import { LaunchProps } from "@raycast/api";
import { SelectionChat } from "./components/SelectionChat";

export default function Command(props: LaunchProps<{ arguments: Arguments.AskAboutSelection }>) {
  const question = props.arguments.question.trim();
  return (
    <SelectionChat
      label={question}
      instructions={`Answer this question about the text below: ${JSON.stringify(question)}`}
    />
  );
}
