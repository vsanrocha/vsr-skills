---
name: conventional-commit
description: >
  Creates Git commits following the Conventional Commits specification. Use this
  skill WHENEVER the user asks to "commit", "make a commit", "create a commit",
  "save changes to git", or any variation involving recording changes in the
  repository. Also trigger when the user mentions "git commit" or asks to
  "close the task in git". This skill explicitly forbids adding Co-Authored-By
  from any AI tool.
author: vsanrocha
version: 1.1.0
---

## Language Rule

All commit messages — subject line, body, and footer — must be written in **English**, regardless of the language used in conversation.

---

## Workflow

Follow these steps in order:

1. **Inspect changes** — run `git status` to see changed files and `git diff` (or `git diff --cached` for staged) to understand what changed.

2. **Selective staging** — add only the relevant files with `git add <file>`. Prefer specific files over `git add .` to avoid accidentally staging sensitive files (.env, credentials) or large binaries.

3. **Construct the message** — use the Conventional Commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

4. **Execute the commit** — use a heredoc to ensure correct formatting:

```bash
git commit -m "$(cat <<'EOF'
type(scope): short description

Optional body with more context about why the change was made.

BREAKING CHANGE: details (if applicable)
EOF
)"
```

---

## Allowed Types

| Type       | When to use                                                  |
|------------|--------------------------------------------------------------|
| `feat`     | A new feature for the user                                   |
| `fix`      | A bug fix                                                    |
| `docs`     | Documentation only                                           |
| `style`    | Formatting, missing semicolons — no logic change             |
| `refactor` | Code refactoring with no bug fix or new feature              |
| `perf`     | A change that improves performance                           |
| `test`     | Adding or correcting tests                                   |
| `build`    | Changes to the build system or external dependencies         |
| `ci`       | Changes to CI configuration files                            |
| `chore`    | Other changes that don't affect src or tests                 |
| `revert`   | Reverts a previous commit                                    |

---

## Writing Rules

- **Description**: required, imperative mood ("add", not "added"), no period at the end, max 72 characters on the first line.
- **Scope**: optional but recommended. Indicates the affected module or area (e.g. `auth`, `ui`, `store`, `api`).
- **Body**: optional. Explain *why* the change was made, not *what* was done — the diff already shows what.
- **Footer**: use for `BREAKING CHANGE:` or issue references (e.g. `Closes #123`).
- **Breaking change**: signal with `!` after the type (`feat!:`) and/or with `BREAKING CHANGE:` in the footer.

---

## Co-Authored-By — FORBIDDEN

**Never include `Co-Authored-By` in the commit message**, regardless of the AI tool being used.

This includes (but is not limited to):
- `Co-Authored-By: Claude <noreply@anthropic.com>`
- `Co-Authored-By: Cursor <noreply@cursor.sh>`
- `Co-Authored-By: Gemini <noreply@google.com>`
- `Co-Authored-By: GitHub Copilot <noreply@github.com>`
- Any variant with an AI model or tool name

**Why?** The commit history reflects the developer's authorship. Automatic AI attribution pollutes the git log, can cause issues in authorship review processes, and does not reflect the real contribution of the person who made the design and code decisions.

---

## Examples

```
feat(auth): add JWT refresh token rotation

Implements silent token refresh to avoid forcing users to re-login.
Tokens now expire in 15min but are automatically renewed while active.
```

```
fix(store): correct policy approval status update

The store was mutating the wrong index when updating nested approval items.
```

```
refactor(RulePage): extract approval subject to composable
```

```
test(createPolicyStore): add unit tests for happy path and edge cases
```

```
chore: update eslint config to flat format
```

---

## Pre-commit Checklist

- [ ] The message describes *why*, not just *what*
- [ ] The type is correct for what was changed
- [ ] There is no `Co-Authored-By` in the message
- [ ] The message is written in English
- [ ] The first line is 72 characters or fewer
- [ ] No sensitive files were staged
