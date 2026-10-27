import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { SelectionChat } from "./components/SelectionChat";
import { apiKey } from "./lib/langdock";

export default function Command() {
  if (!apiKey()) return <ApiKeyMissing />;
  return (
    <SelectionChat
      label="Summarize"
      instructions="Summarize the following text concisely. Use bullet points for the key points when it helps. Answer in the language of the text."
    />
  );
}
