import { createFileRoute } from "@tanstack/react-router";
import { requireEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { me, NotFoundError } from "@/server/me";
import { readKnowledge } from "@/server/projects";

/** A project document as plain text, for anyone who can view the project. */
export const Route = createFileRoute("/api/knowledge/$fileId")({
  server: {
    handlers: {
      GET: async ({ request, params }: { request: Request; params: { fileId: string } }) => {
        const user = await requireEveryAppUser(request, env);
        try {
          const doc = await readKnowledge(me(user), params.fileId);
          return new Response(doc.content, {
            headers: {
              "content-type": "text/plain; charset=utf-8",
              "content-disposition": `inline; filename="${doc.name.replace(/["\\\r\n]/g, "")}"`,
              "x-content-type-options": "nosniff",
              "content-security-policy": "sandbox",
            },
          });
        } catch (error) {
          if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
          throw error;
        }
      },
    },
  },
});
