import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { SelectionChat } from "./components/SelectionChat";
import { apiKey } from "./lib/langdock";

export default function Command() {
  if (!apiKey()) return <ApiKeyMissing />;
  return (
    <SelectionChat
      label="Explain"
      instructions="Explain the following text in simple terms. Define jargon and give a short example if it helps. Answer in the language of the text."
    />
  );
}
