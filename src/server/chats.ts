import { and, asc, desc, eq, gt, inArray, like, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { artifacts, artifactVersions, chats, messages, type Attachment } from "@/db/schema";
import { lastIndex } from "@/shared/lastIndex";
import { artifactTag, marker, parseReply, splitStored } from "@/shared/artifactParse";
import { getInstructions, listMemories } from "./memory";
import { NotFoundError, type Me } from "./me";
import { complete, type ModelMessage } from "./model";
import { access, projectContext } from "./projects";

const attachment = z
  .object({
    name: z.string().trim().min(1).max(200),
    content: z.string().max(200_000, "Attach files under 200 KB"),
  })
  .strict();
const text = z.string().trim().min(1, "Write a message").max(50_000);

export const startChatInput = z
  .object({ content: text, attachments: z.array(attachment).max(5).default([]), projectId: z.string().min(1).nullable().default(null) })
  .strict();
export const sendInput = z
  .object({ chatId: z.string().min(1), content: text, attachments: z.array(attachment).max(5).default([]) })
  .strict();
export const chatIdInput = z.object({ chatId: z.string().min(1) }).strict();
export const editLastInput = z.object({ chatId: z.string().min(1), content: text }).strict();
export const renameInput = z.object({ chatId: z.string().min(1), title: z.string().trim().min(1, "Give it a title").max(200) }).strict();
export const starInput = z.object({ chatId: z.string().min(1), starred: z.boolean() }).strict();
export const searchInput = z.object({ query: z.string().max(200).default("") }).strict();

const now = () => new Date().toISOString();

const ARTIFACT_RULES = `When your reply includes a substantial, self-contained piece of work the person is likely to reuse or change (a document of several paragraphs, a complete web page, a program or a long snippet of code), put that piece inside one artifact tag:
<artifact identifier="short-kebab-id" type="document|html|code" title="A few words" language="for code only">
...the full content...
</artifact>
Use type "document" for Markdown text, "html" for a complete web page in one file (inline CSS and JavaScript), and "code" for code. Keep short answers, explanations and small snippets out of artifacts. To change an artifact that already exists, reply with the same identifier and its full new content. Never mention these tags.`;

export async function ownChat(userId: string, chatId: string) {
  const [chat] = await db.select().from(chats).where(and(eq(chats.id, chatId), eq(chats.ownerId, userId)));
  if (!chat) throw new NotFoundError("Chat");
  return chat;
}

export async function listChats(userId: string, query = "") {
  const q = query.trim();
  return db
    .select({ id: chats.id, title: chats.title, starred: chats.starred, projectId: chats.projectId, updatedAt: chats.updatedAt })
    .from(chats)
    .where(and(eq(chats.ownerId, userId), q ? like(chats.title, `%${q.replace(/[%_]/g, "")}%`) : undefined))
    .orderBy(desc(chats.updatedAt))
    .limit(200);
}

async function chatMessages(chatId: string) {
  return db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.position));
}

export async function getChat(user: Me, chatId: string) {
  const chat = await ownChat(user.id, chatId);
  const rows = await chatMessages(chatId);
  const arts = await db
    .select({ id: artifacts.id, title: artifacts.title, kind: artifacts.kind, currentVersion: artifacts.currentVersion })
    .from(artifacts)
    .where(and(eq(artifacts.chatId, chatId), eq(artifacts.ownerId, user.id)));
  let project: { id: string; name: string } | null = null;
  if (chat.projectId) {
    try {
      const found = await access(user, chat.projectId);
      project = { id: found.project.id, name: found.project.name };
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
    }
  }
  return {
    chat: { id: chat.id, title: chat.title, starred: chat.starred, project },
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      attachments: m.attachments.map((a) => ({ name: a.name, size: a.size })),
    })),
    artifacts: arts,
  };
}

function withAttachments(content: string, files: Attachment[]): string {
  if (files.length === 0) return content;
  const blocks = files.map((f) => `<file name="${f.name.replaceAll('"', "'")}">\n${f.content}\n</file>`);
  return `${blocks.join("\n\n")}\n\n${content}`;
}

