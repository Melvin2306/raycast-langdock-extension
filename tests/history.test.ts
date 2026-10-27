import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  clearConversations,
  compactTurn,
  Conversation,
  currentAccount,
  getConversations,
  MAX_STORED_PROMPT_CHARS,
  saveConversation,
} from "../src/lib/history";
import { LocalStorage, preferences } from "./raycast-mock";

const conversation = (id: string): Conversation => ({
  id,
  title: id,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  turns: [{ question: "q", answer: "a", sources: [] }],
});

test("conversations are bound to the API key and host", async () => {
  await LocalStorage.clear();
  preferences.apiKey = "key-a";
  await saveConversation(conversation("a1"));
  const accountA = currentAccount();
  preferences.apiKey = "key-b";
  assert.notEqual(currentAccount(), accountA);
  assert.deepEqual(await getConversations(), [], "another key sees nothing");
  await saveConversation(conversation("b1"));
  assert.deepEqual(
    (await getConversations()).map((c) => c.id),
    ["b1"],
  );
  await clearConversations();
  preferences.apiKey = "key-a";
  assert.deepEqual(
    (await getConversations()).map((c) => c.id),
    ["a1"],
    "clearing B keeps A",
  );
  preferences.apiKey = "test-key";
});

test("the stored account is a hash, not the key", async () => {
  await LocalStorage.clear();
  preferences.apiKey = "super-secret-key";
  await saveConversation(conversation("x"));
  const raw = await LocalStorage.getItem<string>("chat-history");
  assert.ok(raw && !raw.includes("super-secret-key"));
  preferences.apiKey = "test-key";
});

test("long hidden prompts are truncated when stored", () => {
  const turn = compactTurn({
    question: "q",
    prompt: "x".repeat(MAX_STORED_PROMPT_CHARS + 10),
    answer: "a",
    sources: [],
  });
  assert.ok(turn.prompt!.length < MAX_STORED_PROMPT_CHARS + 20);
  assert.ok(turn.prompt!.endsWith("[…truncated]"));
});

test("corrupt history is ignored instead of crashing", async () => {
  await LocalStorage.setItem("chat-history", "{not json");
  assert.deepEqual(await getConversations(), []);
});
