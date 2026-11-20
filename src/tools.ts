// The app's tools for AI clients. The Gateway serves them at /mcp and calls
// each with the signed-in user; every one reads or writes only that user's rows.
import { defineTools } from "@every-app/sdk/server";
import { z } from "zod";
import { listChats } from "@/server/chats";
import * as memory from "@/server/memory";

export const tools = defineTools({
  list_chats: {
    description: "List the user's chats, newest first, optionally filtered by words in the title.",
    risk: "read",
    input: z.object({ query: z.string().max(200).optional() }).strict(),
    handler: (input, { user }) => listChats(user.id, input.query ?? ""),
  },
  list_memory_notes: {
    description: "List the notes the user keeps for the assistant to remember about them.",
    risk: "read",
    input: z.object({}).strict(),
    handler: (_input, { user }) => memory.listMemories(user.id),
  },
  add_memory_note: {
    description: "Add a note for the assistant to remember in every chat of this user.",
    risk: "write",
    idempotent: false,
    input: memory.memoryInput,
    handler: (input, { user }) => memory.addMemory(user.id, input.content),
  },
});
