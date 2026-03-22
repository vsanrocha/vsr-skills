---
name: publish-to-vsr
description: Publishes skills, hooks, rules, or plugins to the vsr-skills public catalog. Use when the user asks to "publish to vsr", "save this skill to my repo", "add to vsr-skills catalog", or wants to share an item publicly.
---

# Publish to VSR Skills Catalog

This skill saves items (skills, hooks, rules, plugins) to the public vsr-skills catalog repository, validates content for sensitive data, commits, and pushes.

## Important

- The target repository is **public** — never publish sensitive or personal data.
- All file content MUST be written in **English**.
- The repository path is: `<path-to-vsr-skills>`
- Remote: `git@github.com:<username>/vsr-skills.git`

## Steps

### 1. Determine item type and name

Ask the user (if not already clear) what they want to publish and identify:
- **Type**: `skill`, `hook`, `rule`, or `plugin`
- **Name**: must match the pattern `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (lowercase, hyphens, no leading/trailing hyphens)
- **Content**: the full content to publish (read from current project or conversation context)

### 2. Validate content for sensitive data

Before writing any file, scan the content for sensitive patterns:

- **Absolute paths**: `/home/<user>/`, `/Users/<user>/`, `C:\Users\`
- **Email addresses**: `\b[\w.-]+@[\w.-]+\.\w+\b`
- **API keys / tokens**: strings matching `(sk-|ghp_|gho_|github_pat_|xoxb-|xoxp-|AKIA|AIza)[\w-]+`
- **Hardcoded usernames**: references to specific user accounts, hostnames, or internal domains
- **Environment variables with values**: `KEY=value` patterns with actual secrets
- **Internal URLs**: company-specific domains, localhost with ports, internal service addresses

If violations are found:
1. List each finding with line number and matched text
2. Ask the user: **fix the content** or **proceed anyway**
3. Only continue after explicit user confirmation

### 3. Write files to the correct directory

Based on the item type, create files in the vsr-skills repo:

#### Skill
```
skills/<name>/SKILL.md
```
- Must include frontmatter with `name` and `description` fields
- Follow the template structure from `templates/skill/SKILL.md`

#### Hook
```
hooks/<name>/hooks.json
hooks/<name>/README.md
```

#### Rule
```
rules/<agent>/AGENTS.md
rules/<agent>/README.md
```

#### Plugin
```
plugins/<name>/
```
- Copy the full plugin structure as-is

### 4. Build and validate

Run the following commands sequentially from the repo root:

```bash
cd <path-to-vsr-skills> && bun run build
```

This regenerates `registry/skills.json` and `registry/plugins.json`.

Then validate:

```bash
cd <path-to-vsr-skills> && bun run validate
```

If validation fails, fix the issues before proceeding.

### 5. Commit and push

Stage only the relevant files (the new/updated item files + registry files):

```bash
cd <path-to-vsr-skills>
git add <item-files> registry/
git commit -m "feat: add <type> <name>"
git push origin main
```

- Use conventional commit format for the message
- Do NOT use `git add -A` — only stage the specific files for this item plus registry changes

### 6. Confirm publication

After pushing, confirm to the user:
- What was published (type + name)
- The path in the repository
- The commit hash
- That the registry was updated

## Checklist

Before completing, verify:
- [ ] Content has no sensitive data (or user explicitly approved)
- [ ] All file content is in English
- [ ] Name follows the naming pattern
- [ ] Frontmatter includes required fields (name, description)
- [ ] `bun run build` succeeded
- [ ] `bun run validate` passed
- [ ] Changes are committed and pushed
