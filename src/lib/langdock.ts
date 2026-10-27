import { getPreferenceValues } from "@raycast/api";
import { randomUUID } from "node:crypto";
import { openAsBlob } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export const DEFAULT_API_BASE_URL = "https://api.langdock.com";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validates an API base URL. The API key is sent to this URL, so only https is accepted,
 * except for loopback addresses used in local development.
 */
export function parseApiBaseUrl(value: string | undefined): { url: string; error?: undefined } | { error: string } {
  const raw = (value?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: `"${raw}" is not a valid URL. Use https://<your-domain>/api/public.` };
  }
  const isLoopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    return { error: "The API Base URL must start with https://." };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { error: "The API Base URL must not contain credentials, a query or a fragment." };
  }
  // Common mistakes: the cloud web app host, or a dedicated domain without the /api/public prefix
  // (the web app answers those paths with its HTML page).
  if (url.hostname === "app.langdock.com") return { url: DEFAULT_API_BASE_URL };
  if (url.hostname !== "api.langdock.com" && !isLoopback && url.pathname === "/") {
    return { url: `${url.origin}/api/public` };
  }
  return { url: raw };
}

/** The configured API base URL, or the default when the preference is invalid (requests then fail with the error). */
export function apiBaseUrl(): string {
  const parsed = parseApiBaseUrl(getPreferenceValues<Preferences>().apiBaseUrl);
  return parsed.error === undefined ? parsed.url : DEFAULT_API_BASE_URL;
}

export function apiBaseUrlError(): string | undefined {
  return parseApiBaseUrl(getPreferenceValues<Preferences>().apiBaseUrl).error;
}

/** Web app URL matching the configured API: app.langdock.com for cloud, the deployment root for dedicated. */
export function webAppUrl(): string {
  const base = apiBaseUrl();
  if (new URL(base).hostname === "api.langdock.com") return "https://app.langdock.com";
  return base.replace(/\/api\/public$/, "");
}

export function apiKey(): string {
  return getPreferenceValues<Preferences>().apiKey?.trim() ?? "";
}

export class LangdockError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Parsed JSON error body, when there was one. */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "LangdockError";
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (!apiKey()) throw new LangdockError("No API key set. Add one in the extension preferences.", 401);
  const baseUrlError = apiBaseUrlError();
  if (baseUrlError) throw new LangdockError(baseUrlError);
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      // Multipart bodies set their own content type with the boundary.
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) throw await toError(response);
  return response;
}

async function toError(response: Response): Promise<LangdockError> {
  let detail = "";
  let body: unknown;
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      body = json;
      detail = String(json.message ?? json.error?.message ?? json.error ?? text);
    } catch {
      // A web page instead of an API response means the base URL points at the web app, not the API.
      detail = /^\s*</.test(text)
        ? `Got a web page instead of an API response (HTTP ${response.status}). Check the API Base URL; dedicated deployments use https://<your-domain>/api/public.`
        : text;
    }
  } catch {
    // Body unreadable; fall back to the status text.
  }
  if (detail.length > 500) detail = `${detail.slice(0, 500)}…`;
  const hint =
    response.status === 401
      ? "Check the API key in the extension preferences."
      : response.status === 403
        ? "The API key is missing a scope or access to this resource."
        : response.status === 429
          ? "Rate limit reached, try again in a moment."
          : "";
  const message = [detail || `${response.status} ${response.statusText}`, hint].filter(Boolean).join(" — ");
  return new LangdockError(String(message), response.status, body);
}

// Models

export interface Model {
  id: string;
  name: string;
  region: string;
  supportsExtendedThinking: boolean;
}

/** Sentinel for "Auto": the request is sent without a model, so the workspace's default model answers. */
export const AUTO_MODEL = "auto";
/** Preferred model when a request without a model is rejected; any available model is used otherwise. */
export const FALLBACK_MODEL = "gpt-6-luna";

const MODELS_TTL_MS = 60_000;
let modelsCache: { at: number; models: Promise<Model[]> } | undefined;

