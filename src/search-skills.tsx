import { Action, ActionPanel, Icon, List, useNavigation } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { AskForm, Chat } from "./components/Chat";
import { listSkills, Skill } from "./lib/langdock";
import { escapeMarkdown, sanitizeMarkdown, wrapUntrusted } from "./lib/markdown";
import { showLangdockError } from "./lib/errors";

export default function Command() {
  return <SearchSkills />;
}

function SearchSkills() {
  const [query, setQuery] = useState("");
  const { push } = useNavigation();
  const { data: skills, isLoading } = useCachedPromise(listSkills, [query], {
    keepPreviousData: true,
    onError: (error) => {
      showLangdockError(error, { title: "Could not load skills" });
    },
  });

  // Skills can't be attached to an inline agent, so their instructions are sent with the question.
  const openSkill = (skill: Skill) =>
    push(
      <AskForm
        title={skill.name}
        onSubmit={(question) =>
          push(
            <Chat
              initialPrompt={`Follow the instructions of this skill.\n\n${wrapUntrusted("skill", skill.instructions, { name: skill.name })}\n\n${question}`}
              displayPrompt={`🧩 ${skill.name}: ${question}`}
            />,
          )
        }
      />,
    );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={(skills?.length ?? 0) > 0}
      searchBarPlaceholder="Search skills…"
      onSearchTextChange={setQuery}
      throttle
    >
      <List.EmptyView
        icon={Icon.Hammer}
        title={query ? "No Matching Skills" : "No Skills"}
        description="Skills from your Langdock workspace appear here. The API key needs the Skill API scope."
      />
      {skills?.map((skill) => (
        <List.Item
          key={skill.id}
          icon={Icon.Hammer}
          title={skill.name}
          keywords={[skill.slug, skill.description]}
          detail={
            <List.Item.Detail
              markdown={`## ${escapeMarkdown(skill.name)}\n\n${sanitizeMarkdown(skill.description)}\n\n---\n\n${sanitizeMarkdown(skill.instructions)}`}
            />
          }
          actions={
            <ActionPanel>
              <Action title="Use Skill" icon={Icon.Bubble} onAction={() => openSkill(skill)} />
              <Action.CopyToClipboard title="Copy Instructions" content={skill.instructions} />
              <Action.CopyToClipboard title="Copy Slug" content={skill.slug} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
