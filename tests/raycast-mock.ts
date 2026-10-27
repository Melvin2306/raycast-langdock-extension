// In-memory stand-in for @raycast/api, used by the unit tests.
export const preferences: Record<string, string | undefined> = { apiKey: "test-key", apiBaseUrl: "" };
export const getPreferenceValues = () => preferences;

const store = new Map<string, string>();
export const LocalStorage = {
  getItem: async <T>(key: string) => store.get(key) as T | undefined,
  setItem: async (key: string, value: string) => void store.set(key, value),
  removeItem: async (key: string) => void store.delete(key),
  clear: async () => store.clear(),
};

export const environment = { supportPath: process.env.TMPDIR ?? "/tmp" };
export const Icon = new Proxy({}, { get: (_target, name) => String(name) });
