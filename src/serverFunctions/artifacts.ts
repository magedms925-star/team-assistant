import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as artifacts from "@/server/artifacts";
import { NotFoundError } from "@/server/me";

export const listArtifacts = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => artifacts.listArtifacts(context.user.id));

export const getArtifact = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => artifacts.artifactIdInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      return await artifacts.getArtifact(context.user.id, data.artifactId);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

export const editArtifact = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => artifacts.editArtifactInput.parse(data))
  .handler(({ data, context }) => artifacts.editArtifact(context.user.id, data));

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => artifacts.restoreInput.parse(data))
  .handler(({ data, context }) => artifacts.restoreVersion(context.user.id, data));

export const deleteArtifact = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => artifacts.artifactIdInput.parse(data))
  .handler(({ data, context }) => artifacts.deleteArtifact(context.user.id, data.artifactId));
