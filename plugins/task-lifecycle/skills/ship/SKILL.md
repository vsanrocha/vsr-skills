---
name: ship
description: Create a Pull Request (GitHub) or Merge Request (GitLab) for the current branch. Auto-detects the git remote, reads spec.json and progress.txt to build the PR/MR body, and links back to the originating issue.
---

Ship the current branch by creating a PR (GitHub) or MR (GitLab).

## Usage

```
/ship                    # Auto-detect remote and create PR/MR
/ship --draft            # Create as draft PR/MR
/ship --target main      # Override target branch (default: main)
```

## Steps

### Step 1 — Detect Git Remote

Run:

```bash
git remote get-url origin
```

Classify the remote:

| Remote URL contains | Platform | CLI |
|---------------------|----------|-----|
| `github.com` | GitHub | `gh pr create` |
| `gitlab` | GitLab | `glab mr create` |
| Neither | Unknown | Skip — tell user no remote detected |

If no remote is configured, tell the user:
> "No git remote found. Push your branch to a remote first, then run `/ship` again."
> Stop here.

### Step 2 — Read Context Files

**Spec file** — look for `.local-development/spec.json` in the current working directory:

```bash
cat .local-development/spec.json 2>/dev/null || echo "{}"
```

Extract from spec.json:
- `title` — use as PR/MR title if no better title is available
- `source` — `jira | github | gitlab | local`
- `source_id` — issue number or ticket key
- `source_url` — link to original issue

**Progress file** — look for `.local-development/progress.txt`:

```bash
cat .local-development/progress.txt 2>/dev/null || echo ""
```

Use progress.txt content as the PR/MR body summary.

**Branch name** — if no spec.json title is available, derive the title from the branch name:

```bash
git rev-parse --abbrev-ref HEAD
```

Convert branch name to title: strip `feat/`, `fix/`, `chore/` prefixes, replace hyphens with spaces, capitalize first letter.

Example: `feat/gh-42-jwt-refresh-rotation` → `JWT refresh rotation`

### Step 3 — Build PR/MR Title and Body

**Title**: Use `spec.title` if available, otherwise derive from branch name (Step 2).

**Body** — build a markdown body using this template:

```markdown
## Summary

{progress.txt content, or "See commit history for details." if empty}

## Changes

{Run `git log origin/main..HEAD --oneline` and list the commits}

{issue_link_section}
```

**Issue link section** — depends on source:

| Source | Section |
|--------|---------|
| `github` | `Closes #{source_id}` |
| `gitlab` | `Closes #{source_id}` |
| `jira` | `Jira: [{source_id}]({source_url})` |
| `local` or missing spec | *(omit section)* |

### Step 4 — Create PR or MR

#### GitHub

```bash
gh pr create \
  --title "{title}" \
  --body "{body}" \
  --base main \
  [--draft if --draft flag passed]
```

If the PR already exists for this branch, `gh pr create` will fail with a message. In that case, tell the user:
> "A PR already exists for this branch. Open it with: `gh pr view --web`"

#### GitLab

```bash
glab mr create \
  --title "{title}" \
  --description "{body}" \
  --target-branch main \
  --remove-source-branch \
  [--draft if --draft flag passed]
```

If the MR already exists, `glab mr create` will output the existing MR URL. Show it to the user.

### Step 5 — Display Result

After successful creation, display:

```
--- Shipped ---
Platform:   GitHub PR  |  GitLab MR
Title:      {title}
URL:        {pr_or_mr_url}
Issue:      {source_url or "none"}
---
```

## Error Handling

| Error | Action |
|-------|--------|
| `gh` not installed | Tell user: "GitHub CLI (`gh`) is not installed. Install: https://cli.github.com/" |
| `glab` not installed | Tell user: "GitLab CLI (`glab`) is not installed. Install: https://gitlab.com/gitlab-org/cli" |
| Not authenticated | Tell user to run `gh auth login` or `glab auth login` |
| Branch not pushed | Run `git push -u origin HEAD` first, then retry |
| PR/MR already exists | Show existing URL, suggest `gh pr view --web` or `glab mr view --web` |
| No commits ahead of main | Warn: "Branch has no commits ahead of main. Nothing to ship." |
