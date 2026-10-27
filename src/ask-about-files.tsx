import { Action, ActionPanel, Form, Icon, getSelectedFinderItems, showToast, Toast, useNavigation } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { realpathSync, statSync } from "node:fs";
import { useState } from "react";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { Chat } from "./components/Chat";
import { ModelDropdown } from "./components/ModelPicker";
import { apiKey } from "./lib/langdock";

/** Total size of all files. Inline files are resent with every follow-up, so this bounds each request. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

export default function Command() {
  return apiKey() ? <AskAboutFiles /> : <ApiKeyMissing />;
}

async function finderSelection(): Promise<string[]> {
  try {
    return (await getSelectedFinderItems()).map((item) => item.path).filter((path) => statSync(path).isFile());
  } catch {
    return [];
  }
}

function AskAboutFiles() {
  const { push } = useNavigation();
  const { data: selectedFiles, isLoading } = usePromise(finderSelection);
  const [model, setModel] = useState<string>();

  async function submit(values: { files: string[]; question: string }) {
    // Resolve symlinks so the uploaded name matches the file whose content is sent.
    const files = [...new Set(values.files.map((path) => realpathSync(path)))].filter((path) =>
      statSync(path).isFile(),
    );
    if (files.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Choose at least one file" });
      return;
    }
    const totalBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      await showToast({ style: Toast.Style.Failure, title: "Files too large", message: "Up to 20 MB in total" });
      return;
    }
    const question = values.question.trim() || "Summarize these files.";
    push(<Chat initialPrompt={question} filePaths={files} model={model} />);
  }

  if (isLoading) return <Form isLoading />;

  return (
    <Form
      navigationTitle="Ask About Files"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Ask" icon={Icon.ArrowRight} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.FilePicker
        id="files"
        title="Files"
        allowMultipleSelection
        canChooseDirectories={false}
        defaultValue={selectedFiles}
        info="Files selected in Finder are added automatically."
      />
      <Form.TextArea id="question" title="Question" placeholder="Summarize these files." />
      <ModelDropdown value={model} onChange={setModel} />
    </Form>
  );
}
