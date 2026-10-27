# Langdock for Raycast

Chat with Langdock models and agents, work with selected text and files, generate images, and search your prompts, knowledge, meetings, tasks and workflows without leaving Raycast.

## Commands

**Chat**

- **Ask Langdock** – chat with Langdock. Type questions and follow-ups in the search bar, pick the model in the dropdown, copy or paste answers.
- **Ask Agent** – search your Langdock agents by name and chat with them. Agents with an input form open the form. Recently used agents appear first.
- **Ask About Web Page** – summarize or ask about the page open in your browser (needs the [Raycast browser extension](https://www.raycast.com/browser-extension)).
- **Ask About Screenshot** – capture part of the screen and ask about it.
- **Ask About Files** – ask about files, such as the ones selected in Finder.
- **Chat History** – search and continue earlier conversations.

**Selected text** (falls back to the clipboard)

- **Ask About Selection**, **Summarize Selection**, **Translate Selection**, **Improve Writing**, **Explain Selection** – Translate and Improve Writing put **Paste Answer** first, so the result can replace the selection.

**Search**

- **Search Prompts** – paste, copy or run prompts from your prompt library.
- **Search Knowledge** – semantic search across knowledge bases shared with your key.
- **Add to Knowledge Base** – upload files, such as the ones selected in Finder, to a knowledge base.
- **Search Skills** – use a skill's instructions in a chat.
- **Search Meetings** – read notes and transcripts of Langdock meetings, and summarize them.

**Images**

- **Generate Image** – generate an image with one of your workspace's image models.
- **Browse Generated Images** – copy, save or regenerate earlier images.

**Workspace**

- **Manage Scheduled Tasks** / **Create Scheduled Task** – create, run, pause and resume scheduled tasks.
- **Browse Workflows** – see workflows and the steps of recent runs.
- **Run Integration Action** – run an action of a custom, MCP or A2A integration with your connection.
- **Open Langdock** – open the desktop app, or the web app if it's not installed.

## Setup

1. In Langdock, create an API key under **Settings → Account → API keys** ([guide](https://docs.langdock.com/en/using-langdock/account/personal-api-keys)), or ask an admin for a workspace key.
2. Paste it into the extension preferences. Raycast asks for it the first time you run a command.
3. Personal keys start with model access only; your admin can allow more scopes, such as the Agent, Prompt, Knowledge, Skill, Integration, Workflow and Meetings APIs. Scheduled Tasks need a workspace key. [help.md](help.md) lists the scope each command needs, and error messages name a missing scope.

**Dedicated deployments:** set **API Base URL** to `https://<your-domain>/api/public`.

## Tips

- **Fallback search:** add **Ask Langdock** to Raycast's fallback commands (Raycast Settings → Extensions → Langdock → Ask Langdock → Use as Fallback). Then type a question into Raycast's root search and pick Ask Langdock to send it right away.
- **Quicklinks:** in **Ask Agent** or **Search Prompts**, use **Create Quicklink** (⌘⇧L) to give a favorite agent or prompt its own entry, alias and hotkey in Raycast.
- **Default models:** pick a model in a chat or in Generate Image and use **Set as Default Model** (⌘⇧D).
- **More commands:** to keep Raycast's search tidy, only the core commands are on after installing: Ask Langdock, Ask Agent, Ask About Selection, Improve Writing, Translate Selection, Ask About Web Page, Ask About Screenshot and Generate Image. Turn on the others in Raycast Settings → Extensions → Langdock.

## Notes

- **Auto** sends requests without a model, so Langdock uses your workspace's default model.
- Model names, descriptions and logos come from a snapshot of Langdock's model catalog in `src/lib/model-catalog.json`. Custom models get a name derived from their deployment name.

## Development

```bash
npm install
npm run dev     # loads the extension into Raycast in development mode
npm run lint
npm run build
npm test        # unit tests (markdown safety, API client, history, model names)

# Check the API client against a real workspace. Asks for confirmation first, since requests may cost money
# (2–3 small chat requests; --all also creates one image and uploads one small file; --yes skips the question).
LANGDOCK_API_KEY=… npm run smoke-test
```
