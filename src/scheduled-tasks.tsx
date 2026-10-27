import { Action, ActionPanel, Color, Icon, Keyboard, List, showToast, Toast } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { apiKey, listScheduledTasks, runScheduledTask, ScheduledTask, setScheduledTaskActive } from "./lib/langdock";
import { sanitizeMarkdown } from "./lib/markdown";

// Assumes JavaScript day numbering (0 = Sunday); the API docs don't say.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function Command() {
  return apiKey() ? <ScheduledTasks /> : <ApiKeyMissing />;
}

function ScheduledTasks() {
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const {
    data: tasks,
    isLoading,
    mutate,
    revalidate,
  } = useCachedPromise(listScheduledTasks, [], {
    onError: (error) => {
      showFailureToast(error, { title: "Could not load scheduled tasks" });
    },
  });

  async function run(task: ScheduledTask) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Starting ${task.name}…` });
    try {
      await runScheduledTask(task.id);
      toast.style = Toast.Style.Success;
      toast.title = "Run queued";
      toast.message = "The result appears in your Langdock chats";
    } catch (error) {
      await showFailureToast(error, { title: "Could not run task" });
    }
  }

  async function toggle(task: ScheduledTask) {
    try {
      await mutate(setScheduledTaskActive(task.id, !task.active), {
        optimisticUpdate: (current) => current?.map((t) => (t.id === task.id ? { ...t, active: !task.active } : t)),
      });
      await showToast({ style: Toast.Style.Success, title: task.active ? "Task paused" : "Task resumed" });
    } catch (error) {
      await showFailureToast(error, { title: "Could not update task" });
    }
  }

  return (
    <List isLoading={isLoading} isShowingDetail={isShowingDetail} searchBarPlaceholder="Search scheduled tasks…">
      <List.EmptyView
        icon={Icon.Calendar}
        title="No Scheduled Tasks"
        description="Scheduled tasks appear here. This needs a workspace API key with the Scheduled Tasks API scope; personal keys may not support it."
      />
      {tasks?.map((task) => (
        <List.Item
          key={task.id}
          icon={{ source: Icon.Calendar, tintColor: task.active ? Color.Green : Color.SecondaryText }}
          title={task.name}
          subtitle={isShowingDetail ? undefined : schedule(task)}
          keywords={[task.prompt]}
          accessories={
            isShowingDetail
              ? []
              : [
                  ...(task.lastRunAt ? [{ date: new Date(task.lastRunAt), tooltip: "Last run" }] : []),
                  { text: `${task.runCount} run${task.runCount === 1 ? "" : "s"}` },
                  task.active ? { tag: { value: "Active", color: Color.Green } } : { tag: "Paused" },
                ]
          }
          detail={
            <List.Item.Detail
              markdown={sanitizeMarkdown(task.prompt)}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label title="Schedule" text={schedule(task)} />
                  <List.Item.Detail.Metadata.Label title="Status" text={task.active ? "Active" : "Paused"} />
                  <List.Item.Detail.Metadata.Label
                    title="Model"
                    text={task.modelMode === "EXPLICIT" ? (task.modelId ?? "-") : "Auto"}
                  />
                  <List.Item.Detail.Metadata.Label title="Runs" text={String(task.runCount)} />
                  <List.Item.Detail.Metadata.Label
                    title="Last Run"
                    text={task.lastRunAt ? new Date(task.lastRunAt).toLocaleString() : "Never"}
                  />
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              <Action title="Run Now" icon={Icon.Play} onAction={() => run(task)} />
              <Action
                title={task.active ? "Pause Task" : "Resume Task"}
                icon={task.active ? Icon.Pause : Icon.Play}
                shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                onAction={() => toggle(task)}
              />
              <Action
                title={isShowingDetail ? "Hide Details" : "Show Details"}
                icon={Icon.Sidebar}
                shortcut={{ modifiers: ["cmd"], key: "d" }}
                onAction={() => setIsShowingDetail((value) => !value)}
              />
              <Action.CopyToClipboard title="Copy Prompt" content={task.prompt} />
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

function schedule(task: ScheduledTask): string {
  const at = task.timeOfDay ? ` at ${task.timeOfDay}` : "";
  switch (task.frequency) {
    case "MANUAL":
      return "Manual";
    case "DAILY":
      return `Daily${at}`;
    case "WEEKDAYS":
      return `Weekdays${at}`;
    case "WEEKLY":
      return `Weekly on ${DAYS[task.dayOfWeek ?? 1] ?? "?"}${at}`;
    case "MONTHLY":
      return `Monthly on day ${task.dayOfMonth ?? "?"}${at}`;
    case "SELECTED_WEEKDAYS":
      return `${task.daysOfWeek.map((d) => DAYS[d]?.slice(0, 3) ?? d).join(", ")}${at}`;
    default:
      return task.frequency;
  }
}
