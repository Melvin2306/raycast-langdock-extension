import { Action, ActionPanel, Detail, Form, Icon, Keyboard, Toast, showToast, useNavigation } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { ReactNode, useEffect, useRef, useState } from "react";
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
import { Conversation, conversationTitle, saveConversation, transcript } from "../lib/history";
import { RenderableTurn, renderTurn } from "../lib/render";
import { displayName, regionLabel } from "../lib/models";
import { getSettings } from "../lib/settings";
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
}

export function Chat(props: ChatProps) {
  const agent = props.agent ?? props.conversation?.agent;
  const [turns, setTurns] = useState<Turn[]>(
    () => props.conversation?.turns.map((turn) => ({ ...turn, id: randomUUID() })) ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<string>();
  const abortRef = useRef<AbortController>(null);
  const webSearchRef = useRef(false);
  const conversationRef = useRef({
    id: props.conversation?.id ?? randomUUID(),
    createdAt: props.conversation?.createdAt ?? new Date().toISOString(),
  });
  // Only conversations with new questions are saved, so reopening one doesn't reorder history.
  const hasAskedRef = useRef(false);
  // Follow-up forms outlive the render they were created in, so read history from a ref.
  const turnsRef = useRef<Turn[]>([]);
  turnsRef.current = turns;

  const { data: models } = useCachedPromise(listModels, [], { execute: !agent });

  useEffect(() => {
    (async () => {
      const settings = await getSettings();
      webSearchRef.current = settings.webSearch;
      const wanted = props.model ?? props.conversation?.model ?? settings.chatModel;
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
      if (agent) {
        await run({ agentId: agent.id });
      } else {
        const chosenModel = modelId ?? AUTO_MODEL;
        try {
          await run({ model: chosenModel, webSearch: webSearchRef.current });
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
          await run({ model: fallback, webSearch: webSearchRef.current });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await showFailureToast(error, { title: "Langdock request failed" });
        update((t) => ({ ...t, error: error instanceof Error ? error.message : String(error) }));
      }
    } finally {
      update((t) => ({ ...t, status: undefined }));
      if (abortRef.current === controller) setIsLoading(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setIsLoading(false);
  }

  const lastAnswer = turns.at(-1)?.answer ?? "";
  const hasAnswer = lastAnswer.trim().length > 0;
  const currentModel = models?.find((m) => m.id === model);
  const modelName =
    model === AUTO_MODEL
      ? "Auto"
      : currentModel
        ? `${displayName(currentModel)} · ${regionLabel(currentModel)}`
        : (model ?? "");
  const title = agent ? `${agent.emojiIcon ? `${agent.emojiIcon} ` : ""}${agent.name}` : `Langdock · ${modelName}`;

  const followUpAction = (
    <Action.Push
      title="Ask Follow-Up"
      icon={Icon.Bubble}
      shortcut={{ modifiers: ["cmd"], key: "f" }}
      target={<FollowUpForm onSubmit={(question) => ask({ question })} />}
    />
  );
  const pasteAction = (
    <Action.Paste title="Paste Answer" content={lastAnswer} shortcut={{ modifiers: ["cmd", "shift"], key: "v" }} />
  );
  const primary: ReactNode[] =
    props.pasteFirst && hasAnswer ? [pasteAction, followUpAction] : [followUpAction, hasAnswer && pasteAction];

  return (
    <Detail
      navigationTitle={title}
      isLoading={isLoading}
      markdown={turns.map(renderTurn).join("\n\n---\n\n")}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {primary[0]}
            {primary[1]}
            {isLoading && (
              <Action
                title="Stop Generating"
                icon={Icon.Stop}
                shortcut={Keyboard.Shortcut.Common.Remove}
                onAction={stop}
              />
            )}
            {hasAnswer && <Action.CopyToClipboard title="Copy Answer" content={lastAnswer} />}
            <Action.CopyToClipboard
              title="Copy Conversation"
              content={transcript(turns)}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            {!agent && (
              <Action.Push
                title="Choose Model…"
                icon={Icon.ComputerChip}
                shortcut={{ modifiers: ["cmd"], key: "m" }}
                target={<ModelPicker selectedModelId={model} onSelect={setModel} />}
              />
            )}
            <Action.OpenInBrowser title="Open Langdock" url={webAppUrl()} shortcut={Keyboard.Shortcut.Common.Open} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
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

function FollowUpForm(props: { onSubmit: (question: string) => void }) {
  const { pop } = useNavigation();
  return (
    <AskForm
      title="Ask Follow-Up"
      onSubmit={(question) => {
        props.onSubmit(question);
        pop();
      }}
    />
  );
}
