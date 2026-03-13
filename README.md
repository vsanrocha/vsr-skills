# vsr-skills

Public catalog of skills, plugins, hooks and rules for coding agents. **Primary focus: Claude Code**, with compatibility for Cursor, Codex, Antigravity and others.

## Quick Start (Claude Code)

### Install via repository

```bash
# Register this repository as marketplace and install the main plugin
/plugin marketplace add vsanrocha/vsr-skills
/plugin install vsr-skills@vsr-skills-marketplace
```

### Install skills directly

If you use Claude Code with skills in `.claude/skills/`, you can clone or copy the skills:

```bash
git clone https://github.com/vsanrocha/vsr-skills.git
cp -r vsr-skills/skills/* ~/.claude/skills/
# or for the current project:
cp -r vsr-skills/skills/* .claude/skills/
```

### Via npx skills (multi-agent)

```bash
npx skills add vsanrocha/vsr-skills -a claude-code
```

## Updating

Plugins are **not** updated automatically. When skills or plugins change in this repository, run:

```bash
# Update this marketplace specifically
/plugin marketplace update vsr-skills

# Or update all registered marketplaces at once
/plugin marketplace update
```

## Structure

| Directory | Content |
|-----------|---------|
| `skills/` | Reusable skills (SKILL.md) |
| `plugins/` | Packaged plugins for Claude Code |
| `hooks/` | Automation hooks |
| `rules/` | Rules per agent/editor |

## Compatibility

| Agent | Tier | Installation |
|--------|------|------------|
| **Claude Code** | 1 | Plugin marketplace, repository, `.claude/skills/` |
| Cursor | 2 | `.cursor/skills/`, npx skills |
| Codex | 2 | `.codex/skills/`, npx skills |
| Antigravity | 2 | `.gemini/antigravity/skills/`, npx skills |

## Security

- Catalog 100% in open text, no binaries.
- Each item documents permissions and limitations.
- See [SECURITY.md](SECURITY.md) for vulnerability policy.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for standards and contribution flow.

## License

MIT — see [LICENSE](LICENSE).
