import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  List,
  showHUD,
  showInFinder,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateImage, ImageQuality, ImageRegion, ImageSize, listImageModels } from "../lib/langdock";
import { saveImage } from "../lib/images";
import { describeModel, displayName, groupByProvider, providerIcon, providerName, regionLabel } from "../lib/models";
import { IMAGE_QUALITIES, IMAGE_SIZES, useSettings } from "../lib/settings";
import { escapeMarkdown } from "../lib/markdown";

export interface ImageRequest {
  prompt: string;
  /** Unset means the first image model available in the region. */
  model?: string;
  region: ImageRegion;
  size: ImageSize;
  quality: ImageQuality;
}

export function useImageModels(region: ImageRegion) {
  return useCachedPromise(listImageModels, [region], {
    onError: (error) => {
      showFailureToast(error, { title: "Could not load image models" });
    },
  });
}

export function GenerateImageForm(props: { initialPrompt?: string }) {
  const { push } = useNavigation();
  const { settings, isLoading: isLoadingSettings } = useSettings();
  const { data: models, isLoading } = useImageModels(settings.imageRegion);
  const [model, setModel] = useState<string>();
  const defaultModel = settings.imageModel ?? models?.[0];
  // Keep a manually entered default model selectable even if discovery did not list it.
  const modelOptions = [...new Set([...(settings.imageModel ? [settings.imageModel] : []), ...(models ?? [])])];
  const hasModelList = modelOptions.length > 0;

  return (
    <Form
      isLoading={isLoading || isLoadingSettings}
      navigationTitle="Generate Image"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Generate Image"
            icon={Icon.Image}
            onSubmit={(values: { prompt: string; model?: string; size: ImageSize; quality: ImageQuality }) => {
              if (!values.prompt.trim()) return;
              push(
                <ImageResult
                  request={{
                    prompt: values.prompt.trim(),
                    model: values.model?.trim() || defaultModel,
                    region: settings.imageRegion,
                    size: values.size,
                    quality: values.quality,
                  }}
                />,
              );
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="A lighthouse at dusk…"
        defaultValue={props.initialPrompt}
      />
      {hasModelList || isLoading ? (
        <Form.Dropdown id="model" title="Model" value={model ?? defaultModel} onChange={setModel}>
          {groupByProvider(modelOptions).map(([provider, ids]) => (
            <Form.Dropdown.Section key={provider} title={provider}>
              {ids.map((id) => (
                <Form.Dropdown.Item
                  key={id}
                  value={id}
                  title={`${displayName(id)} · ${regionLabel({ region: settings.imageRegion })}`}
                  icon={providerIcon(id)}
                  keywords={[id, provider]}
                />
              ))}
            </Form.Dropdown.Section>
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField
          id="model"
          title="Model ID"
          placeholder="Image model ID from your workspace"
          defaultValue={settings.imageModel}
          info="Langdock did not return a list of image models for this region. Ask your admin for the image model ID."
        />
      )}
      {!isLoadingSettings && (
        <>
          <Form.Dropdown id="size" title="Size" defaultValue={settings.imageSize}>
            {IMAGE_SIZES.map((size) => (
              <Form.Dropdown.Item key={size.value} value={size.value} title={size.title} />
            ))}
          </Form.Dropdown>
          <Form.Dropdown id="quality" title="Quality" defaultValue={settings.imageQuality}>
            {IMAGE_QUALITIES.map((quality) => (
              <Form.Dropdown.Item key={quality.value} value={quality.value} title={quality.title} />
            ))}
          </Form.Dropdown>
        </>
      )}
      {(model ?? defaultModel) && describeModel(model ?? defaultModel ?? "") && (
        <Form.Description title="About" text={describeModel(model ?? defaultModel ?? "") ?? ""} />
      )}
      <Form.Description text="Change the default image model, region, size and quality in Langdock Settings." />
    </Form>
  );
}

interface GeneratedImage {
  path: string;
  model: string;
  revisedPrompt?: string;
}

export function ImageResult(props: { request: ImageRequest }) {
  const { request } = props;
  const [image, setImage] = useState<GeneratedImage>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    setImage(undefined);
    setError(undefined);
    (async () => {
      try {
        const model = request.model || (await listImageModels(request.region))[0];
        if (!model) throw new Error(`No image models available in the ${request.region.toUpperCase()} region`);
        const result = await generateImage({ ...request, model, signal: controller.signal });
        const path = await saveImage(result.base64, {
          prompt: request.prompt,
          revisedPrompt: result.revisedPrompt,
          model,
          region: request.region,
          size: request.size,
          quality: request.quality,
          createdAt: new Date().toISOString(),
        });
        if (!controller.signal.aborted) setImage({ path, model, revisedPrompt: result.revisedPrompt });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
        await showFailureToast(err, { title: "Image generation failed" });
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  const markdown = image
    ? `![${request.prompt.replace(/[[\]]/g, "")}](${encodeURI(`file://${image.path}`)}?raycast-height=360)`
    : error
      ? `## Image generation failed\n\n${escapeMarkdown(error)}`
      : `Generating image… this can take up to a minute.\n\n> ${escapeMarkdown(request.prompt)}`;

  return (
    <Detail
      navigationTitle="Generated Image"
      isLoading={!image && !error}
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Prompt" text={request.prompt} />
          {image?.revisedPrompt && <Detail.Metadata.Label title="Revised Prompt" text={image.revisedPrompt} />}
          <Detail.Metadata.Label
            title="Model"
            text={displayName(image?.model ?? request.model ?? "First available")}
            icon={image?.model || request.model ? providerIcon(image?.model ?? request.model ?? "") : undefined}
          />
          <Detail.Metadata.Label title="Size" text={IMAGE_SIZES.find((s) => s.value === request.size)?.title} />
          <Detail.Metadata.Label
            title="Quality"
            text={IMAGE_QUALITIES.find((q) => q.value === request.quality)?.title}
          />
          <Detail.Metadata.Label title="Region" text={request.region.toUpperCase()} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          {image && <ImageFileActions path={image.path} />}
          <ActionPanel.Section>
            <Action
              title="Regenerate"
              icon={Icon.ArrowClockwise}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              onAction={() => setAttempt((n) => n + 1)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

/** Copy, paste and save actions for a generated image file. */
export function ImageFileActions(props: { path: string }) {
  const { path } = props;
  return (
    <ActionPanel.Section>
      <Action
        title="Copy Image"
        icon={Icon.Clipboard}
        onAction={async () => {
          await Clipboard.copy({ file: path });
          await showHUD("Copied image");
        }}
      />
      <Action.Paste title="Paste Image" content={{ file: path }} />
      <Action
        title="Save to Downloads"
        icon={Icon.Download}
        shortcut={Keyboard.Shortcut.Common.Save}
        onAction={async () => {
          const target = join(homedir(), "Downloads", `langdock-image-${Date.now()}.png`);
          await copyFile(path, target);
          await showInFinder(target);
        }}
      />
      <Action.Open title="Open in Preview" target={path} application="Preview" icon={Icon.Eye} />
      <Action.ShowInFinder path={path} />
    </ActionPanel.Section>
  );
}

/** Picker for the default image model in Langdock Settings. */
export function ImageModelPicker(props: {
  region: ImageRegion;
  selected?: string;
  onSelect: (model: string | undefined) => void;
}) {
  const { pop } = useNavigation();
  const { data: models, isLoading } = useImageModels(props.region);
  const select = (model: string | undefined) => {
    props.onSelect(model);
    pop();
  };

  return (
    <List isLoading={isLoading} navigationTitle="Choose Image Model" searchBarPlaceholder="Search image models…">
      <List.Item
        icon={Icon.Wand}
        title="First Available"
        subtitle="Use whichever image model Langdock lists first"
        accessories={props.selected ? [] : [{ icon: Icon.CheckCircle }]}
        actions={
          <ActionPanel>
            <Action title="Use First Available" icon={Icon.Checkmark} onAction={() => select(undefined)} />
          </ActionPanel>
        }
      />
      {groupByProvider(models ?? []).map(([provider, ids]) => (
        <List.Section key={provider} title={provider}>
          {ids.map((model) => (
            <List.Item
              key={model}
              icon={providerIcon(model)}
              title={displayName(model)}
              subtitle={describeModel(model)}
              keywords={[model, providerName(model)]}
              accessories={[
                ...(model === props.selected ? [{ icon: Icon.CheckCircle, tooltip: "Current default" }] : []),
                { tag: regionLabel({ region: props.region }) },
              ]}
              actions={
                <ActionPanel>
                  <Action title="Use Model" icon={Icon.Checkmark} onAction={() => select(model)} />
                  <Action.Push
                    title="Enter Model ID"
                    icon={Icon.Pencil}
                    target={<ImageModelIdForm onSubmit={select} />}
                  />
                  <Action.CopyToClipboard title="Copy Model ID" content={model} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
      {!isLoading && !models?.length && (
        <List.Item
          icon={Icon.Pencil}
          title="Enter Model ID…"
          subtitle="Langdock did not return image models for this region"
          actions={
            <ActionPanel>
              <Action.Push title="Enter Model ID" icon={Icon.Pencil} target={<ImageModelIdForm onSubmit={select} />} />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}

function ImageModelIdForm(props: { onSubmit: (model: string) => void }) {
  const { pop } = useNavigation();
  return (
    <Form
      navigationTitle="Enter Image Model ID"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            onSubmit={(values: { model: string }) => {
              if (!values.model.trim()) return;
              pop();
              props.onSubmit(values.model.trim());
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="model" title="Model ID" placeholder="e.g. gpt-image-1" />
    </Form>
  );
}
