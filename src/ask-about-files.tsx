import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LaunchProps,
  getSelectedFinderItems,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { realpathSync, statSync } from "node:fs";
import { useState } from "react";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { Chat } from "./components/Chat";
import { ModelDropdown } from "./components/ModelPicker";
import { apiKey } from "./lib/langdock";

/** Total size of all files. Inline files are resent with every follow-up, so this bounds each request. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/** Set when another command (e.g. Ask About Screenshot) opens this one with files. */
export interface AskAboutFilesContext {
  files?: string[];
  question?: string;
  /** Send right away instead of showing the form. */
  send?: boolean;
}

export default function Command(props: LaunchProps<{ launchContext?: AskAboutFilesContext }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  const context = props.launchContext;
  const files = (context?.files ?? []).filter((path) => statSync(path, { throwIfNoEntry: false })?.isFile());
  if (context?.send && files.length > 0 && context.question) {
    return <Chat initialPrompt={context.question} filePaths={files} />;
  }
  return <AskAboutFiles files={files.length > 0 ? files : undefined} question={context?.question} />;
}

async function finderSelection(): Promise<string[]> {
  try {
    return (await getSelectedFinderItems()).map((item) => item.path).filter((path) => statSync(path).isFile());
  } catch {
    return [];
  }
}

function AskAboutFiles(props: { files?: string[]; question?: string }) {
  const { push } = useNavigation();
  // Files passed in by another command take the place of the Finder selection.
  const { data: selectedFiles, isLoading } = usePromise(async () => props.files ?? (await finderSelection()));
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
      <Form.TextArea
        id="question"
        title="Question"
        placeholder="Summarize these files."
        defaultValue={props.question}
      />
      <ModelDropdown value={model} onChange={setModel} />
    </Form>
  );
}
