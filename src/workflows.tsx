import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { apiKey, listWorkflowRuns, listWorkflows, Workflow, WorkflowRun } from "./lib/langdock";
import { escapeMarkdown } from "./lib/markdown";

const RUN_STATUS: Record<string, { color: Color; icon: Icon }> = {
  COMPLETED: { color: Color.Green, icon: Icon.CheckCircle },
  FAILED: { color: Color.Red, icon: Icon.XMarkCircle },
  CANCELLED: { color: Color.SecondaryText, icon: Icon.MinusCircle },
  IN_PROGRESS: { color: Color.Blue, icon: Icon.CircleProgress50 },
  PENDING: { color: Color.Yellow, icon: Icon.Clock },
  AWAITING_INPUT: { color: Color.Orange, icon: Icon.QuestionMarkCircle },
};

export default function Command() {
  return apiKey() ? <Workflows /> : <ApiKeyMissing />;
}

function Workflows() {
  const {
    data: workflows,
    isLoading,
    revalidate,
  } = useCachedPromise(listWorkflows, [], {
    onError: (error) => {
      showFailureToast(error, { title: "Could not load workflows" });
    },
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search workflows…">
      <List.EmptyView
        icon={Icon.Switch}
        title="No Workflows"
        description="Workflows you can access in Langdock appear here. The API key needs the Workflow Read API scope."
      />
      {workflows?.map((workflow) => (
        <List.Item
          key={workflow.id}
          icon={{ source: Icon.Switch, tintColor: workflow.status === "ACTIVE" ? Color.Green : Color.SecondaryText }}
          title={workflow.name}
          subtitle={workflow.description ?? undefined}
          accessories={[
            ...(workflow.activeVersion ? [{ text: `v${workflow.activeVersion.version}` }] : []),
            ...(workflow.owner.name ? [{ icon: Icon.Person, tooltip: `Owner: ${workflow.owner.name}` }] : []),
            { date: new Date(workflow.updatedAt), tooltip: "Last updated" },
            workflow.status === "ACTIVE" ? { tag: { value: "Active", color: Color.Green } } : { tag: "Inactive" },
          ]}
          actions={
            <ActionPanel>
              <Action.Push title="Show Runs" icon={Icon.List} target={<WorkflowRuns workflow={workflow} />} />
              <Action.CopyToClipboard title="Copy Workflow ID" content={workflow.id} />
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={revalidate}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function WorkflowRuns(props: { workflow: Workflow }) {
  const { workflow } = props;
  const {
    data: runs,
    isLoading,
    revalidate,
  } = useCachedPromise(listWorkflowRuns, [workflow.id], {
    onError: (error) => {
      showFailureToast(error, { title: "Could not load runs", message: "Reading runs needs editor access" });
    },
  });

  return (
    <List
      isLoading={isLoading}
      navigationTitle={workflow.name}
      isShowingDetail={(runs?.length ?? 0) > 0}
      searchBarPlaceholder="Filter runs…"
    >
      <List.EmptyView icon={Icon.List} title="No Runs Yet" />
      {runs?.map((run) => {
        const status = RUN_STATUS[run.status] ?? { color: Color.SecondaryText, icon: Icon.Circle };
        return (
          <List.Item
            key={run.id}
            icon={{ source: status.icon, tintColor: status.color }}
            title={`#${run.runNumber}`}
            subtitle={run.isTestRun ? "Test" : undefined}
            keywords={[run.status, run.isTestRun ? "test" : "production"]}
            accessories={[{ date: new Date(run.createdAt) }]}
            detail={<List.Item.Detail markdown={renderRun(run)} />}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard title="Copy Run Details" content={JSON.stringify(run, null, 2)} />
                <Action.CopyToClipboard title="Copy Run ID" content={run.id} />
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  onAction={revalidate}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export function renderRun(run: WorkflowRun): string {
  const header = `## Run #${run.runNumber} · ${escapeMarkdown(run.status.replace(/_/g, " ").toLowerCase())}\n\n${
    run.isTestRun ? "Test run" : `Version ${escapeMarkdown(String(run.workflowVersion.version))}`
  } · ${new Date(run.createdAt).toLocaleString()}`;
  if (run.isExecutionDataExpired) return `${header}\n\n_Execution data has expired._`;

  const nodeName = (id: string) => {
    const node = run.workflowVersion.nodes.find((n) => n.id === id);
    return node?.name ?? node?.type ?? id.slice(0, 8);
  };
  // Table cells: escape markdown and keep each cell on one line.
  const cell = (text: string) => escapeMarkdown(text.replace(/\s+/g, " ").slice(0, 300));
  const rows = run.executions.map((execution) => {
    const error = execution.outputError ?? execution.inputError;
    const errorText = error ? ` — ${typeof error === "string" ? error : JSON.stringify(error)}` : "";
    return `| ${cell(nodeName(execution.workflowNodeId))} | ${cell(execution.status.toLowerCase())} | ${(execution.durationMs / 1000).toFixed(1)}s${cell(errorText)} |`;
  });
  return rows.length
    ? `${header}\n\n| Step | Status | Duration |\n| - | - | - |\n${rows.join("\n")}`
    : `${header}\n\n_No steps recorded._`;
}
