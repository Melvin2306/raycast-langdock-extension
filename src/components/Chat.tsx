import { Action, ActionPanel, Form, Icon, Keyboard, List, Toast, showHUD, showToast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { randomUUID } from "node:crypto";
import {
  AUTO_MODEL,
  ChatMessage,
  LangdockError,
  fallbackModelId,
  inlineFile,
  listModels,
  resolveModelId,
  streamChat,
  uploadAttachment,
  webAppUrl,
  type ChatTarget,
} from "../lib/langdock";
import { showLangdockError } from "../lib/errors";
import { Conversation, conversationTitle, saveConversation, transcript } from "../lib/history";
import { AUTO_ICON, displayName, groupByProvider, providerIcon, regionLabel } from "../lib/models";
import { RenderableTurn, renderTurn } from "../lib/render";
import { getSettings, useSettings, webSearchEnabled } from "../lib/settings";
import { ModelDropdown, ModelPicker } from "./ModelPicker";

/** A turn on screen. `error` is kept out of the answer so it is never pasted or resent; inline `files` stay in memory. */
interface Turn extends RenderableTurn {
  id: string;
}

export interface ChatAgent {
  id: string;
  name: string;
  emojiIcon?: string | null;
}

interface Question {
  question: string;
  prompt?: string;
  filePaths?: string[];
}

export interface ChatProps {
  /** First question, sent as soon as the chat opens. */
  initialPrompt?: string;
  /** Shown instead of `initialPrompt`, e.g. a short label for a long selection prompt. */
  displayPrompt?: string;
  /** Files attached to the first question. */
  filePaths?: string[];
  agent?: ChatAgent;
  model?: string;
  /** A saved conversation to continue. */
  conversation?: Conversation;
  /** Puts Paste Answer first, for commands that rewrite selected text. */
  pasteFirst?: boolean;
  /** Suggested first questions, e.g. an agent's conversation starters. */
  starters?: string[];
}

/** Chat as a list: one item per question, the answer in the detail pane, follow-ups typed in the search bar. */
export function Chat(props: ChatProps) {
  const agent = props.agent ?? props.conversation?.agent;
  const [turns, setTurns] = useState<Turn[]>(
    () => props.conversation?.turns.map((turn) => ({ ...turn, id: randomUUID() })) ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<string>();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(() => turns.at(-1)?.id);
  const abortRef = useRef<AbortController>(null);
  const conversationRef = useRef({
    id: props.conversation?.id ?? randomUUID(),
    createdAt: props.conversation?.createdAt ?? new Date().toISOString(),
  });
  // Only conversations with new questions are saved, so reopening one doesn't reorder history.
  const hasAskedRef = useRef(false);
  // Actions created in earlier renders (e.g. a toast's Retry) read the latest turns from here.
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const { settings, update: updateSettings } = useSettings();
  const { data: models } = useCachedPromise(listModels, [], { execute: !agent });

  useEffect(() => {
    (async () => {
      const wanted = props.model ?? props.conversation?.model ?? (await getSettings()).chatModel;
      const initialModel = agent ? undefined : await resolveModelId(wanted);
      setModel(initialModel);
      if (props.initialPrompt) {
        ask(
          {
            question: props.displayPrompt ?? props.initialPrompt,
            prompt: props.initialPrompt,
            filePaths: props.filePaths,
          },
          turnsRef.current,
          initialModel,
        );
      }
    })();
    return () => abortRef.current?.abort();
  }, []);

  // Save the conversation whenever an answer finishes.
  useEffect(() => {
    if (isLoading || turns.length === 0 || !hasAskedRef.current) return;
    saveConversation({
      ...conversationRef.current,
      title: conversationTitle(turns[0].question),
      updatedAt: new Date().toISOString(),
      model: agent ? undefined : model,
      agent: agent ? { id: agent.id, name: agent.name, emojiIcon: agent.emojiIcon } : undefined,
      turns: turns.map((t) => ({
        question: t.question,
        prompt: t.prompt,
        answer: t.answer,
        sources: t.sources,
        attachments: t.attachments,
        inlineFileNames: t.files?.map((f) => f.filename) ?? t.inlineFileNames,
      })),
    });
  }, [isLoading]);

  async function ask(input: Question, history: Turn[] = turnsRef.current, modelId = model) {
    hasAskedRef.current = true;
    const turnId = randomUUID();
    const update = (fn: (turn: Turn) => Turn) => setTurns((all) => all.map((t) => (t.id === turnId ? fn(t) : t)));
    const turn: Turn = { id: turnId, question: input.question, prompt: input.prompt, answer: "", sources: [] };
    setTurns([...history, turn]);
    setSelectedId(turnId);
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (input.filePaths?.length) {
        update((t) => ({ ...t, status: "Uploading files…" }));
        const attached = await attachFiles(input.filePaths);
        Object.assign(turn, attached);
        update((t) => ({ ...t, ...attached }));
      }

      // Turns without an answer (failed or stopped) are left out of the context.
      const messages: ChatMessage[] = [...history.filter((t) => t.answer), turn].flatMap((t) => [
        { role: "user" as const, text: t.prompt ?? t.question, attachments: t.attachments, files: t.files },
        ...(t.id === turnId ? [] : [{ role: "assistant" as const, text: t.answer }]),
      ]);

      const run = (target: ChatTarget) =>
        streamChat({
          target,
          messages,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "text") update((t) => ({ ...t, answer: t.answer + event.text, status: undefined }));
            if (event.type === "tool") update((t) => ({ ...t, status: `Using ${humanize(event.name)}…` }));
            if (event.type === "source") update((t) => ({ ...t, sources: [...t.sources, event] }));
          },
        });

      update((t) => ({ ...t, status: undefined }));
      const webSearch = webSearchEnabled();
      if (agent) {
        await run({ agentId: agent.id });
      } else {
        const chosenModel = modelId ?? AUTO_MODEL;
        try {
          await run({ model: chosenModel, webSearch });
        } catch (error) {
          // Only retry when the request without a model was rejected because of the model.
          const modelRejected =
            error instanceof LangdockError && [400, 422].includes(error.status ?? 0) && /model/i.test(error.message);
          if (chosenModel !== AUTO_MODEL || !modelRejected) throw error;
          const fallback = await fallbackModelId();
          if (!fallback) throw error;
          setModel(fallback);
          await showToast({
            style: Toast.Style.Failure,
            title: "No default model for Auto",
            message: `Using ${fallback} instead. ${error.message}`,
          });
          await run({ model: fallback, webSearch });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await showLangdockError(error, { title: "Langdock request failed", onRetry: () => retry(turnId) });
        update((t) => ({ ...t, error: error instanceof Error ? error.message : String(error) }));
      }
    } finally {
      update((t) => ({ ...t, status: undefined }));
      if (abortRef.current === controller) setIsLoading(false);
    }
  }

  /** Asks a failed question again, in place of the failed turn. */
  function retry(turnId: string) {
    const all = turnsRef.current;
    const index = all.findIndex((t) => t.id === turnId);
    if (index < 0) return;
    const failed = all[index];
    ask({ question: failed.question, prompt: failed.prompt }, all.slice(0, index));
  }

  function send(text = query) {
    const question = text.trim();
    if (!question) return;
    setQuery("");
    ask({ question });
  }

  function stop() {
    abortRef.current?.abort();
    setIsLoading(false);
  }

  function newConversation() {
    stop();
    setTurns([]);
    setSelectedId(undefined);
    hasAskedRef.current = false;
    conversationRef.current = { id: randomUUID(), createdAt: new Date().toISOString() };
  }

  async function setDefaultModel() {
    if (!model) return;
    await updateSettings({ chatModel: model });
    await showHUD(`${modelLabel(model)} is now the default model`);
  }

  function modelLabel(id: string): string {
    if (id === AUTO_MODEL) return "Auto";
    const found = models?.find((m) => m.id === id);
    return found ? displayName(found) : id;
  }

  const actionsFor = (turn?: Turn) => {
    const answer = turn?.answer ?? "";
    const hasAnswer = answer.trim().length > 0;
    const paste = hasAnswer && (
      <Action.Paste title="Paste Answer" content={answer} shortcut={{ modifiers: ["cmd", "shift"], key: "v" }} />
    );
    return (
      <ActionPanel>
        <ActionPanel.Section>
          {query.trim() && <Action title="Send" icon={Icon.ArrowRight} onAction={() => send()} />}
          {props.pasteFirst && paste}
          {hasAnswer && <Action.CopyToClipboard title="Copy Answer" content={answer} />}
          {!props.pasteFirst && paste}
          {turn?.error && !isLoading && (
            <Action
              title="Retry"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => retry(turn.id)}
            />
          )}
          {isLoading && (
            <Action
              title="Stop Generating"
              icon={Icon.Stop}
              shortcut={Keyboard.Shortcut.Common.Remove}
              onAction={stop}
            />
          )}
          {turns.length > 0 && (
            <Action.CopyToClipboard
              title="Copy Conversation"
              content={transcript(turns)}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          )}
          {turns.length > 0 && (
            <Action
              title="New Conversation"
              icon={Icon.PlusCircle}
              shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
              onAction={newConversation}
            />
          )}
        </ActionPanel.Section>
        <ActionPanel.Section>
          {!agent && model && model !== settings.chatModel && (
            <Action
              title="Set as Default Model"
              icon={Icon.Star}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
              onAction={setDefaultModel}
            />
          )}
          {!agent && (
            <Action.Push
              title="Browse Models"
              icon={Icon.ComputerChip}
              shortcut={{ modifiers: ["cmd"], key: "m" }}
              target={<ModelPicker selectedModelId={model} onSelect={setModel} />}
            />
          )}
          <Action.OpenInBrowser title="Open Langdock" url={webAppUrl()} shortcut={Keyboard.Shortcut.Common.Open} />
        </ActionPanel.Section>
      </ActionPanel>
    );
  };

  // The dropdown needs its value among the items, so it appears once the model is known.
  const modelDropdown =
    !agent && model ? (
      <List.Dropdown tooltip="Model" value={model} onChange={setModel}>
        <List.Dropdown.Item value={AUTO_MODEL} title="Auto" icon={AUTO_ICON} />
        {model !== AUTO_MODEL && !models?.some((m) => m.id === model) && (
          <List.Dropdown.Item value={model} title={model} icon={providerIcon(model)} />
        )}
        {groupByProvider(models ?? []).map(([provider, providerModels]) => (
          <List.Dropdown.Section key={provider} title={provider}>
            {providerModels.map((m) => (
              <List.Dropdown.Item
                key={m.id}
                value={m.id}
                title={`${displayName(m)} · ${regionLabel(m)}`}
                icon={providerIcon(m)}
                keywords={[m.name, provider]}
              />
            ))}
          </List.Dropdown.Section>
        ))}
      </List.Dropdown>
    ) : undefined;

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={query}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={turns.length > 0 ? "Ask a follow-up…" : agent ? `Ask ${agent.name}…` : "Ask anything…"}
      searchBarAccessory={modelDropdown}
      isShowingDetail={turns.length > 0}
      selectedItemId={selectedId}
      onSelectionChange={(id) => id && setSelectedId(id)}
    >
      {turns.length === 0 && !props.starters?.length && (
        <List.EmptyView
          icon={agent?.emojiIcon || AUTO_ICON}
          title={agent ? agent.name : "Ask Langdock"}
          description="Type a question and press Enter."
          actions={actionsFor()}
        />
      )}
      {turns.length === 0 &&
        props.starters?.map((starter) => (
          <List.Item
            key={starter}
            icon={Icon.LightBulb}
            title={starter}
            actions={
              <ActionPanel>
                {query.trim() && <Action title="Send" icon={Icon.ArrowRight} onAction={() => send()} />}
                <Action title="Ask This" icon={Icon.ArrowRight} onAction={() => send(starter)} />
              </ActionPanel>
            }
          />
        ))}
      {turns.map((turn) => (
        <List.Item
          key={turn.id}
          id={turn.id}
          icon={turn.error && !turn.answer ? { source: Icon.ExclamationMark } : Icon.Bubble}
          title={conversationTitle(turn.question)}
          detail={<List.Item.Detail markdown={renderTurn(turn)} />}
          actions={actionsFor(turn)}
        />
      ))}
    </List>
  );
}

