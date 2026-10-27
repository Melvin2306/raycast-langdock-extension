import { Action, ActionPanel, Clipboard, Detail, Icon, getSelectedText } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { useState } from "react";
import { wrapUntrusted } from "../lib/markdown";
import { Chat } from "./Chat";

interface Selection {
  text: string;
  fromClipboard: boolean;
}

/** Selected text from the frontmost app, or the clipboard when nothing is selected. */
async function readSelection(): Promise<Selection | undefined> {
  try {
    const text = (await getSelectedText()).trim();
    if (text) return { text, fromClipboard: false };
  } catch {
    // No selection or no accessibility access; fall back to the clipboard.
  }
  const clipboard = (await Clipboard.readText())?.trim();
  return clipboard ? { text: clipboard, fromClipboard: true } : undefined;
}

const PREVIEW_CHARS = 160;

export function SelectionChat(props: {
  /** Short label shown as the question, e.g. "Summarize". */
  label: string;
  instructions: string;
  /** For commands that rewrite text, so the result can replace the selection. */
  pasteFirst?: boolean;
}) {
  const { data: selection, isLoading } = usePromise(readSelection);
  const [clipboardConfirmed, setClipboardConfirmed] = useState(false);

  if (isLoading) return <Detail isLoading />;
  if (!selection) {
    return <Detail markdown={"## No Text Found\n\nSelect text in any app, or copy it, then run the command again."} />;
  }

  // Clipboard text was never chosen for this command, so it is only sent after the user confirms.
  if (selection.fromClipboard && !clipboardConfirmed) {
    return (
      <Detail
        navigationTitle={props.label}
        markdown={`## No text selected\n\nSend the text from your clipboard to Langdock?\n\n\`\`\`\n${selection.text.slice(0, 2000).replace(/```/g, "ˋˋˋ")}${selection.text.length > 2000 ? "\n…" : ""}\n\`\`\``}
        actions={
          <ActionPanel>
            <Action title="Send Clipboard Text" icon={Icon.ArrowRight} onAction={() => setClipboardConfirmed(true)} />
          </ActionPanel>
        }
      />
    );
  }

  const preview =
    selection.text.length > PREVIEW_CHARS ? `${selection.text.slice(0, PREVIEW_CHARS - 1)}…` : selection.text;
  return (
    <Chat
      initialPrompt={`${props.instructions}\n\n${wrapUntrusted("text", selection.text)}`}
      // Rendered through sanitizeMarkdown in Chat and shown as plain text in Chat History.
      displayPrompt={`${props.label}${selection.fromClipboard ? " (from clipboard)" : ""}: “${preview}”`}
      pasteFirst={props.pasteFirst}
    />
  );
}
