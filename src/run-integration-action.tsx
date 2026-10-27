import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Detail,
  Form,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { actionInputs, FormValue } from "./lib/forms";
import {
  ActionInputField,
  ActionResult,
  executeIntegrationAction,
  getIntegrationActions,
  IntegrationSummary,
  listIntegrationConnections,
  listIntegrations,
} from "./lib/langdock";
import { safeHttpUrl } from "./lib/markdown";
import { showLangdockError } from "./lib/errors";

/** Field types that can't be entered in a Raycast form. */
const UNSUPPORTED_FIELDS = new Set<ActionInputField["type"]>(["FILE", "VECTOR"]);

export default function Command() {
  return <Integrations />;
}

function Integrations() {
  const {
    data: integrations,
    isLoading,
    revalidate,
  } = useCachedPromise(listIntegrations, [], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load integrations" });
    },
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search integration actions…">
      <List.EmptyView
        icon={Icon.Plug}
        title="No Integration Actions"
        description="Custom, MCP and A2A integrations shared with your API key appear here. The key needs the Integration API scope."
      />
      {integrations?.map((integration) => (
        <List.Section key={integration.id} title={integration.name} subtitle={integration.integrationType}>
          {integration.actions.map((action) => (
            <List.Item
              key={action.id}
              icon={integrationIcon(integration)}
              title={action.name}
              subtitle={action.description ?? undefined}
              keywords={[integration.name]}
              accessories={
                action.requiresConfirmation
                  ? [{ tag: { value: "Confirm", color: Color.Orange }, tooltip: "Asks before running" }]
                  : []
              }
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Run Action"
                    icon={Icon.Play}
                    target={
                      <ActionForm
                        integration={integration}
                        actionId={action.id}
                        requiresConfirmation={action.requiresConfirmation}
                      />
                    }
                  />
                  <Action
                    title="Reload"
                    icon={Icon.ArrowClockwise}
                    shortcut={Keyboard.Shortcut.Common.Refresh}
                    onAction={revalidate}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}

function integrationIcon(integration: IntegrationSummary) {
  const url = safeHttpUrl(integration.iconUrl);
  return url ? { source: url, fallback: Icon.Plug } : Icon.Plug;
}

function ActionForm(props: { integration: IntegrationSummary; actionId: string; requiresConfirmation: boolean }) {
  const { integration, actionId } = props;
  const { push } = useNavigation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);
  const { data, isLoading } = useCachedPromise(
    async (id: string) => {
      const [actions, connections] = await Promise.all([getIntegrationActions(id), listIntegrationConnections(id)]);
      return { action: actions.find((a) => a.id === actionId), connections };
    },
    [integration.id],
    {
      onError: (error) => {
        showLangdockError(error, { title: "Could not load the action" });
      },
    },
  );
  const action = data?.action;
  const connections = data?.connections ?? [];
  const fields = [...(action?.inputFields ?? [])].sort((a, b) => a.order - b.order);
  const supported = fields.filter((field) => !UNSUPPORTED_FIELDS.has(field.type));
  const blocking = fields.filter((field) => UNSUPPORTED_FIELDS.has(field.type) && field.required);

  async function submit(values: Record<string, FormValue>) {
    if (!action) return;
    const { inputs, errors: fieldErrors } = actionInputs(supported, values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    const connectionId = String(values.connection ?? "");
    if (!connectionId) {
      await showToast({ style: Toast.Style.Failure, title: "Choose a connection" });
      return;
    }
    if (
      props.requiresConfirmation &&
      !(await confirmAlert({
        title: `Run ${action.name}?`,
        message: `This runs the action in ${integration.name} with the values you entered.`,
        primaryAction: { title: "Run", style: Alert.ActionStyle.Default },
      }))
    ) {
      return;
    }
    setIsRunning(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: `Running ${action.name}…` });
    try {
      const result = await executeIntegrationAction({ integrationId: integration.id, actionId, connectionId, inputs });
      toast.style = result.success ? Toast.Style.Success : Toast.Style.Failure;
      toast.title = result.success ? `${action.name} finished` : `${action.name} failed`;
      push(<ActionResultView title={action.name} result={result} />);
    } catch (error) {
      await showLangdockError(error, { title: `${action.name} failed` });
    } finally {
      setIsRunning(false);
    }
  }

  if (!isLoading && data && !action) return <Detail markdown="## This action is no longer available" />;

  return (
    <Form
      navigationTitle={action?.name ?? "Run Action"}
      isLoading={isLoading || isRunning}
      actions={
        blocking.length === 0 && connections.length > 0 ? (
          <ActionPanel>
            <Action.SubmitForm title="Run Action" icon={Icon.Play} onSubmit={submit} />
          </ActionPanel>
        ) : undefined
      }
    >
      {action?.description && <Form.Description text={action.description} />}
      {!isLoading && connections.length === 0 && (
        <Form.Description
          title="Connection"
          text={`You have no connection to ${integration.name}. Connect it in Langdock first.`}
        />
      )}
      {connections.length > 0 && (
        <Form.Dropdown id="connection" title="Connection">
          {connections.map((connection) => (
            <Form.Dropdown.Item
              key={connection.id}
              value={connection.id}
              title={`${connection.name || "Connection"}${connection.valid ? "" : " (needs reconnecting)"}`}
              icon={connection.valid ? Icon.CheckCircle : Icon.ExclamationMark}
            />
          ))}
        </Form.Dropdown>
      )}
      {blocking.length > 0 && (
        <Form.Description
          title="Not supported"
          text={`${blocking.map((f) => f.label).join(", ")} can't be entered in Raycast. Run this action in Langdock.`}
        />
      )}
      {supported.map((field) => (
        <ActionField key={field.slug} field={field} error={errors[field.slug]} />
      ))}
    </Form>
  );
}

function ActionField(props: { field: ActionInputField; error?: string }) {
  const { field } = props;
  const common = {
    id: field.slug,
    title: field.required ? `${field.label} *` : field.label,
    info: field.description ?? undefined,
    error: props.error,
  };
  switch (field.type) {
    case "MULTI_LINE_TEXT":
      return <Form.TextArea {...common} placeholder={field.placeholder ?? undefined} />;
    case "OBJECT":
      return <Form.TextArea {...common} placeholder={field.placeholder ?? '{ "key": "value" }'} />;
    case "PASSWORD":
      return <Form.PasswordField {...common} placeholder={field.placeholder ?? undefined} />;
    case "BOOLEAN":
      return <Form.Checkbox {...common} label={field.label} />;
    case "SELECT":
      if (field.options?.length && field.allowMultiSelect) {
        return (
          <Form.TagPicker {...common}>
            {field.options.map((option) => (
              <Form.TagPicker.Item key={option.value} value={option.value} title={option.label} />
            ))}
          </Form.TagPicker>
        );
      }
      if (field.options?.length) {
        return (
          <Form.Dropdown {...common}>
            {!field.required && <Form.Dropdown.Item value="" title="—" />}
            {field.options.map((option) => (
              <Form.Dropdown.Item key={option.value} value={option.value} title={option.label} />
            ))}
          </Form.Dropdown>
        );
      }
      return <Form.TextField {...common} placeholder={field.placeholder ?? undefined} />;
    default:
      return <Form.TextField {...common} placeholder={field.placeholder ?? undefined} />;
  }
}

function ActionResultView(props: { title: string; result: ActionResult }) {
  const { result } = props;
  const output = JSON.stringify(result.success ? result.result : (result.error ?? result.result), null, 2) ?? "";
  const status = result.success
    ? "✅ Finished"
    : result.authError
      ? "🔒 The connection needs reconnecting"
      : "❌ Failed";
  return (
    <Detail
      navigationTitle={props.title}
      markdown={`## ${status}\n\n\`\`\`json\n${output.replace(/```/g, "ˋˋˋ")}\n\`\`\``}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Status" text={result.success ? "Success" : "Error"} />
          <Detail.Metadata.Label title="Duration" text={`${(result.durationMs / 1000).toFixed(1)} s`} />
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Result" content={output} />
        </ActionPanel>
      }
    />
  );
}
