import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artifacts, artifactVersions, chats, shares } from "@/db/schema";
import { NotFoundError } from "./me";

export const artifactIdInput = z.object({ artifactId: z.string().min(1) }).strict();
export const editArtifactInput = z.object({ artifactId: z.string().min(1), content: z.string().max(300_000) }).strict();
export const restoreInput = z.object({ artifactId: z.string().min(1), version: z.number().int().min(1) }).strict();

export async function ownArtifact(userId: string, artifactId: string) {
  const [row] = await db.select().from(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.ownerId, userId)));
  if (!row) throw new NotFoundError("Artifact");
  return row;
}

export function listArtifacts(userId: string) {
  return db
    .select({
      id: artifacts.id,
      title: artifacts.title,
      kind: artifacts.kind,
      currentVersion: artifacts.currentVersion,
      updatedAt: artifacts.updatedAt,
      chatId: artifacts.chatId,
      chatTitle: chats.title,
    })
    .from(artifacts)
    .leftJoin(chats, eq(chats.id, artifacts.chatId))
    .where(eq(artifacts.ownerId, userId))
    .orderBy(desc(artifacts.updatedAt), desc(artifacts.createdAt));
}

/** The artifact with every version, oldest first. */
export async function getArtifact(userId: string, artifactId: string) {
  const a = await ownArtifact(userId, artifactId);
  const versions = await db
    .select({ version: artifactVersions.version, content: artifactVersions.content, source: artifactVersions.source, createdAt: artifactVersions.createdAt })
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(asc(artifactVersions.version));
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    language: a.language,
    chatId: a.chatId,
    currentVersion: a.currentVersion,
    versions,
  };
}

async function addVersion(userId: string, artifactId: string, content: string, source: "edit" | "restore") {
  const a = await ownArtifact(userId, artifactId);
  const version = a.currentVersion + 1;
  await db.batch([
    db.insert(artifactVersions).values({ id: crypto.randomUUID(), artifactId, version, content, source }),
    db
      .update(artifacts)
      .set({ currentVersion: version, updatedAt: new Date().toISOString() })
      .where(and(eq(artifacts.id, artifactId), eq(artifacts.ownerId, userId))),
  ]);
  return { version };
}

/** A hand edit becomes a new version; older ones stay. */
export function editArtifact(userId: string, input: z.infer<typeof editArtifactInput>) {
  return addVersion(userId, input.artifactId, input.content, "edit");
}

/** Restoring copies an older version forward as the newest one. */
export async function restoreVersion(userId: string, input: z.infer<typeof restoreInput>) {
  await ownArtifact(userId, input.artifactId);
  const [old] = await db
    .select({ content: artifactVersions.content })
    .from(artifactVersions)
    .where(and(eq(artifactVersions.artifactId, input.artifactId), eq(artifactVersions.version, input.version)));
  if (!old) throw new NotFoundError("Version");
  return addVersion(userId, input.artifactId, old.content, "restore");
}

export async function deleteArtifact(userId: string, artifactId: string) {
  await ownArtifact(userId, artifactId);
  await db.batch([
    db.delete(artifactVersions).where(eq(artifactVersions.artifactId, artifactId)),
    db.delete(shares).where(and(eq(shares.kind, "artifact"), eq(shares.targetId, artifactId))),
    db.delete(artifacts).where(and(eq(artifacts.id, artifactId), eq(artifacts.ownerId, userId))),
  ]);
  return { ok: true };
}

/** The current version, for downloads and shares. */
export async function currentContent(artifactId: string) {
  const [row] = await db
    .select({ id: artifacts.id, title: artifacts.title, kind: artifacts.kind, language: artifacts.language, version: artifacts.currentVersion, content: artifactVersions.content })
    .from(artifacts)
    .innerJoin(artifactVersions, and(eq(artifactVersions.artifactId, artifacts.id), eq(artifactVersions.version, artifacts.currentVersion)))
    .where(eq(artifacts.id, artifactId));
  return row ?? null;
}
