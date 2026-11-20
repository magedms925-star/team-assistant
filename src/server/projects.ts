import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artifacts, artifactVersions, chats, knowledge, messages, projectMembers, projects } from "@/db/schema";
import { admin, emailsOf, ForbiddenError, NotFoundError, type Me } from "./me";

export type ProjectRole = "owner" | "edit" | "view";

export const projectInput = z
  .object({
    name: z.string().trim().min(1, "Give the project a name").max(120),
    description: z.string().trim().max(1000).default(""),
    instructions: z.string().max(8000).default(""),
  })
  .strict();
export const projectUpdateInput = projectInput.extend({ id: z.string().min(1) }).strict();
export const knowledgeInput = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(1, "Give it a title").max(200),
    kind: z.enum(["file", "text"]),
    content: z.string().min(1, "It is empty").max(300_000, "Keep it under 300 KB"),
  })
  .strict();
export const memberInput = z
  .object({ projectId: z.string().min(1), userId: z.string().min(1), role: z.enum(["view", "edit"]) })
  .strict();
export const removeMemberInput = z.object({ projectId: z.string().min(1), userId: z.string().min(1) }).strict();
export const visibilityInput = z.object({ projectId: z.string().min(1), orgVisible: z.boolean() }).strict();
export const archiveInput = z.object({ projectId: z.string().min(1), archived: z.boolean() }).strict();
export const projectIdInput = z.object({ projectId: z.string().min(1) }).strict();
export const knowledgeIdInput = z.object({ id: z.string().min(1) }).strict();

type Project = typeof projects.$inferSelect;

/** What `user` may do with a project, or null when they can't see it. */
export async function roleIn(user: Me, project: Project): Promise<ProjectRole | null> {
  if (project.orgId !== user.orgId) return null;
  if (project.ownerId === user.id) return "owner";
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, user.id)));
  if (row) return row.role;
  if (project.orgVisible) return "view";
  return null;
}

/** The project and the caller's role, or NotFound when they can't see it. */
export async function access(user: Me, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new NotFoundError("Project");
  const role = await roleIn(user, project);
  if (!role) throw new NotFoundError("Project");
  return { project, role };
}

const canEdit = (role: ProjectRole) => role === "owner" || role === "edit";

export async function listProjects(user: Me) {
  const shared = db
    .select({ id: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, user.id));
  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.orgId, user.orgId),
        or(eq(projects.ownerId, user.id), eq(projects.orgVisible, true), inArray(projects.id, shared)),
      ),
    )
    .orderBy(desc(projects.updatedAt));
  const owners = await emailsOf([...new Set(rows.map((r) => r.ownerId))]);
  return Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      archived: p.archived,
      orgVisible: p.orgVisible,
      updatedAt: p.updatedAt,
      ownerEmail: owners.get(p.ownerId) ?? "",
      role: (await roleIn(user, p))!,
    })),
  );
}

export async function createProject(user: Me, input: z.infer<typeof projectInput>) {
  const id = crypto.randomUUID();
  await db.insert(projects).values({ id, ownerId: user.id, orgId: user.orgId, ...input });
  return { id };
}

export async function getProject(user: Me, projectId: string) {
  const { project, role } = await access(user, projectId);
  const [files, myChats, memberRows] = await Promise.all([
    db
      .select({ id: knowledge.id, name: knowledge.name, kind: knowledge.kind, size: knowledge.size, createdAt: knowledge.createdAt })
      .from(knowledge)
      .where(eq(knowledge.projectId, projectId))
      .orderBy(knowledge.createdAt),
    db
      .select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
      .from(chats)
      .where(and(eq(chats.projectId, projectId), eq(chats.ownerId, user.id)))
      .orderBy(desc(chats.updatedAt)),
    db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)),
  ]);
  const emails = await emailsOf([project.ownerId, ...memberRows.map((m) => m.userId)]);
  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      orgVisible: project.orgVisible,
      archived: project.archived,
      ownerEmail: emails.get(project.ownerId) ?? "",
    },
    role,
    canEdit: canEdit(role),
    canManage: role === "owner" || admin(user),
    knowledge: files,
    chats: myChats,
    members: memberRows.map((m) => ({ userId: m.userId, email: emails.get(m.userId) ?? m.userId, role: m.role })),
  };
}

