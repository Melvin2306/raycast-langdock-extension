import { SelectionChat } from "./components/SelectionChat";

export default function Command() {
  return (
    <SelectionChat
      label="Explain"
      instructions="Explain the following text in simple terms. Define jargon and give a short example if it helps. Answer in the language of the text."
    />
  );
}
