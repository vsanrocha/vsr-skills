---
name: start-task
description: Start a new development task from any spec source (Jira, GitHub Issue, GitLab Issue, or local file). Auto-detects source, fetches spec, normalizes to common format, creates worktree, and kicks off the planning pipeline.
---

Start a new task by fetching a spec from any supported source, normalizing it, creating a git worktree, and launching the planning pipeline.

## Usage

```
/start-task APR-1234              # Jira (KEY-NUMBER pattern)
/start-task #42                   # GitHub/GitLab Issue (#NUMBER pattern)
/start-task ./specs/feature.md    # Local file (file path)
/start-task --jira APR-1234       # Explicit Jira
/start-task --github 42           # Explicit GitHub
/start-task --gitlab 42           # Explicit GitLab
/start-task --file ./specs/feat.md # Explicit local file
/start-task                       # Interactive — asks where the spec is
```

## Steps

### Step 1 — Parse Arguments and Detect Source

Parse the argument provided by the user. Detect the spec source using this logic:

| Argument | Detection Rule | Source |
|----------|---------------|--------|
| `--jira <id>` | Explicit flag | Jira |
| `--github <number>` | Explicit flag | GitHub |
| `--gitlab <number>` | Explicit flag | GitLab |
| `--file <path>` | Explicit flag | Local file |
| Matches `/^[A-Z]+-\d+$/` | KEY-NUMBER pattern | Jira |
| Matches `/^#?\d+$/` | Issue number | GitHub or GitLab (detect from git remote) |
| Matches a file path (contains `/` or `.`) | File path | Local file |
| No argument | Interactive | Ask user |

**For `#NUMBER` pattern without explicit flag**, detect the git remote to determine GitHub vs GitLab:

```bash
git remote get-url origin
```

- If URL contains `github.com` → GitHub
- If URL contains `gitlab` → GitLab
- If ambiguous → ask user: "Is this a GitHub or GitLab issue?"

**For no argument (interactive mode)**, ask:

> Where is your spec?
> 1. Jira ticket (e.g., APR-1234)
> 2. GitHub Issue (e.g., #42)
> 3. GitLab Issue (e.g., #42)
> 4. Local file (e.g., ./specs/feature.md)

### Step 2 — Fetch and Normalize Spec

Fetch the spec from the detected source and normalize into a common `spec.json` format.

#### Source: Jira

1. Use the Atlassian MCP tool `getJiraIssue` to fetch the issue by key
2. Extract: summary, description, acceptance criteria (from description or subtasks), labels, assignee, priority
3. Attempt to transition the issue to "In Development" using `getTransitionsForJiraIssue` then `transitionJiraIssue`
4. Build `source_url` as `https://{site}.atlassian.net/browse/{key}`

#### Source: GitHub

1. Run:
```bash
gh issue view <number> --json title,body,labels,assignees,milestone,url
```
2. Extract: title, body (parse for acceptance criteria — look for checkboxes `- [ ]`), labels (as array of strings), assignee (first assignee login), url
3. Parse acceptance criteria from the body: lines matching `- [ ] ...` or `- [x] ...` become acceptance_criteria items. If no checkboxes found, leave acceptance_criteria empty.

#### Source: GitLab

1. Run:
```bash
glab issue view <number> --output json
```
2. Extract: title, description (parse for acceptance criteria same as GitHub), labels, assignees (first assignee), web_url
3. Parse acceptance criteria from description same as GitHub.

#### Source: Local File

1. Read the file using the Read tool
2. Use the file content as the description
3. Extract title from the first `# Heading` line, or use the filename without extension
4. No acceptance criteria parsing needed — use full content as description
5. source_url is empty, source_id is the filename

#### Normalized spec.json Schema

Save this as `spec.json` in the task directory (`.local-development/` in the worktree):

```json
{
  "source": "jira | github | gitlab | local",
  "source_id": "APR-1234 | 42 | 42 | feature.md",
  "source_url": "https://... | '' for local",
  "title": "Human-readable title",
  "description": "Full description text",
  "acceptance_criteria": ["criterion 1", "criterion 2"],
  "labels": ["label1", "label2"],
  "assignee": "username or empty string",
  "priority": "high | medium | low | ''",
  "raw": {}
}
```

The `raw` field contains the original API response (full JSON from gh/glab/Jira) for reference.

### Step 3 — Generate Branch Name

Generate the branch name based on the source:

| Source | Pattern | Example |
|--------|---------|---------|
| Jira | `feat/{KEY}-{slug}` | `feat/APR-1234-jwt-refresh-rotation` |
| GitHub | `feat/gh-{number}-{slug}` | `feat/gh-42-jwt-refresh-rotation` |
| GitLab | `feat/gl-{number}-{slug}` | `feat/gl-42-jwt-refresh-rotation` |
| Local | `feat/{slug}` | `feat/jwt-refresh-rotation` |

**Slug generation rules:**
- Take the title, lowercase it
- Replace non-alphanumeric characters with hyphens
- Collapse consecutive hyphens into one
- Trim leading/trailing hyphens
- Truncate to 50 characters max (at word boundary)

### Step 4 — Create Git Worktree

Create a git worktree for isolated development:

```bash
# Ensure we're on the latest main
git fetch origin

# Create worktree with the generated branch name
git worktree add -b <branch-name> ../<repo-name>-<branch-name> origin/main
```

If the worktree command fails (e.g., branch already exists), try:
```bash
git worktree add ../<repo-name>-<branch-name> <branch-name>
```

After creating the worktree, `cd` into it and create the task directory:

```bash
mkdir -p .local-development
```

Save the `spec.json` file into `.local-development/spec.json`.

### Step 5 — Display Summary and Continue Pipeline

Print a summary of what was set up:

```
--- Task Started ---
Source:     {source} ({source_id})
Title:      {title}
Branch:     {branch_name}
Worktree:   {worktree_path}
Spec:       {worktree_path}/.local-development/spec.json
---
```

Then continue the planning pipeline in order:

1. **Scout**: Explore the codebase to understand architecture and relevant files for this task. Build enough confidence (>= 70%) to proceed. If confidence is low, gather more context.

2. **Grill-Me** (`/grill-me`): Run a requirements stress-test interview with the user. Challenge assumptions, find edge cases, clarify scope.

3. **Write PRD** (`/write-a-prd`): Create a PRD document from the spec + interview results + codebase understanding.

4. **PRD to Tasks** (`/prd-to-tasks`): Break the PRD into implementation tasks with tiers and criteria.

**Important**: Wait for user approval at each gate (PRD approval, task list approval) before proceeding to the next step.

## Error Handling

| Error | Action |
|-------|--------|
| Jira MCP not configured | Tell user: "Atlassian MCP is not configured. Run `/setup-task-lifecycle` or use `--github`, `--gitlab`, or `--file` instead." |
| `gh` CLI not installed | Tell user: "GitHub CLI (`gh`) is not installed. Install it: https://cli.github.com/" |
| `glab` CLI not installed | Tell user: "GitLab CLI (`glab`) is not installed. Install it: https://gitlab.com/gitlab-org/cli" |
| Local file not found | Tell user: "File not found: {path}. Check the path and try again." |
| Issue not found (404) | Tell user: "Issue {id} not found. Verify the issue exists and you have access." |
| Worktree creation fails | Check if branch already exists. If so, ask user if they want to resume work on the existing branch. |
| No git remote | Skip GitHub/GitLab detection. Only allow Jira (if MCP configured) or local file. |
