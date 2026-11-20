import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/client/components/FormDialog";
import { errorText } from "@/client/components/chat/ArtifactPanel";
import { Button } from "@/client/components/ui/button";
import { Label } from "@/client/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import { getProject, listPeople, removeMember, setMember, setVisibility } from "@/serverFunctions/projects";

type Data = NonNullable<Awaited<ReturnType<typeof getProject>>>;
type Role = "view" | "edit";

const ROLES = [
  { value: "view", label: "Can view" },
  { value: "edit", label: "Can edit" },
];

/** Who the project is shared with, and whether the whole organization sees it. */
export function ProjectSharing({ data, onClose, onChange }: { data: Data; onClose: () => void; onChange: () => Promise<void> }) {
  const { project, members } = data;
  const [people, setPeople] = useState<{ id: string; email: string; name: string }[]>([]);
  const [person, setPerson] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("view");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    listPeople().then(setPeople, (error: unknown) => toast.error(errorText(error)));
  }, []);

  async function act(work: () => Promise<unknown>) {
    setPending(true);
    try {
      await work();
      await onChange();
      return true;
    } catch (error) {
      toast.error(errorText(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  const choices = people
    .filter((p) => !members.some((m) => m.userId === p.id))
    .map((p) => ({ value: p.id, label: p.name ? `${p.name} · ${p.email}` : p.email }));

  return (
    <FormDialog title="Share project" onClose={onClose} actions={<Button variant="outline" onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Add a member</Label>
          <div className="flex flex-wrap gap-2">
            <Select items={choices} value={person} onValueChange={(v) => setPerson(v as string | null)}>
              <SelectTrigger data-testid="share-member-select" aria-label="Member" className="min-w-0 flex-1">
                <SelectValue placeholder={choices.length ? "Choose a member" : "No one else yet"} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select items={ROLES} value={role} onValueChange={(v) => v && setRole(v as Role)}>
              <SelectTrigger data-testid="share-role-select" aria-label="Access" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              data-testid="share-add"
              disabled={!person}
              pending={pending}
              onClick={async () => {
                if (person && (await act(() => setMember({ data: { projectId: project.id, userId: person, role } })))) setPerson(null);
              }}
            >
              Add
            </Button>
          </div>
        </div>

        {members.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <li key={m.userId} data-testid="project-member-row" className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
                <Select
                  items={ROLES}
                  value={m.role}
                  onValueChange={(v) => v && act(() => setMember({ data: { projectId: project.id, userId: m.userId, role: v as Role } }))}
                >
                  <SelectTrigger data-testid="member-role-select" aria-label={`Access for ${m.email}`} size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${m.email}`}
                  onClick={() => act(() => removeMember({ data: { projectId: project.id, userId: m.userId } }))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <Label htmlFor="org-visible" className="flex-col items-start gap-0.5">
            <span>Everyone in the organization</span>
            <span className="text-xs font-normal text-muted-foreground">They can view it and chat in it.</span>
          </Label>
          <Switch
            id="org-visible"
            data-testid="org-visible-switch"
            checked={project.orgVisible}
            onCheckedChange={(checked) => act(() => setVisibility({ data: { projectId: project.id, orgVisible: checked } }))}
          />
        </div>
      </div>
    </FormDialog>
  );
}
