import { Detail, LaunchProps } from "@raycast/api";
import { GenerateImageForm, ImageResult } from "./components/ImageGeneration";
import { imagePreferences, useSettings } from "./lib/settings";

export default function Command(props: LaunchProps<{ arguments: Arguments.GenerateImage }>) {
  const prompt = props.arguments.prompt?.trim() || props.fallbackText?.trim();
  return prompt ? <QuickGenerate prompt={prompt} /> : <GenerateImageForm />;
}

/** Generates straight away with the default model and the command's preferences. */
function QuickGenerate(props: { prompt: string }) {
  const { settings, isLoading } = useSettings();
  if (isLoading) return <Detail isLoading />;
  return <ImageResult request={{ prompt: props.prompt, model: settings.imageModel, ...imagePreferences() }} />;
}