/** Lists chat models. Calls within a minute share one request. */
export function listModels(): Promise<Model[]> {
  if (!modelsCache || Date.now() - modelsCache.at > MODELS_TTL_MS) {
    const models = request("/agent/v1/models")
      .then((response) => response.json() as Promise<{ data: Model[] }>)
      .then((json) => json.data);
    modelsCache = { at: Date.now(), models };
    models.catch(() => (modelsCache = undefined));
  }
  return modelsCache.models;
}

/** Picks the model to retry with when a request without a model is rejected. */
export async function fallbackModelId(): Promise<string | undefined> {
  const models = await listModels().catch(() => []);
  return (matchModel(models, FALLBACK_MODEL) ?? models[0])?.id;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function isAutoModel(model: string): boolean {
  return normalize(model) === AUTO_MODEL;
}

/** Finds a model by id or deployment name, ignoring case and punctuation. */
export function matchModel(models: Model[], wanted: string): Model | undefined {
  return models.find((m) => normalize(m.id) === normalize(wanted) || normalize(m.name) === normalize(wanted));
}

/** Maps a loosely written model to its API id, or returns it unchanged. */
export async function resolveModelId(wanted: string): Promise<string> {
  if (isAutoModel(wanted)) return AUTO_MODEL;
  try {
    return matchModel(await listModels(), wanted)?.id ?? wanted;
  } catch {
    return wanted;
  }
}

// Agents

export type AgentInputType = "PROMPT" | "STRUCTURED" | "INTEGRATION" | "SCHEDULED" | "WEBHOOK";

/** A field of an agent's input form (agents with input type STRUCTURED). */
export interface AgentInputField {
  type: "TEXT" | "MULTI_LINE_TEXT" | "NUMBER" | "CHECKBOX" | "FILE" | "SELECT" | "MULTI_SELECT" | "DATE" | "EMAIL";
  label: string;
  description: string | null;
  required: boolean;
  order: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  emojiIcon: string | null;
  model: string | null;
  conversationStarters: string[];
  inputType?: AgentInputType;
  inputFields?: AgentInputField[];
}

export interface AgentListItem {
  id: string;
  name: string | null;
  description: string | null;
  emojiIcon: string | null;
  /** Deployment name, or "auto". */
  model: string | null;
  inputType: AgentInputType;
  owner: { id: string; name: string | null; email: string } | null;
  disabled: boolean;
  updatedAt: string | null;
}

/** Agents this key can use. Personal keys see the same agents as their owner. Older deployments answer 404. */
export async function listAgents(): Promise<AgentListItem[]> {
  const agents: AgentListItem[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ limit: "250", ...(cursor ? { cursor } : {}) });
    const response = await request(`/agent/v1/list?${params}`);
    const json = (await response.json()) as { agents: AgentListItem[]; nextCursor?: string };
    agents.push(...json.agents);
    // Stop on an empty page as well, so a misbehaving cursor cannot loop forever.
    cursor = json.agents.length > 0 ? json.nextCursor : undefined;
  } while (cursor && agents.length < 1000);
  return agents;
}

export async function getAgent(agentId: string): Promise<Agent> {
  const response = await request(`/agent/v1/get?agentId=${encodeURIComponent(agentId)}`);
  const json = (await response.json()) as { agent: Agent };
  return json.agent;
}

// Prompt library

export interface Prompt {
  id: string;
  title: string;
  prompt: string;
  sharedWithWorkspace: boolean;
  updatedAt: string | null;
}

export async function listPrompts(query: string): Promise<Prompt[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (query) params.set("query", query);
  const response = await request(`/prompts/v1?${params}`);
  const json = (await response.json()) as { prompts: Prompt[] };
  return json.prompts;
}

// Files

const MEDIA_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mediaType(path: string): string {
  return MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** Uploads a file for use in agent chats. Needs the Knowledge Folder API scope. */
export async function uploadAttachment(path: string): Promise<string> {
  const form = new FormData();
  form.append("file", await openAsBlob(path, { type: mediaType(path) }), basename(path));
  const response = await request("/attachment/v1/upload", { method: "POST", body: form });
  const json = (await response.json()) as { attachmentId: string };
  return json.attachmentId;
}

export async function inlineFile(path: string): Promise<InlineFile> {
  const type = mediaType(path);
  const data = await readFile(path);
  return { filename: basename(path), mediaType: type, url: `data:${type};base64,${data.toString("base64")}` };
}

// Scheduled tasks

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  modelId: string | null;
  modelMode: "UNSET" | "EXPLICIT" | "AUTO";
  frequency: "MANUAL" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY" | "SELECTED_WEEKDAYS";
  timeOfDay: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  daysOfWeek: number[];
  timezone: string | null;
  active: boolean;
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
}

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const response = await request("/automations/v1?limit=250");
  const json = (await response.json()) as { automations: ScheduledTask[] };
  return json.automations;
}

