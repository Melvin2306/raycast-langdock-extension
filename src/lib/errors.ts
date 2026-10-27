import { Toast, open, openExtensionPreferences } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { LangdockError, webAppUrl } from "./langdock";
import { scopeForPath } from "./scopes";

export function apiKeysUrl(): string {
  return `${webAppUrl()}/settings/account/api-keys`;
}

/**
 * Failure toast with the fix as its action: preferences for a bad key or URL, the API keys page for a
 * missing scope, and Retry for rate limits when the caller can retry.
 */
export function showLangdockError(
  error: unknown,
  options: { title: string; message?: string; onRetry?: () => void },
): Promise<Toast> {
  const { title, message, onRetry } = options;
  if (error instanceof LangdockError) {
    if (error.isConfigError || error.status === 401) {
      return showFailureToast(error, {
        title,
        primaryAction: { title: "Open Extension Preferences", onAction: () => openExtensionPreferences() },
      });
    }
    if (error.status === 403) {
      const scope = scopeForPath(error.path);
      return showFailureToast(error, {
        title,
        message: scope ? `The API key needs the ${scope} scope, or access to this item.` : (message ?? error.message),
        primaryAction: { title: "Manage API Keys", onAction: () => open(apiKeysUrl()) },
      });
    }
    if (error.status === 429 && onRetry) {
      return showFailureToast(error, { title, primaryAction: { title: "Retry", onAction: () => onRetry() } });
    }
  }
  return showFailureToast(error, { title, message });
}
