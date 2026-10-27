import { strict as assert } from "node:assert";
import { test } from "node:test";
import { actionInputs, agentFieldId, buildScheduledTask, promptFromAgentForm } from "../src/lib/forms";
import { ActionInputField, AgentInputField } from "../src/lib/langdock";

const agentField = (type: AgentInputField["type"], label: string, order: number): AgentInputField => ({
  type,
  label,
  description: null,
  required: false,
  order,
});

test("agent forms become 'Label: value' lines like in Langdock", () => {
  const fields = [
    agentField("TEXT", "Company", 0),
    agentField("CHECKBOX", "Urgent", 1),
    agentField("DATE", "Due", 2),
    agentField("MULTI_SELECT", "Topics", 3),
    agentField("FILE", "Contract", 4),
    agentField("TEXT", "Notes", 5),
  ];
  const prompt = promptFromAgentForm(fields, {
    [agentFieldId(0)]: " Acme ",
    [agentFieldId(1)]: true,
    [agentFieldId(2)]: new Date("2026-11-03T10:00:00Z"),
    [agentFieldId(3)]: ["Legal", "Pricing"],
    [agentFieldId(4)]: ["/tmp/contract.pdf"],
    [agentFieldId(5)]: "",
  });
  assert.equal(prompt, "Company: Acme\nUrgent: true\nDue: 2026-11-03\nTopics: Legal, Pricing");
});

test("an empty agent form is sent as <empty_string>", () => {
  assert.equal(promptFromAgentForm([agentField("TEXT", "Notes", 0)], {}), "<empty_string>");
});

const actionField = (slug: string, type: ActionInputField["type"], required = false): ActionInputField => ({
  slug,
  label: slug,
  type,
  description: null,
  placeholder: null,
  required,
  order: 0,
  options: null,
  allowMultiSelect: null,
});

test("integration inputs are typed and validated", () => {
  const fields = [
    actionField("title", "TEXT", true),
    actionField("count", "NUMBER"),
    actionField("meta", "OBJECT"),
    actionField("notify", "BOOLEAN", true),
  ];
  assert.deepEqual(actionInputs(fields, { title: "Hi", count: "3", meta: '{"a":1}', notify: false }), {
    inputs: { title: "Hi", count: 3, meta: { a: 1 }, notify: false },
    errors: {},
  });
  const invalid = actionInputs(fields, { title: "", count: "x", meta: "{nope", notify: false });
  assert.deepEqual(invalid.errors, { title: "Required", count: "Enter a number", meta: "Enter valid JSON" });
});

const base = { name: "Digest", prompt: "Summarize news", agent: "", time: "9:30", timezone: "Europe/Berlin" };

test("scheduled tasks are validated like the API does", () => {
  assert.deepEqual(buildScheduledTask({ ...base, frequency: "DAILY" }).task, {
    name: "Digest",
    prompt: "Summarize news",
    frequency: "DAILY",
    timeOfDay: "09:30",
    timezone: "Europe/Berlin",
  });
  assert.equal(buildScheduledTask({ ...base, frequency: "WEEKLY", dayOfWeek: "0" }).task?.dayOfWeek, 0);
  assert.deepEqual(
    buildScheduledTask({ ...base, frequency: "SELECTED_WEEKDAYS", daysOfWeek: ["5", "1"] }).task?.daysOfWeek,
    [1, 5],
  );
  assert.deepEqual(buildScheduledTask({ ...base, frequency: "MANUAL", agent: "agent-1" }).task, {
    name: "Digest",
    prompt: "Summarize news",
    frequency: "MANUAL",
    assistantId: "agent-1",
  });
});

test("invalid scheduled tasks report field errors", () => {
  const { task, errors } = buildScheduledTask({
    ...base,
    name: " ",
    frequency: "SELECTED_WEEKDAYS",
    time: "25:00",
    timezone: "Mars/Olympus",
    daysOfWeek: [],
  });
  assert.equal(task, undefined);
  assert.deepEqual(Object.keys(errors).sort(), ["daysOfWeek", "name", "time", "timezone"]);
});
