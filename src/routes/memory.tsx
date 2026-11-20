import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { addMemory, deleteMemory, getMemory, saveInstructions, updateMemory } from "@/serverFunctions/memory";

export const Route = createFileRoute("/memory")({
  loader: () => getMemory(),
  head: () => ({ meta: [{ title: "Memory · Team Assistant" }] }),
  component: MemoryPage,
});

function MemoryPage() {
  const { instructions, notes } = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState(instructions);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);

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

  return (
    <AppShell>
      <PageHeader title="Memory" description="Only you see these. They go into every chat you have." />

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            data-testid="instructions-input"
            aria-label="Instructions"
            value={draft}
            placeholder="Answer briefly. I work in operations at a bakery."
            className="min-h-32"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              data-testid="instructions-save"
              pending={saving}
              disabled={draft === instructions}
              onClick={async () => {
                setSaving(true);
                if (await act(() => saveInstructions({ data: { instructions: draft } }))) toast.success("Instructions saved");
                setSaving(false);
              }}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              if (await act(() => addMemory({ data: { content: note.trim() } }))) setNote("");
            }}
          >
            <Input data-testid="memory-input" aria-label="New note" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button data-testid="memory-add" type="submit" disabled={!note.trim()}>
              Add
            </Button>
          </form>
          {notes.length === 0 ? (
            <EmptyState size="sm" title="No notes yet" description="Add one here, or save one from any message in a chat." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {notes.map((n) => (
                <li key={n.id} data-testid="memory-item" className="flex items-start gap-2 px-3 py-2">
                  {editing?.id === n.id ? (
                    <form
                      className="flex flex-1 gap-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await act(() => updateMemory({ data: editing }))) setEditing(null);
                      }}
                    >
                      <Input
                        data-testid="memory-edit-input"
                        aria-label="Note"
                        value={editing.content}
                        onChange={(e) => setEditing({ id: n.id, content: e.target.value })}
                      />
                      <Button data-testid="memory-edit-save" type="submit" size="sm" disabled={!editing.content.trim()}>
                        Save
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p className="flex-1 py-1 text-sm whitespace-pre-wrap">{n.content}</p>
                      <Button data-testid="memory-edit" variant="ghost" size="icon-sm" aria-label="Edit note" onClick={() => setEditing({ id: n.id, content: n.content })}>
                        <Pencil />
                      </Button>
                      <Button
                        data-testid="memory-delete"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete note"
                        onClick={() => act(() => deleteMemory({ data: { id: n.id } }))}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