/** Everything a model call sees: the person's instructions and memory, the project, the chat's artifacts and history. */
async function contextFor(user: Me, chat: { id: string | null; projectId: string | null }, history: { role: "user" | "assistant"; content: string; attachments: Attachment[] }[]): Promise<ModelMessage[]> {
  const [instructions, notes, project] = await Promise.all([
    getInstructions(user.id),
    listMemories(user.id),
    chat.projectId ? projectContext(user, chat.projectId) : null,
  ]);
  const system = [`You are a helpful assistant for a member of an organization. Today is ${now().slice(0, 10)}.`, ARTIFACT_RULES];
  if (instructions.trim()) system.push(`The person's standing instructions for every conversation:\n${instructions.trim()}`);
  if (notes.length) system.push(`What the person has asked you to remember about them and their work:\n${notes.map((n) => `- ${n.content}`).join("\n")}`);
  if (project) {
    system.push(`This conversation is part of the project "${project.name}".`);
    if (project.instructions.trim()) system.push(`Project instructions:\n${project.instructions.trim()}`);
    if (project.docs.length)
      system.push(`Project knowledge:\n${project.docs.map((d) => `<document name="${d.name.replaceAll('"', "'")}">\n${d.content}\n</document>`).join("\n\n")}`);
  }
  const versions = new Map<string, { identifier: string; kind: string; title: string; language: string }>();
  if (chat.id) {
    const current = await db
      .select({ id: artifacts.id, identifier: artifacts.identifier, kind: artifacts.kind, title: artifacts.title, language: artifacts.language, content: artifactVersions.content })
      .from(artifacts)
      .innerJoin(artifactVersions, and(eq(artifactVersions.artifactId, artifacts.id), eq(artifactVersions.version, artifacts.currentVersion)))
      .where(and(eq(artifacts.chatId, chat.id), eq(artifacts.ownerId, user.id)));
    for (const a of current) versions.set(a.id, a);
    if (current.length)
      system.push(`The current content of this conversation's artifacts:\n${current.map((a) => artifactTag(a, a.content)).join("\n\n")}`);
  }
  const turns: ModelMessage[] = history.map((m) => {
    if (m.role === "user") return { role: "user", content: withAttachments(m.content, m.attachments) };
    const content = splitStored(m.content)
      .map((p) => {
        if (p.type === "text") return p.text;
        const a = versions.get(p.id);
        return a ? `(artifact "${a.title}", identifier ${a.identifier}, version ${p.version})` : "(an artifact since deleted)";
      })
      .join("\n\n");
    return { role: "assistant", content };
  });
  return [{ role: "system", content: system.join("\n\n") }, ...turns];
}

type Statement = Parameters<typeof db.batch>[0][number];

/** Turns a model reply into stored text plus artifact writes. */
async function storeReply(user: Me, chatId: string, reply: string) {
  const writes: Statement[] = [];
  const out: string[] = [];
  const seen = new Map<string, { id: string; version: number }>();
  for (const part of parseReply(reply)) {
    if (part.type === "text") {
      out.push(part.text.trim());
      continue;
    }
    const a = part.artifact;
    const prior = seen.get(a.identifier);
    const [existing] = prior
      ? [{ id: prior.id, currentVersion: prior.version }]
      : await db
          .select({ id: artifacts.id, currentVersion: artifacts.currentVersion })
          .from(artifacts)
          .where(and(eq(artifacts.chatId, chatId), eq(artifacts.ownerId, user.id), eq(artifacts.identifier, a.identifier)));
    if (existing) {
      const version = existing.currentVersion + 1;
      writes.push(
        db.insert(artifactVersions).values({ id: crypto.randomUUID(), artifactId: existing.id, version, content: a.content, source: "assistant" }),
        db.update(artifacts).set({ currentVersion: version, title: a.title, updatedAt: now() }).where(eq(artifacts.id, existing.id)),
      );
      seen.set(a.identifier, { id: existing.id, version });
      out.push(marker(existing.id, version));
    } else {
      const id = crypto.randomUUID();
      writes.push(
        db.insert(artifacts).values({ id, ownerId: user.id, chatId, identifier: a.identifier, title: a.title, kind: a.kind, language: a.language, currentVersion: 1 }),
        db.insert(artifactVersions).values({ id: crypto.randomUUID(), artifactId: id, version: 1, content: a.content, source: "assistant" }),
      );
      seen.set(a.identifier, { id, version: 1 });
      out.push(marker(id, 1));
    }
  }
  return { content: out.filter(Boolean).join("\n\n"), writes };
}

