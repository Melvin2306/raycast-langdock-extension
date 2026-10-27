import { LocalStorage } from "@raycast/api";
import { createHash } from "node:crypto";
import { apiBaseUrl, apiKey } from "./langdock";

// The API has no chat history, so conversations started in Raycast are kept locally.

export interface StoredTurn {
  /** What the user sees as the question. */
  question: string;
  /** What was sent, when it differs from the question (e.g. selection commands). */
  prompt?: string;
  answer: string;
  sources: { url: string; title?: string }[];
  attachments?: string[];
  /** Names of files that were sent inline; their content is not stored. */
  inlineFileNames?: string[];
}

export interface Conversation {
  id: string;
  /** Workspace the conversation belongs to, so it is never continued under another API key or host. */
  account?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model?: string;
  agent?: { id: string; name: string; emojiIcon?: string | null };
  turns: StoredTurn[];
}

const HISTORY_KEY = "chat-history";
const MAX_CONVERSATIONS = 200;
/** Long hidden prompts (selections, transcripts) are cut when stored to keep history small. */
export const MAX_STORED_PROMPT_CHARS = 20_000;
const MAX_HISTORY_CHARS = 4_000_000;

/** Identifies the current API key and host without storing the key itself. */
export function currentAccount(): string {
  return createHash("sha256").update(`${apiBaseUrl()}\n${apiKey()}`).digest("hex").slice(0, 16);
}

async function readAll(): Promise<Conversation[]> {
  const raw = await LocalStorage.getItem<string>(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Conversation[]).filter((c) => c && Array.isArray(c.turns)) : [];
  } catch {
    return [];
  }
}

/** Conversations of the current account. Conversations saved before accounts were recorded are included. */
export async function getConversations(account = currentAccount()): Promise<Conversation[]> {
  return (await readAll()).filter((c) => !c.account || c.account === account);
}

/** Keeps the newest conversations within the count and size limits. */
export function trimHistory(conversations: Conversation[]): Conversation[] {
  const kept: Conversation[] = [];
  let size = 0;
  for (const conversation of conversations.slice(0, MAX_CONVERSATIONS)) {
    size += JSON.stringify(conversation).length;
    if (size > MAX_HISTORY_CHARS && kept.length > 0) break;
    kept.push(conversation);
  }
  return kept;
}

export function compactTurn(turn: StoredTurn): StoredTurn {
  if (!turn.prompt || turn.prompt.length <= MAX_STORED_PROMPT_CHARS) return turn;
  return { ...turn, prompt: `${turn.prompt.slice(0, MAX_STORED_PROMPT_CHARS)}\n[…truncated]` };
}

export async function saveConversation(conversation: Conversation) {
  const stored = {
    ...conversation,
    account: conversation.account ?? currentAccount(),
    turns: conversation.turns.map(compactTurn),
  };
  const others = (await readAll()).filter((c) => c.id !== conversation.id);
  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(trimHistory([stored, ...others])));
}

export async function deleteConversation(id: string) {
  const remaining = (await readAll()).filter((c) => c.id !== id);
  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(remaining));
}

/** Deletes the current account's conversations. */
export async function clearConversations(account = currentAccount()) {
  const remaining = (await readAll()).filter((c) => c.account && c.account !== account);
  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(remaining));
}

export function conversationTitle(question: string): string {
  const line = question.split("\n").find((l) => l.trim()) ?? "Untitled";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

export function transcript(turns: StoredTurn[]): string {
  return turns.map((t) => `> ${t.question.split("\n").join("\n> ")}\n\n${t.answer}`).join("\n\n---\n\n");
}
