# lint-on-save

Example hook that triggers after Write/Edit. Replace the command with your real linter.

## Usage

Copy `hooks.json` to `.claude/settings.json` or to `hooks/hooks.json` in your plugin.

Example with ESLint:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs -I {} npx eslint {} --fix"
          }
        ]
      }
    ]
  }
}
```

**Compatible with:** Claude Code (Tier 1)