async function titleFor(question: string, answer: string): Promise<string> {
  const fallback = question.split(/\s+/).slice(0, 6).join(" ").slice(0, 80) || "New chat";
  try {
    const title = await complete(
      [
        { role: "system", content: "Write a short title (at most six words) for a chat that begins with the exchange below. Answer with the title only, without quotes." },
        { role: "user", content: `${question.slice(0, 2000)}\n\n---\n\n${answer.slice(0, 1000)}` },
      ],
      24,
    );
    return title.replace(/^["'\s#*]+|["'\s.*]+$/g, "").split("\n")[0]!.slice(0, 80) || fallback;
  } catch {
    return fallback;
  }
}

function toAttachments(files: { name: string; content: string }[]): Attachment[] {
  return files.map((f) => ({ name: f.name, content: f.content, size: new TextEncoder().encode(f.content).length }));
}

/** Starts a chat with its first message; nothing is stored unless the model answers. */
export async function startChat(user: Me, input: z.infer<typeof startChatInput>) {
  if (input.projectId) await access(user, input.projectId);
  const files = toAttachments(input.attachments);
  const history = [{ role: "user" as const, content: input.content, attachments: files }];
  const reply = await complete(await contextFor(user, { id: null, projectId: input.projectId }, history));
  const chatId = crypto.randomUUID();
  const stored = await storeReply(user, chatId, reply);
  const title = await titleFor(input.content, stored.content);
  await db.batch([
    db.insert(chats).values({ id: chatId, ownerId: user.id, projectId: input.projectId, title }),
    db.insert(messages).values({ id: crypto.randomUUID(), chatId, position: 1, role: "user", content: input.content, attachments: files }),
    db.insert(messages).values({ id: crypto.randomUUID(), chatId, position: 2, role: "assistant", content: stored.content }),
    ...stored.writes,
  ]);
  return { chatId };
}

async function nextPosition(chatId: string) {
  const [row] = await db.select({ top: max(messages.position) }).from(messages).where(eq(messages.chatId, chatId));
  return (row?.top ?? 0) + 1;
}

export async function sendMessage(user: Me, input: z.infer<typeof sendInput>) {
  const chat = await ownChat(user.id, input.chatId);
  const files = toAttachments(input.attachments);
  const history = [...(await chatMessages(chat.id)), { role: "user" as const, content: input.content, attachments: files }];
  const reply = await complete(await contextFor(user, chat, history));
  const stored = await storeReply(user, chat.id, reply);
  const position = await nextPosition(chat.id);
  await db.batch([
    db.insert(messages).values({ id: crypto.randomUUID(), chatId: chat.id, position, role: "user", content: input.content, attachments: files }),
    db.insert(messages).values({ id: crypto.randomUUID(), chatId: chat.id, position: position + 1, role: "assistant", content: stored.content }),
    db.update(chats).set({ updatedAt: now() }).where(eq(chats.id, chat.id)),
    ...stored.writes,
  ]);
  return { chatId: chat.id };
}

/** Replaces the last reply with a new one. */
export async function regenerate(user: Me, chatId: string) {
  const chat = await ownChat(user.id, chatId);
  const rows = await chatMessages(chat.id);
  const lastUser = lastIndex(rows, (m) => m.role === "user");
  if (lastUser < 0) throw new NotFoundError("Message");
  const kept = rows.slice(0, lastUser + 1);
  const reply = await complete(await contextFor(user, chat, kept));
  const stored = await storeReply(user, chat.id, reply);
  const position = kept.at(-1)!.position;
  await db.batch([
    db.delete(messages).where(and(eq(messages.chatId, chat.id), gt(messages.position, position))),
    db.insert(messages).values({ id: crypto.randomUUID(), chatId: chat.id, position: position + 1, role: "assistant", content: stored.content }),
    db.update(chats).set({ updatedAt: now() }).where(eq(chats.id, chat.id)),
    ...stored.writes,
  ]);
  return { chatId: chat.id };
}

/** Changes the last message and answers it again; anything after it is replaced. */
export async function editLast(user: Me, input: z.infer<typeof editLastInput>) {
  const chat = await ownChat(user.id, input.chatId);
  const rows = await chatMessages(chat.id);
  const lastUser = lastIndex(rows, (m) => m.role === "user");
  if (lastUser < 0) throw new NotFoundError("Message");
  const target = rows[lastUser]!;
  const kept = [...rows.slice(0, lastUser), { ...target, content: input.content }];
  const reply = await complete(await contextFor(user, chat, kept));
  const stored = await storeReply(user, chat.id, reply);
  await db.batch([
    db.update(messages).set({ content: input.content }).where(eq(messages.id, target.id)),
    db.delete(messages).where(and(eq(messages.chatId, chat.id), gt(messages.position, target.position))),
    db.insert(messages).values({ id: crypto.randomUUID(), chatId: chat.id, position: target.position + 1, role: "assistant", content: stored.content }),
    db.update(chats).set({ updatedAt: now() }).where(eq(chats.id, chat.id)),
    ...stored.writes,
  ]);
  return { chatId: chat.id };
}

export async function renameChat(userId: string, input: z.infer<typeof renameInput>) {
  await ownChat(userId, input.chatId);
  await db.update(chats).set({ title: input.title }).where(and(eq(chats.id, input.chatId), eq(chats.ownerId, userId)));
  return { ok: true };
}

export async function starChat(userId: string, input: z.infer<typeof starInput>) {
  await ownChat(userId, input.chatId);
  await db.update(chats).set({ starred: input.starred }).where(and(eq(chats.id, input.chatId), eq(chats.ownerId, userId)));
  return { ok: true };
}

/** Deletes the chat, its messages and the artifacts it made. Share snapshots already taken stay. */
export async function deleteChat(userId: string, chatId: string) {
  await ownChat(userId, chatId);
  const made = db.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.chatId, chatId), eq(artifacts.ownerId, userId)));
  await db.batch([
    db.delete(messages).where(eq(messages.chatId, chatId)),
    db.delete(artifactVersions).where(inArray(artifactVersions.artifactId, made)),
    db.delete(artifacts).where(and(eq(artifacts.chatId, chatId), eq(artifacts.ownerId, userId))),
    db.delete(chats).where(and(eq(chats.id, chatId), eq(chats.ownerId, userId))),
  ]);
  return { ok: true };
}

