import { useLocalStorage } from "@raycast/utils";
import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { AUTO_MODEL, ImageQuality, ImageRegion, ImageSize } from "./langdock";

// Defaults that depend on workspace data (the model lists) are stored here; Raycast preferences only support
// static dropdowns. Users change them with the "Set as Default" actions.

export interface Settings {
  /** AUTO_MODEL or a model id from the models API. */
  chatModel: string;
  /** Unset means the first image model available in the region. */
  imageModel?: string;
}

export const DEFAULT_SETTINGS: Settings = { chatModel: AUTO_MODEL };

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

/** Whether chat answers may use web search (extension preference). */
export function webSearchEnabled(): boolean {
  return getPreferenceValues<Preferences>().webSearch ?? false;
}

/** Image options from the Generate Image command preferences. */
export function imagePreferences(): { region: ImageRegion; size: ImageSize; quality: ImageQuality } {
  const prefs = getPreferenceValues<Preferences.GenerateImage>();
  return { region: prefs.imageRegion ?? "eu", size: prefs.imageSize ?? "auto", quality: prefs.imageQuality ?? "auto" };
}

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