export interface NewScheduledTask {
  name: string;
  prompt: string;
  frequency: ScheduledTask["frequency"];
  /** HH:MM, required unless the task is manual. */
  timeOfDay?: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfWeek?: number[];
  timezone?: string;
  assistantId?: string;
}

/** Creates a scheduled task. Needs the Scheduled Tasks API scope (workspace keys). */
export async function createScheduledTask(task: NewScheduledTask): Promise<ScheduledTask> {
  const response = await request("/automations/v1", { method: "POST", body: JSON.stringify(task) });
  const json = (await response.json()) as { automation: ScheduledTask };
  return json.automation;
}

export async function runScheduledTask(id: string): Promise<void> {
  await request(`/automations/v1/${encodeURIComponent(id)}/run`, { method: "POST" });
}

export async function setScheduledTaskActive(id: string, active: boolean): Promise<void> {
  await request(`/automations/v1/${encodeURIComponent(id)}/${active ? "resume" : "pause"}`, { method: "POST" });
}

// Knowledge bases

export interface KnowledgeResult {
  id: string;
  text: string;
  similarity: number;
  subsource: string;
  subname: string;
  url: string | null;
}

export async function searchKnowledge(query: string): Promise<KnowledgeResult[]> {
  const response = await request("/knowledge/search", { method: "POST", body: JSON.stringify({ query }) });
  const json = (await response.json()) as { result: KnowledgeResult[] };
  return json.result;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  updatedAt: string;
  /** EDITOR can upload files; USER can only search. */
  role: "USER" | "EDITOR";
}

/** Only workspace keys get knowledge bases here; personal keys get an empty list. */
export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  const response = await request("/knowledge?limit=100");
  const json = (await response.json()) as { result: { folders: KnowledgeBase[] } };
  return json.result.folders;
}

/** Uploads a file to a knowledge base. Langdock processes it in the background. */
export async function uploadToKnowledgeBase(folderId: string, path: string, sourceUrl?: string): Promise<string> {
  const form = new FormData();
  form.append("file", await openAsBlob(path, { type: mediaType(path) }), basename(path));
  if (sourceUrl) form.append("url", sourceUrl);
  const response = await request(`/knowledge/${encodeURIComponent(folderId)}`, { method: "POST", body: form });
  const json = (await response.json()) as { result?: { id?: string } };
  return json.result?.id ?? "";
}

// Integrations (custom, MCP and A2A integrations shared with the API key)

export interface IntegrationSummary {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  integrationType: string;
  actions: { id: string; name: string; description: string | null; requiresConfirmation: boolean }[];
}

export interface ActionInputField {
  slug: string;
  label: string;
  type: "TEXT" | "MULTI_LINE_TEXT" | "PASSWORD" | "SELECT" | "NUMBER" | "BOOLEAN" | "VECTOR" | "OBJECT" | "FILE" | "ID";
  description: string | null;
  placeholder: string | null;
  required: boolean;
  order: number;
  options: { label: string; value: string }[] | null;
  allowMultiSelect: boolean | null;
}

export interface IntegrationAction {
  id: string;
  name: string;
  description: string | null;
  inputFields: ActionInputField[];
}

export interface IntegrationConnection {
  id: string;
  name: string | null;
  valid: boolean;
}

export interface ActionResult {
  success: boolean;
  authError: boolean;
  error?: unknown;
  result?: unknown;
  durationMs: number;
}

export async function listIntegrations(): Promise<IntegrationSummary[]> {
  const response = await request("/integrations/v1/get");
  const json = (await response.json()) as { integrations: IntegrationSummary[] };
  return json.integrations;
}

