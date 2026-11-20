import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ClipboardPaste, FileText, Pencil, Trash2, Upload, Users } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { FormDialog } from "@/client/components/FormDialog";
import { NotFound } from "@/client/components/NotFound";
import { PageHeader } from "@/client/components/PageHeader";
import { AiSetup } from "@/client/components/chat/AiSetup";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { formatSize } from "@/client/components/chat/Attachments";
import { Composer } from "@/client/components/chat/Composer";
import { readTextFiles, TEXT_ACCEPT } from "@/client/components/chat/textFiles";
import { ProjectForm } from "@/client/components/projects/ProjectForm";
import { ProjectSharing } from "@/client/components/projects/ProjectSharing";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { startChat } from "@/serverFunctions/chats";
import { addKnowledge, deleteKnowledge, deleteProject, getProject, setArchived, updateProject } from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/$projectId")({
  loader: ({ params }) => getProject({ data: { projectId: params.projectId } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.project.name} · Team Assistant` : "Team Assistant" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <AppShell>
        <NotFound what="project" />
      </AppShell>
    );
  }
  return <Project data={data} />;
}

function Project({ data }: { data: NonNullable<Awaited<ReturnType<typeof getProject>>> }) {
  const { project, canEdit, canManage, knowledge, chats } = data;
  const router = useRouter();
  const navigate = useNavigate();
  const upload = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pasting, setPasting] = useState<{ name: string; content: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [setup, setSetup] = useState<{ setup: string | null } | null>(null);

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
      <PageHeader
        title={project.name}
        backLink={
          <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            Projects
          </Link>
        }
        description={
          <div className="flex flex-wrap items-center gap-2">
            {project.description ? <span>{project.description}</span> : null}
            {project.archived ? (
              <Badge data-testid="archived-badge" variant="outline">
                Archived
              </Badge>
            ) : null}
            {data.role !== "owner" ? <Badge variant="secondary">{data.role === "edit" ? "Can edit" : "Can view"}</Badge> : null}
          </div>
        }
        actions={
          <>
            {canEdit ? (
              <>
                <Button data-testid="share-project-button" variant="outline" size="sm" onClick={() => setSharing(true)}>
                  <Users data-icon="inline-start" />
                  Share
                </Button>
                <Button data-testid="edit-project-button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
              </>
            ) : null}
            {canManage ? (
              <>
                <Button
                  data-testid="archive-project-button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={project.archived ? "Unarchive" : "Archive"}
                  onClick={() => act(() => setArchived({ data: { projectId: project.id, archived: !project.archived } }))}
                >
                  {project.archived ? <ArchiveRestore /> : <Archive />}
                </Button>
                <Button data-testid="delete-project-button" variant="ghost" size="icon-sm" aria-label="Delete project" onClick={() => setConfirmDelete(true)}>
                  <Trash2 />
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {project.archived ? null : setup ? (
        <AiSetup setup={setup.setup} onReady={() => setSetup(null)} />
      ) : (
        <Composer
          placeholder={`Start a chat in ${project.name}`}
          onSend={async (content, attachments) => {
            try {
              const result = await startChat({ data: { content, attachments, projectId: project.id } });
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

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Your chats in this project</h2>
        {chats.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {chats.map((c) => (
              <li key={c.id} data-testid="project-chat-row" className="px-3 py-2.5">
                <Link to="/chats/$chatId" params={{ chatId: c.id }} className="text-sm font-medium hover:underline">
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <p data-testid="project-instructions-view" className="text-sm whitespace-pre-wrap">
            {project.instructions || <span className="text-muted-foreground">None</span>}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge</CardTitle>
          {canEdit ? (
            <CardAction className="flex gap-2">
              <input
                ref={upload}
                data-testid="knowledge-upload"
                type="file"
                multiple
                accept={TEXT_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                onChange={async (e) => {
                  const { files, refused } = await readTextFiles(e.target.files);
                  e.target.value = "";
                  if (refused.length) toast.error(refused.join(". "));
                  for (const f of files) {
                    await act(() => addKnowledge({ data: { projectId: project.id, name: f.name, kind: "file", content: f.content } }));
                  }
                }}
              />
              <Button variant="outline" size="sm" onClick={() => upload.current?.click()}>
                <Upload data-icon="inline-start" />
                Upload
              </Button>
              <Button data-testid="knowledge-paste-button" variant="outline" size="sm" onClick={() => setPasting({ name: "", content: "" })}>
                <ClipboardPaste data-icon="inline-start" />
                Add text
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {knowledge.length === 0 ? (
            <EmptyState size="sm" title="No documents" description={canEdit ? "Every chat in this project reads the text files and notes you add here." : undefined} />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {knowledge.map((k) => (
                <li key={k.id} data-testid="knowledge-item" className="flex items-center gap-3 px-3 py-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a href={`/api/knowledge/${k.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {k.name}
                  </a>
                  <span className="text-xs text-muted-foreground">{formatSize(k.size)}</span>
                  {canEdit ? (
                    <Button
                      data-testid="knowledge-delete"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${k.name}`}
                      onClick={() => act(() => deleteKnowledge({ data: { id: k.id } }))}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing ? (
        <ProjectForm
          title="Edit project"
          submitLabel="Save"
          submitTestId="project-save"
          initial={{ name: project.name, description: project.description, instructions: project.instructions }}
          onClose={() => setEditing(false)}
          onSubmit={async (draft) => {
            if (await act(() => updateProject({ data: { id: project.id, ...draft } }))) setEditing(false);
          }}
        />
      ) : null}

      {pasting ? (
        <FormDialog
          title="Add text"
          onClose={() => setPasting(null)}
          actions={
            <>
              <Button variant="outline" onClick={() => setPasting(null)}>
                Cancel
              </Button>
              <Button
                data-testid="knowledge-save"
                disabled={!pasting.name.trim() || !pasting.content.trim()}
                onClick={async () => {
                  if (await act(() => addKnowledge({ data: { projectId: project.id, name: pasting.name, kind: "text", content: pasting.content } })))
                    setPasting(null);
                }}
              >
                Add
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="knowledge-title">Title</Label>
              <Input id="knowledge-title" data-testid="knowledge-title" value={pasting.name} onChange={(e) => setPasting({ ...pasting, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="knowledge-content">Text</Label>
              <Textarea
                id="knowledge-content"
                data-testid="knowledge-content"
                className="min-h-40"
                value={pasting.content}
                onChange={(e) => setPasting({ ...pasting, content: e.target.value })}
              />
            </div>
          </div>
        </FormDialog>
      ) : null}

      {sharing ? <ProjectSharing data={data} onClose={() => setSharing(false)} onChange={() => router.invalidate()} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this project?"
          confirmLabel="Delete project"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteProject({ data: { projectId: project.id } });
              await navigate({ to: "/projects" });
            } catch (error) {
              toast.error(errorText(error));
              setConfirmDelete(false);
            }
          }}
        >
          Its documents and everyone's chats in it are deleted.
        </ConfirmDialog>
      ) : null}
    </AppShell>
  );
}
