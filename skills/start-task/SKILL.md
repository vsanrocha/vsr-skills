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

Use the `/git-worktrees` skill to create an isolated worktree. All worktrees MUST go in `~/.worktrees/`.

```bash
mkdir -p ~/.worktrees
git fetch origin
git worktree add -b <branch-name> ~/.worktrees/<branch-name> origin/main
```

If branch already exists: `git worktree add ~/.worktrees/<branch-name> <branch-name>`

**NEVER create worktrees alongside the project directory.** Always under `~/.worktrees/`.

After creating the worktree, `cd` into it and set up the task directory:

```bash
cd ~/.worktrees/<branch-name>
mkdir -p .local-development
```

Save the `spec.json` file into `.local-development/spec.json`.

### Step 5 — Display Summary

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

Then proceed to Step 6. Do NOT generate PRD, tasks, or any implementation artifacts yet.

### Step 6 — Scout (codebase exploration)

Explore the codebase to build context before planning. This step is mandatory even for new/empty repos — understanding what exists (or doesn't) informs the plan.

1. Check project structure: `ls -la`, look for `package.json`, `composer.json`, `go.mod`, `pyproject.toml`, etc.
2. Read key config files and READMEs
3. Identify existing patterns: test conventions, directory layout, frameworks in use
4. If the repo has existing code, use Grep/Glob to map relevant areas for the task
5. Build a mental model of the architecture

Write a brief scout summary (5-10 bullet points) and save to `.local-development/scout-notes.md`.

After writing scout notes, tell the user:

> **Scout complete.** Here's what I found: [summary]. Moving to requirements interview.

Then proceed to Step 7.

### Step 7 — Grill-Me (requirements stress-test)

CRITICAL: This step is an interactive interview with the user. You MUST ask questions and WAIT for answers. Do NOT skip this step. Do NOT auto-answer on behalf of the user.

Conduct a requirements stress-test interview. The goal is to challenge assumptions, find gaps, and clarify scope BEFORE writing any PRD.

**Interview protocol:**
- Ask ONE question at a time. Wait for the user's answer before asking the next.
- Use multiple choice when possible (easier for the user to answer quickly).
- Minimum 3 questions, maximum 8 questions.
- Cover these areas:
  - **Scope**: "What's explicitly OUT of scope?"
  - **MVP vs Full**: "What's the minimum demo-able version?"
  - **Risk**: "What's the hardest technical challenge here?"
  - **Dependencies**: "What external tools/APIs/services are required?"
  - **Success criteria**: "How do we know this is done?"
  - **Time constraint**: "How much time do we have?" (if not in spec)
  - **Edge cases**: Challenge any assumption that seems fragile

**Example questions:**
> 1. The spec mentions 3 phases (brainstorm, dev, pitch). For the hackathon, which phase is the MUST-HAVE vs nice-to-have?
>    a) All three equally important
>    b) Brainstorm + Dev are critical, pitch is bonus
>    c) Just Dev flow matters, the rest is polish

After the interview is complete (user has answered all questions or says "enough"), write a summary of decisions to `.local-development/interview-notes.md`.

Then tell the user:

> **Interview complete.** Key decisions: [summary]. Ready to write the PRD. Proceed?

STOP HERE. Wait for the user to confirm before proceeding to Step 8.

### Step 8 — Write PRD (gate: requires user approval)

Only proceed when the user explicitly approves (e.g., "yes", "go", "proceed", "ok").

Generate a PRD using:
- The original spec (spec.json)
- Scout notes (scout-notes.md)
- Interview decisions (interview-notes.md)

If the `/write-a-prd` skill is available, invoke it. Otherwise, write the PRD directly following this structure:

1. **Problem Statement** — what pain does this solve?
2. **Proposed Solution** — high-level approach
3. **Scope** — what's in, what's explicitly out
4. **Technical Approach** — architecture, key decisions
5. **Success Criteria** — measurable outcomes
6. **Risks & Mitigations**

Save to `.local-development/PRD.md`.

Present the PRD to the user:

> **PRD ready.** Please review `.local-development/PRD.md`. Approve it or request changes.

STOP HERE. Wait for the user to approve the PRD before proceeding to Step 9. If the user requests changes, edit the PRD and present again.

**On PRD approval → compact gate:**
Before proceeding to Step 9, run the compact sequence:
1. Invoke `/compact-guard` — saves branch, worktree path, task dir, current stage
2. Run `/compact Focus on branch name, worktree path, spec.json location, PRD decisions`

This reduces context for the task breakdown step. The PRD is already saved to file — no need to keep it in context.

### Step 9 — PRD to Tasks (gate: requires user approval)

Only proceed when the user explicitly approves the PRD.

Invoke the `/prd-to-tasks` skill to break the PRD into implementation tasks. If the skill is not available, generate tasks manually following this structure:

1. Read the PRD
2. Break into discrete tasks (each task = one logical unit of work)
3. For each task, create a `task-N/task.json` with: id, title, description, files, tier (lite/standard/adversarial), acceptance criteria
4. Create `manifest.json` with task order and dependencies
5. Save under `.local-development/tasks/`

Present the task breakdown to the user:

> **Task breakdown ready.** {N} tasks created:
> - T1: {title} (tier: {tier})
> - T2: {title} (tier: {tier})
> - ...
>
> Approve to start the ralph loop, or request changes.

STOP HERE. Wait for the user to approve the task list before proceeding to Step 10.

**On task approval → compact gate (mandatory before ralph):**
1. Invoke `/compact-guard` — saves branch, worktree path, task dir, manifest location
2. Run `/compact Focus on branch {branch}, worktree {path}, task dir {task-dir}, manifest.json path`

This is the most important compact point — ralph runs as a separate background Agent with its own context window. The main session only needs to know where things are, not all the scout/interview/PRD content.

### Step 10 — Hand Off to Ralph

Only proceed when the user explicitly approves the task list and compact is done.

> **CRITICAL:** Never implement tasks yourself. Launch ralph as a background Agent.

```
Agent({
  description: "Ralph loop — {task-dir}",
  run_in_background: true,
  prompt: "You are a ralph runner. Execute this command and wait for it to finish:
           bun ~/.agents/scripts/ralph-parallel.js {absolute-worktree-path} {absolute-task-dir}

           When done, report: total tasks completed, any failures, final manifest status.
           Do not do anything else. Just run the command and report back."
})
```

After launching: tell the user "Ralph is running in background. I'll notify you when it finishes."

When the `task-notification` arrives from the background Agent:
- All tasks done → invoke `/review-pr`, then `/ship`, then `/wrap-up`
- Failures → report which tasks failed, ask how to proceed

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
