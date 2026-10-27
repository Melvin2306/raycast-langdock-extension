import { Action, ActionPanel, Color, Detail, Icon, Keyboard, List, showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { Chat } from "./components/Chat";
import { getMeetingNotes, getMeetingTranscript, listMeetings, Meeting, TranscriptSegment } from "./lib/langdock";
import { escapeMarkdown, safeHttpUrl, sanitizeMarkdown, wrapUntrusted } from "./lib/markdown";
import { showLangdockError } from "./lib/errors";

export default function Command() {
  return <SearchMeetings />;
}

function SearchMeetings() {
  const [search, setSearch] = useState("");
  const { data: meetings, isLoading } = useCachedPromise(listMeetings, [search.trim()], {
    keepPreviousData: true,
    onError: (error) => {
      showLangdockError(error, { title: "Could not load meetings" });
    },
  });

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search meetings…" onSearchTextChange={setSearch} throttle>
      <List.EmptyView
        icon={Icon.Microphone}
        title={search ? "No Matching Meetings" : "No Meetings"}
        description="Meetings recorded with the Langdock desktop app appear here. The API key needs the Meetings Read API scope."
      />
      {meetings?.map((meeting) => {
        const link = meetingLink(meeting);
        return (
          <List.Item
            key={meeting.id}
            icon={{ source: Icon.Microphone, tintColor: meeting.status === "READY" ? Color.Blue : Color.SecondaryText }}
            title={meetingTitle(meeting)}
            subtitle={meeting.folder?.name}
            keywords={meeting.calendarEvent?.attendees.flatMap((a) => [a.email, a.displayName ?? ""]) ?? []}
            accessories={[
              ...(meeting.status !== "READY" ? [{ tag: meeting.status.toLowerCase() }] : []),
              ...(meeting.durationMins ? [{ text: `${meeting.durationMins} min` }] : []),
              { date: new Date(meeting.startedAt ?? meeting.createdAt) },
            ]}
            actions={
              <ActionPanel>
                <Action.Push title="Show Notes" icon={Icon.Document} target={<MeetingNotes meeting={meeting} />} />
                <Action.Push
                  title="Show Transcript"
                  icon={Icon.Text}
                  shortcut={{ modifiers: ["cmd"], key: "t" }}
                  target={<MeetingTranscript meeting={meeting} />}
                />
                <Action.Push
                  title="Ask About Meeting"
                  icon={Icon.Bubble}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                  target={<AskAboutMeeting meeting={meeting} />}
                />
                {link && (
                  <Action.OpenInBrowser title="Open in Langdock" url={link} shortcut={Keyboard.Shortcut.Common.Open} />
                )}
                {link && <Action.CopyToClipboard title="Copy Link" content={link} />}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

function meetingTitle(meeting: Meeting): string {
  return meeting.title || meeting.calendarEvent?.title || "Untitled Meeting";
}

function attendees(meeting: Meeting): string {
  return (meeting.calendarEvent?.attendees ?? []).map((a) => a.displayName || a.email).join(", ");
}

function MeetingMetadata(props: { meeting: Meeting }) {
  const { meeting } = props;
  const link = meetingLink(meeting);
  return (
    <Detail.Metadata>
      <Detail.Metadata.Label title="Date" text={new Date(meeting.startedAt ?? meeting.createdAt).toLocaleString()} />
      {meeting.durationMins != null && meeting.durationMins > 0 && (
        <Detail.Metadata.Label title="Duration" text={`${meeting.durationMins} min`} />
      )}
      {meeting.folder && <Detail.Metadata.Label title="Folder" text={meeting.folder.name} />}
      {attendees(meeting) && <Detail.Metadata.Label title="Attendees" text={attendees(meeting)} />}
      {meeting.createdBy.email && <Detail.Metadata.Label title="Recorded By" text={meeting.createdBy.email} />}
      {link && <Detail.Metadata.Link title="Langdock" text="Open meeting" target={link} />}
    </Detail.Metadata>
  );
}

function MeetingNotes(props: { meeting: Meeting }) {
  const { meeting } = props;
  const link = meetingLink(meeting);
  const { data: notes, isLoading } = useCachedPromise(getMeetingNotes, [meeting.id], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load notes" });
    },
  });
  const empty = meeting.notesStatus === "READY" ? "_No notes._" : `_Notes are ${meeting.notesStatus.toLowerCase()}._`;

  return (
    <Detail
      navigationTitle={meetingTitle(meeting)}
      isLoading={isLoading}
      markdown={`# ${escapeMarkdown(meetingTitle(meeting))}\n\n${notes ? sanitizeMarkdown(notes) : isLoading ? "" : empty}`}
      metadata={<MeetingMetadata meeting={meeting} />}
      actions={
        <ActionPanel>
          <Action.Push title="Ask About Meeting" icon={Icon.Bubble} target={<AskAboutMeeting meeting={meeting} />} />
          {notes && <Action.CopyToClipboard title="Copy Notes" content={notes} />}
          <Action.Push title="Show Transcript" icon={Icon.Text} target={<MeetingTranscript meeting={meeting} />} />
          {link && <Action.OpenInBrowser title="Open in Langdock" url={link} />}
        </ActionPanel>
      }
    />
  );
}

/** Plain transcript for prompts and copying. */
function formatTranscript(segments: TranscriptSegment[]): string {
  return segments.map((s) => `${speaker(s)} (${clock(s.startAt)}): ${s.text}`).join("\n\n");
}

/** Transcript as safe markdown for display. */
function renderTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `**${escapeMarkdown(speaker(s))}** · ${clock(s.startAt)}\n${sanitizeMarkdown(s.text)}`)
    .join("\n\n");
}

function speaker(segment: TranscriptSegment): string {
  return segment.speakerName || segment.speaker;
}

function meetingLink(meeting: Meeting): string | undefined {
  return safeHttpUrl(meeting.url);
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MeetingTranscript(props: { meeting: Meeting }) {
  const { meeting } = props;
  const link = meetingLink(meeting);
  const { data: segments, isLoading } = useCachedPromise(getMeetingTranscript, [meeting.id], {
    onError: (error) => {
      showLangdockError(error, { title: "Could not load transcript" });
    },
  });
  const text = segments ? formatTranscript(segments) : "";
  const rendered = segments ? renderTranscript(segments) : "";

  return (
    <Detail
      navigationTitle={`${meetingTitle(meeting)} · Transcript`}
      isLoading={isLoading}
      markdown={`# Transcript\n\n${rendered || (isLoading ? "" : "_No transcript._")}`}
      metadata={<MeetingMetadata meeting={meeting} />}
      actions={
        <ActionPanel>
          <Action.Push title="Ask About Meeting" icon={Icon.Bubble} target={<AskAboutMeeting meeting={meeting} />} />
          {text && <Action.CopyToClipboard title="Copy Transcript" content={text} />}
          {link && <Action.OpenInBrowser title="Open in Langdock" url={link} />}
        </ActionPanel>
      }
    />
  );
}

/** Loads notes and transcript, then opens a chat with them as context. */
function AskAboutMeeting(props: { meeting: Meeting }) {
  const { meeting } = props;
  const { data: context, isLoading } = useCachedPromise(
    async (id: string) => {
      const [notes, segments] = await Promise.allSettled([getMeetingNotes(id), getMeetingTranscript(id)]);
      const failures = [notes, segments]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      if (failures.length === 1) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Part of the meeting couldn't be loaded",
          message: failures[0],
        });
      }
      return {
        notes: notes.status === "fulfilled" ? notes.value : "",
        transcript: segments.status === "fulfilled" ? formatTranscript(segments.value) : "",
        failures,
      };
    },
    [meeting.id],
  );

  if (isLoading || !context) return <Detail isLoading markdown="Loading meeting…" />;
  if (!context.notes.trim() && !context.transcript.trim()) {
    const reason = context.failures.length ? `\n\n${escapeMarkdown(context.failures.join("\n"))}` : "";
    return (
      <Detail
        markdown={`## Nothing to summarize\n\nThis meeting has no notes or transcript you can access.${reason}`}
      />
    );
  }
  return (
    <MeetingChat
      meeting={meeting}
      context={wrapUntrusted(
        "meeting",
        `${wrapUntrusted("notes", context.notes)}\n${wrapUntrusted("transcript", context.transcript)}`,
        { title: meetingTitle(meeting), date: meeting.startedAt ?? meeting.createdAt },
      )}
    />
  );
}

function MeetingChat(props: { meeting: Meeting; context: string }) {
  return (
    <Chat
      initialPrompt={`Here are the notes and transcript of a meeting. Summarize the key points, decisions and action items with owners.\n\n${props.context}`}
      displayPrompt={`Summarize “${meetingTitle(props.meeting)}”`}
    />
  );
}
