import { isAdmin } from "@every-app/sdk/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** The signed-in person, as the Gateway's identity gives them. */
export interface Me {
  id: string;
  email: string;
  orgId: string;
  orgRole: string;
}

export function me(user: Me): Me {
  return { id: user.id, email: user.email, orgId: user.orgId, orgRole: user.orgRole };
}

export function admin(user: Me): boolean {
  return isAdmin({ orgRole: user.orgRole as never });
}

/** Records the person on first sight, and keeps their email current. */
export async function rememberUser(user: Me): Promise<void> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, orgId: user.orgId })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, orgId: user.orgId },
    });
}

export async function emailsOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.email]));
}

export async function knownUsers(orgId: string) {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.orgId, orgId));
}

export class NotFoundError extends Error {
  constructor(what = "That") {
    super(`${what} was not found.`);
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You can't change this.") {
    super(message);
  }
}
