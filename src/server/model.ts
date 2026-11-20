import { env } from "cloudflare:workers";
import { aiBaseUrl, createGatewayFetch, gatewayRefusal, refusalFromError } from "@every-app/sdk/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appState } from "@/db/schema";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Thrown when the Gateway has no model for this app: the page shows the setup message. */
export class ModelUnavailableError extends Error {
  constructor(readonly setup: string | null) {
    super("No AI model is set up.");
  }
}

const AI_OFF = "ai_off";

async function markAiOff(setup: string | null) {
  const value = JSON.stringify({ setup });
  await db.insert(appState).values({ key: AI_OFF, value }).onConflictDoUpdate({ target: appState.key, set: { value } });
}

/** The setup message from the last refused call, until a call succeeds. */
export async function aiStatus(): Promise<{ off: boolean; setup: string | null }> {
  const [row] = await db.select().from(appState).where(eq(appState.key, AI_OFF));
  if (!row) return { off: false, setup: null };
  return { off: true, setup: (JSON.parse(row.value) as { setup: string | null }).setup };
}

/** One chat completion from the workspace's default model. */
export async function complete(messages: ModelMessage[], maxTokens?: number): Promise<string> {
  let response: Response;
  try {
    const call = createGatewayFetch({ env });
    response = await call(`${aiBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "default", messages, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
    });
  } catch (error) {
    const refusal = refusalFromError(error);
    if (refusal) {
      await markAiOff(refusal.setup);
      throw new ModelUnavailableError(refusal.setup);
    }
    throw error;
  }
  const refusal = await gatewayRefusal(response);
  if (refusal) {
    if (refusal.status === 503 || /not_configured|not_allowed/.test(refusal.code)) {
      await markAiOff(refusal.setup);
      throw new ModelUnavailableError(refusal.setup);
    }
    throw new Error(refusal.message);
  }
  if (!response.ok) throw new Error(`The model answered with an error (${response.status}). Try again.`);
  const json = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
  await db.delete(appState).where(eq(appState.key, AI_OFF));
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("The model sent an empty reply. Try again.");
  return text;
}

/** A one-token call, to see whether a model is set up now. */
export async function probe(): Promise<{ off: boolean; setup: string | null }> {
  try {
    await complete([{ role: "user", content: "Reply with ok." }], 1);
    return { off: false, setup: null };
  } catch (error) {
    if (error instanceof ModelUnavailableError) return { off: true, setup: error.setup };
    // Any other answer means a model is there.
    return { off: false, setup: null };
  }
}
