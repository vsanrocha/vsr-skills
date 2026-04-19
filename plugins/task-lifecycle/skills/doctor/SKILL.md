---
name: doctor
description: Run a health check on the task-lifecycle plugin installation. Diagnoses missing hooks, dependencies, database, config, and rules.
---

Run the doctor diagnostic script and present the results to the user.

## Steps

1. Execute the script:

```bash
bun plugins/task-lifecycle/scripts/doctor.js
```

2. Present the output as-is — it already uses colored ✅/⚠️/❌ status lines.

3. If any ❌ errors are found, suggest fixes:

| Error | Fix |
|-------|-----|
| `plugin.json` missing or invalid | Re-run plugin setup: `bun plugins/task-lifecycle/scripts/setup.js` |
| Hook script file missing | Check `plugins/task-lifecycle/hooks/` — the file may not have been created yet |
| `learnings.db` missing | Run any task-lifecycle command to initialize the database at `~/.task-lifecycle/` |
| Required CLI missing (`bun`, `git`, `claude`) | Install the missing tool and ensure it is in PATH |
| Project config missing | Copy the template: `cp plugins/task-lifecycle/rules/task-lifecycle-config plugins/task-lifecycle/rules/task-lifecycle-config.mdc` and fill in project-specific values |
| Rules directory empty | Ensure `.mdc` rule files exist under `plugins/task-lifecycle/rules/` |

4. If only ⚠️ warnings are found (no errors), inform the user the plugin is functional but some optional components are missing.

5. If all checks pass (✅), confirm the plugin is healthy and ready to use.
