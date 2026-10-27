import { Action, ActionPanel, Detail, Icon, openExtensionPreferences } from "@raycast/api";
import { webAppUrl } from "../lib/langdock";

export function apiKeysUrl(): string {
  return `${webAppUrl()}/settings/account/api-keys`;
}

export function ApiKeyMissing() {
  const markdown = `# Connect Langdock

Add a Langdock API key to get started.

1. Create a key in Langdock under **Settings → Account → API keys**, or ask your admin for a workspace key.
2. Paste it into **API Key** in the extension preferences.

Dedicated deployments also need **API Base URL** set to \`https://<your-domain>/api/public\`.`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
          <Action.OpenInBrowser title="Create API Key in Langdock" url={apiKeysUrl()} />
        </ActionPanel>
      }
    />
  );
}
