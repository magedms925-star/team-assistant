import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** People the app has seen, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  orgId: text("org_id").notNull(),
  createdAt: createdAt(),
});

/** A person's standing instructions for every chat. */
export const preferences = sqliteTable("preferences", {
  userId: text("user_id").primaryKey(),
  instructions: text("instructions").notNull().default(""),
  updatedAt: createdAt(),
});

export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("memories_owner").on(t.ownerId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    orgVisible: integer("org_visible", { mode: "boolean" })
      .notNull()
      .default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("projects_owner").on(t.ownerId), index("projects_org").on(t.orgId)],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["view", "edit"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user").on(t.userId),
  ],
);

export const knowledge = sqliteTable(
  "knowledge",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["file", "text"] }).notNull(),
    size: integer("size").notNull(),
    content: text("content").notNull(),
    addedBy: text("added_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("knowledge_project").on(t.projectId)],
);

export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id"),
    title: text("title").notNull(),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("chats_owner").on(t.ownerId), index("chats_project").on(t.projectId)],
);

export interface Attachment {
  name: string;
  size: number;
  content: string;
}

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id").notNull(),
    position: integer("position").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    attachments: text("attachments", { mode: "json" })
      .$type<Attachment[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("messages_chat_position").on(t.chatId, t.position)],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    chatId: text("chat_id"),
    identifier: text("identifier").notNull(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["document", "html", "code"] }).notNull(),
    language: text("language").notNull().default(""),
    currentVersion: integer("current_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [index("artifacts_owner").on(t.ownerId), index("artifacts_chat").on(t.chatId)],
);

export const artifactVersions = sqliteTable(
  "artifact_versions",
  {
    id: text("id").primaryKey(),
    artifactId: text("artifact_id").notNull(),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    source: text("source", { enum: ["assistant", "edit", "restore"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("artifact_versions_unique").on(t.artifactId, t.version)],
);

export interface SnapshotMessage {
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
}

export const shares = sqliteTable(
  "shares",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    orgId: text("org_id").notNull(),
    kind: text("kind", { enum: ["chat", "artifact"] }).notNull(),
    targetId: text("target_id").notNull(),
    title: text("title").notNull(),
    snapshot: text("snapshot", { mode: "json" }).$type<SnapshotMessage[]>(),
    createdAt: createdAt(),
    revokedAt: text("revoked_at"),
  },
  (t) => [index("shares_owner").on(t.ownerId)],
);

/** App-wide facts the Worker keeps, such as the last AI setup refusal. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
