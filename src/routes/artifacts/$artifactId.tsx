import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { NotFound } from "@/client/components/NotFound";
import { PageHeader } from "@/client/components/PageHeader";
import { ArtifactPanel } from "@/client/components/chat/ArtifactPanel";
import { Button } from "@/client/components/ui/button";
import { getArtifact } from "@/serverFunctions/artifacts";

export const Route = createFileRoute("/artifacts/$artifactId")({
  loader: ({ params }) => getArtifact({ data: { artifactId: params.artifactId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} · Team Assistant` : "Team Assistant" }] }),
  component: ArtifactPage,
});

function ArtifactPage() {
  const artifact = Route.useLoaderData();
  const navigate = useNavigate();
  if (!artifact) {
    return (
      <AppShell>
        <NotFound what="artifact" />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <PageHeader
        title={artifact.title}
        backLink={
          <Link to="/artifacts" className="text-sm text-muted-foreground hover:text-foreground">
            Artifacts
          </Link>
        }
        actions={
          artifact.chatId ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/chats/$chatId" params={{ chatId: artifact.chatId }} />}>
              Open chat
            </Button>
          ) : undefined
        }
      />
      <ArtifactPanel artifactId={artifact.id} onDeleted={() => void navigate({ to: "/artifacts" })} />
    </AppShell>
  );
}
