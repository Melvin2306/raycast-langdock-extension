import { LaunchProps, useNavigation } from "@raycast/api";
import { useState } from "react";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { AskForm, Chat } from "./components/Chat";
import { apiKey } from "./lib/langdock";

export default function Command(props: LaunchProps<{ arguments: Arguments.AskLangdock }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  const prompt = props.arguments.prompt?.trim() || props.fallbackText?.trim();
  if (prompt) return <Chat initialPrompt={prompt} />;
  return <AskLangdockForm />;
}

function AskLangdockForm() {
  const { push } = useNavigation();
  const [model, setModel] = useState<string>();
  return (
    <AskForm
      title="Ask Langdock"
      model={model}
      onModelChange={setModel}
      onSubmit={(question) => push(<Chat initialPrompt={question} model={model} />)}
    />
  );
}
