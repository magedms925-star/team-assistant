import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { checkModel } from "@/serverFunctions/chats";

/** Takes the composer's place while the Gateway has no AI model for the app. */
export function AiSetup({ setup, onReady }: { setup: string | null; onReady: () => void }) {
  const [pending, setPending] = useState(false);
  const [still, setStill] = useState(false);
  return (
    <Alert data-testid="ai-setup">
      <AlertTitle>No AI model is set up yet</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{setup ?? "Ask an admin to choose a default AI model in the Gateway."}</p>
        {still ? <p>Still not set up.</p> : null}
        <Button
          data-testid="retry-ai"
          size="sm"
          variant="outline"
          pending={pending}
          onClick={async () => {
            setPending(true);
            try {
              const status = await checkModel();
              if (status.off) setStill(true);
              else onReady();
            } finally {
              setPending(false);
            }
          }}
        >
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
