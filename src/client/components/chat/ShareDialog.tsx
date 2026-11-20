import { CopyButton } from "@/client/components/CopyButton";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";

/** The link a share created. */
export function ShareDialog({ url, chat, onClose }: { url: string; chat: boolean; onClose: () => void }) {
  return (
    <FormDialog
      title="Link created"
      onClose={onClose}
      actions={<Button variant="outline" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {chat
            ? "Members of your organization with this link can read the chat as it is now. Later messages stay private."
            : "Members of your organization with this link can see this artifact's latest version."}
        </p>
        <div className="flex gap-2">
          <Input data-testid="share-link" readOnly value={url} aria-label="Link" onFocus={(e) => e.target.select()} />
          <CopyButton value={url} successMessage="Link copied" size="sm" />
        </div>
      </div>
    </FormDialog>
  );
}
