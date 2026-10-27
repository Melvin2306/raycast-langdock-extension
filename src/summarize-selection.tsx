import { SelectionChat } from "./components/SelectionChat";

export default function Command() {
  return (
    <SelectionChat
      label="Summarize"
      instructions="Summarize the following text concisely. Use bullet points for the key points when it helps. Answer in the language of the text."
    />
  );
}
