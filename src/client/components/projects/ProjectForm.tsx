import { useState } from "react";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";

export interface ProjectDraft {
  name: string;
  description: string;
  instructions: string;
}

export function ProjectForm({
  title,
  submitLabel,
  submitTestId,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  submitTestId: string;
  initial: ProjectDraft;
  onSubmit: (draft: ProjectDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <FormDialog
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid={submitTestId}
            pending={pending}
            disabled={!draft.name.trim()}
            onClick={async () => {
              setPending(true);
              try {
                await onSubmit(draft);
              } finally {
                setPending(false);
              }
            }}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input id="project-name" data-testid="project-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-description">Description</Label>
          <Input
            id="project-description"
            data-testid="project-description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-instructions">Instructions</Label>
          <Textarea
            id="project-instructions"
            data-testid="project-instructions"
            className="min-h-28"
            placeholder="What every chat in this project should know or do"
            value={draft.instructions}
            onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
          />
        </div>
      </div>
    </FormDialog>
  );
}
