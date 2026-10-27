import { LaunchProps } from "@raycast/api";
import { ApiKeyMissing } from "./components/ApiKeyMissing";
import { AddToKnowledgeBase } from "./components/KnowledgeUpload";
import { apiKey } from "./lib/langdock";

export default function Command(props: LaunchProps<{ launchContext?: { knowledgeBaseId?: string } }>) {
  return apiKey() ? <AddToKnowledgeBase knowledgeBaseId={props.launchContext?.knowledgeBaseId} /> : <ApiKeyMissing />;
}
