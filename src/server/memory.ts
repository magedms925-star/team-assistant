import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memories, preferences } from "@/db/schema";
import { NotFoundError } from "./me";

export const instructionsInput = z
  .object({ instructions: z.string().max(8000) })
  .strict();
export const memoryInput = z
  .object({ content: z.string().trim().min(1, "Write a note").max(2000) })
  .strict();
export const memoryUpdateInput = memoryInput.extend({ id: z.string().min(1) }).strict();
export const idInput = z.object({ id: z.string().min(1).max(64) }).strict();

export async function getInstructions(userId: string): Promise<string> {
  const [row] = await db
    .select({ instructions: preferences.instructions })
    .from(preferences)
    .where(eq(preferences.userId, userId));
  return row?.instructions ?? "";
}

export async function saveInstructions(userId: string, instructions: string) {
  await db
    .insert(preferences)
    .values({ userId, instructions })
    .onConflictDoUpdate({
      target: preferences.userId,
      set: { instructions, updatedAt: new Date().toISOString() },
    });
  return { instructions };
}

export function listMemories(userId: string) {
  return db
    .select({ id: memories.id, content: memories.content, createdAt: memories.createdAt })
    .from(memories)
    .where(eq(memories.ownerId, userId))
    .orderBy(desc(memories.createdAt), memories.id);
}

export async function addMemory(userId: string, content: string) {
  const [row] = await db
    .insert(memories)
    .values({ id: crypto.randomUUID(), ownerId: userId, content })
    .returning({ id: memories.id, content: memories.content });
  return row!;
}

export async function updateMemory(userId: string, id: string, content: string) {
  const [row] = await db
    .update(memories)
    .set({ content })
    .where(and(eq(memories.id, id), eq(memories.ownerId, userId)))
    .returning({ id: memories.id });
  if (!row) throw new NotFoundError("Note");
  return row;
}

export async function deleteMemory(userId: string, id: string) {
  const [row] = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.ownerId, userId)))
    .returning({ id: memories.id });
  if (!row) throw new NotFoundError("Note");
  return row;
}
