// Minimal @raycast/api stand-in so the API client can run under Node for the smoke test.
export const getPreferenceValues = () => ({
  apiKey: process.env.LANGDOCK_API_KEY ?? "",
  apiBaseUrl: process.env.LANGDOCK_API_BASE_URL ?? "https://api.langdock.com",
});
export const environment = { supportPath: process.env.TMPDIR ?? "/tmp" };
export const Icon = {};
export const LocalStorage = {};
