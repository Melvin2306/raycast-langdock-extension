import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  Keyboard,
  LaunchProps,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { createDeeplink, useCachedPromise, useLocalStorage } from "@raycast/utils";
import { AgentForm } from "./components/AgentForm";
import { Chat, ChatAgent } from "./components/Chat";
import { AgentListItem, getAgent, LangdockError, listAgents, webAppUrl } from "./lib/langdock";
import { displayName } from "./lib/models";
import { RECENT_AGENTS_KEY, SAVED_AGENTS_KEY } from "./lib/settings";
import { showLangdockError } from "./lib/errors";

/** Agents added by ID, for deployments without the agent list endpoint or agents it doesn't return. */
interface SavedAgent {
  id: string;
  name: string;
  description: string | null;
  emojiIcon: string | null;
  model: string | null;
  conversationStarters?: string[];
}

interface AgentRow {
  id: string;
  name: string;
  description: string | null;
  emojiIcon: string | null;
  model: string | null;
  owner?: string | null;
  inputType?: AgentListItem["inputType"];
  conversationStarters?: string[];
  addedManually: boolean;
}

const MAX_RECENT = 6;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function Command(props: LaunchProps<{ launchContext?: { agentId?: string } }>) {
  // Quicklinks open one agent directly.
  const agentId = props.launchContext?.agentId;
  return agentId ? <AgentChat agentId={agentId} /> : <Agents />;
}

/** Opens an agent: its form for agents with structured input, otherwise a chat with its conversation starters. */
function AgentChat(props: { agentId: string; agent?: ChatAgent }) {
  const {
    data: agent,
    isLoading,
    error,
  } = useCachedPromise(getAgent, [props.agentId], {
    onError: (err) => {
      showLangdockError(err, { title: "Could not load the agent" });
    },
  });
  const chatAgent: ChatAgent | undefined = agent
    ? { id: agent.id, name: agent.name, emojiIcon: agent.emojiIcon }
    : props.agent;
  if (!agent && (isLoading || !error)) return <List isLoading />;
  if (!chatAgent)
    return (
      <List>
        <List.EmptyView icon={Icon.Stars} title="Agent not found" />
      </List>
    );
  if (agent?.inputType === "STRUCTURED") return <AgentForm agent={chatAgent} />;
  return <Chat agent={chatAgent} starters={agent?.conversationStarters} />;
}

