import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/client/components/AppShell";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { ProjectForm, type ProjectDraft } from "@/client/components/projects/ProjectForm";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { createProject, listProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/projects/")({
  loader: () => listProjects(),
  head: () => ({ meta: [{ title: "Projects · Team Assistant" }] }),
  component: ProjectsPage,
});

const ROLE_LABEL = { owner: null, edit: "Can edit", view: "Can view" } as const;

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  return (
    <AppShell>
      <PageHeader
        title="Projects"
        actions={
          <Button data-testid="new-project-button" onClick={() => setCreating(true)}>
            <Plus data-icon="inline-start" />
            New project
          </Button>
        }
      />
      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="A project keeps instructions and documents that every chat in it uses."
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 ? <ProjectList rows={active} /> : null}
          {archived.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
              <ProjectList rows={archived} />
            </section>
          ) : null}
        </div>
      )}
      {creating ? (
        <ProjectForm
          title="New project"
          submitLabel="Create project"
          submitTestId="project-create"
          initial={{ name: "", description: "", instructions: "" }}
          onClose={() => setCreating(false)}
          onSubmit={async (draft: ProjectDraft) => {
            try {
              const { id } = await createProject({ data: draft });
              await navigate({ to: "/projects/$projectId", params: { projectId: id } });
            } catch (error) {
              toast.error(errorText(error));
            }
          }}
        />
      ) : null}
    </AppShell>
  );
}

function ProjectList({ rows }: { rows: Awaited<ReturnType<typeof listProjects>> }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((p) => (
        <li key={p.id} data-testid="project-row" className="space-y-2 rounded-lg border border-border bg-card p-4">
          <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block font-medium hover:underline">
            {p.name}
          </Link>
          {p.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p> : null}
          <div className="flex flex-wrap gap-1.5">
            {ROLE_LABEL[p.role] ? <Badge variant="secondary">{ROLE_LABEL[p.role]}</Badge> : null}
            {p.role !== "owner" ? <Badge variant="outline">{p.ownerEmail}</Badge> : null}
            {p.orgVisible ? <Badge variant="outline">Organization</Badge> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
