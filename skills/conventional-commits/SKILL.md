---
name: conventional-commits
description: Generates commit messages in Conventional Commits format. Use when committing, creating changelog, or documenting changes.
---

# Conventional Commits

Follow the format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
- `feat(auth): add login with OAuth`
- `fix(api): handle null response`
- `docs: update README installation`

Use imperative mood, lowercase (except after `:`), no period at end of first line.
