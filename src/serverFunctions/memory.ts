import { createServerFn } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import * as memory from "@/server/memory";
import { me, rememberUser } from "@/server/me";

export const getMemory = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    await rememberUser(me(context.user));
    const [instructions, notes] = await Promise.all([
      memory.getInstructions(context.user.id),
      memory.listMemories(context.user.id),
    ]);
    return { instructions, notes };
  });

export const saveInstructions = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => memory.instructionsInput.parse(data))
  .handler(({ data, context }) => memory.saveInstructions(context.user.id, data.instructions));

export const addMemory = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => memory.memoryInput.parse(data))
  .handler(({ data, context }) => memory.addMemory(context.user.id, data.content));

export const updateMemory = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => memory.memoryUpdateInput.parse(data))
  .handler(({ data, context }) => memory.updateMemory(context.user.id, data.id, data.content));

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((data: unknown) => memory.idInput.parse(data))
  .handler(({ data, context }) => memory.deleteMemory(context.user.id, data.id));
