import { Code, FileText, Globe } from "lucide-react";
import { Markdown } from "@/client/components/Markdown";
import { parseReply, splitStored } from "@/shared/artifactParse";
import { ArtifactView } from "./ArtifactView";

const ICONS = { html: Globe, document: FileText, code: Code } as const;

export interface ArtifactRef {
  id: string;
  title: string;
  kind: "document" | "html" | "code";
}

/** A message's text, with its artifacts as cards that open the side panel. */
export function MessageBody({
  content,
  artifacts = [],
  onOpen,
}: {
  content: string;
  artifacts?: ArtifactRef[];
  onOpen?: (id: string, version: number) => void;
}) {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  return (
    <div className="space-y-3">
      {splitStored(content).map((part, i) => {
        if (part.type === "artifact") {
          const a = byId.get(part.id);
          if (!a) return <p key={i} className="text-sm text-muted-foreground italic">Deleted artifact</p>;
          const Icon = ICONS[a.kind];
          return (
            <button
              key={i}
              type="button"
              data-testid="artifact-card"
              onClick={() => onOpen?.(a.id, part.version)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted"
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.title}</span>
                <span className="block text-xs text-muted-foreground">Version {part.version}</span>
              </span>
            </button>
          );
        }
        return parseReply(part.text).map((p, j) =>
          p.type === "text" ? (
            <Markdown key={`${i}-${j}`}>{p.text}</Markdown>
          ) : (
            <div key={`${i}-${j}`} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{p.artifact.title}</p>
              <ArtifactView kind={p.artifact.kind} content={p.artifact.content} className="h-80" />
            </div>
          ),
        );
      })}
    </div>
  );
}
