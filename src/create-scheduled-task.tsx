import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { ScheduledTaskForm } from "./components/ScheduledTaskForm";
import { apiKey } from "./lib/langdock";

export default function Command() {
  return apiKey() ? <ScheduledTaskForm /> : <ApiKeyMissing />;
}
