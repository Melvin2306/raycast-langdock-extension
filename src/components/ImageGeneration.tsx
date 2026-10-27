import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  LaunchType,
  launchCommand,
  showHUD,
  showInFinder,
  useNavigation,
  Keyboard,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateImage, ImageQuality, ImageRegion, ImageSize, listImageModels } from "../lib/langdock";
import { saveImage } from "../lib/images";
import { describeModel, displayName, groupByProvider, providerIcon, regionLabel } from "../lib/models";
import { IMAGE_QUALITIES, IMAGE_SIZES, imagePreferences, useSettings } from "../lib/settings";
import { escapeMarkdown } from "../lib/markdown";
import { showLangdockError } from "../lib/errors";

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
      showLangdockError(error, { title: "Could not load image models" });
    },
  });
}

export function GenerateImageForm(props: { initialPrompt?: string }) {
  const { push } = useNavigation();
  const { region, size, quality } = imagePreferences();
  const { settings, update, isLoading: isLoadingSettings } = useSettings();
  const { data: models, isLoading } = useImageModels(region);
  const [model, setModel] = useState<string>();
  const defaultModel = settings.imageModel ?? models?.[0];
  // Keep a manually entered default model selectable even if discovery did not list it.
  const modelOptions = [...new Set([...(settings.imageModel ? [settings.imageModel] : []), ...(models ?? [])])];
  const hasModelList = modelOptions.length > 0;
  const selected = model ?? defaultModel;

  return (
    <Form
      isLoading={isLoading || isLoadingSettings}
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
                    region,
                    size: values.size,
                    quality: values.quality,
                  }}
                />,
              );
            }}
          />
          {selected && selected !== settings.imageModel && (
            <Action
              title="Set Selected Model as Default"
              icon={Icon.Star}
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
              onAction={async () => {
                await update({ imageModel: selected });
                await showHUD(`${displayName(selected)} is now the default image model`);
              }}
            />
          )}
          <Action
            title="Browse Generated Images"
            icon={Icon.AppWindowGrid3x3}
            onAction={() => launchCommand({ name: "image-history", type: LaunchType.UserInitiated })}
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
        <Form.Dropdown id="model" title="Model" value={selected} onChange={setModel}>
          {groupByProvider(modelOptions).map(([provider, ids]) => (
            <Form.Dropdown.Section key={provider} title={provider}>
              {ids.map((id) => (
                <Form.Dropdown.Item
                  key={id}
                  value={id}
                  title={`${displayName(id)} · ${regionLabel({ region })}${id === settings.imageModel ? " · Default" : ""}`}
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
      <Form.Dropdown id="size" title="Size" defaultValue={size}>
        {IMAGE_SIZES.map((option) => (
          <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="quality" title="Quality" defaultValue={quality}>
        {IMAGE_QUALITIES.map((option) => (
          <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
        ))}
      </Form.Dropdown>
      {selected && describeModel(selected) && <Form.Description title="About" text={describeModel(selected) ?? ""} />}
      <Form.Description text="Defaults for region, size and quality are in the command's preferences." />
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
        await showLangdockError(err, { title: "Image generation failed" });
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