export async function getIntegrationActions(integrationId: string): Promise<IntegrationAction[]> {
  const response = await request(`/integrations/v1/${encodeURIComponent(integrationId)}`);
  const json = (await response.json()) as { integration: { actions: IntegrationAction[] } };
  return json.integration.actions;
}

export async function listIntegrationConnections(integrationId: string): Promise<IntegrationConnection[]> {
  const response = await request(`/integrations/v1/${encodeURIComponent(integrationId)}/connections`);
  const json = (await response.json()) as { connections: IntegrationConnection[] };
  return json.connections;
}

export async function executeIntegrationAction(options: {
  integrationId: string;
  actionId: string;
  connectionId: string;
  inputs: Record<string, unknown>;
}): Promise<ActionResult> {
  const { integrationId, actionId, connectionId, inputs } = options;
  const response = await request(
    `/integrations/v1/${encodeURIComponent(integrationId)}/actions/${encodeURIComponent(actionId)}/execute`,
    { method: "POST", body: JSON.stringify({ connectionId, inputs }) },
  );
  return (await response.json()) as ActionResult;
}

// Workflows

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "INACTIVE";
  updatedAt: string;
  owner: { id: string; name: string | null };
  accessRole: "user" | "editor" | "owner";
  activeVersion: { id: string; version: string } | null;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const response = await request("/workflows/v1/list?limit=250");
  const json = (await response.json()) as { workflows: Workflow[] };
  return json.workflows;
}

export interface WorkflowNodeExecution {
  id: string;
  workflowNodeId: string;
  status: string;
  durationMs: number;
  inputError: unknown;
  outputError: unknown;
  output: unknown;
}

export interface WorkflowRun {
  id: string;
  runNumber: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  isTestRun: boolean;
  isExecutionDataExpired: boolean;
  workflowVersion: { version: string; nodes: { id: string; name?: string; type?: string }[] };
  executions: WorkflowNodeExecution[];
}

export async function listWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  const params = new URLSearchParams({ workflowId, limit: "50" });
  const response = await request(`/workflows/v1/runs?${params}`);
  const json = (await response.json()) as { runs: WorkflowRun[] };
  return json.runs;
}

// Skills

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  instructions: string;
  updatedAt: string;
}

export async function listSkills(query: string): Promise<Skill[]> {
  const params = new URLSearchParams({ limit: "100" });
  if (query) params.set("query", query);
  const response = await request(`/skills/v1?${params}`);
  const json = (await response.json()) as { skills: Skill[] };
  return json.skills;
}

// Meetings (Langdock meeting recorder)

export interface Meeting {
  id: string;
  url: string;
  title: string | null;
  status: "RECORDING" | "PROCESSING" | "READY" | "FAILED";
  startedAt: string | null;
  endedAt: string | null;
  durationMins: number | null;
  createdAt: string;
  createdBy: { id: string | null; email: string | null };
  notesStatus: "PENDING" | "GENERATING" | "READY" | "FAILED";
  folder: { id: string; name: string } | null;
  calendarEvent: { title: string; attendees: { email: string; displayName: string | null }[] } | null;
}

export async function listMeetings(search: string): Promise<Meeting[]> {
  const params = new URLSearchParams({ limit: "100", includeShared: "true" });
  if (search) params.set("search", search);
  const response = await request(`/meetings/v1/list?${params}`);
  const json = (await response.json()) as { meetings: Meeting[] };
  return json.meetings;
}

export async function getMeetingNotes(id: string): Promise<string> {
  const response = await request(`/meetings/v1/${encodeURIComponent(id)}/notes`);
  const json = (await response.json()) as { content: string };
  return json.content;
}

export interface TranscriptSegment {
  startAt: string;
  speaker: "Me" | "Them";
  speakerName: string | null;
  text: string;
}

export async function getMeetingTranscript(id: string): Promise<TranscriptSegment[]> {
  const response = await request(`/meetings/v1/${encodeURIComponent(id)}/transcript`);
  const json = (await response.json()) as { segments: TranscriptSegment[] };
  return json.segments;
}

// Image generation (OpenAI-compatible images API)

export type ImageRegion = "eu" | "us";
export type ImageSize = "auto" | "1024x1024" | "1536x1024" | "1024x1536";
export type ImageQuality = "auto" | "low" | "medium" | "high";

