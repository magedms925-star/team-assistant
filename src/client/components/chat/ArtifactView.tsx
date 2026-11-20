import { Markdown } from "@/client/components/Markdown";

/**
 * An artifact's content: a web page runs in a sandboxed frame with no access
 * to this app, a document renders formatted, code shows as code.
 */
export function ArtifactView({ kind, content, className = "h-[60vh]" }: { kind: string; content: string; className?: string }) {
  if (kind === "html") {
    return (
      <iframe
        data-testid="artifact-frame"
        title="Preview"
        sandbox="allow-scripts"
        srcDoc={content}
        className={`w-full rounded-md border border-border bg-background ${className}`}
      />
    );
  }
  if (kind === "document") {
    return (
      <div data-testid="artifact-document" className={`overflow-y-auto rounded-md border border-border p-4 ${className}`}>
        <Markdown>{content}</Markdown>
      </div>
    );
  }
  return (
    <pre data-testid="artifact-code" className={`overflow-auto rounded-md border border-border bg-muted p-4 font-mono text-xs leading-relaxed ${className}`}>
      <code>{content}</code>
    </pre>
  );
}
