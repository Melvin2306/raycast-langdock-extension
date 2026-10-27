import { strict as assert } from "node:assert";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import {
  LangdockError,
  listAgents,
  listImageModels,
  parseApiBaseUrl,
  parseImageModels,
  streamChat,
  StreamEvent,
  webAppUrl,
} from "../src/lib/langdock";
import { preferences } from "./raycast-mock";

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;
let handler: Handler = (_req, _body, res) => res.end();
const requests: { url: string; auth?: string; body: string }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    requests.push({ url: req.url ?? "", auth: req.headers.authorization, body });
    handler(req, body, res);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  preferences.apiBaseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
after(() => server.close());

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};

async function collect(body: string) {
  handler = (_req, _body, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(body);
  };
  const events: StreamEvent[] = [];
  await streamChat({
    target: { model: "auto", webSearch: false },
    messages: [{ role: "user", text: "hi" }],
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
  });
  return events;
}

test("API base URL must be https, except loopback", () => {
  assert.equal(parseApiBaseUrl(undefined).error, undefined);
  assert.equal(parseApiBaseUrl("https://ld.example.com/api/public/").error, undefined);
  assert.equal(parseApiBaseUrl("http://localhost:3000").error, undefined);
  assert.match(parseApiBaseUrl("http://ld.example.com/api/public").error ?? "", /https/);
  assert.match(parseApiBaseUrl("ld.example.com/api/public").error ?? "", /not a valid URL/);
  assert.match(parseApiBaseUrl("https://user:pw@ld.example.com").error ?? "", /credentials/);
});

test("dedicated domains get the /api/public prefix, and the web app host maps to the API", () => {
  assert.deepEqual(parseApiBaseUrl("https://ld.dedicated.example"), { url: "https://ld.dedicated.example/api/public" });
  assert.deepEqual(parseApiBaseUrl("https://ld.corp.example/"), { url: "https://ld.corp.example/api/public" });
  assert.deepEqual(parseApiBaseUrl("https://ld.corp.example/api/public"), {
    url: "https://ld.corp.example/api/public",
  });
  assert.deepEqual(parseApiBaseUrl("https://app.langdock.com"), { url: "https://api.langdock.com" });
  assert.deepEqual(parseApiBaseUrl("https://api.langdock.com"), { url: "https://api.langdock.com" });
});

test("a web page instead of an API response gives a readable error", async () => {
  handler = (_req, _body, res) => {
    res.writeHead(404, { "content-type": "text/html" });
    res.end("<!doctype html><html><head><script>window.x=1</script></head></html>");
  };
  await assert.rejects(listAgents(), (error: unknown) => {
    assert.ok(error instanceof LangdockError);
    assert.match(error.message, /web page instead of an API response \(HTTP 404\)/);
    assert.ok(!error.message.includes("<script>"));
    return true;
  });
});

test("an invalid base URL never receives the API key", async () => {
  const before = preferences.apiBaseUrl;
  preferences.apiBaseUrl = "http://ld.example.com/api/public";
  const count = requests.length;
  await assert.rejects(listAgents(), (error: unknown) => error instanceof LangdockError && /https/.test(error.message));
  assert.equal(requests.length, count);
  preferences.apiBaseUrl = before;
});

test("webAppUrl maps cloud and dedicated base URLs", () => {
  const before = preferences.apiBaseUrl;
  preferences.apiBaseUrl = "";
  assert.equal(webAppUrl(), "https://app.langdock.com");
  preferences.apiBaseUrl = "https://ld.corp.example/api/public";
  assert.equal(webAppUrl(), "https://ld.corp.example");
  preferences.apiBaseUrl = "not a url";
  assert.equal(webAppUrl(), "https://app.langdock.com");
  preferences.apiBaseUrl = before;
});

test("streams the AI SDK v5 format, even when lines are split across chunks", async () => {
  handler = (_req, _body, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const raw =
      'data: {"type":"tool-input-start","toolName":"webSearch"}\n\n' +
      'data: {"type":"source-url","url":"https://a.b","title":"A"}\n\n' +
      'data: {"type":"text-delta","delta":"Hel"}\n\ndata: {"type":"text-delta","delta":"lo ü"}\n\ndata: [DONE]\n\n';
    res.write(raw.slice(0, 40));
    setTimeout(() => res.end(raw.slice(40)), 10);
  };
  const events: StreamEvent[] = [];
  await streamChat({
    target: { model: "auto", webSearch: true },
    messages: [{ role: "user", text: "hi" }],
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
  });
  assert.deepEqual(events, [
    { type: "tool", name: "webSearch" },
    { type: "source", url: "https://a.b", title: "A" },
    { type: "text", text: "Hel" },
    { type: "text", text: "lo ü" },
  ]);
  const sent = JSON.parse(requests.at(-1)!.body);
  assert.equal(sent.agent.model, undefined, "Auto sends no model");
  assert.equal(sent.agent.capabilities.webSearch, true);
  assert.equal(requests.at(-1)!.auth, "Bearer test-key");
});

test("streams the older data stream format and JSON responses", async () => {
  assert.deepEqual(await collect('0:"Hi "\n0:"there"\n'), [
    { type: "text", text: "Hi " },
    { type: "text", text: "there" },
  ]);
  handler = (_req, _body, res) => json(res, 200, { messages: [{ content: "plain" }] });
  const events: StreamEvent[] = [];
  await streamChat({
    target: { agentId: "a" },
    messages: [{ role: "user", text: "hi", attachments: ["att-1"] }],
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
  });
  assert.deepEqual(events, [{ type: "text", text: "plain" }]);
  const sent = JSON.parse(requests.at(-1)!.body);
  assert.equal(sent.agentId, "a");
  assert.deepEqual(sent.messages[0].metadata, { attachments: ["att-1"] });
});

test("stream errors and HTTP errors become LangdockErrors", async () => {
  await assert.rejects(collect('data: {"type":"error","errorText":"overloaded"}\n\n'), /overloaded/);
  handler = (_req, _body, res) => json(res, 401, { message: "Invalid API key" });
  await assert.rejects(
    streamChat({
      target: { model: "auto", webSearch: false },
      messages: [{ role: "user", text: "hi" }],
      signal: new AbortController().signal,
      onEvent: () => undefined,
    }),
    (error: unknown) => error instanceof LangdockError && error.status === 401 && /Invalid API key/.test(error.message),
  );
});

test("image models are read from the error body", async () => {
  const error = new LangdockError("x — hint", 400, {
    message: "Invalid model, available image generation models are: gpt-image-2.5-flare, flux-2-pro",
  });
  assert.deepEqual(parseImageModels(error), ["gpt-image-2.5-flare", "flux-2-pro"]);
  assert.deepEqual(
    parseImageModels(
      new LangdockError("x", 400, { message: "No image generation models available for the us region" }),
    ),
    [],
  );

  handler = (_req, _body, res) =>
    json(res, 400, { message: "Invalid model, available image generation models are: gpt-image-2" });
  assert.deepEqual(await listImageModels("eu"), ["gpt-image-2"]);
  assert.match(requests.at(-1)!.url, /^\/openai\/eu\/v1\/images\/generations$/);
});

test("agent listing stops on an empty page with a cursor", async () => {
  let calls = 0;
  handler = (_req, _body, res) => {
    calls++;
    json(
      res,
      200,
      calls === 1 ? { agents: [{ id: "1", name: "A" }], nextCursor: "c1" } : { agents: [], nextCursor: "c2" },
    );
  };
  const agents = await listAgents();
  assert.equal(agents.length, 1);
  assert.equal(calls, 2);
});
