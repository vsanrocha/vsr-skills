# Contributing

Thank you for considering contributing to vsr-skills.

## How to contribute

1. **Fork** the repository
2. **Create a branch** for your change (`git checkout -b feat/my-skill`)
3. **Add or edit** skills/plugins/hooks/rules following the conventions below
4. **Validate** locally: `bun run validate`
5. **Commit** with a clear message (`feat: add skill X`, `fix: update plugin Y`)
6. **Push** and open a **Pull Request**

## Conventions

### Skills

- Each skill lives in `skills/<skill-name>/`
- Required: `SKILL.md` with YAML frontmatter (`name`, `description`)
- Optional: `references/`, `templates/` for auxiliary assets

### Plugins (Claude Code)

- Each plugin lives in `plugins/<plugin-name>/`
- Required: `.claude-plugin/plugin.json` with `name`, `description`, `version`
- Plugin skills in `plugins/<name>/skills/`
- README.md with installation and permissions

### Hooks and Rules

- Hooks in `hooks/<name>/` with `hooks.json` and README
- Rules in `rules/<agent>/` with rule files and README

## PR Checklist

- [ ] Required files present
- [ ] Valid metadata (frontmatter, plugin.json)
- [ ] README with installation and usage
- [ ] No binaries or opaque payloads
- [ ] `bun run validate` passes

## Questions

Open an [issue](https://github.com/vsanrocha/vsr-skills/issues) to discuss.
