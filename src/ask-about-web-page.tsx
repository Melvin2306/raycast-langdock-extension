import { Action, ActionPanel, BrowserExtension, Detail, Icon, LaunchProps } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { Chat } from "./components/Chat";
import { apiKey } from "./lib/langdock";
import { wrapUntrusted } from "./lib/markdown";

/** Long pages are cut so the request stays within the model's context. */
const MAX_PAGE_CHARS = 60_000;

interface Page {
  title: string;
  url: string;
  content: string;
}

async function readActiveTab(): Promise<Page> {
  const tabs = await BrowserExtension.getTabs();
  const tab = tabs.find((t) => t.active);
  const content = await BrowserExtension.getContent({ format: "markdown", tabId: tab?.id });
  return { title: tab?.title || tab?.url || "Web page", url: tab?.url ?? "", content };
}

export default function Command(props: LaunchProps<{ arguments: Arguments.AskAboutWebPage }>) {
  if (!apiKey()) return <ApiKeyMissing />;
  return <AskAboutWebPage question={props.arguments.question?.trim()} />;
}

function AskAboutWebPage(props: { question?: string }) {
  const { data: page, isLoading, error } = usePromise(readActiveTab);

  if (isLoading) return <Detail isLoading markdown="Reading the current page…" />;
  if (error || !page) {
    return (
      <Detail
        markdown={`## Couldn't read the page\n\nThis command needs the Raycast browser extension in your browser, with a page open.\n\n\`${error?.message ?? "No active tab"}\``}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="Get the Raycast Browser Extension"
              icon={Icon.Globe}
              url="https://www.raycast.com/browser-extension"
            />
          </ActionPanel>
        }
      />
    );
  }
  if (!page.content.trim()) return <Detail markdown="## This page has no readable text" />;

  const content =
    page.content.length > MAX_PAGE_CHARS ? `${page.content.slice(0, MAX_PAGE_CHARS)}\n[…page truncated]` : page.content;
  const task = props.question
    ? `Answer this question about the web page below: ${JSON.stringify(props.question)}`
    : "Summarize the web page below. Start with a one-sentence summary, then list the key points.";

  return (
    <Chat
      initialPrompt={`${task}\n\n${wrapUntrusted("page", content, { title: page.title, url: page.url })}`}
      displayPrompt={`${props.question || "Summarize"}: “${page.title}”`}
    />
  );
}