/** Uploads files as attachments, or sends them inline when the key may not upload. */
async function attachFiles(paths: string[]): Promise<Pick<Turn, "attachments" | "files">> {
  try {
    return { attachments: await Promise.all(paths.map(uploadAttachment)) };
  } catch (error) {
    if (!(error instanceof LangdockError) || error.status !== 403) throw error;
    await showToast({
      style: Toast.Style.Animated,
      title: "Sending files inline",
      message: "This API key can't upload attachments",
    });
    return { files: await Promise.all(paths.map(inlineFile)) };
  }
}

function humanize(toolName: string): string {
  return toolName.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function AskForm(props: {
  title?: string;
  onSubmit: (question: string) => void;
  defaultValue?: string;
  /** Shows a model dropdown when set. */
  onModelChange?: (modelId: string) => void;
  model?: string;
}) {
  return (
    <Form
      navigationTitle={props.title}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Ask"
            icon={Icon.ArrowRight}
            onSubmit={(values: { question: string }) => {
              if (values.question.trim()) props.onSubmit(values.question.trim());
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="question" title="Question" placeholder="Ask anything…" defaultValue={props.defaultValue} />
      {props.onModelChange && <ModelDropdown value={props.model} onChange={props.onModelChange} />}
    </Form>
  );
}
