import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { deleteArtifact, listArtifacts } from "@/serverFunctions/artifacts";
import { formatWhen } from "@/routes/index";

export const Route = createFileRoute("/artifacts/")({
  loader: () => listArtifacts(),
  head: () => ({ meta: [{ title: "Artifacts · Team Assistant" }] }),
  component: ArtifactsPage,
});

const KIND = { html: "Web page", document: "Document", code: "Code" } as const;

function ArtifactsPage() {
  const rows = Route.useLoaderData();
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <AppShell>
      <PageHeader title="Artifacts" />
      {rows.length === 0 ? (
        <EmptyState title="No artifacts yet" description="Ask for a document, a web page or some code in a chat and it is kept here." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((a) => (
            <li key={a.id} data-testid="artifact-row" className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link to="/artifacts/$artifactId" params={{ artifactId: a.id }} className="block truncate text-sm font-medium hover:underline">
                  {a.title}
                </Link>
                {a.chatTitle ? <p className="truncate text-xs text-muted-foreground">{a.chatTitle}</p> : null}
              </div>
              <Badge variant="secondary">{KIND[a.kind]}</Badge>
              <span className="hidden text-xs text-muted-foreground sm:inline">v{a.currentVersion}</span>
              <time className="hidden text-xs text-muted-foreground sm:inline" dateTime={a.updatedAt} suppressHydrationWarning>
                {formatWhen(a.updatedAt)}
              </time>
              <Button data-testid="artifact-delete" variant="ghost" size="icon-sm" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {deleting ? (
        <ConfirmDialog
          title="Delete this artifact?"
          confirmLabel="Delete artifact"
          destructive
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await deleteArtifact({ data: { artifactId: deleting } });
              await router.invalidate();
            } catch (error) {
              toast.error(errorText(error));
            }
            setDeleting(null);
          }}
        >
          Every version and any link to it go too.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
