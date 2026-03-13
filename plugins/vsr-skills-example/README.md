# vsr-skills-example

Example plugin for Claude Code, marketplace-ready.

## Installation

```bash
# Via marketplace (when registered)
/plugin install vsr-skills-example@vsr-skills-marketplace

# Local (development)
claude --plugin-dir ./plugins/vsr-skills-example
```

## Permissions

- **Network:** no
- **Filesystem:** read-only (context reading only)
- **Reviewed:** yes

## Structure

```
vsr-skills-example/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── hello/
│       └── SKILL.md
└── README.md
```
