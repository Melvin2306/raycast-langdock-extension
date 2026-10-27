# Langdock for Raycast

Chat with Langdock models and agents, work with selected text and files, generate images, and search your prompts, knowledge, meetings, tasks and workflows without leaving Raycast.

## Commands

**Chat**

- **Ask Langdock** – ask a question and get a streamed answer. Ask follow-ups (⌘F), switch the model (⌘M), copy or paste the answer.
- **Ask Agent** – search your Langdock agents by name and chat with them. Recently used agents appear first.
- **Ask About Files** – ask about files, such as the ones selected in Finder.
- **Chat History** – search and continue earlier conversations.

**Selected text** (falls back to the clipboard)

- **Ask About Selection**, **Summarize Selection**, **Translate Selection**, **Improve Writing**, **Explain Selection** – Translate and Improve Writing put **Paste Answer** first, so the result can replace the selection.

**Search**

- **Search Prompts** – paste, copy or run prompts from your prompt library.
- **Search Knowledge** – semantic search across knowledge bases shared with your key.
- **Search Skills** – use a skill's instructions in a chat.
- **Search Meetings** – read notes and transcripts of Langdock meetings, and summarize them.

**Images**

- **Generate Image** – generate an image with one of your workspace's image models.
- **Browse Generated Images** – copy, save or regenerate earlier images.

**Workspace**

- **Manage Scheduled Tasks** – run, pause and resume scheduled tasks.
- **Browse Workflows** – see workflows and the steps of recent runs.
- **Open Langdock** – open the desktop app, or the web app if it's not installed.
- **Langdock Settings** – API key, default chat and image models, and which Langdock APIs your key can use.

## Setup

1. In Langdock, create an API key under **Settings → Account → API keys** ([guide](https://docs.langdock.com/en/using-langdock/account/personal-api-keys)), or ask an admin for a workspace key.
2. Paste it into the extension preferences, or open **Langdock Settings** and choose **Add API Key**.
3. Open **Langdock Settings** to see which features your key can use. Personal keys start with model access only; your admin can allow more scopes, such as the Agent, Prompt, Knowledge, Skill, Workflow and Meetings APIs. Scheduled Tasks need a workspace key.

**Dedicated deployments:** set **API Base URL** to `https://<your-domain>/api/public`.

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
