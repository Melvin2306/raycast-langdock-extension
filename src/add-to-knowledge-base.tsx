import { LaunchProps } from "@raycast/api";
import { AddToKnowledgeBase } from "./components/KnowledgeUpload";

export default function Command(props: LaunchProps<{ launchContext?: { knowledgeBaseId?: string } }>) {
  return <AddToKnowledgeBase knowledgeBaseId={props.launchContext?.knowledgeBaseId} />;
}
