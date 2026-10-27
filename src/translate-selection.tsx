import { LaunchProps, getPreferenceValues } from "@raycast/api";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { SelectionChat } from "./components/SelectionChat";
import { apiKey } from "./lib/langdock";

export default function Command(props: LaunchProps<{ arguments: Arguments.TranslateSelection }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  const { defaultLanguage } = getPreferenceValues<Preferences.TranslateSelection>();
  const language = props.arguments.language?.trim() || defaultLanguage?.trim() || "English";
  return (
    <SelectionChat
      label={`Translate to ${language}`}
      pasteFirst
      instructions={`Translate the following text into ${JSON.stringify(language)}. Keep its meaning, tone and formatting. Reply with the translation only, without quotes or comments.`}
    />
  );
}
