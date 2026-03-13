# lint-on-save

Hook de exemplo que dispara após Write/Edit. Substitua o comando pelo seu linter real.

## Uso

Copie `hooks.json` para `.claude/settings.json` ou para `hooks/hooks.json` do seu plugin.

Exemplo com ESLint:

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

**Compatível com:** Claude Code (Tier 1)
