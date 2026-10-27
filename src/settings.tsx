import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  Keyboard,
  List,
  LocalStorage,
  confirmAlert,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { apiKeysUrl } from "./components/ApiKeyMissing";
import { ImageModelPicker } from "./components/ImageGeneration";
import { ModelPicker } from "./components/ModelPicker";
import {
  AccessStatus,
  API_CAPABILITIES,
  apiBaseUrl,
  apiBaseUrlError,
  apiKey,
  checkAccess,
  listModels,
  webAppUrl,
} from "./lib/langdock";
import { displayName, regionLabel } from "./lib/models";
import {
  IMAGE_QUALITIES,
  IMAGE_REGIONS,
  IMAGE_SIZES,
  RECENT_AGENTS_KEY,
  SAVED_AGENTS_KEY,
  useSettings,
} from "./lib/settings";

const STATUS: Record<AccessStatus, { text: string; icon: Icon; color: Color }> = {
  available: { text: "Available", icon: Icon.CheckCircle, color: Color.Green },
  "missing-scope": { text: "No access", icon: Icon.XMarkCircle, color: Color.Orange },
  "invalid-key": { text: "Invalid key", icon: Icon.XMarkCircle, color: Color.Red },
  error: { text: "Error", icon: Icon.ExclamationMark, color: Color.Red },
};

