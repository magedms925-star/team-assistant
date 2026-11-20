import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "team-assistant",
  name: "Team Assistant",
  description:
    "Chat with your workspace's AI model, with personal memory, shared projects, editable artifacts and share links for your team.",
  resources: {
    d1: ["DB"],
  },
  ai: {
    chat: { why: "Writes the replies, artifacts and chat titles." },
  },
  capabilities: {
    members: { access: "read", why: "Lists the people you can share a project with." },
  },
});
