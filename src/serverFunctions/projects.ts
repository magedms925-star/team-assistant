import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { GatewayRefusalError, listMembers } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { db } from "@/db";
import { users } from "@/db/schema";
import { knownUsers, me, NotFoundError, rememberUser } from "@/server/me";
import * as projects from "@/server/projects";

export const listProjects = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    await rememberUser(me(context.user));
    return projects.listProjects(me(context.user));
  });

export const getProject = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return await projects.getProject(me(context.user), data.projectId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectInput.parse(data))
  .handler(async ({ data, context }) => {
    await rememberUser(me(context.user));
    return projects.createProject(me(context.user), data);
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectUpdateInput.parse(data))
  .handler(({ data, context }) => projects.updateProject(me(context.user), data));

export const addKnowledge = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.knowledgeInput.parse(data))
  .handler(({ data, context }) => projects.addKnowledge(me(context.user), data));

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.knowledgeIdInput.parse(data))
  .handler(({ data, context }) => projects.deleteKnowledge(me(context.user), data.id));

export const setMember = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.memberInput.parse(data))
  .handler(({ data, context }) => projects.setMember(me(context.user), data));

export const removeMember = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.removeMemberInput.parse(data))
  .handler(({ data, context }) => projects.removeMember(me(context.user), data));

export const setVisibility = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.visibilityInput.parse(data))
  .handler(({ data, context }) => projects.setVisibility(me(context.user), data));

export const setArchived = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.archiveInput.parse(data))
  .handler(({ data, context }) => projects.setArchived(me(context.user), data));

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => projects.projectIdInput.parse(data))
  .handler(({ data, context }) => projects.deleteProject(me(context.user), data.projectId));

/**
 * People a project can be shared with: the organization's members from the
 * Gateway, or, when it won't list them, the members who have opened this app.
 */
export const listPeople = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const user = me(context.user);
    try {
      const { members } = await listMembers({ env });
      for (const m of members) {
        await db.insert(users).values({ id: m.id, email: m.email, orgId: user.orgId }).onConflictDoNothing();
      }
      return members.filter((m) => m.id !== user.id).map((m) => ({ id: m.id, email: m.email, name: m.name }));
    } catch (error) {
      if (!(error instanceof GatewayRefusalError)) throw error;
      const known = await knownUsers(user.orgId);
      return known.filter((m) => m.id !== user.id).map((m) => ({ ...m, name: "" }));
    }
  });
