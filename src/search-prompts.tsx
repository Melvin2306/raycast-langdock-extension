import { Action, ActionPanel, Icon, LaunchProps, List } from "@raycast/api";
import { createDeeplink, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { Chat } from "./components/Chat";
import { showLangdockError } from "./lib/errors";
import { getPrompt, listPrompts, webAppUrl } from "./lib/langdock";
import { sanitizeMarkdown } from "./lib/markdown";

export default function Command(props: LaunchProps<{ launchContext?: { promptId?: string } }>) {
  // Quicklinks run one prompt directly.
  const promptId = props.launchContext?.promptId;
  return promptId ? <RunPrompt promptId={promptId} /> : <PromptSearch />;
}

function RunPrompt(props: { promptId: string }) {
  const { data: prompt, isLoading } = useCachedPromise(getPrompt, [props.promptId], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load the prompt" });
    },
  });
  if (!prompt) {
    return (
      <List isLoading={isLoading}>{!isLoading && <List.EmptyView icon={Icon.Text} title="Prompt not found" />}</List>
    );
  }
  return <Chat initialPrompt={prompt.prompt} displayPrompt={prompt.title} />;
}

function PromptSearch() {
  const [searchText, setSearchText] = useState("");
  const { data: prompts, isLoading } = useCachedPromise(listPrompts, [searchText], {
    keepPreviousData: true,
    onError: (error) => {
      showLangdockError(error, { title: "Could not load prompts" });
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
                target={<Chat initialPrompt={prompt.prompt} displayPrompt={prompt.title} />}
                shortcut={{ modifiers: ["cmd"], key: "return" }}
              />
              <Action.CopyToClipboard title="Copy Prompt" content={prompt.prompt} />
              <Action.CreateQuicklink
                title="Create Quicklink"
                icon={Icon.Link}
                shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
                quicklink={{
                  name: prompt.title,
                  link: createDeeplink({ command: "search-prompts", context: { promptId: prompt.id } }),
                }}
              />
              <Action.OpenInBrowser title="Open Langdock" url={webAppUrl()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
