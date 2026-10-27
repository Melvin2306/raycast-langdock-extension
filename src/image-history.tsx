import { Action, ActionPanel, Alert, Detail, Grid, Icon, Keyboard, confirmAlert } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { ImageFileActions, ImageResult } from "./components/ImageGeneration";
import { deleteImage, listSavedImages, SavedImage } from "./lib/images";
import { IMAGE_QUALITIES, IMAGE_SIZES } from "./lib/settings";

export default function Command() {
  const { data: images, isLoading, mutate } = useCachedPromise(listSavedImages);

  async function remove(image: SavedImage) {
    const confirmed = await confirmAlert({
      title: "Delete image?",
      message: "The image is removed from Raycast. Copies you saved elsewhere are kept.",
      primaryAction: { title: "Delete", style: Alert.ActionStyle.Destructive },
    });
    if (confirmed) {
      await mutate(deleteImage(image.path), {
        optimisticUpdate: (current) => current?.filter((i) => i.path !== image.path),
      });
    }
  }

  return (
    <Grid isLoading={isLoading} columns={4} aspectRatio="1" fit={Grid.Fit.Fill} searchBarPlaceholder="Search images…">
      <Grid.EmptyView
        icon={Icon.Image}
        title="No Images Yet"
        description="Images you create with Generate Image appear here."
      />
      {images?.map((image) => (
        <Grid.Item
          key={image.path}
          content={image.path}
          title={image.prompt}
          keywords={[image.model ?? "", image.revisedPrompt ?? ""]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action.Push title="Show Image" icon={Icon.Eye} target={<ImageDetail image={image} />} />
              </ActionPanel.Section>
              <ImageFileActions path={image.path} />
              <ActionPanel.Section>
                {image.prompt && image.model && image.region && image.size && image.quality && (
                  <Action.Push
                    title="Generate Again"
                    icon={Icon.ArrowClockwise}
                    target={
                      <ImageResult
                        request={{
                          prompt: image.prompt,
                          model: image.model,
                          region: image.region,
                          size: image.size,
                          quality: image.quality,
                        }}
                      />
                    }
                  />
                )}
                {image.prompt && <Action.CopyToClipboard title="Copy Prompt" content={image.prompt} />}
                <Action
                  title="Delete Image"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={Keyboard.Shortcut.Common.Remove}
                  onAction={() => remove(image)}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </Grid>
  );
}

function ImageDetail(props: { image: SavedImage }) {
  const { image } = props;
  return (
    <Detail
      navigationTitle="Image"
      markdown={`![](${encodeURI(`file://${image.path}`)}?raycast-height=360)`}
      metadata={
        <Detail.Metadata>
          {image.prompt && <Detail.Metadata.Label title="Prompt" text={image.prompt} />}
          {image.revisedPrompt && <Detail.Metadata.Label title="Revised Prompt" text={image.revisedPrompt} />}
          {image.model && <Detail.Metadata.Label title="Model" text={image.model} />}
          {image.size && (
            <Detail.Metadata.Label title="Size" text={IMAGE_SIZES.find((s) => s.value === image.size)?.title} />
          )}
          {image.quality && (
            <Detail.Metadata.Label
              title="Quality"
              text={IMAGE_QUALITIES.find((q) => q.value === image.quality)?.title}
            />
          )}
          <Detail.Metadata.Label title="Created" text={new Date(image.createdAt).toLocaleString()} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ImageFileActions path={image.path} />
        </ActionPanel>
      }
    />
  );
}
