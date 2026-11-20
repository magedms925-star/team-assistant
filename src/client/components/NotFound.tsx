import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";

/** Something that isn't there, or isn't the viewer's to see. */
export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <div data-testid="not-found">
      <EmptyState
        icon={SearchX}
        title={`No ${what} here`}
        description="It may have been deleted, or it isn't shared with you."
        action={
          <Button nativeButton={false} render={<Link to="/" />}>
            Go to chats
          </Button>
        }
      />
    </div>
  );
}
