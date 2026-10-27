import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { Chat } from "./components/Chat";
import { listPrompts, webAppUrl, apiKey } from "./lib/langdock";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { sanitizeMarkdown } from "./lib/markdown";

export default function Command() {
  return apiKey() ? <PromptSearch /> : <ApiKeyMissing />;
}

function PromptSearch() {
  const [searchText, setSearchText] = useState("");
  const { data: prompts, isLoading } = useCachedPromise(listPrompts, [searchText], {
    keepPreviousData: true,
    onError: (error) => {
      showFailureToast(error, { title: "Could not load prompts" });
    },
  });

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={(prompts?.length ?? 0) > 0}
      searchBarPlaceholder="Search prompts…"
      onSearchTextChange={setSearchText}
      throttle
    >
      <List.EmptyView
        icon={Icon.Text}
        title={searchText ? "No Matching Prompts" : "No Prompts"}
        description="Prompts from your Langdock prompt library appear here."
      />
      {prompts?.map((prompt) => (
        <List.Item
          key={prompt.id}
          icon={prompt.sharedWithWorkspace ? Icon.TwoPeople : Icon.Person}
          title={prompt.title}
          detail={<List.Item.Detail markdown={sanitizeMarkdown(prompt.prompt)} />}
          actions={
            <ActionPanel>
              <Action.Paste title="Paste Prompt" content={prompt.prompt} />
              <Action.Push
                title="Run with Langdock"
                icon={Icon.Bubble}
                target={<Chat initialPrompt={prompt.prompt} />}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
              />
              <Action.CopyToClipboard title="Copy Prompt" content={prompt.prompt} />
              <Action.OpenInBrowser title="Open Langdock" url={webAppUrl()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