export async function generateImage(options: {
  model: string;
  prompt: string;
  region: ImageRegion;
  size: ImageSize;
  quality: ImageQuality;
  signal?: AbortSignal;
}): Promise<{ base64: string; revisedPrompt?: string }> {
  const { model, prompt, region, size, quality, signal } = options;
  const response = await request(`/openai/${region}/v1/images/generations`, {
    method: "POST",
    body: JSON.stringify({ model, prompt, size, quality, response_format: "b64_json" }),
    signal,
  });
  const json = (await response.json()) as { data: { b64_json: string; revised_prompt?: string }[] };
  return { base64: json.data[0].b64_json, revisedPrompt: json.data[0].revised_prompt };
}

const DISCOVERY_MODEL = "raycast-image-model-discovery";

/** Lists the image models of a region. The images API names them when it rejects an unknown model. */
export async function listImageModels(region: ImageRegion): Promise<string[]> {
  try {
    await generateImage({ model: DISCOVERY_MODEL, prompt: "-", region, size: "auto", quality: "auto" });
  } catch (error) {
    if (!(error instanceof LangdockError) || error.status !== 400) throw error;
    return parseImageModels(error);
  }
  return [];
}

export function parseImageModels(error: LangdockError): string[] {
  // "Invalid model, available image generation models are: a, b" or "No image generation models available…"
  const body = error.body as { message?: unknown } | undefined;
  const message = typeof body?.message === "string" ? body.message : "";
  const listed = /available image generation models are:\s*(.+)$/i.exec(message)?.[1];
  if (!listed) return [];
  return [
    ...new Set(
      listed
        .split(/,\s*/)
        .map((name) => name.trim())
        .filter((name) => name && name !== DISCOVERY_MODEL),
    ),
  ];
}

// API access checks

export type AccessStatus = "available" | "missing-scope" | "invalid-key" | "error";

export interface ApiCapability {
  id: string;
  title: string;
  scope: string;
  description: string;
  docsUrl: string;
  probe: string;
}

export const API_CAPABILITIES: ApiCapability[] = [
  {
    id: "agents",
    title: "Chat & Agents",
    scope: "Agent API",
    description: "Ask Langdock, Ask Agent, selection and file commands",
    docsUrl: "https://docs.langdock.com/en/developer/agents-api/agents-overview",
    probe: "/agent/v1/models",
  },
  {
    id: "completion",
    title: "Image Generation",
    scope: "Completion API",
    description: "Generate Image",
    docsUrl: "https://docs.langdock.com/en/developer/completion-api/openai-images",
    probe: "/openai/eu/v1/models",
  },
  {
    id: "prompts",
    title: "Prompt Library",
    scope: "Prompt API",
    description: "Search Prompts",
    docsUrl: "https://docs.langdock.com/en/developer/prompts-api/prompts-overview",
    probe: "/prompts/v1?limit=1",
  },
  {
    id: "knowledge",
    title: "Knowledge Bases",
    scope: "Knowledge Folder API",
    description: "Search Knowledge, Add to Knowledge Base, file uploads",
    docsUrl: "https://docs.langdock.com/en/developer/knowledge-folder-api/knowledge-folder-overview",
    probe: "/knowledge?limit=1",
  },
  {
    id: "meetings",
    title: "Meetings",
    scope: "Meetings Read API",
    description: "Search Meetings",
    docsUrl: "https://docs.langdock.com/en/developer/overview/api-introduction",
    probe: "/meetings/v1/list?limit=1",
  },
  {
    id: "integrations",
    title: "Integrations",
    scope: "Integration API",
    description: "Run Integration Action",
    docsUrl: "https://docs.langdock.com/en/developer/integrations-api/integrations-overview",
    probe: "/integrations/v1/get",
  },
  {
    id: "workflows",
    title: "Workflows",
    scope: "Workflow Read API",
    description: "Browse Workflows",
    docsUrl: "https://docs.langdock.com/en/developer/workflow-api/workflows-overview",
    probe: "/workflows/v1/list?limit=1",
  },
  {
    id: "automations",
    title: "Scheduled Tasks",
    scope: "Scheduled Tasks API",
    description: "Manage and Create Scheduled Tasks (workspace keys)",
    docsUrl: "https://docs.langdock.com/en/developer/scheduled-tasks-api/scheduled-tasks-overview",
    probe: "/automations/v1?limit=1",
  },
  {
    id: "skills",
    title: "Skills",
    scope: "Skill API",
    description: "Search Skills",
    docsUrl: "https://docs.langdock.com/api-endpoints/skills/skills-overview",
    probe: "/skills/v1?limit=1",
  },
];

