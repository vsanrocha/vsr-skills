# remove-co-authored-by

A `PreToolUse` hook that blocks `git commit` commands containing `Co-Authored-By: Claude` (or any variant). Works alongside the `conventional-commits` skill to enforce clean commit history.

## What it does

Intercepts every `Bash` tool call before execution. If the command is a `git commit` that includes a `Co-Authored-By` line referencing Claude, the hook:

1. Denies the tool call
2. Sends a system message instructing the model to redo the commit without the line

## Installation

**Step 1** — copy the script to your Claude hooks directory:

```bash
cp hook.py ~/.claude/hooks/remove-co-authored-by.py
chmod +x ~/.claude/hooks/remove-co-authored-by.py
```

**Step 2** — add the hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ~/.claude/hooks/remove-co-authored-by.py"
          }
        ]
      }
    ]
  }
}
```

## Pairing with conventional-commits

The `conventional-commits` skill already instructs the model never to include `Co-Authored-By`. This hook enforces that rule at the tool level — even if the model forgets.

**Compatible with:** Claude Code (Tier 1)
