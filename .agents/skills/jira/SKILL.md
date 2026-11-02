---
name: jira
description: >
  View and interact with Jira tickets using the jira CLI, and create CI tickets
  with sprint, epic and story points through the REST API. Use when the user
  asks to view or create a ticket, list assigned issues, check sprint status,
  search issues, add comments, or change ticket status via a Jira URL or key.
---

# Jira CLI Skill

Interact with Jira tickets using the `jira` command-line tool.

## Usage

Use this skill when the user:

- Asks to view a Jira ticket
- Wants to list issues assigned to them
- Needs to check ticket status or details
- Provides a Jira URL or ticket key (e.g., `ADP-1234`)

## Common Commands

### View a Ticket

```bash
jira issue view <TICKET_KEY>
```

Example: `jira issue view ADP-6405`

If given a Jira URL like `https://aircall-product.atlassian.net/browse/ADP-6405`, extract the ticket key (`ADP-6405`) and use the view command.

### List My Issues

```bash
jira issue list -a$(jira me)
```

### List Issues in a Sprint

```bash
jira sprint list --current
jira sprint list --current -a$(jira me)
```

### Search Issues

```bash
jira issue list -q "project = ADP AND status = 'In Progress'"
```

### Add a Comment

```bash
jira issue comment add <TICKET_KEY> -b "<COMMENT_BODY>"
```

### Move Issue Status

```bash
jira issue move <TICKET_KEY> "<STATUS>"
```

## Create a CI ticket (sprint, assignee, epic, story points)

Kento's CI tickets always get all four: the **active sprint** of board `4795`, **assignee** Kento Monthubert (account id `61623175d9820f0070f2d020`), the **relevant epic** (ask if not obvious), and **story points** (ask if not given).
The `jira` CLI cannot set the sprint: it is configured for board `1260`, whose sprint endpoint 404s, so every `jira sprint list` variant fails here.
Create through REST instead.

- **Dedup first:** `jira issue list -q "project = CI AND summary ~ '<term>'"`, and check the epic.
- **Batch gate:** when creating several, create one, then wait for the user's "go" before the rest.
- **Auth** for every call: `-u "$(jira me):$JIRA_API_TOKEN"`.
  The email comes from `jira me`, not `$USER_EMAIL` (unset in most shells).
  An empty username returns `401`, which reads exactly like an expired token but is not one.

1. Active sprint id: `curl -u "$(jira me):$JIRA_API_TOKEN" "https://aircall-product.atlassian.net/rest/agile/1.0/board/4795/sprint?state=active"`.
2. `POST https://aircall-product.atlassian.net/rest/api/2/issue` with `fields`: `project.key="CI"`, `issuetype.id="10002"` (Task), `assignee.id="61623175d9820f0070f2d020"`, `customfield_10014` = epic key, `customfield_10020` = sprint id (int), `customfield_10028` = story points (not `customfield_10016`), `description` in wiki markup (`h2.`, `{{code}}`).
3. Verify: `GET /rest/api/2/issue/<KEY>?fields=summary,assignee,customfield_10014,customfield_10020,customfield_10028,status`.

Request shorthand such as `fe-maintenance, size 1, fix` is ticket metadata: the epic or label, the story points, and a fix/bug classification in the summary.

## Notes

- Attachments referenced in tickets are not viewable via CLI - suggest opening the Jira URL directly
- The CLI may truncate long descriptions - recommend viewing in browser for full context
- Ticket keys are case-insensitive but conventionally uppercase (e.g., `ADP-1234`)