export async function checkAccess(capability: ApiCapability): Promise<{ status: AccessStatus; message?: string }> {
  try {
    await request(capability.probe);
    return { status: "available" };
  } catch (error) {
    const status = error instanceof LangdockError ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 401) return { status: "invalid-key", message };
    if (status === 403) return { status: "missing-scope", message };
    return { status: "error", message };
  }
}

// Chat (Agents completions API, Vercel AI SDK UIMessage format)

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  /** Uploaded attachment ids. */
  attachments?: string[];
  /** Files sent inline as data URLs when uploading is not allowed. */
  files?: InlineFile[];
}

export interface InlineFile {
  filename: string;
  mediaType: string;
  url: string;
}

export type ChatTarget = { agentId: string } | { model: string; webSearch: boolean };

export type StreamEvent =
  { type: "text"; text: string } | { type: "tool"; name: string } | { type: "source"; url: string; title?: string };

export async function streamChat(options: {
  target: ChatTarget;
  messages: ChatMessage[];
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}): Promise<void> {
  const { target, messages, signal, onEvent } = options;
  const body = {
    ...("agentId" in target
      ? { agentId: target.agentId }
      : {
          agent: {
            name: "Raycast",
            instructions: "You are a helpful assistant. Answer concisely and format responses in Markdown.",
            ...(target.model === AUTO_MODEL ? {} : { model: target.model }),
            capabilities: { webSearch: target.webSearch },
          },
        }),
    messages: messages.map((message) => ({
      id: randomUUID(),
      role: message.role,
      parts: [
        { type: "text", text: message.text },
        ...(message.files ?? []).map((file) => ({ type: "file", ...file })),
      ],
      ...(message.attachments?.length ? { metadata: { attachments: message.attachments } } : {}),
    })),
    stream: true,
  };

  const response = await request("/agent/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });

  // Some errors and non-streaming fallbacks come back as plain JSON.
  if (response.headers.get("content-type")?.includes("application/json")) {
    const json = (await response.json()) as { messages?: { content: string }[] };
    onEvent({ type: "text", text: json.messages?.map((m) => m.content).join("\n\n") ?? "" });
    return;
  }

  if (!response.body) throw new LangdockError("Empty response from Langdock");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleStreamLine(line.trim(), onEvent);
  }
  handleStreamLine(buffer.trim(), onEvent);
}

/**
 * Handles one line of either the AI SDK v5 UI message stream (`data: {"type":"text-delta",...}`)
 * or the older v4 data stream protocol (`0:"text"`).
 */
function handleStreamLine(line: string, onEvent: (event: StreamEvent) => void) {
  if (!line) return;

  if (line.startsWith("data:")) {
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let chunk: Record<string, unknown>;
    try {
      chunk = JSON.parse(payload);
    } catch {
      return;
    }
    switch (chunk.type) {
      case "text-delta": {
        const text = (chunk.delta ?? chunk.textDelta) as string | undefined;
        if (text) onEvent({ type: "text", text });
        break;
      }
      case "tool-input-start":
      case "tool-call":
        onEvent({ type: "tool", name: String(chunk.toolName ?? "tool") });
        break;
      case "source-url":
        onEvent({ type: "source", url: String(chunk.url), title: chunk.title as string | undefined });
        break;
      case "error":
        throw new LangdockError(String(chunk.errorText ?? chunk.error ?? "Langdock returned an error"));
    }
    return;
  }

  const legacy = /^([0-9a-z]):(.*)$/.exec(line);
  if (!legacy) return;
  const [, code, raw] = legacy;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return;
  }
  if (code === "0" && typeof value === "string") onEvent({ type: "text", text: value });
  if (code === "3") throw new LangdockError(String(value));
}
