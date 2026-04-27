---
name: setup-task-lifecycle
description: >
  Install or repair the Task-Lifecycle v2 plugin. Copies hooks, db, and scripts
  to the correct locations, registers hooks in settings.json, and syncs skills
  to the plugin cache. Use when setting up a new machine or after reinstalling
  Claude Code.
---

# Setup Task-Lifecycle v2

Installs the full Task-Lifecycle v2 plugin from the local repo.

## Usage

```
/setup-task-lifecycle
```

## What It Does

Runs the install script at `plugins/task-lifecycle/scripts/install.js` from the
`management-ai-helper` repo root. The script is idempotent — safe to run multiple
times, skips anything already installed.

**Steps performed:**
1. Copies hooks → `~/.claude/hooks/task-lifecycle/`
2. Copies `db/` → `~/.claude/hooks/db/`
3. Copies scripts → `~/.agents/scripts/`
4. Registers hooks in `~/.claude/settings.json`
5. Registers plugin in `enabledPlugins` + `extraKnownMarketplaces`
6. Updates `installed_plugins.json`
7. Syncs skills to plugin cache

## Instructions

1. Locate the `management-ai-helper` repo:
   - Check common paths: `~/projetos/management-ai-helper`, `~/projects/management-ai-helper`
   - If not found, ask the user: "Where is the management-ai-helper repo?"

2. Run the install script:
   ```bash
   bun {repo-root}/plugins/task-lifecycle/scripts/install.js
   ```

3. Display the output as a checklist:
   - `[x]` for each `✓` line
   - `[-]` for each `–` (skipped) line
   - `[ ]` for each `✗` (failed) line

4. If any step fails, report the error and suggest a fix.

5. Tell the user: **"Restart your Claude Code session to load all hooks and skills."**

## Repair Mode

If only a specific component is broken (e.g., hooks after a `db/` move), the user
can re-run the script — it will skip already-installed items and only fix what's missing.
