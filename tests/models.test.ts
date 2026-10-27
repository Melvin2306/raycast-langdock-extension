import { strict as assert } from "node:assert";
import { test } from "node:test";
import { catalogEntry, displayName, groupByProvider, providerName } from "../src/lib/models";

const model = (name: string, region = "eu") => ({ id: name, name, region, supportsExtendedThinking: false });

test("catalog names are used when known", () => {
  assert.equal(displayName("gpt-6-luna"), "GPT-6 Luna");
  assert.equal(displayName("gpt-image-2.5-flare"), "GPT Image 2.5 Flare");
  assert.equal(providerName("flux-2-pro"), "Black Forest Labs");
});

test("current catalog entries win over deprecated duplicates", () => {
  assert.notEqual(catalogEntry("gpt-5")?.deprecated, true);
});

test("custom deployments get readable names", () => {
  assert.equal(displayName("claude-haiku-9-9"), "Haiku 9.9");
  assert.equal(displayName("moonshotai/kimi-k2.6"), "Kimi K2.6");
  assert.equal(displayName("My Custom Model"), "My Custom Model");
  assert.equal(providerName("moonshotai/kimi-k2.6"), "Moonshot AI");
});

test("models are grouped by provider in Langdock's order", () => {
  const groups = groupByProvider([model("claude-sonnet-5"), model("gpt-6-luna"), model("my-model")]);
  assert.deepEqual(
    groups.map(([name]) => name),
    ["OpenAI", "Anthropic", "Other"],
  );
});
