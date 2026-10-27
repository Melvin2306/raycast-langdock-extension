import { StoredTurn } from "./history";
import { InlineFile } from "./langdock";
import { escapeMarkdown, sanitizeMarkdown, sourceLink } from "./markdown";

export interface RenderableTurn extends StoredTurn {
  status?: string;
  error?: string;
  files?: InlineFile[];
}

/** Renders a turn as markdown. Everything except our own labels comes from users, models or the API. */
export function renderTurn(turn: RenderableTurn): string {
  const question = sanitizeMarkdown(turn.question)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const fileNames = turn.files?.map((f) => f.filename) ?? turn.inlineFileNames;
  const attachmentNote = fileNames?.length
    ? `📎 ${fileNames.map(escapeMarkdown).join(", ")}`
    : turn.attachments?.length
      ? `📎 ${turn.attachments.length} file${turn.attachments.length === 1 ? "" : "s"}`
      : "";
  const parts = [question, attachmentNote, sanitizeMarkdown(turn.answer)];
  if (turn.error && !turn.answer) parts.push(`_⚠️ ${escapeMarkdown(turn.error)}_`);
  if (turn.status) parts.push(`_${escapeMarkdown(turn.status)}_`);
  if (turn.sources.length > 0) {
    const unique = [...new Map(turn.sources.map((s) => [s.url, s])).values()];
    parts.push(`**Sources**\n\n${unique.map((s) => `- ${sourceLink(s.url, s.title)}`).join("\n")}`);
  }
  return parts.filter(Boolean).join("\n\n");
}
