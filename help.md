# Set up Langdock

1. In Langdock, open **Settings → Account → API keys** and create a key. Your admin may need to enable personal API keys first, or can give you a workspace key.
2. Paste the key into **API Key**.
3. On a dedicated deployment, set **API Base URL** to `https://<your-domain>/api/public`.

## Scopes

Personal keys start with model access only. Ask your admin to allow the scopes for the commands you use:

| Commands                                                                   | Scope                                |
| -------------------------------------------------------------------------- | ------------------------------------ |
| Ask Langdock, Ask Agent, selection, web page, screenshot and file commands | Agent API                            |
| Generate Image                                                             | Completion API                       |
| Search Prompts                                                             | Prompt API                           |
| Search Knowledge, Add to Knowledge Base, file uploads                      | Knowledge Folder API                 |
| Search Meetings                                                            | Meetings Read API                    |
| Search Skills                                                              | Skill API                            |
| Run Integration Action                                                     | Integration API                      |
| Browse Workflows                                                           | Workflow Read API                    |
| Manage and Create Scheduled Tasks                                          | Scheduled Tasks API (workspace keys) |

When a scope is missing, the error message names it.
