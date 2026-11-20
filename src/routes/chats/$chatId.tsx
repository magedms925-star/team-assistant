import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { BookmarkPlus, Pencil, RefreshCw, Share2, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { CopyButton } from "@/client/components/CopyButton";
import { FormDialog } from "@/client/components/FormDialog";
import { NotFound } from "@/client/components/NotFound";
import { PageHeader } from "@/client/components/PageHeader";
import { AiSetup } from "@/client/components/chat/AiSetup";
import { ArtifactPanel, errorText } from "@/client/components/chat/ArtifactPanel";
import { Attachments } from "@/client/components/chat/Attachments";
import { Composer } from "@/client/components/chat/Composer";
import { MessageBody } from "@/client/components/chat/MessageBody";
import { ShareDialog } from "@/client/components/chat/ShareDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { deleteChat, editLast, getChat, regenerate, renameChat, sendMessage, starChat } from "@/serverFunctions/chats";
import { addMemory } from "@/serverFunctions/memory";
import { createShare } from "@/serverFunctions/shares";
import { splitStored } from "@/shared/artifactParse";
import { lastIndex } from "@/shared/lastIndex";

export const Route = createFileRoute("/chats/$chatId")({
  loader: ({ params }) => getChat({ data: { chatId: params.chatId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.chat.title} · Team Assistant` : "Team Assistant" }] }),
  component: ChatPage,
});

type Outcome = { chatId: string; aiOff?: undefined } | { aiOff: true; setup: string | null };

function ChatPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <AppShell>
        <NotFound what="chat" />
      </AppShell>
    );
  }
  return <Chat key={data.chat.id} data={data} />;
}

function Chat({ data }: { data: NonNullable<Awaited<ReturnType<typeof getChat>>> }) {
  const { chat, messages, artifacts } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ setup: string | null } | null>(data.ai.off ? { setup: data.ai.setup } : null);
  const [open, setOpen] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [remember, setRemember] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  async function model(work: () => Promise<Outcome>): Promise<boolean> {
    setBusy(true);
    try {
      const result = await work();
      if (result.aiOff) {
        setSetup({ setup: result.setup });
        return false;
      }
      await router.invalidate();
      setRefreshKey((k) => k + 1);
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function act(work: () => Promise<unknown>) {
    try {
      await work();
      await router.invalidate();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    }
  }

  const lastUser = lastIndex(messages, (m) => m.role === "user");
  const lastAssistant = lastIndex(messages, (m) => m.role === "assistant");

  return (
    <AppShell wide>
      <PageHeader
        title={chat.title}
        backLink={
          chat.project ? (
            <Link
              to="/projects/$projectId"
              params={{ projectId: chat.project.id }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {chat.project.name}
            </Link>
          ) : undefined
        }
        actions={
          <>
            <Button
              data-testid="star-button"
              variant="ghost"
              size="icon-sm"
              aria-label={chat.starred ? "Unstar" : "Star"}
              aria-pressed={chat.starred}
              onClick={() => act(() => starChat({ data: { chatId: chat.id, starred: !chat.starred } }))}
            >
              <Star className={chat.starred ? "fill-current" : undefined} />
            </Button>
            <Button data-testid="rename-button" variant="ghost" size="icon-sm" aria-label="Rename" onClick={() => setRenaming(chat.title)}>
              <Pencil />
            </Button>
            <Button
              data-testid="share-chat-button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { url } = await createShare({ data: { kind: "chat", targetId: chat.id } });
                  setShareUrl(url);
                } catch (error) {
                  toast.error(errorText(error));
                }
              }}
            >
              <Share2 data-icon="inline-start" />
              Share
            </Button>
            <Button data-testid="delete-chat-button" variant="ghost" size="icon-sm" aria-label="Delete chat" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </>
        }
      />

      <div className={open ? "grid gap-6 lg:grid-cols-2" : "mx-auto max-w-3xl"}>
        <div className="min-w-0 space-y-6">
          <ol className="space-y-6">
            {messages.map((m, i) => (
              <li key={m.id} data-testid="message" data-role={m.role} className={m.role === "user" ? "flex flex-col items-end gap-1" : "space-y-1"}>
                {m.role === "user" && editing !== null && i === lastUser ? (
                  <div className="w-full space-y-2">
                    <Textarea data-testid="edit-input" aria-label="Message" value={editing} onChange={(e) => setEditing(e.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        data-testid="edit-save"
                        size="sm"
                        pending={busy}
                        disabled={!editing.trim()}
                        onClick={async () => {
                          if (await model(() => editLast({ data: { chatId: chat.id, content: editing } }))) setEditing(null);
                        }}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                ) : m.role === "user" ? (
                  <div className="max-w-[85%] space-y-2 rounded-2xl bg-muted px-4 py-2.5">
                    <Attachments files={m.attachments} />
                    <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                  </div>
                ) : (
                  <MessageBody content={m.content} artifacts={artifacts} onOpen={(id) => setOpen(id)} />
                )}
                <div className="flex items-center gap-0.5 text-muted-foreground">
                  {m.role === "assistant" ? (
                    <CopyButton testId="copy-reply" value={plain(m.content)} successMessage="Copied" variant="ghost" size="icon-xs" label="Copy reply" />
                  ) : null}
                  <Button
                    data-testid="remember-button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Save to memory"
                    onClick={() => setRemember(plain(m.content).slice(0, 2000))}
                  >
                    <BookmarkPlus />
                  </Button>
                  {m.role === "user" && i === lastUser && editing === null && !setup ? (
                    <Button data-testid="edit-last-button" variant="ghost" size="icon-xs" aria-label="Edit message" onClick={() => setEditing(m.content)}>
                      <Pencil />
                    </Button>
                  ) : null}
                  {m.role === "assistant" && i === lastAssistant && i === messages.length - 1 && !setup ? (
                    <Button
                      data-testid="regenerate-button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Regenerate reply"
                      disabled={busy}
                      onClick={() => model(() => regenerate({ data: { chatId: chat.id } }))}
                    >
                      <RefreshCw />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <div className="sticky bottom-4">
            {setup ? (
              <AiSetup setup={setup.setup} onReady={() => setSetup(null)} />
            ) : (
              <Composer
                placeholder="Reply"
                onSend={(content, attachments) => model(() => sendMessage({ data: { chatId: chat.id, content, attachments } }))}
              />
            )}
          </div>
        </div>
        {open ? (
          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <ArtifactPanel
              artifactId={open}
              refreshKey={refreshKey}
              onClose={() => setOpen(null)}
              onDeleted={() => {
                setOpen(null);
                void router.invalidate();
              }}
              onAsk={setup ? undefined : (instruction) => model(() => sendMessage({ data: { chatId: chat.id, content: instruction, attachments: [] } }))}
            />
          </div>
        ) : null}
      </div>

      {remember !== null ? (
        <FormDialog
          title="Save to memory"
          onClose={() => setRemember(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => setRemember(null)}>
                Cancel
              </Button>
              <Button
                data-testid="remember-save"
                disabled={!remember.trim()}
                onClick={async () => {
                  if (await act(() => addMemory({ data: { content: remember.trim() } }))) {
                    toast.success("Saved to memory");
                    setRemember(null);
                  }
                }}
              >
                Save note
              </Button>
            </>
          }
        >
          <Textarea data-testid="remember-input" aria-label="Note" value={remember} onChange={(e) => setRemember(e.target.value)} className="min-h-28" />
        </FormDialog>
      ) : null}

      {renaming !== null ? (
        <FormDialog
          title="Rename chat"
          onClose={() => setRenaming(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button
                data-testid="rename-save"
                disabled={!renaming.trim()}
                onClick={async () => {
                  if (await act(() => renameChat({ data: { chatId: chat.id, title: renaming.trim() } }))) setRenaming(null);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <Input data-testid="rename-input" aria-label="Title" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
        </FormDialog>
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this chat?"
          confirmLabel="Delete chat"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteChat({ data: { chatId: chat.id } });
              await navigate({ to: "/" });
            } catch (error) {
              toast.error(errorText(error));
              setConfirmDelete(false);
            }
          }}
        >
          Its messages and artifacts are deleted. Links already shared keep working until you revoke them.
        </ConfirmDialog>
      ) : null}

      {shareUrl ? <ShareDialog url={shareUrl} chat onClose={() => setShareUrl(null)} /> : null}
    </AppShell>
  );
}

/** A message as plain text: artifact cards leave no marker behind. */
function plain(content: string): string {
  return splitStored(content)
    .filter((p) => p.type === "text")
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n\n");
}
