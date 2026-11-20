import { Download, Pencil, Send, Share2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Spinner } from "@/client/components/ui/spinner";
import { Textarea } from "@/client/components/ui/textarea";
import { deleteArtifact, editArtifact, getArtifact, restoreVersion } from "@/serverFunctions/artifacts";
import { createShare } from "@/serverFunctions/shares";
import { ArtifactView } from "./ArtifactView";
import { ShareDialog } from "./ShareDialog";

type Artifact = NonNullable<Awaited<ReturnType<typeof getArtifact>>>;

const KIND_LABEL: Record<string, string> = { html: "Web page", document: "Document", code: "Code" };

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "That didn't work. Try again.";
}

/** One artifact: its versions, a hand editor, a way to ask the chat for changes, copy, download and share. */
export function ArtifactPanel({
  artifactId,
  refreshKey = 0,
  onAsk,
  onClose,
  onDeleted,
}: {
  artifactId: string;
  refreshKey?: number;
  onAsk?: (instruction: string) => Promise<boolean>;
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const [artifact, setArtifact] = useState<Artifact | null | undefined>(undefined);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [pending, setPending] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function load() {
    const found = await getArtifact({ data: { artifactId } });
    setArtifact(found);
    if (found) setSelected(found.currentVersion);
  }

  useEffect(() => {
    setEditing(null);
    void load();
  }, [artifactId, refreshKey]);

  async function run(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      await load();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  if (artifact === undefined) {
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (artifact === null) return <p className="p-4 text-sm text-muted-foreground">This artifact was deleted.</p>;

  const total = artifact.versions.length;
  const shown = artifact.versions.find((v) => v.version === selected) ?? artifact.versions.at(-1)!;

  return (
    <section data-testid="artifact-panel" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 data-testid="artifact-title" className="truncate text-lg font-semibold">
            {artifact.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{KIND_LABEL[artifact.kind] ?? artifact.kind}</Badge>
            <span data-testid="artifact-version">
              Version {shown.version} of {total}
            </span>
          </div>
        </div>
        {onClose ? (
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {artifact.versions.map((v) => (
            <Button
              key={v.version}
              data-testid="artifact-version-item"
              size="xs"
              variant={v.version === shown.version ? "secondary" : "ghost"}
              aria-pressed={v.version === shown.version}
              onClick={() => {
                setEditing(null);
                setSelected(v.version);
              }}
            >
              Version {v.version}
            </Button>
          ))}
        </div>
      ) : null}

      {editing !== null ? (
        <div className="space-y-2">
          <Textarea
            data-testid="artifact-editor"
            aria-label="Content"
            value={editing}
            onChange={(e) => setEditing(e.target.value)}
            className="h-[50vh] font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              data-testid="artifact-save"
              size="sm"
              pending={pending}
              onClick={async () => {
                if (await run(() => editArtifact({ data: { artifactId, content: editing } }))) setEditing(null);
              }}
            >
              Save as new version
            </Button>
          </div>
        </div>
      ) : (
        <ArtifactView kind={artifact.kind} content={shown.content} />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {shown.version !== artifact.currentVersion ? (
          <Button
            data-testid="artifact-restore"
            size="sm"
            pending={pending}
            onClick={() => run(() => restoreVersion({ data: { artifactId, version: shown.version } }))}
          >
            Restore this version
          </Button>
        ) : editing === null ? (
          <Button data-testid="artifact-edit-button" variant="outline" size="sm" onClick={() => setEditing(shown.content)}>
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
        ) : null}
        <CopyButton testId="artifact-copy" value={shown.content} successMessage="Copied" size="sm" />
        <Button
          variant="outline"
          size="sm"
          render={<a data-testid="artifact-download" href={`/api/artifacts/${artifact.id}/download`} download />}
          nativeButton={false}
        >
          <Download data-icon="inline-start" />
          Download
        </Button>
        <Button
          data-testid="artifact-share"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const { url } = await createShare({ data: { kind: "artifact", targetId: artifact.id } });
              setShareUrl(url);
            } catch (error) {
              toast.error(errorText(error));
            }
          }}
        >
          <Share2 data-icon="inline-start" />
          Share
        </Button>
        <Button variant="ghost" size="sm" aria-label="Delete artifact" onClick={() => setConfirming(true)}>
          <Trash2 />
        </Button>
      </div>

      {onAsk ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!ask.trim()) return;
            setPending(true);
            try {
              if (await onAsk(`About the artifact "${artifact.title}": ${ask.trim()}`)) setAsk("");
            } finally {
              setPending(false);
            }
          }}
        >
          <Input
            data-testid="artifact-ask-input"
            aria-label="Ask for changes"
            placeholder="Ask for changes"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
          />
          <Button data-testid="artifact-ask-send" type="submit" size="icon" aria-label="Send" pending={pending}>
            {pending ? null : <Send />}
          </Button>
        </form>
      ) : null}

      {shareUrl ? <ShareDialog url={shareUrl} chat={false} onClose={() => setShareUrl(null)} /> : null}
      {confirming ? (
        <ConfirmDialog
          title="Delete this artifact?"
          confirmLabel="Delete artifact"
          destructive
          pending={pending}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            if (await run(() => deleteArtifact({ data: { artifactId } }))) {
              setConfirming(false);
              onDeleted?.();
            }
          }}
        >
          Every version and any link to it go too.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
