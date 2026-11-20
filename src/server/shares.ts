import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { shares } from "@/db/schema";
import { currentContent, ownArtifact } from "./artifacts";
import { copyToNewChat, snapshotOf } from "./chats";
import { admin, emailsOf, NotFoundError, type Me } from "./me";

export const createShareInput = z.object({ kind: z.enum(["chat", "artifact"]), targetId: z.string().min(1) }).strict();
export const shareIdInput = z.object({ shareId: z.string().min(1).max(64) }).strict();

function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_");
}

export async function createShare(user: Me, input: z.infer<typeof createShareInput>) {
  const id = newShareId();
  if (input.kind === "chat") {
    const snap = await snapshotOf(user.id, input.targetId);
    await db.insert(shares).values({ id, ownerId: user.id, orgId: user.orgId, kind: "chat", targetId: input.targetId, title: snap.title, snapshot: snap.messages });
  } else {
    const a = await ownArtifact(user.id, input.targetId);
    await db.insert(shares).values({ id, ownerId: user.id, orgId: user.orgId, kind: "artifact", targetId: a.id, title: a.title });
  }
  return { id };
}

export function listMyShares(userId: string) {
  return db
    .select({ id: shares.id, kind: shares.kind, title: shares.title, targetId: shares.targetId, createdAt: shares.createdAt })
    .from(shares)
    .where(and(eq(shares.ownerId, userId), isNull(shares.revokedAt)))
    .orderBy(desc(shares.createdAt));
}

/** Only the creator or an admin of the same organization can revoke. */
export async function revokeShare(user: Me, shareId: string) {
  const [row] = await db.select().from(shares).where(and(eq(shares.id, shareId), eq(shares.orgId, user.orgId), isNull(shares.revokedAt)));
  if (!row || (row.ownerId !== user.id && !admin(user))) throw new NotFoundError("Link");
  await db.update(shares).set({ revokedAt: new Date().toISOString() }).where(eq(shares.id, shareId));
  return { ok: true };
}

async function liveShare(user: Me, shareId: string) {
  const [row] = await db.select().from(shares).where(and(eq(shares.id, shareId), eq(shares.orgId, user.orgId), isNull(shares.revokedAt)));
  return row ?? null;
}

/** What a member of the organization sees at a share link; null once revoked. */
export async function viewShare(user: Me, shareId: string) {
  const row = await liveShare(user, shareId);
  if (!row) return null;
  const by = (await emailsOf([row.ownerId])).get(row.ownerId) ?? "";
  if (row.kind === "chat") {
    return {
      kind: "chat" as const,
      title: row.title,
      by,
      createdAt: row.createdAt,
      mine: row.ownerId === user.id,
      messages: (row.snapshot ?? []).map((m) => ({ role: m.role, content: m.content, attachments: m.attachments.map((a) => ({ name: a.name, size: a.size })) })),
    };
  }
  const artifact = await currentContent(row.targetId);
  if (!artifact) return null;
  return { kind: "artifact" as const, title: artifact.title, by, createdAt: row.createdAt, mine: row.ownerId === user.id, artifact };
}

export async function continueShare(user: Me, shareId: string) {
  const row = await liveShare(user, shareId);
  if (!row || row.kind !== "chat") throw new NotFoundError("Link");
  return copyToNewChat(user, row.title, row.snapshot ?? []);
}
