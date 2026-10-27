import { LocalStorage } from "@raycast/api";
import { useLocalStorage } from "@raycast/utils";
import { AUTO_MODEL, ImageQuality, ImageRegion, ImageSize } from "./langdock";

// Settings that depend on workspace data (models) live here instead of in Raycast preferences,
// which only support static dropdowns. Credentials stay in preferences.

export interface Settings {
  /** AUTO_MODEL or a model id from the models API. */
  chatModel: string;
  webSearch: boolean;
  /** Unset means the first image model available in the region. */
  imageModel?: string;
  imageRegion: ImageRegion;
  imageSize: ImageSize;
  imageQuality: ImageQuality;
}

export const DEFAULT_SETTINGS: Settings = {
  chatModel: AUTO_MODEL,
  webSearch: false,
  imageRegion: "eu",
  imageSize: "auto",
  imageQuality: "auto",
};

const SETTINGS_KEY = "settings";
export const SAVED_AGENTS_KEY = "saved-agents";
export const RECENT_AGENTS_KEY = "recent-agents";

export const IMAGE_SIZES: { value: ImageSize; title: string }[] = [
  { value: "auto", title: "Auto" },
  { value: "1024x1024", title: "Square (1024×1024)" },
  { value: "1536x1024", title: "Landscape (1536×1024)" },
  { value: "1024x1536", title: "Portrait (1024×1536)" },
];

export const IMAGE_QUALITIES: { value: ImageQuality; title: string }[] = [
  { value: "auto", title: "Auto" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
];

export const IMAGE_REGIONS: { value: ImageRegion; title: string }[] = [
  { value: "eu", title: "🇪🇺 EU" },
  { value: "us", title: "🇺🇸 US" },
];

export async function getSettings(): Promise<Settings> {
  const raw = await LocalStorage.getItem<string>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) };
}

export function useSettings() {
  const { value, setValue, removeValue, isLoading } = useLocalStorage<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    settings: { ...DEFAULT_SETTINGS, ...value },
    isLoading,
    update: (patch: Partial<Settings>) => setValue({ ...value, ...patch }),
    reset: removeValue,
  };
}
