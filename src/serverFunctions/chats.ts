import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as chats from "@/server/chats";
import { me, NotFoundError, rememberUser } from "@/server/me";
import { aiStatus, ModelUnavailableError, probe } from "@/server/model";

type Outcome = { chatId: string; aiOff?: undefined } | { aiOff: true; setup: string | null };

/** A model call that may find no model set up: the page shows the setup message instead. */
async function withModel(work: () => Promise<{ chatId: string }>): Promise<Outcome> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ModelUnavailableError) return { aiOff: true, setup: error.setup };
    throw error;
  }
}

export const getHome = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.searchInput.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await rememberUser(me(context.user));
    const [list, ai] = await Promise.all([chats.listChats(context.user.id, data.query), aiStatus()]);
    return { chats: list, ai };
  });

export const getChat = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.chatIdInput.parse(data))
  .handler(async ({ data, context }) => {
    try {
      const [chat, ai] = await Promise.all([chats.getChat(me(context.user), data.chatId), aiStatus()]);
      return { ...chat, ai };
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  });

export const checkModel = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(() => probe());

export const startChat = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.startChatInput.parse(data))
  .handler(async ({ data, context }) => {
    await rememberUser(me(context.user));
    return withModel(() => chats.startChat(me(context.user), data));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.sendInput.parse(data))
  .handler(({ data, context }) => withModel(() => chats.sendMessage(me(context.user), data)));

export const regenerate = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.chatIdInput.parse(data))
  .handler(({ data, context }) => withModel(() => chats.regenerate(me(context.user), data.chatId)));

export const editLast = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.editLastInput.parse(data))
  .handler(({ data, context }) => withModel(() => chats.editLast(me(context.user), data)));

export const renameChat = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.renameInput.parse(data))
  .handler(({ data, context }) => chats.renameChat(context.user.id, data));

export const starChat = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.starInput.parse(data))
  .handler(({ data, context }) => chats.starChat(context.user.id, data));

export const deleteChat = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => chats.chatIdInput.parse(data))
  .handler(({ data, context }) => chats.deleteChat(context.user.id, data.chatId));