export default function Command() {
  const key = apiKey();
  const { settings, update, reset, isLoading: isLoadingSettings } = useSettings();
  const { data: models } = useCachedPromise(listModels, [], { execute: Boolean(key) });
  const {
    data: access,
    isLoading: isChecking,
    revalidate: recheck,
  } = useCachedPromise(
    async (): Promise<Record<string, Awaited<ReturnType<typeof checkAccess>>>> =>
      Object.fromEntries(await Promise.all(API_CAPABILITIES.map(async (c) => [c.id, await checkAccess(c)]))),
    [],
    { execute: Boolean(key), keepPreviousData: true },
  );

  const results = Object.values(access ?? {});
  const keyStatus = !key
    ? undefined
    : !access
      ? undefined
      : results.some((r) => r.status === "invalid-key")
        ? "invalid"
        : results.some((r) => r.status === "available")
          ? "ok"
          : "unreachable";
  const isCloud = new URL(apiBaseUrl()).hostname === "api.langdock.com";
  const baseUrlError = apiBaseUrlError();
  const chatModel = models?.find((m) => m.id === settings.chatModel);
  const chatModelName =
    settings.chatModel === "auto"
      ? "Auto"
      : chatModel
        ? `${displayName(chatModel)} · ${regionLabel(chatModel)}`
        : settings.chatModel;

  const preferencesAction = (title: string) => (
    <Action title={title} icon={Icon.Gear} onAction={openExtensionPreferences} />
  );
  const recheckAction = (
    <Action
      title="Check API Access Again"
      icon={Icon.ArrowClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={recheck}
    />
  );

  return (
    <List isLoading={isChecking || isLoadingSettings} navigationTitle="Langdock Settings">
      <List.Section title="Account">
        <List.Item
          icon={Icon.Key}
          title="API Key"
          subtitle={key ? `••••${key.slice(-4)}` : "Not set"}
          accessories={[
            keyStatus === "ok"
              ? { tag: { value: "Connected", color: Color.Green } }
              : keyStatus === "invalid"
                ? { tag: { value: "Invalid", color: Color.Red } }
                : keyStatus === "unreachable"
                  ? { tag: { value: "Not reachable", color: Color.Red }, tooltip: results[0]?.message }
                  : key
                    ? { tag: "Checking…" }
                    : { tag: { value: "Missing", color: Color.Orange } },
          ]}
          actions={
            <ActionPanel>
              {preferencesAction(key ? "Change or Remove API Key" : "Add API Key")}
              <Action.OpenInBrowser title="Manage API Keys in Langdock" url={apiKeysUrl()} />
              {key && recheckAction}
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.Globe}
          title="API Base URL"
          subtitle={baseUrlError ? "Invalid" : apiBaseUrl()}
          accessories={[
            baseUrlError
              ? { tag: { value: "Fix in preferences", color: Color.Red }, tooltip: baseUrlError }
              : { tag: isCloud ? "Langdock Cloud" : "Dedicated" },
          ]}
          actions={
            <ActionPanel>
              {preferencesAction("Change API Base URL")}
              <Action.OpenInBrowser title="Open Langdock" url={webAppUrl()} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Chat">
        <List.Item
          icon={Icon.ComputerChip}
          title="Default Model"
          subtitle={chatModelName}
          actions={
            <ActionPanel>
              <Action.Push
                title="Choose Default Model"
                icon={Icon.ComputerChip}
                target={
                  <ModelPicker selectedModelId={settings.chatModel} onSelect={(chatModel) => update({ chatModel })} />
                }
              />
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.MagnifyingGlass}
          title="Web Search"
          subtitle="Let Ask Langdock search the web"
          accessories={[{ tag: settings.webSearch ? { value: "On", color: Color.Green } : "Off" }]}
          actions={
            <ActionPanel>
              <Action
                title={settings.webSearch ? "Turn Web Search off" : "Turn Web Search on"}
                icon={Icon.Switch}
                onAction={() => update({ webSearch: !settings.webSearch })}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Image Generation">
        <List.Item
          icon={Icon.Image}
          title="Default Image Model"
          subtitle={settings.imageModel ? displayName(settings.imageModel) : "First available"}
          actions={
            <ActionPanel>
              <Action.Push
                title="Choose Image Model"
                icon={Icon.Image}
                target={
                  <ImageModelPicker
                    region={settings.imageRegion}
                    selected={settings.imageModel}
                    onSelect={(imageModel) => update({ imageModel })}
                  />
                }
              />
            </ActionPanel>
          }
        />
        <OptionItem
          icon={Icon.Pin}
          title="Image Region"
          options={IMAGE_REGIONS}
          value={settings.imageRegion}
          // Image models differ per region, so a region change resets the model.
          onChange={(imageRegion) => update({ imageRegion, imageModel: undefined })}
        />
        <OptionItem
          icon={Icon.Maximize}
          title="Default Size"
          options={IMAGE_SIZES}
          value={settings.imageSize}
          onChange={(imageSize) => update({ imageSize })}
        />
        <OptionItem
          icon={Icon.Stars}
          title="Default Quality"
          options={IMAGE_QUALITIES}
          value={settings.imageQuality}
          onChange={(imageQuality) => update({ imageQuality })}
        />
      </List.Section>

      {key && (
        <List.Section title="API Access" subtitle="What this key can use">
          {API_CAPABILITIES.map((capability) => {
            const result = access?.[capability.id];
            const status = result ? STATUS[result.status] : undefined;
            return (
              <List.Item
                key={capability.id}
                icon={status ? { source: status.icon, tintColor: status.color } : Icon.CircleProgress}
                title={capability.title}
                subtitle={capability.description}
                accessories={[
                  { text: capability.scope, tooltip: result?.message },
                  status ? { tag: { value: status.text, color: status.color } } : { tag: "Checking…" },
                ]}
                actions={
                  <ActionPanel>
                    {recheckAction}
                    <Action.OpenInBrowser title="Open API Docs" url={capability.docsUrl} />
                    {result?.message && <Action.CopyToClipboard title="Copy Error" content={result.message} />}
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}

      <List.Section title="Data">
        <List.Item
          icon={Icon.ArrowCounterClockwise}
          title="Reset Settings"
          subtitle="Restore default models and options"
          actions={
            <ActionPanel>
              <Action
                title="Reset Settings"
                icon={Icon.ArrowCounterClockwise}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (await confirm("Reset all settings?", "Your API key and saved agents are kept.")) {
                    await reset();
                    await showToast({ style: Toast.Style.Success, title: "Settings reset" });
                  }
                }}
              />
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.Trash}
          title="Clear Agent History"
          subtitle="Forget recent and manually added agents in Ask Agent"
          actions={
            <ActionPanel>
              <Action
                title="Clear Agent History"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (await confirm("Clear agent history?", "The agents themselves stay in Langdock.")) {
                    await LocalStorage.removeItem(SAVED_AGENTS_KEY);
                    await LocalStorage.removeItem(RECENT_AGENTS_KEY);
                    await showToast({ style: Toast.Style.Success, title: "Agent history cleared" });
                  }
                }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function OptionItem<T extends string>(props: {
  icon: Icon;
  title: string;
  options: { value: T; title: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const current = props.options.find((o) => o.value === props.value);
  return (
    <List.Item
      icon={props.icon}
      title={props.title}
      subtitle={current?.title}
      actions={
        <ActionPanel>
          <ActionPanel.Submenu title={`Change ${props.title}`} icon={props.icon}>
            {props.options.map((option) => (
              <Action
                key={option.value}
                title={option.title}
                icon={option.value === props.value ? Icon.CheckCircle : Icon.Circle}
                onAction={() => props.onChange(option.value)}
              />
            ))}
          </ActionPanel.Submenu>
        </ActionPanel>
      }
    />
  );
}

function confirm(title: string, message: string): Promise<boolean> {
  return confirmAlert({ title, message, primaryAction: { title: "Confirm", style: Alert.ActionStyle.Destructive } });
}