/** A chat's messages with artifacts written out in full, for a share snapshot. */
export async function snapshotOf(userId: string, chatId: string) {
  const chat = await ownChat(userId, chatId);
  const rows = await chatMessages(chatId);
  const all = await db
    .select({ id: artifacts.id, identifier: artifacts.identifier, kind: artifacts.kind, title: artifacts.title, language: artifacts.language, version: artifactVersions.version, content: artifactVersions.content })
    .from(artifacts)
    .innerJoin(artifactVersions, eq(artifactVersions.artifactId, artifacts.id))
    .where(and(eq(artifacts.chatId, chatId), eq(artifacts.ownerId, userId)));
  const byKey = new Map(all.map((a) => [`${a.id}:${a.version}`, a]));
  return {
    title: chat.title,
    messages: rows.map((m) => ({
      role: m.role,
      attachments: m.attachments,
      content: splitStored(m.content)
        .map((p) => {
          if (p.type === "text") return p.text;
          const a = byKey.get(`${p.id}:${p.version}`);
          return a ? artifactTag(a, a.content) : "";
        })
        .filter(Boolean)
        .join("\n\n"),
    })),
  };
}

/** A new chat of the viewer's own, holding a copy of a shared snapshot. */
export async function copyToNewChat(user: Me, title: string, snapshot: { role: "user" | "assistant"; content: string; attachments: Attachment[] }[]) {
  const chatId = crypto.randomUUID();
  await db.batch([
    db.insert(chats).values({ id: chatId, ownerId: user.id, title }),
    ...snapshot.map((m, i) =>
      db.insert(messages).values({ id: crypto.randomUUID(), chatId, position: i + 1, role: m.role, content: m.content, attachments: m.attachments }),
    ),
  ]);
  return { chatId };
}
