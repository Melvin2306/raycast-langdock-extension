import { Action, ActionPanel, Alert, Icon, Keyboard, List, confirmAlert } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { Chat } from "./components/Chat";
import { clearConversations, deleteConversation, getConversations, transcript } from "./lib/history";
import { sanitizeMarkdown } from "./lib/markdown";

export default function Command() {
  return <ChatHistory />;
}

function ChatHistory() {
  // usePromise rather than useCachedPromise, so conversations aren't mirrored into Raycast's file cache.
  const { data: conversations, isLoading, revalidate, mutate } = usePromise(getConversations);

  async function remove(id: string) {
    await mutate(deleteConversation(id), {
      optimisticUpdate: (current) => (current ?? []).filter((c) => c.id !== id),
    });
  }

  async function removeAll() {
    const confirmed = await confirmAlert({
      title: "Delete all conversations?",
      message: "This only removes the history stored in Raycast.",
      primaryAction: { title: "Delete All", style: Alert.ActionStyle.Destructive },
    });
    if (confirmed) await mutate(clearConversations(), { optimisticUpdate: () => [] });
  }

  return (
    <List isLoading={isLoading} isShowingDetail={(conversations?.length ?? 0) > 0} searchBarPlaceholder="Search chats…">
      <List.EmptyView
        icon={Icon.Clock}
        title="No Chats Yet"
        description="Conversations from Ask Langdock and other commands appear here."
      />
      {conversations?.map((conversation) => (
        <List.Item
          key={conversation.id}
          icon={conversation.agent ? conversation.agent.emojiIcon || Icon.Stars : Icon.Bubble}
          title={conversation.title}
          keywords={conversation.turns.flatMap((t) => [t.question, t.answer.slice(0, 500)])}
          accessories={[{ date: new Date(conversation.updatedAt) }]}
          detail={
            <List.Item.Detail
              markdown={sanitizeMarkdown(transcript(conversation.turns))}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title={conversation.agent ? "Agent" : "Model"}
                    text={conversation.agent?.name ?? conversation.model ?? "Auto"}
                  />
                  <List.Item.Detail.Metadata.Label title="Messages" text={String(conversation.turns.length * 2)} />
                  <List.Item.Detail.Metadata.Label
                    title="Started"
                    text={new Date(conversation.createdAt).toLocaleString()}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action.Push
                title="Continue Conversation"
                icon={Icon.Bubble}
                target={<Chat conversation={conversation} />}
                onPop={revalidate}
              />
              <Action.CopyToClipboard
                title="Copy Conversation"
                content={transcript(conversation.turns)}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
              <Action
                title="Delete Conversation"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={Keyboard.Shortcut.Common.Remove}
                onAction={() => remove(conversation.id)}
              />
              <Action
                title="Delete All Conversations"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={Keyboard.Shortcut.Common.RemoveAll}
                onAction={removeAll}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
