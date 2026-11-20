export type ArtifactKind = "document" | "html" | "code";

export interface ParsedArtifact {
  identifier: string;
  title: string;
  kind: ArtifactKind;
  language: string;
  content: string;
}

export type ReplyPart =
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: ParsedArtifact };

const TAG = /<artifact\b([^>]*)>([\s\S]*?)<\/artifact>/g;
const ATTR = /([a-zA-Z]+)\s*=\s*"([^"]*)"/g;

function kindOf(type: string | undefined, language: string): ArtifactKind {
  const t = (type ?? "").toLowerCase();
  if (t === "html" || t === "webpage" || t === "web") return "html";
  if (t === "code" || (t === "" && language)) return "code";
  return "document";
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "artifact"
  );
}

/** Splits a reply into prose and the artifacts the model wrapped in tags. */
export function parseReply(reply: string): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let last = 0;
  for (const match of reply.matchAll(TAG)) {
    const before = reply.slice(last, match.index);
    if (before.trim()) parts.push({ type: "text", text: before });
    const attrs: Record<string, string> = {};
    for (const [, key, value] of match[1]!.matchAll(ATTR)) attrs[key!.toLowerCase()] = value!;
    const language = attrs["language"] ?? "";
    const title = (attrs["title"] ?? "").trim() || "Untitled";
    parts.push({
      type: "artifact",
      artifact: {
        identifier: slug(attrs["identifier"] ?? title),
        title: title.slice(0, 200),
        kind: kindOf(attrs["type"], language),
        language: language.slice(0, 40),
        content: match[2]!.replace(/^\n/, "").replace(/\n$/, ""),
      },
    });
    last = match.index! + match[0].length;
  }
  const rest = reply.slice(last);
  if (rest.trim() || parts.length === 0) parts.push({ type: "text", text: rest });
  return parts;
}

/** A stored message refers to an artifact version with a marker on its own line. */
export const MARKER = /\[\[artifact:([A-Za-z0-9-]+):(\d+)\]\]/g;

export function marker(id: string, version: number): string {
  return `[[artifact:${id}:${version}]]`;
}

export type StoredPart =
  | { type: "text"; text: string }
  | { type: "artifact"; id: string; version: number };

export function splitStored(content: string): StoredPart[] {
  const parts: StoredPart[] = [];
  let last = 0;
  for (const match of content.matchAll(MARKER)) {
    const before = content.slice(last, match.index);
    if (before.trim()) parts.push({ type: "text", text: before.trim() });
    parts.push({ type: "artifact", id: match[1]!, version: Number(match[2]) });
    last = match.index! + match[0].length;
  }
  const rest = content.slice(last);
  if (rest.trim()) parts.push({ type: "text", text: rest.trim() });
  return parts;
}

export function artifactTag(a: { identifier: string; kind: string; title: string; language?: string }, content: string): string {
  const language = a.language ? ` language="${a.language}"` : "";
  return `<artifact identifier="${a.identifier}" type="${a.kind}" title="${a.title.replaceAll('"', "'")}"${language}>\n${content}\n</artifact>`;
}

const EXTENSIONS: Record<string, string> = {
  javascript: "js", typescript: "ts", python: "py", ruby: "rb", rust: "rs",
  go: "go", java: "java", css: "css", sql: "sql", shell: "sh", bash: "sh",
  json: "json", yaml: "yml", html: "html", tsx: "tsx", jsx: "jsx",
};

export function fileNameFor(a: { title: string; kind: ArtifactKind | string; language: string }): string {
  const base = slug(a.title);
  if (a.kind === "html") return `${base}.html`;
  if (a.kind === "document") return `${base}.md`;
  return `${base}.${EXTENSIONS[a.language.toLowerCase()] ?? (a.language.toLowerCase() || "txt")}`;
}
