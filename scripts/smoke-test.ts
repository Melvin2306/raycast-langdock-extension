/**
 * Maintainer tool, not part of the extension: runs the API client against a real Langdock workspace.
 * Uses the API key from LANGDOCK_API_KEY and never prints it.
 *
 *   LANGDOCK_API_KEY=… npm run smoke-test            read-only checks plus two tiny chat requests
 *   LANGDOCK_API_KEY=… npm run smoke-test -- --all   also generates one image and uploads one small file
 */
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_CAPABILITIES,
  AUTO_MODEL,
  checkAccess,
  generateImage,
  getAgent,
  LangdockError,
  listAgents,
  listImageModels,
  listKnowledgeBases,
  listMeetings,
  listModels,
  listPrompts,
  listScheduledTasks,
  listSkills,
  listWorkflows,
  streamChat,
  uploadAttachment,
} from "../src/lib/langdock";
import { catalogEntry, displayName, providerName } from "../src/lib/models";

const all = process.argv.includes("--all");
let failures = 0;

async function step<T>(name: string, run: () => Promise<T>, describe: (value: T) => string = () => "") {
  const started = Date.now();
  try {
    const value = await run();
    console.log(`✓ ${name} (${Date.now() - started} ms) ${describe(value)}`);
    return value;
  } catch (error) {
    if (error instanceof LangdockError && error.status === 403) {
      console.log(`– ${name}: no access with this key`);
      return undefined;
    }
    failures++;
    console.log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function chat(target: Parameters<typeof streamChat>[0]["target"], text: string, attachments?: string[]) {
  let answer = "";
  const events = new Set<string>();
  await streamChat({
    target,
    messages: [{ role: "user", text, attachments }],
    signal: AbortSignal.timeout(90_000),
    onEvent: (event) => {
      events.add(event.type);
      if (event.type === "text") answer += event.text;
    },
  });
  if (!answer.trim()) throw new Error(`empty answer (events: ${[...events].join(", ") || "none"})`);
  return answer.trim().replace(/\s+/g, " ").slice(0, 80);
}

if (!process.env.LANGDOCK_API_KEY) {
  console.error("Set LANGDOCK_API_KEY first.");
  process.exit(1);
}
console.log(`API: ${process.env.LANGDOCK_API_BASE_URL ?? "https://api.langdock.com"}\n`);

console.log("API access");
for (const capability of API_CAPABILITIES) {
  const result = await checkAccess(capability);
  console.log(
    `  ${result.status === "available" ? "✓" : "·"} ${capability.title} (${capability.scope}): ${result.status}`,
  );
}
console.log();

const models = await step(
  "List chat models",
  listModels,
  (m) =>
    `${m.length} models, ${m.filter((x) => catalogEntry(x.name)).length} in bundled catalog: ` +
    m
      .slice(0, 6)
      .map((x) => `${displayName(x)} [${providerName(x)}]`)
      .join(", "),
);
await step(
  "Chat with Auto (no model)",
  () => chat({ model: AUTO_MODEL, webSearch: false }, "Reply with just: OK"),
  (a) => `→ "${a}"`,
);
if (models?.length) {
  const model = models.find((m) => /luna|mini|flash|haiku/i.test(m.name)) ?? models[0];
  await step(
    `Chat with ${displayName(model)}`,
    () => chat({ model: model.id, webSearch: false }, "Reply with just: OK"),
    (a) => `→ "${a}"`,
  );
}

const agents = await step(
  "List agents",
  listAgents,
  (a) =>
    `${a.length} agents: ${a
      .slice(0, 5)
      .map((x) => x.name)
      .join(", ")}`,
);
const agent = agents?.find((a) => !a.disabled && a.inputType === "PROMPT");
if (agent) {
  await step(
    `Get agent "${agent.name}"`,
    () => getAgent(agent.id),
    (a) => `${a.conversationStarters.length} conversation starters`,
  );
  await step(
    `Chat with agent "${agent.name}"`,
    () => chat({ agentId: agent.id }, "Reply with just: OK"),
    (a) => `→ "${a}"`,
  );
}

await step(
  "List prompts",
  () => listPrompts(""),
  (p) => `${p.length} prompts`,
);
await step(
  "List skills",
  () => listSkills(""),
  (s) => `${s.length} skills`,
);
await step("List knowledge bases", listKnowledgeBases, (k) => `${k.length} knowledge bases`);
await step(
  "List meetings",
  () => listMeetings(""),
  (m) => `${m.length} meetings`,
);
await step("List workflows", listWorkflows, (w) => `${w.length} workflows`);
await step("List scheduled tasks", listScheduledTasks, (t) => `${t.length} tasks`);
const imageModels = await step(
  "Discover image models (EU)",
  () => listImageModels("eu"),
  (m) => m.map((x) => displayName(x)).join(", ") || "none",
);
await step(
  "Discover image models (US)",
  () => listImageModels("us"),
  (m) => m.map((x) => displayName(x)).join(", ") || "none",
);

if (all) {
  if (imageModels?.length) {
    await step(
      `Generate image with ${displayName(imageModels[0])}`,
      () =>
        generateImage({
          model: imageModels[0],
          prompt: "A small red circle on white",
          region: "eu",
          size: "1024x1024",
          quality: "low",
        }),
      (r) => `${Math.round((r.base64.length * 3) / 4 / 1024)} KB`,
    );
  }
  const file = join(tmpdir(), "langdock-smoke-test.txt");
  await writeFile(file, "The secret word is BANANA.\n");
  const attachmentId = await step(
    "Upload attachment",
    () => uploadAttachment(file),
    (id) => id,
  );
  if (attachmentId) {
    await step(
      "Chat about uploaded file",
      () =>
        chat(
          { model: AUTO_MODEL, webSearch: false },
          "What is the secret word in the file? Reply with the word only.",
          [attachmentId],
        ),
      (a) => `→ "${a}"`,
    );
  }
}

console.log(failures ? `\n${failures} step(s) failed.` : "\nAll steps passed.");
process.exit(failures ? 1 : 0);
