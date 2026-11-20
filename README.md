# Team Assistant

A private AI chat workspace for your organization. Members chat with the workspace's AI model, keep personal instructions and memory, work in shared projects with their own instructions and documents, and get editable artifacts they can share inside the team.

Inspired by https://claude.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Chat with the AI model, attach text files, regenerate or edit the last turn, and rename, star, search or delete chats.
- Set standing instructions and keep memory notes that every one of your chats uses.
- Create projects with instructions and knowledge documents, and share them with members or the whole organization.
- Get documents, web pages and code as versioned artifacts you can edit, restore, copy and download.
- Share a chat snapshot or an artifact with your organization by link, and revoke it later.

Left out: accounts and sign-in, which your Gateway handles; web search and running code; image, PDF and voice input; connectors and plugins; agent tasks; desktop and mobile apps.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev` (put a provider key such as `OPENROUTER_API_KEY` in `.dev.vars` for replies)
- Test: `pnpm test` for unit tests; `checks/` holds the release suites, run with the oss.new runtime.
- Deploy: `pnpm run deploy`, then open the app from your Gateway.

There are no secrets or settings to set. Replies use the workspace's default AI model (`everyapp ai default`, or a provider key added with `everyapp provider add openrouter`); until one is set, chats show the setup message instead of the message box. The members capability lists who a project can be shared with.

## Limitations

- Replies arrive whole, not word by word.
- Attachments and project documents must be text files of up to 200 KB and 300 KB each.
- Share links open only for signed-in members of your organization.
- The checks use a local stand-in for the model; real model output and a real deployment were not exercised here.
