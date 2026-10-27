import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { buildScheduledTask, ScheduledTaskFormValues } from "../lib/forms";
import { createScheduledTask, listAgents, ScheduledTask } from "../lib/langdock";
import { showLangdockError } from "../lib/errors";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FREQUENCIES: { value: ScheduledTask["frequency"]; title: string }[] = [
  { value: "DAILY", title: "Daily" },
  { value: "WEEKDAYS", title: "Weekdays (Mon–Fri)" },
  { value: "WEEKLY", title: "Weekly" },
  { value: "SELECTED_WEEKDAYS", title: "Selected days" },
  { value: "MONTHLY", title: "Monthly" },
  { value: "MANUAL", title: "Manual (run on demand)" },
];

export function ScheduledTaskForm(props: { onCreated?: () => void }) {
  const { pop } = useNavigation();
  const [frequency, setFrequency] = useState<ScheduledTask["frequency"]>("DAILY");
  const [errors, setErrors] = useState<Partial<Record<keyof ScheduledTaskFormValues, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  // Agents are optional; older deployments without the list endpoint just show none.
  const { data: agents, isLoading } = useCachedPromise(listAgents, [], { onError: () => undefined });

  async function submit(values: ScheduledTaskFormValues) {
    const { task, errors: fieldErrors } = buildScheduledTask(values);
    setErrors(fieldErrors);
    if (!task) return;
    setIsSaving(true);
    try {
      const created = await createScheduledTask(task);
      await showToast({ style: Toast.Style.Success, title: `Created “${created.name}”` });
      props.onCreated?.();
      pop();
    } catch (error) {
      await showLangdockError(error, { title: "Could not create the task" });
    } finally {
      setIsSaving(false);
    }
  }

  const clear = (field: keyof ScheduledTaskFormValues) => () => errors[field] && setErrors({ ...errors, [field]: "" });

  return (
    <Form
      isLoading={isLoading || isSaving}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Task" icon={Icon.Calendar} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Daily news digest"
        error={errors.name}
        onChange={clear("name")}
      />
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder="Summarize the most important AI news from the last 24 hours."
        error={errors.prompt}
        onChange={clear("prompt")}
      />
      <Form.Dropdown id="agent" title="Agent" info="Optional. Runs the prompt with this agent.">
        <Form.Dropdown.Item value="" title="No agent" icon={Icon.Bubble} />
        {(agents ?? [])
          .filter((agent) => !agent.disabled && agent.inputType === "PROMPT")
          .map((agent) => (
            <Form.Dropdown.Item
              key={agent.id}
              value={agent.id}
              title={agent.name || "Untitled Agent"}
              icon={agent.emojiIcon || Icon.Stars}
            />
          ))}
      </Form.Dropdown>
      <Form.Separator />
      <Form.Dropdown
        id="frequency"
        title="Repeat"
        value={frequency}
        onChange={(value) => setFrequency(value as ScheduledTask["frequency"])}
      >
        {FREQUENCIES.map((f) => (
          <Form.Dropdown.Item key={f.value} value={f.value} title={f.title} />
        ))}
      </Form.Dropdown>
      {frequency === "WEEKLY" && (
        <Form.Dropdown id="dayOfWeek" title="Day" defaultValue="1">
          {DAYS.map((day, index) => (
            <Form.Dropdown.Item key={day} value={String(index)} title={day} />
          ))}
        </Form.Dropdown>
      )}
      {frequency === "SELECTED_WEEKDAYS" && (
        <Form.TagPicker id="daysOfWeek" title="Days" error={errors.daysOfWeek} onChange={clear("daysOfWeek")}>
          {DAYS.map((day, index) => (
            <Form.TagPicker.Item key={day} value={String(index)} title={day} />
          ))}
        </Form.TagPicker>
      )}
      {frequency === "MONTHLY" && (
        <Form.Dropdown
          id="dayOfMonth"
          title="Day of Month"
          defaultValue="1"
          info="Days after the 28th run on the last day of shorter months."
        >
          {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
            <Form.Dropdown.Item key={day} value={day} title={day} />
          ))}
        </Form.Dropdown>
      )}
      {frequency !== "MANUAL" && (
        <>
          <Form.TextField
            id="time"
            title="Time"
            defaultValue="09:00"
            placeholder="HH:MM"
            error={errors.time}
            onChange={clear("time")}
          />
          <Form.TextField
            id="timezone"
            title="Timezone"
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            error={errors.timezone}
            onChange={clear("timezone")}
          />
        </>
      )}
      <Form.Description text="Results appear in your Langdock chats. Scheduled tasks need a workspace API key with the Scheduled Tasks API scope." />
    </Form>
  );
}
