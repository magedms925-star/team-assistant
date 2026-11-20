import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { ArtifactView } from "@/client/components/chat/ArtifactView";
import { Attachments } from "@/client/components/chat/Attachments";
import { MessageBody } from "@/client/components/chat/MessageBody";
import { CopyButton } from "@/client/components/CopyButton";
import { Button } from "@/client/components/ui/button";
import { continueShare, viewShare } from "@/serverFunctions/shares";

export const Route = createFileRoute("/s/$shareId")({
  loader: ({ params }) => viewShare({ data: { shareId: params.shareId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} · Team Assistant` : "Team Assistant" }] }),
  component: SharePage,
});

function SharePage() {
  const share = Route.useLoaderData();
  const { shareId } = Route.useParams();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  if (!share) {
    return (
      <AppShell>
        <div data-testid="share-missing">
          <EmptyState title="This link doesn't work" description="It was revoked, or it never existed." />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={share.title}
        description={`Shared by ${share.by}`}
        actions={
          share.kind === "chat" ? (
            <Button
              data-testid="continue-chat-button"
              pending={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const { chatId } = await continueShare({ data: { shareId } });
                  await navigate({ to: "/chats/$chatId", params: { chatId } });
                } catch (error) {
                  toast.error(errorText(error));
                  setPending(false);
                }
              }}
            >
              <MessageSquarePlus data-icon="inline-start" />
              Continue in a new chat
            </Button>
          ) : (
            <CopyButton value={share.artifact.content} successMessage="Copied" size="sm" />
          )
        }
      />
      {share.kind === "chat" ? (
        <ol className="space-y-6">
          {share.messages.map((m, i) => (
            <li key={i} data-testid="shared-message" data-role={m.role} className={m.role === "user" ? "flex flex-col items-end" : undefined}>
              {m.role === "user" ? (
                <div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5">
                  <Attachments files={m.attachments} />
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                </div>
              ) : (
                <MessageBody content={m.content} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <ArtifactView kind={share.artifact.kind} content={share.artifact.content} className="h-[70vh]" />
      )}
    </AppShell>
  );
}
