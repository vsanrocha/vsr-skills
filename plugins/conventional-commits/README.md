# conventional-commits plugin

Bundles the `conventional-commits` skill with a `PreToolUse` hook that enforces clean commit messages by blocking any `Co-Authored-By: Claude` line at the tool level.

## What's included

| Item | Type | Purpose |
|------|------|---------|
| `conventional-commits` | Skill | Guides the model through the Conventional Commits workflow |
| `remove-co-authored-by` | Hook | Blocks `git commit` commands that include AI attribution lines |

## Installation

```bash
/plugin install vsr-skills@conventional-commits
```

## Hook setup

After installing, copy the hook script and register it:

```bash
cp ~/.claude/plugins/cache/vsr-skills/conventional-commits/*/hooks/remove-co-authored-by/hook.py \
   ~/.claude/hooks/remove-co-authored-by.py
```

Then add to `~/.claude/settings.json`:

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

## How it works

The skill instructs the model never to include `Co-Authored-By`. The hook enforces that rule at the tool level — even if the model forgets, the commit is blocked and the model is instructed to redo it without the line.
