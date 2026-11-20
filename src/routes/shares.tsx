import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { listShares, revokeShare } from "@/serverFunctions/shares";
import { formatWhen } from "@/routes/index";

export const Route = createFileRoute("/shares")({
  loader: () => listShares(),
  head: () => ({ meta: [{ title: "Links · Team Assistant" }] }),
  component: SharesPage,
});

function SharesPage() {
  const rows = Route.useLoaderData();
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <AppShell>
      <PageHeader title="Links" description="Chats and artifacts you've shared with your organization." />
      {rows.length === 0 ? (
        <EmptyState title="No links" description="Share a chat or an artifact and its link appears here." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((s) => (
            <li key={s.id} data-testid="share-row" className="flex items-center gap-3 px-3 py-2.5">
              <a href={`/s/${s.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                {s.title}
              </a>
              <Badge variant="secondary">{s.kind === "chat" ? "Chat" : "Artifact"}</Badge>
              <time className="hidden text-xs text-muted-foreground sm:inline" dateTime={s.createdAt} suppressHydrationWarning>
                {formatWhen(s.createdAt)}
              </time>
              <CopyButton value={`${origin}/s/${s.id}`} successMessage="Link copied" variant="ghost" size="icon-sm" label="Copy link" />
              <Button data-testid="revoke-share" variant="outline" size="sm" onClick={() => setRevoking(s.id)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {revoking ? (
        <ConfirmDialog
          title="Revoke this link?"
          confirmLabel="Revoke link"
          destructive
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            try {
              await revokeShare({ data: { shareId: revoking } });
              await router.invalidate();
            } catch (error) {
              toast.error(errorText(error));
            }
            setRevoking(null);
          }}
        >
          The link stops working for everyone.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
