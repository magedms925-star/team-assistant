import { createFileRoute } from "@tanstack/react-router";
import { requireEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { fileNameFor } from "@/shared/artifactParse";
import { currentContent, ownArtifact } from "@/server/artifacts";
import { NotFoundError } from "@/server/me";

const TYPES = { html: "text/html", document: "text/markdown", code: "text/plain" } as const;

/** The artifact's current version as a file, for its creator only. */
export const Route = createFileRoute("/api/artifacts/$artifactId/download")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { artifactId: string } }) => {
        const user = await requireEveryAppUser(request, env);
        try {
          await ownArtifact(user.id, params.artifactId);
        } catch (error) {
          if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
          throw error;
        }
        const a = (await currentContent(params.artifactId))!;
        return new Response(a.content, {
          headers: {
            "content-type": `${TYPES[a.kind]}; charset=utf-8`,
            "content-disposition": `attachment; filename="${fileNameFor(a)}"`,
            "x-content-type-options": "nosniff",
            "content-security-policy": "sandbox",
          },
        });
      },
    },
  },
});
