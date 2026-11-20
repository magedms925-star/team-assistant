import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { me } from "@/server/me";
import * as shares from "@/server/shares";

export const createShare = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => shares.createShareInput.parse(data))
  .handler(async ({ data, context }) => {
    const { id } = await shares.createShare(me(context.user), data);
    return { id, url: `${new URL(getRequest().url).origin}/s/${id}` };
  });

export const listShares = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(({ context }) => shares.listMyShares(context.user.id));

export const revokeShare = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => shares.shareIdInput.parse(data))
  .handler(({ data, context }) => shares.revokeShare(me(context.user), data.shareId));

export const viewShare = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => shares.shareIdInput.parse(data))
  .handler(({ data, context }) => shares.viewShare(me(context.user), data.shareId));

export const continueShare = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => shares.shareIdInput.parse(data))
  .handler(({ data, context }) => shares.continueShare(me(context.user), data.shareId));
