import { Action, ActionPanel, Color, Form, Icon, List, showHUD, useNavigation } from "@raycast/api";
import { useState } from "react";
import { useCachedPromise } from "@raycast/utils";
import { AUTO_MODEL, isAutoModel, listModels, matchModel, Model } from "../lib/langdock";
import { useSettings } from "../lib/settings";
import {
  AUTO_ICON,
  catalogEntry,
  describeModel,
  displayName,
  formatTokens,
  groupByProvider,
  providerIcon,
  providerName,
  regionLabel,
} from "../lib/models";
import { escapeMarkdown } from "../lib/markdown";
import { showLangdockError } from "../lib/errors";

export function ModelPicker(props: { selectedModelId?: string; onSelect: (modelId: string) => void }) {
  const { pop } = useNavigation();
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const { settings, update } = useSettings();
  const setDefault = (modelId: string, label: string) => (
    <Action
      title="Set as Default Model"
      icon={Icon.Star}
      shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
      onAction={async () => {
        await update({ chatModel: modelId });
        await showHUD(`${label} is now the default model`);
      }}
    />
  );
  const { data: models, isLoading } = useCachedPromise(listModels, [], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load models" });
    },
  });

  const select = (modelId: string) => {
    props.onSelect(modelId);
    pop();
  };
  const selectedAccessory = (modelId: string) =>
    modelId === props.selectedModelId
      ? [{ icon: { source: Icon.CheckCircle, tintColor: Color.Green }, tooltip: "Current model" }]
      : [];
  const detailAction = (
    <Action
      title={isShowingDetail ? "Hide Details" : "Show Details"}
      icon={Icon.Sidebar}
      shortcut={{ modifiers: ["cmd"], key: "d" }}
      onAction={() => setIsShowingDetail((value) => !value)}
    />
  );

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Choose Model"
      searchBarPlaceholder="Search models…"
      isShowingDetail={isShowingDetail}
    >
      <List.Item
        icon={AUTO_ICON}
        title="Auto"
        keywords={["automatic", "recommended", "default"]}
        subtitle={isShowingDetail ? undefined : "Workspace default"}
        accessories={[...selectedAccessory(AUTO_MODEL), { tag: { value: "Recommended", color: Color.Blue } }]}
        detail={<List.Item.Detail markdown={AUTO_DESCRIPTION} />}
        actions={
          <ActionPanel>
            <Action title="Use Model" icon={Icon.Checkmark} onAction={() => select(AUTO_MODEL)} />
            {settings.chatModel !== AUTO_MODEL && setDefault(AUTO_MODEL, "Auto")}
            {detailAction}
          </ActionPanel>
        }
      />
      {groupByProvider(models ?? []).map(([provider, providerModels]) => (
        <List.Section key={provider} title={provider}>
          {providerModels.map((model) => (
            <List.Item
              key={model.id}
              icon={providerIcon(model)}
              title={displayName(model)}
              keywords={[model.name, model.id, provider, model.region, describeModel(model) ?? ""]}
              accessories={[
                ...selectedAccessory(model.id),
                ...(model.supportsExtendedThinking ? [{ icon: Icon.LightBulb, tooltip: "Extended thinking" }] : []),
                { tag: regionLabel(model) },
              ]}
              detail={<ModelDetail model={model} />}
              actions={
                <ActionPanel>
                  <Action title="Use Model" icon={Icon.Checkmark} onAction={() => select(model.id)} />
                  {settings.chatModel !== model.id && setDefault(model.id, displayName(model))}
                  {detailAction}
                  <Action.CopyToClipboard title="Copy Model ID" content={model.id} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

/** Model dropdown for forms. Starts on the default chat model (Auto unless changed with Set as Default Model). */
export function ModelDropdown(props: { value?: string; onChange: (modelId: string) => void }) {
  const { data: models, isLoading } = useCachedPromise(listModels, []);
  const { settings, isLoading: isLoadingSettings } = useSettings();
  const preferred = settings.chatModel;
  const defaultValue = isAutoModel(preferred) ? AUTO_MODEL : (matchModel(models ?? [], preferred)?.id ?? AUTO_MODEL);

  // Render only once the default is known; a dropdown mounted earlier would report "Auto" as the choice.
  if (isLoadingSettings || (isLoading && !models)) {
    return <Form.Description title="Model" text="Loading models…" />;
  }

  return (
    <Form.Dropdown id="model" title="Model" value={props.value ?? defaultValue} onChange={props.onChange}>
      <Form.Dropdown.Item value={AUTO_MODEL} title="Auto" icon={AUTO_ICON} keywords={["recommended"]} />
      {groupByProvider(models ?? []).map(([provider, providerModels]) => (
        <Form.Dropdown.Section key={provider} title={provider}>
          {providerModels.map((model) => (
            <Form.Dropdown.Item
              key={model.id}
              value={model.id}
              title={`${displayName(model)} · ${regionLabel(model)}`}
              icon={providerIcon(model)}
              keywords={[model.name, provider]}
            />
          ))}
        </Form.Dropdown.Section>
      ))}
    </Form.Dropdown>
  );
}

const AUTO_DESCRIPTION = `## Auto

Requests are sent without a model, so Langdock answers with your **workspace's default model**.`;

function ModelDetail(props: { model: Model }) {
  const { model } = props;
  const entry = catalogEntry(model.name);
  return (
    <List.Item.Detail
      markdown={`## ${escapeMarkdown(providerName(model))} / ${escapeMarkdown(displayName(model))}\n\n${entry?.description ?? "Custom model in your workspace."}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Provider" text={providerName(model)} icon={providerIcon(model)} />
          <List.Item.Detail.Metadata.Label title="Region" text={regionLabel(model)} />
          {entry?.contextWindowSize && (
            <List.Item.Detail.Metadata.Label title="Context" text={formatTokens(entry.contextWindowSize)} />
          )}
          {entry?.maxOutputTokens && (
            <List.Item.Detail.Metadata.Label title="Max Output" text={formatTokens(entry.maxOutputTokens)} />
          )}
          <List.Item.Detail.Metadata.TagList title="Capabilities">
            <List.Item.Detail.Metadata.TagList.Item text="Chat" color={Color.Blue} />
            {(model.supportsExtendedThinking || entry?.thinking) && (
              <List.Item.Detail.Metadata.TagList.Item text="Thinking" color={Color.Purple} />
            )}
            {entry?.vision && <List.Item.Detail.Metadata.TagList.Item text="Vision" color={Color.Green} />}
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Model ID" text={model.id} />
        </List.Item.Detail.Metadata>
      }
    />
  );
}
