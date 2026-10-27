import { ActionInputField, AgentInputField, NewScheduledTask } from "./langdock";

export type FormValue = string | number | boolean | Date | string[] | null | undefined;

/** Form field id for the n-th agent input. The API identifies fields only by label, so the position keys the form. */
export const agentFieldId = (index: number) => `field-${index}`;

function formatValue(field: AgentInputField, value: FormValue): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.join(", ");
  if (field.type === "CHECKBOX") return value ? "true" : "false";
  return value == null ? "" : String(value).trim();
}

/**
 * Builds the message for an agent form, the same way Langdock's chat does: one "Label: value" line per filled field.
 * Files are attached separately. An empty form is sent as "<empty_string>".
 */
export function promptFromAgentForm(fields: AgentInputField[], values: Record<string, FormValue>): string {
  const lines = fields
    .map((field, index) => ({ field, value: values[agentFieldId(index)] }))
    .filter(({ field }) => field.type !== "FILE")
    .map(({ field, value }) => ({ label: field.label, text: formatValue(field, value) }))
    .filter(({ text }) => text.length > 0)
    .map(({ label, text }) => `${label}: ${text}`);
  return lines.length > 0 ? lines.join("\n") : "<empty_string>";
}

/** Converts form values to the inputs an integration action expects, keyed by field slug. */
export function actionInputs(
  fields: ActionInputField[],
  values: Record<string, FormValue>,
): { inputs: Record<string, unknown>; errors: Record<string, string> } {
  const inputs: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.slug];
    const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (field.required && field.type !== "BOOLEAN") errors[field.slug] = "Required";
      continue;
    }
    if (field.type === "NUMBER") {
      const number = Number(value);
      if (Number.isNaN(number)) errors[field.slug] = "Enter a number";
      else inputs[field.slug] = number;
    } else if (field.type === "OBJECT") {
      try {
        inputs[field.slug] = JSON.parse(String(value));
      } catch {
        errors[field.slug] = "Enter valid JSON";
      }
    } else {
      inputs[field.slug] = value;
    }
  }
  return { inputs, errors };
}

export interface ScheduledTaskFormValues {
  name: string;
  prompt: string;
  agent: string;
  frequency: NewScheduledTask["frequency"];
  time?: string;
  dayOfWeek?: string;
  dayOfMonth?: string;
  daysOfWeek?: string[];
  timezone?: string;
}

/** Validates the scheduled task form with the same rules as the API and builds the request. */
export function buildScheduledTask(values: ScheduledTaskFormValues): {
  task?: NewScheduledTask;
  errors: Partial<Record<keyof ScheduledTaskFormValues, string>>;
} {
  const errors: Partial<Record<keyof ScheduledTaskFormValues, string>> = {};
  const name = values.name.trim();
  const prompt = values.prompt.trim();
  if (!name) errors.name = "Required";
  if (name.length > 200) errors.name = "At most 200 characters";
  if (!prompt) errors.prompt = "Required";

  const task: NewScheduledTask = { name, prompt, frequency: values.frequency };
  if (values.agent) task.assistantId = values.agent;
  if (values.frequency !== "MANUAL") {
    const time = values.time?.trim() ?? "";
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) errors.time = "Use HH:MM, e.g. 09:00";
    else task.timeOfDay = `${match[1].padStart(2, "0")}:${match[2]}`;
    const timezone = values.timezone?.trim();
    if (timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        task.timezone = timezone;
      } catch {
        errors.timezone = "Use an IANA timezone, e.g. Europe/Berlin";
      }
    }
  }
  if (values.frequency === "WEEKLY") task.dayOfWeek = Number(values.dayOfWeek ?? 1);
  if (values.frequency === "MONTHLY") task.dayOfMonth = Number(values.dayOfMonth ?? 1);
  if (values.frequency === "SELECTED_WEEKDAYS") {
    const days = (values.daysOfWeek ?? []).map(Number).sort((a, b) => a - b);
    if (days.length === 0) errors.daysOfWeek = "Choose at least one day";
    task.daysOfWeek = days;
  }
  return Object.keys(errors).length > 0 ? { errors } : { task, errors };
}
