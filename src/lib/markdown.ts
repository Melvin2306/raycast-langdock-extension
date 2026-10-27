// Markdown from models, the API and other people is rendered by Raycast, which can load remote images.
// Images are turned into ordinary links so nothing is fetched until the user clicks, and links are limited
// to http(s) and mailto so a crafted link can't open another app.

const SAFE_LINK = /^(https?:|mailto:)/i;
// Fenced code blocks (closed or still streaming) and inline code spans are left untouched.
const CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

/** Returns the URL when it is http(s), so server-supplied links can be opened safely. */
export function safeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Escapes text so it renders literally inside markdown, e.g. link labels built from server data. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+!|<>~])/g, "\\$1");
}

function sanitizeProse(text: string): string {
  return (
    text
      // Inline images: ![alt](url "title") → link (http/https) or plain text.
      .replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^)]*["'])?\s*\)/g, (_m, alt: string, url: string) =>
        SAFE_LINK.test(url) ? `[🖼 ${alt || "image"}](${url})` : `🖼 ${alt || "image"}`,
      )
      // Reference-style images: ![alt][ref] / ![alt][] → reference links.
      .replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (_m, alt: string, ref: string) => `[🖼 ${alt || "image"}][${ref}]`)
      // HTML images and other raw tags that could load resources.
      .replace(
        /<(\/?)(img|image|picture|source|video|audio|iframe|object|embed|svg|link|meta|style|script)\b/gi,
        "&lt;$1$2",
      )
      // Inline links with a non-http(s) target are shown as text.
      .replace(/\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+["'][^)]*["'])?\s*\)/g, (match, label: string, url: string) =>
        SAFE_LINK.test(url) || url.startsWith("#") ? match : `${label} (${escapeMarkdown(url)})`,
      )
      // Reference definitions pointing at unsafe targets: [ref]: javascript:… → plain text.
      .replace(/^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/gm, (match, head: string, url: string) =>
        SAFE_LINK.test(url.replace(/^<|>$/g, "")) ? match : `${escapeMarkdown(head.trim())} ${escapeMarkdown(url)}`,
      )
      // Autolinks with other schemes: <raycast://…>.
      .replace(/<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi, (match, url: string) =>
        SAFE_LINK.test(url) ? match : escapeMarkdown(url),
      )
  );
}

/** Makes untrusted markdown safe to render: no auto-loading images, no non-http(s) links. Code stays as is. */
export function sanitizeMarkdown(markdown: string): string {
  return markdown
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : sanitizeProse(part)))
    .join("");
}

/** Markdown link for a server-supplied source; returns plain text when the URL isn't http(s). */
export function sourceLink(url: string, title?: string): string {
  const label = escapeMarkdown(title || url);
  const safe = safeHttpUrl(url);
  return safe ? `[${label}](${safe.replace(/\)/g, "%29").replace(/ /g, "%20")})` : label;
}

/**
 * Wraps untrusted text in a tag for a prompt. Closing tags inside the text are neutralized so the
 * content can't end the wrapper early.
 */
export function wrapUntrusted(tag: string, text: string, attributes: Record<string, string> = {}): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${value.replace(/["<>]/g, "")}"`)
    .join("");
  const body = text.replace(new RegExp(`<(/?)${tag}\\b`, "gi"), "<$1​" + tag);
  return `<${tag}${attrs}>\n${body}\n</${tag}>`;
}
