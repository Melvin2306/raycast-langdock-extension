import { LaunchProps, getPreferenceValues } from "@raycast/api";
import { SelectionChat } from "./components/SelectionChat";

export default function Command(props: LaunchProps<{ arguments: Arguments.TranslateSelection }>) {
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
