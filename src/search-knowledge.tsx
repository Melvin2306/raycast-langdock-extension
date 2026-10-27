import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { AddToKnowledgeBase } from "./components/KnowledgeUpload";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { Chat } from "./components/Chat";
import { apiKey, KnowledgeResult, listKnowledgeBases, searchKnowledge } from "./lib/langdock";
import { escapeMarkdown, safeHttpUrl, sanitizeMarkdown, wrapUntrusted } from "./lib/markdown";

export default function Command() {
  return apiKey() ? <SearchKnowledge /> : <ApiKeyMissing />;
}

function SearchKnowledge() {
  const [query, setQuery] = useState("");
  const hasQuery = query.trim().length >= 2;
  const { data: results, isLoading } = useCachedPromise(searchKnowledge, [query.trim()], {
    execute: hasQuery,
    keepPreviousData: true,
    onError: (error) => {
      showFailureToast(error, { title: "Knowledge search failed" });
    },
  });
  const { data: knowledgeBases, isLoading: isLoadingBases } = useCachedPromise(listKnowledgeBases, [], {
    onError: () => undefined,
  });
  const visibleResults = hasQuery ? (results ?? []) : [];

  return (
    <List
      isLoading={(hasQuery && isLoading) || isLoadingBases}
      isShowingDetail={visibleResults.length > 0}
      searchBarPlaceholder="Search your knowledge bases…"
      onSearchTextChange={setQuery}
      throttle
    >
      <List.EmptyView
        icon={Icon.MagnifyingGlass}
        title={hasQuery ? "No Results" : "Search Knowledge"}
        description="Searches the knowledge bases shared with your API key. Personal keys usually have none; ask an admin for a workspace key."
      />
      {visibleResults.map((result) => (
        <ResultItem key={result.id} result={result} query={query.trim()} />
      ))}
      {!hasQuery && (knowledgeBases?.length ?? 0) > 0 && (
        <List.Section title="Knowledge Bases" subtitle="Shared with this key">
          {knowledgeBases?.map((base) => (
            <List.Item
              key={base.id}
              icon={Icon.Folder}
              title={base.name}
              subtitle={base.description ?? undefined}
              accessories={[
                { text: `${base.fileCount} file${base.fileCount === 1 ? "" : "s"}` },
                ...(base.role === "EDITOR" ? [] : [{ tag: "View only" }]),
              ]}
              actions={
                base.role === "EDITOR" ? (
                  <ActionPanel>
                    <Action.Push
                      title="Add Files"
                      icon={Icon.Upload}
                      target={<AddToKnowledgeBase knowledgeBaseId={base.id} />}
                    />
                  </ActionPanel>
                ) : undefined
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}

function ResultItem(props: { result: KnowledgeResult; query: string }) {
  const { result, query } = props;
  const sourceUrl = safeHttpUrl(result.url);
  const askPrompt = `Answer the question using the excerpt below. Say so if the excerpt doesn't contain the answer.\n\nQuestion: ${JSON.stringify(query)}\n\n${wrapUntrusted("excerpt", result.text, { source: result.subname })}`;
  return (
    <List.Item
      icon={Icon.Document}
      title={result.subname}
      accessories={[{ text: `${Math.round(result.similarity * 100)}%`, tooltip: "Similarity" }]}
      detail={
        <List.Item.Detail markdown={`### ${escapeMarkdown(result.subname)}\n\n${sanitizeMarkdown(result.text)}`} />
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Ask Langdock About This"
            icon={Icon.Bubble}
            target={<Chat initialPrompt={askPrompt} displayPrompt={`${query} (from ${result.subname})`} />}
          />
          <Action.CopyToClipboard title="Copy Text" content={result.text} />
          <Action.Paste title="Paste Text" content={result.text} />
          {sourceUrl && <Action.OpenInBrowser title="Open Source" url={sourceUrl} />}
          <Action.CopyToClipboard title="Copy File Name" content={result.subname} />
        </ActionPanel>
      }
    />
  );
}
