/** The API key scope each part of the API needs, by path prefix. */
const SCOPES: [RegExp, string][] = [
  [/^\/agent\//, "Agent API"],
  [/^\/(openai|anthropic|google|mistral)\//, "Completion API"],
  [/^\/prompts\//, "Prompt API"],
  [/^\/(knowledge|attachment)\b/, "Knowledge Folder API"],
  [/^\/meetings\//, "Meetings Read API"],
  [/^\/workflows\//, "Workflow Read API"],
  [/^\/automations\//, "Scheduled Tasks API (workspace keys)"],
  [/^\/skills\//, "Skill API"],
  [/^\/integrations\//, "Integration API"],
];

export function scopeForPath(path: string | undefined): string | undefined {
  return path ? SCOPES.find(([pattern]) => pattern.test(path))?.[1] : undefined;
}
