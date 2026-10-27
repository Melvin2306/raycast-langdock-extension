import { LaunchProps } from "@raycast/api";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { SelectionChat } from "./components/SelectionChat";
import { apiKey } from "./lib/langdock";

export default function Command(props: LaunchProps<{ arguments: Arguments.AskAboutSelection }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  const question = props.arguments.question.trim();
  return (
    <SelectionChat
      label={question}
      instructions={`Answer this question about the text below: ${JSON.stringify(question)}`}
    />
  );
}
