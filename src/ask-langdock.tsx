import { LaunchProps } from "@raycast/api";
import { Chat } from "./components/Chat";

export default function Command(props: LaunchProps<{ arguments: Arguments.AskLangdock }>) {
  // A question from the argument or from fallback search is sent right away; otherwise type it in the search bar.
  const prompt = props.arguments.prompt?.trim() || props.fallbackText?.trim();
  return <Chat initialPrompt={prompt || undefined} />;
}
