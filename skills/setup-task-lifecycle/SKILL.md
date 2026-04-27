---
name: setup-task-lifecycle
description: >
  Install or repair the Task-Lifecycle v2 plugin. Copies hooks, db, and scripts
  to the correct locations, registers hooks in settings.json, and syncs skills
  to the plugin cache. Use when setting up a new machine or after reinstalling
  Claude Code.
---

# Setup Task-Lifecycle v2

Installs the full Task-Lifecycle v2 plugin from the plugin cache.

## Usage

```
/setup-task-lifecycle
```

## What It Does

Runs the install script at `scripts/install.js` from the `vsr-skills` plugin cache.
The script is idempotent — safe to run multiple times, skips anything already installed.

**Steps performed:**
1. Copies `db/` → `~/.claude/hooks/db/`
2. Copies scripts → `~/.agents/scripts/`
3. Registers hooks in `~/.claude/settings.json`
4. Registers plugin in `enabledPlugins` + `extraKnownMarketplaces`
5. Updates `installed_plugins.json`
6. Syncs skills to plugin cache

## Instructions

1. Run the install script from the plugin cache:
   ```bash
   bash -c 'bun "$HOME/.claude/plugins/cache/vsr-skills/task-lifecycle/"*/scripts/install.js'
   ```

2. Display the output as a checklist:
   - `[x]` for each `✓` line
   - `[-]` for each `–` (skipped) line
   - `[ ]` for each `✗` (failed) line

3. If any step fails, report the error and suggest a fix.

4. Tell the user: **"Restart your Claude Code session to load all hooks and skills."**

## Repair Mode

If only a specific component is broken (e.g., hooks after a `db/` move), the user
can re-run the script — it will skip already-installed items and only fix what's missing.
