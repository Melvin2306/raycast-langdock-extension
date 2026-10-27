import { Action, ActionPanel, Form, getSelectedFinderItems, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useCachedPromise, usePromise } from "@raycast/utils";
import { realpathSync, statSync } from "node:fs";
import { basename } from "node:path";
import { useState } from "react";
import { listKnowledgeBases, uploadToKnowledgeBase } from "../lib/langdock";
import { safeHttpUrl } from "../lib/markdown";
import { showLangdockError } from "../lib/errors";

async function finderSelection(): Promise<string[]> {
  try {
    return (await getSelectedFinderItems()).map((item) => item.path).filter((path) => statSync(path).isFile());
  } catch {
    return [];
  }
}

export function AddToKnowledgeBase(props: { knowledgeBaseId?: string }) {
  const { pop } = useNavigation();
  const { data: selectedFiles, isLoading: isLoadingFiles } = usePromise(finderSelection);
  const { data: bases, isLoading } = useCachedPromise(listKnowledgeBases, [], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load knowledge bases" });
    },
  });
  const [isUploading, setIsUploading] = useState(false);
  // Uploading needs editor access; viewers can only search.
  const editable = (bases ?? []).filter((base) => base.role === "EDITOR");

  async function submit(values: { files: string[]; knowledgeBase: string; url: string }) {
    const files = [...new Set(values.files.map((path) => realpathSync(path)))].filter((path) =>
      statSync(path).isFile(),
    );
    if (files.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Choose at least one file" });
      return;
    }
    const sourceUrl = values.url.trim();
    if (sourceUrl && !safeHttpUrl(sourceUrl)) {
      await showToast({ style: Toast.Style.Failure, title: "Source URL must start with https://" });
      return;
    }
    const base = editable.find((b) => b.id === values.knowledgeBase);
    setIsUploading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Uploading to ${base?.name ?? "knowledge base"}…`,
    });
    const failed: string[] = [];
    for (const [index, path] of files.entries()) {
      toast.message = `${index + 1} of ${files.length}: ${basename(path)}`;
      try {
        await uploadToKnowledgeBase(values.knowledgeBase, path, sourceUrl || undefined);
      } catch (error) {
        failed.push(`${basename(path)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    setIsUploading(false);
    if (failed.length === 0) {
      toast.style = Toast.Style.Success;
      toast.title = `Added ${files.length} file${files.length === 1 ? "" : "s"} to ${base?.name ?? "the knowledge base"}`;
      toast.message = "Langdock is processing them; they're searchable in a few minutes.";
      pop();
    } else {
      toast.style = Toast.Style.Failure;
      toast.title = `${failed.length} of ${files.length} uploads failed`;
      toast.message = failed[0];
    }
  }

  return (
    <Form
      isLoading={isLoading || isLoadingFiles || isUploading}
      actions={
        editable.length > 0 ? (
          <ActionPanel>
            <Action.SubmitForm title="Upload Files" icon={Icon.Upload} onSubmit={submit} />
          </ActionPanel>
        ) : undefined
      }
    >
      {!isLoading && editable.length === 0 && (
        <Form.Description
          title="No knowledge bases"
          text="No knowledge base lets this API key upload files. Share one with the key as Editor in Langdock (workspace keys only)."
        />
      )}
      {editable.length > 0 && (
        <Form.Dropdown id="knowledgeBase" title="Knowledge Base" defaultValue={props.knowledgeBaseId} storeValue>
          {editable.map((base) => (
            <Form.Dropdown.Item
              key={base.id}
              value={base.id}
              title={`${base.name} · ${base.fileCount} file${base.fileCount === 1 ? "" : "s"}`}
              icon={Icon.Folder}
            />
          ))}
        </Form.Dropdown>
      )}
      {!isLoadingFiles && (
        <Form.FilePicker
          id="files"
          title="Files"
          allowMultipleSelection
          canChooseDirectories={false}
          defaultValue={selectedFiles}
          info="Files selected in Finder are added automatically."
        />
      )}
      <Form.TextField
        id="url"
        title="Source URL"
        placeholder="https://… (optional)"
        info="Shown as the source when knowledge search finds these files."
      />
    </Form>
  );
}
