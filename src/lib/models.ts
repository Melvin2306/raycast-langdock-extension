import { Image } from "@raycast/api";
import catalog from "./model-catalog.json";
import { Model } from "./langdock";

// The public models API only returns deployment names. Display names, descriptions and providers come from
// a bundled list of Langdock's models (model-catalog.json), with a name-based fallback for custom models.

export interface CatalogModel {
  id: string;
  provider: string;
  type: "chat" | "image";
  displayName: string;
  description: string;
  contextWindowSize?: number;
  maxOutputTokens?: number;
  vision?: boolean;
  thinking?: boolean;
  imageEditing?: boolean;
  deprecated?: boolean;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
// Current entries win over deprecated ones that share an id.
const CATALOG = new Map(
  [...(catalog as CatalogModel[])]
    .sort((a, b) => Number(!!b.deprecated) - Number(!!a.deprecated))
    .map((entry) => [normalize(entry.id), entry]),
);

export function catalogEntry(name: string): CatalogModel | undefined {
  return CATALOG.get(normalize(name.replace(/^.*\//, "")));
}

const PROVIDERS: { key: string; name: string; pattern: RegExp }[] = [
  { key: "openai", name: "OpenAI", pattern: /^(gpt|o\d|chatgpt|codex|dall-e)|openai/ },
  { key: "anthropic", name: "Anthropic", pattern: /claude|opus|sonnet|haiku|fable|anthropic/ },
  { key: "google", name: "Google", pattern: /gemini|gemma|imagen|google/ },
  { key: "mistral", name: "Mistral", pattern: /mistral|codestral|magistral|ministral|devstral|pixtral/ },
  { key: "deepseek", name: "DeepSeek", pattern: /deepseek/ },
  { key: "blackforestlabs", name: "Black Forest Labs", pattern: /flux|blackforest|bfl/ },
  { key: "meta", name: "Meta", pattern: /llama|meta/ },
  { key: "perplexity", name: "Perplexity", pattern: /sonar|perplexity/ },
  { key: "microsoft", name: "Microsoft", pattern: /phi-|microsoft/ },
  { key: "amazon", name: "Amazon", pattern: /nova|titan|amazon/ },
  { key: "moonshot", name: "Moonshot AI", pattern: /kimi|moonshot/ },
  { key: "xai", name: "xAI", pattern: /grok|xai/ },
  { key: "qwen", name: "Qwen", pattern: /qwen/ },
];
const OTHER = { key: "other", name: "Other" };
/** Providers with a bundled logo (assets/providers). */
const LOGOS = new Set([
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "blackforestlabs",
  "meta",
  "perplexity",
  "microsoft",
  "amazon",
]);

function themed(name: string): Image.ImageLike {
  return { source: { light: `providers/${name}.svg`, dark: `providers/${name}@dark.svg` } };
}

/** Langdock mark, used for Auto like in the Langdock model picker. */
export const AUTO_ICON = themed("auto");

function provider(name: string): { key: string; name: string } {
  const fromCatalog = catalogEntry(name)?.provider;
  if (fromCatalog) return PROVIDERS.find((p) => p.key === fromCatalog) ?? { key: fromCatalog, name: fromCatalog };
  const lower = name.toLowerCase();
  return PROVIDERS.find((p) => p.pattern.test(lower)) ?? OTHER;
}

export function providerName(model: Model | string): string {
  return provider(typeof model === "string" ? model : model.name).name;
}

export function providerIcon(model: Model | string): Image.ImageLike {
  const key = provider(typeof model === "string" ? model : model.name).key;
  return themed(LOGOS.has(key) ? key : "unknown");
}

const REGIONS: Record<string, string> = {
  eu: "🇪🇺 EU",
  us: "🇺🇸 US",
  ch: "🇨🇭 CH",
  global: "🌐 Global",
};

export function regionLabel(model: Model | { region: string }): string {
  return REGIONS[model.region?.toLowerCase()] ?? model.region?.toUpperCase() ?? "";
}

/** Catalog display name, or one derived from the deployment name for custom models. */
export function displayName(model: Model | string): string {
  const name = typeof model === "string" ? model : model.name;
  return catalogEntry(name)?.displayName ?? deriveDisplayName(name);
}

export function describeModel(model: Model | string): string | undefined {
  return catalogEntry(typeof model === "string" ? model : model.name)?.description || undefined;
}

export function formatTokens(tokens: number | undefined): string | undefined {
  if (!tokens) return undefined;
  return tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M` : `${Math.round(tokens / 1000)}K`;
}

const WORDS: Record<string, string> = { gpt: "GPT", deepseek: "DeepSeek", ai: "AI" };

/** "gpt-6.1-sol" → "GPT-6.1 Sol", "claude-haiku-5-5" → "Haiku 5.5", "moonshotai/kimi-k2.6" → "Kimi K2.6". */
function deriveDisplayName(raw: string): string {
  if (/\s/.test(raw.trim())) return raw.trim();
  const tokens = raw
    .trim()
    .replace(/^.*\//, "")
    .replace(/^claude-/i, "")
    .split(/[-_]/)
    .filter((token) => token && !/^\d{8}$/.test(token)); // drop date stamps like 20250514

  const words: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const previous = words.at(-1);
    if (previous && /^\d+$/.test(lower) && /\d$/.test(previous)) {
      words[words.length - 1] = `${previous}.${lower}`; // "5-5" → "5.5"
    } else if (previous === "GPT" && /^\d/.test(lower)) {
      words[words.length - 1] = `GPT-${lower}`;
    } else if (WORDS[lower]) {
      words.push(WORDS[lower]);
    } else if (/^\d+[km]$/.test(lower)) {
      words.push(lower.toUpperCase()); // context sizes like 1m, 200k
    } else if (/^o\d/.test(lower)) {
      words.push(lower); // OpenAI o-series stays lowercase
    } else {
      words.push(lower.charAt(0).toUpperCase() + lower.slice(1));
    }
  }
  return words.join(" ") || raw;
}

/** Groups models by provider in Langdock's order, keeping the API's order inside each group. */
export function groupByProvider<T extends Model | string>(models: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const model of models) {
    const name = providerName(model);
    groups.set(name, [...(groups.get(name) ?? []), model]);
  }
  const order = [...PROVIDERS.map((p) => p.name), OTHER.name];
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length - 1);
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
}
