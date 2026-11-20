import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Search, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { AiSetup } from "@/client/components/chat/AiSetup";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { Composer } from "@/client/components/chat/Composer";
import { Input } from "@/client/components/ui/input";
import { getHome, startChat } from "@/serverFunctions/chats";

export const Route = createFileRoute("/")({
  loader: () => getHome({ data: {} }),
  head: () => ({ meta: [{ title: "Chats · Team Assistant" }] }),
  component: Home,
});

type ChatRow = Awaited<ReturnType<typeof getHome>>["chats"][number];

function Home() {
  const { chats, ai } = Route.useLoaderData();
  
  const navigate = useNavigate();
  const [setup, setSetup] = useState<{ setup: string | null } | null>(ai.off ? { setup: ai.setup } : null);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  const starred = shown.filter((c) => c.starred);
  const recent = shown.filter((c) => !c.starred);

  return (
    <AppShell>
      <PageHeader title="Chats" />
      {setup ? (
        <AiSetup setup={setup.setup} onReady={() => setSetup(null)} />
      ) : (
        <Composer
          autoFocus
          placeholder="What can I help with?"
          onSend={async (content, attachments) => {
            try {
              const result = await startChat({ data: { content, attachments, projectId: null } });
              if (result.aiOff) {
                setSetup({ setup: result.setup });
                return false;
              }
              await navigate({ to: "/chats/$chatId", params: { chatId: result.chatId } });
              return true;
            } catch (error) {
              toast.error(errorText(error));
              return false;
            }
          }}
        />
      )}

      {chats.length === 0 ? (
        <EmptyState title="No chats yet" description="Send a message and your chat will appear here." />
      ) : (
        <div className="space-y-6">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              data-testid="chat-search"
              aria-label="Search chats"
              placeholder="Search chats"
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {shown.length === 0 ? (
            <EmptyState kind="filtered" title="No chat titles match" />
          ) : null}
          {starred.length > 0 ? <ChatList testId="starred-list" title="Starred" rows={starred} /> : null}
          {recent.length > 0 ? <ChatList testId="recent-list" title="Recent" rows={recent} /> : null}
        </div>
      )}
    </AppShell>
  );
}

function ChatList({ testId, title, rows }: { testId: string; title: string; rows: ChatRow[] }) {
  return (
    <section data-testid={testId} className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((c) => (
          <li key={c.id} data-testid="chat-row" className="flex items-center gap-3 px-3 py-2.5">
            {c.starred ? <Star className="size-4 shrink-0 fill-current text-muted-foreground" aria-label="Starred" /> : null}
            <Link to="/chats/$chatId" params={{ chatId: c.id }} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
              {c.title}
            </Link>
            {c.projectId ? <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-label="In a project" /> : null}
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={c.updatedAt} suppressHydrationWarning>
              {formatWhen(c.updatedAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function formatWhen(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
