import { Detail, LaunchProps } from "@raycast/api";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { GenerateImageForm, ImageResult } from "./components/ImageGeneration";
import { apiKey } from "./lib/langdock";
import { useSettings } from "./lib/settings";

export default function Command(props: LaunchProps<{ arguments: Arguments.GenerateImage }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  const prompt = props.arguments.prompt?.trim() || props.fallbackText?.trim();
  return prompt ? <QuickGenerate prompt={prompt} /> : <GenerateImageForm />;
}

/** Generates straight away with the defaults from Langdock Settings. */
function QuickGenerate(props: { prompt: string }) {
  const { settings, isLoading } = useSettings();
  if (isLoading) return <Detail isLoading />;
  return (
    <ImageResult
      request={{
        prompt: props.prompt,
        model: settings.imageModel,
        region: settings.imageRegion,
        size: settings.imageSize,
        quality: settings.imageQuality,
      }}
    />
  );
}