async function requireEdit(user: Me, projectId: string) {
  const found = await access(user, projectId);
  if (!canEdit(found.role)) throw new ForbiddenError();
  return found;
}

async function touch(projectId: string) {
  await db.update(projects).set({ updatedAt: new Date().toISOString() }).where(eq(projects.id, projectId));
}

export async function updateProject(user: Me, { id, ...input }: z.infer<typeof projectUpdateInput>) {
  await requireEdit(user, id);
  await db.update(projects).set({ ...input, updatedAt: new Date().toISOString() }).where(eq(projects.id, id));
  return { id };
}

export async function addKnowledge(user: Me, input: z.infer<typeof knowledgeInput>) {
  await requireEdit(user, input.projectId);
  const id = crypto.randomUUID();
  await db.insert(knowledge).values({
    id,
    projectId: input.projectId,
    name: input.name,
    kind: input.kind,
    size: new TextEncoder().encode(input.content).length,
    content: input.content,
    addedBy: user.id,
  });
  await touch(input.projectId);
  return { id };
}

async function knowledgeRow(id: string) {
  const [row] = await db.select().from(knowledge).where(eq(knowledge.id, id));
  if (!row) throw new NotFoundError("Document");
  return row;
}

export async function deleteKnowledge(user: Me, id: string) {
  const row = await knowledgeRow(id);
  await requireEdit(user, row.projectId);
  await db.delete(knowledge).where(eq(knowledge.id, id));
  return { id };
}

/** A knowledge document's text, for anyone who can view its project. */
export async function readKnowledge(user: Me, id: string) {
  const row = await knowledgeRow(id);
  await access(user, row.projectId);
  return row;
}

/** Instructions and documents for a model call; null unless the caller can view the project. */
export async function projectContext(user: Me, projectId: string) {
  try {
    const { project } = await access(user, projectId);
    const docs = await db
      .select({ name: knowledge.name, content: knowledge.content })
      .from(knowledge)
      .where(eq(knowledge.projectId, projectId))
      .orderBy(knowledge.createdAt);
    return { name: project.name, instructions: project.instructions, docs };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

async function requireSharing(user: Me, projectId: string) {
  const found = await requireEdit(user, projectId);
  return found;
}

export async function setMember(user: Me, input: z.infer<typeof memberInput>) {
  const { project } = await requireSharing(user, input.projectId);
  if (input.userId === project.ownerId) throw new ForbiddenError("The owner already has full access.");
  await db
    .insert(projectMembers)
    .values(input)
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: input.role } });
  return { ok: true };
}

export async function removeMember(user: Me, input: z.infer<typeof removeMemberInput>) {
  await requireSharing(user, input.projectId);
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
  return { ok: true };
}

export async function setVisibility(user: Me, input: z.infer<typeof visibilityInput>) {
  await requireSharing(user, input.projectId);
  await db.update(projects).set({ orgVisible: input.orgVisible }).where(eq(projects.id, input.projectId));
  return { ok: true };
}

async function requireManage(user: Me, projectId: string) {
  const found = await access(user, projectId);
  if (found.role !== "owner" && !admin(user)) throw new ForbiddenError("Only the owner or an admin can do that.");
  return found;
}

export async function setArchived(user: Me, input: z.infer<typeof archiveInput>) {
  await requireManage(user, input.projectId);
  await db.update(projects).set({ archived: input.archived }).where(eq(projects.id, input.projectId));
  return { ok: true };
}

/** Deletes the project, its documents, sharing and every chat in it. */
export async function deleteProject(user: Me, projectId: string) {
  await requireManage(user, projectId);
  const inProject = db.select({ id: chats.id }).from(chats).where(eq(chats.projectId, projectId));
  const theirArtifacts = db.select({ id: artifacts.id }).from(artifacts).where(inArray(artifacts.chatId, inProject));
  await db.batch([
    db.delete(knowledge).where(eq(knowledge.projectId, projectId)),
    db.delete(projectMembers).where(eq(projectMembers.projectId, projectId)),
    db.delete(messages).where(inArray(messages.chatId, inProject)),
    db.delete(artifactVersions).where(inArray(artifactVersions.artifactId, theirArtifacts)),
    db.delete(artifacts).where(inArray(artifacts.chatId, inProject)),
    db.delete(chats).where(eq(chats.projectId, projectId)),
    db.delete(projects).where(eq(projects.id, projectId)),
  ]);
  return { ok: true };
}
