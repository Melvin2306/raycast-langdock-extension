import { Action, ActionPanel, Detail, Form, Icon, useNavigation } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { statSync } from "node:fs";
import { useState } from "react";
import { agentFieldId, FormValue, promptFromAgentForm } from "../lib/forms";
import { getAgent } from "../lib/langdock";
import { ChatAgent, Chat } from "./Chat";

/** Input form for agents that take structured input instead of a free-text prompt. */
export function AgentForm(props: { agent: ChatAgent }) {
  const { push } = useNavigation();
  const { data: agent, isLoading } = useCachedPromise(getAgent, [props.agent.id], {
    onError: (error) => {
      showFailureToast(error, { title: "Could not load the agent's form" });
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (isLoading && !agent) return <Form isLoading navigationTitle={props.agent.name} />;
  const fields = [...(agent?.inputFields ?? [])].sort((a, b) => a.order - b.order);
  if (agent && fields.length === 0) {
    return <Detail markdown={`## ${props.agent.name}\n\nThis agent has no input fields.`} />;
  }

  function submit(values: Record<string, FormValue>) {
    const missing: Record<string, string> = {};
    fields.forEach((field, index) => {
      const value = values[agentFieldId(index)];
      const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
      if (field.required && field.type !== "CHECKBOX" && empty) missing[agentFieldId(index)] = "Required";
    });
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;

    const filePaths = fields.flatMap((field, index) =>
      field.type === "FILE" ? ((values[agentFieldId(index)] as string[] | undefined) ?? []) : [],
    );
    const prompt = promptFromAgentForm(fields, values);
    push(
      <Chat
        initialPrompt={prompt}
        displayPrompt={prompt === "<empty_string>" ? "(empty form)" : prompt}
        filePaths={filePaths.filter((path) => statSync(path).isFile())}
        agent={props.agent}
      />,
    );
  }

  return (
    <Form
      navigationTitle={props.agent.name}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Agent" icon={Icon.ArrowRight} onSubmit={submit} />
        </ActionPanel>
      }
    >
      {agent?.description && <Form.Description text={agent.description} />}
      {fields.map((field, index) => {
        const id = agentFieldId(index);
        const common = {
          id,
          title: field.required ? `${field.label} *` : field.label,
          info: field.description ?? undefined,
          error: errors[id],
          onChange: () => errors[id] && setErrors({ ...errors, [id]: "" }),
        };
        switch (field.type) {
          case "MULTI_LINE_TEXT":
            return <Form.TextArea key={id} {...common} />;
          case "CHECKBOX":
            return <Form.Checkbox key={id} {...common} label={field.label} />;
          case "DATE":
            return <Form.DatePicker key={id} {...common} type={Form.DatePicker.Type.Date} />;
          case "FILE":
            return <Form.FilePicker key={id} {...common} allowMultipleSelection canChooseDirectories={false} />;
          case "SELECT":
          case "MULTI_SELECT":
            // The API doesn't return the field's options, so the value is typed.
            return (
              <Form.TextField
                key={id}
                {...common}
                placeholder={field.type === "MULTI_SELECT" ? "Option A, Option B" : "Option"}
              />
            );
          default:
            return (
              <Form.TextField
                key={id}
                {...common}
                placeholder={field.type === "EMAIL" ? "name@example.com" : field.type === "NUMBER" ? "0" : undefined}
              />
            );
        }
      })}
    </Form>
  );
}
