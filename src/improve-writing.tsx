import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { SelectionChat } from "./components/SelectionChat";
import { apiKey } from "./lib/langdock";

export default function Command() {
  if (!apiKey()) return <ApiKeyMissing />;
  return (
    <SelectionChat
      label="Improve Writing"
      pasteFirst
      instructions="Improve the writing of the following text. Fix spelling, grammar and punctuation, and make it clearer, while keeping its meaning, tone, language and formatting. Reply with the improved text only, without quotes or comments."
    />
  );
}