function Agents() {
  const { push } = useNavigation();
  const {
    data: listed,
    isLoading: isLoadingList,
    error: listError,
    revalidate,
  } = useCachedPromise(listAgents, [], {
    onError: (error) => {
      // 404: deployment without the list endpoint; saved agents still work.
      if (!(error instanceof LangdockError && error.status === 404)) {
        showLangdockError(error, { title: "Could not load agents" });
      }
    },
  });
  const {
    value: saved = [],
    setValue: setSaved,
    isLoading: isLoadingSaved,
  } = useLocalStorage<SavedAgent[]>(SAVED_AGENTS_KEY, []);
  const {
    value: recent = {},
    setValue: setRecent,
    isLoading: isLoadingRecent,
  } = useLocalStorage<Record<string, string>>(RECENT_AGENTS_KEY, {});

  const rows = new Map<string, AgentRow>();
  for (const agent of listed ?? []) {
    if (agent.disabled) continue;
    rows.set(agent.id, {
      id: agent.id,
      name: agent.name || "Untitled Agent",
      description: agent.description,
      emojiIcon: agent.emojiIcon,
      model: agent.model,
      owner: agent.owner?.name ?? agent.owner?.email,
      inputType: agent.inputType,
      addedManually: false,
    });
  }
  for (const agent of saved) {
    const existing = rows.get(agent.id);
    rows.set(
      agent.id,
      existing ? { ...existing, conversationStarters: agent.conversationStarters } : { ...agent, addedManually: true },
    );
  }

  const recentRows = Object.entries(recent)
    .sort(([, a], [, b]) => b.localeCompare(a))
    .map(([id]) => rows.get(id))
    .filter((row): row is AgentRow => Boolean(row))
    .slice(0, MAX_RECENT);
  const recentIds = new Set(recentRows.map((row) => row.id));
  const otherRows = [...rows.values()]
    .filter((row) => !recentIds.has(row.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function ask(agent: AgentRow) {
    await setRecent({ ...recent, [agent.id]: new Date().toISOString() });
    push(<AgentChat agentId={agent.id} agent={agent} />);
  }

  async function forget(agent: AgentRow) {
    const rest = { ...recent };
    delete rest[agent.id];
    await setRecent(rest);
    if (agent.addedManually) await setSaved(saved.filter((a) => a.id !== agent.id));
  }

  const addAction = (
    <Action.Push
      title="Add Agent by ID"
      icon={Icon.Plus}
      shortcut={Keyboard.Shortcut.Common.New}
      target={<AddAgentForm onAdd={(agent) => setSaved([...saved.filter((a) => a.id !== agent.id), agent])} />}
    />
  );

  const renderRow = (agent: AgentRow) => (
    <List.Item
      key={agent.id}
      icon={agent.emojiIcon || Icon.Stars}
      title={agent.name}
      subtitle={agent.description ?? undefined}
      keywords={[agent.description ?? "", agent.owner ?? ""]}
      accessories={[
        ...(agent.inputType === "STRUCTURED"
          ? [{ tag: { value: "Form", color: Color.Blue }, tooltip: "Opens a form" }]
          : []),
        ...(agent.inputType && !["PROMPT", "STRUCTURED"].includes(agent.inputType)
          ? [
              {
                tag: { value: "Automated", color: Color.Orange },
                tooltip: "Usually runs from an integration, schedule or webhook",
              },
            ]
          : []),
        ...(agent.model ? [{ tag: agent.model === "auto" ? "Auto" : displayName(agent.model) }] : []),
        ...(agent.owner ? [{ icon: Icon.Person, tooltip: `Owner: ${agent.owner}` }] : []),
      ]}
      actions={
        <ActionPanel>
          <Action
            title={agent.inputType === "STRUCTURED" ? "Fill in Form" : "Ask Agent"}
            icon={agent.inputType === "STRUCTURED" ? Icon.List : Icon.Bubble}
            onAction={() => ask(agent)}
          />
          <Action.OpenInBrowser
            title="Open Agent in Langdock"
            url={`${webAppUrl()}/agents/${agent.id}/edit`}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
          <Action.CreateQuicklink
            title="Create Quicklink"
            icon={Icon.Link}
            shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
            quicklink={{
              name: `Ask ${agent.name}`,
              link: createDeeplink({ command: "ask-agent", context: { agentId: agent.id } }),
            }}
          />
          <Action.CopyToClipboard title="Copy Agent ID" content={agent.id} />
          {addAction}
          {(recentIds.has(agent.id) || agent.addedManually) && (
            <Action
              title={agent.addedManually ? "Remove Agent" : "Remove from Recent"}
              icon={Icon.XMarkCircle}
              shortcut={Keyboard.Shortcut.Common.Remove}
              onAction={() => forget(agent)}
            />
          )}
          <Action
            title="Reload Agents"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={revalidate}
          />
        </ActionPanel>
      }
    />
  );

  const listUnavailable = listError instanceof LangdockError && listError.status === 404;

  return (
    <List isLoading={isLoadingList || isLoadingSaved || isLoadingRecent} searchBarPlaceholder="Search agents…">
      <List.EmptyView
        icon={Icon.Stars}
        title="No Agents"
        description={
          listUnavailable
            ? "This Langdock deployment can't list agents yet. Add one by ID or URL."
            : "Agents shared with you, or with this API key, appear here. You can also add one by ID or URL."
        }
        actions={<ActionPanel>{addAction}</ActionPanel>}
      />
      <List.Section title="Recent">{recentRows.map(renderRow)}</List.Section>
      <List.Section title="All Agents">{otherRows.map(renderRow)}</List.Section>
    </List>
  );
}

function AddAgentForm(props: { onAdd: (agent: SavedAgent) => Promise<void> }) {
  const { pop } = useNavigation();

  async function submit(values: { agent: string }) {
    const agentId = UUID_PATTERN.exec(values.agent)?.[0];
    if (!agentId) {
      await showToast({ style: Toast.Style.Failure, title: "No agent ID found", message: "Paste an agent ID or URL" });
      return;
    }
    const toast = await showToast({ style: Toast.Style.Animated, title: "Loading agent…" });
    try {
      const agent = await getAgent(agentId);
      await props.onAdd({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        emojiIcon: agent.emojiIcon,
        model: agent.model,
        conversationStarters: agent.conversationStarters ?? [],
      });
      toast.style = Toast.Style.Success;
      toast.title = `Added ${agent.name}`;
      pop();
    } catch (error) {
      await showLangdockError(error, { title: "Could not load agent" });
    }
  }

  return (
    <Form
      navigationTitle="Add Agent by ID"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Agent" icon={Icon.Plus} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="agent"
        title="Agent ID or URL"
        placeholder="https://app.langdock.com/agents/…/edit"
        info="Open the agent in Langdock and copy the URL. The agent must be shared with you or your API key."
      />
    </Form>
  );
}
