---
name: learn
description: Manually capture a learning (pattern, rule, or correction) into the learnings database
---

# /learn — Manual Learning Capture

Capture a learning manually. Run this skill when you want to record a pattern, rule, or mistake-correction pair that should be remembered across sessions.

## How to invoke

```
/learn
```

## Steps

### 1. Ask for the category

Present the user with the available categories and wait for their selection:

```
Which category best fits this learning?

PROJECT learnings (committed to repo, shared with team):
  1. Architecture  — structural decisions, patterns, component boundaries
  2. Testing       — test strategies, what to mock, edge cases
  3. Quality       — code style, error handling, naming conventions
  4. Git           — commit hygiene, branching, merge strategies
  5. Performance   — optimization patterns, what to avoid

USER learnings (local only, not committed):
  6. Navigation    — how to find things in this codebase
  7. Editing       — editor patterns, refactoring techniques
  8. Context       — how to load context efficiently for this project

Enter number or category name:
```

### 2. Ask for the rule

```
What is the rule or pattern? (the "do this" statement)
```

Example: "Always run `bun typecheck` before committing TypeScript changes."

### 3. Ask for the mistake (optional)

```
What mistake does this rule prevent? (press Enter to skip)
```

Example: "Committed broken types that passed lint but failed CI."

### 4. Ask for the correction (optional)

```
What is the correct approach or fix? (press Enter to skip)
```

Example: "Run `npx tsc --noEmit` locally — it catches errors ESLint misses."

### 5. Save the learning

Use the learnings-db.js API to store the entry:

```javascript
import { addLearning, isProjectCategory, exportToJson } from "../../db/learnings-db.js";

const id = addLearning({
  category,   // string from step 1
  rule,       // string from step 2
  mistake,    // string or null
  correction, // string or null
  source: "manual",
  project: process.env.PROJECT_NAME ?? null,
});
```

If the category is a **project category** (Architecture, Testing, Quality, Git, Performance):
- Also call `exportToJson(projectPath)` to write `{project}/.task-lifecycle/learnings.json`
- Remind the user to commit `.task-lifecycle/learnings.json` so the team gets this learning

```javascript
if (isProjectCategory(category)) {
  const projectPath = process.cwd(); // or resolve from git root
  const { path, count } = exportToJson(projectPath);
  // Report: "Exported to {path} ({count} project learnings). Remember to commit this file."
}
```

### 6. Confirm

Report back:
```
Learning saved (id: {id})
  Category:   {category}
  Rule:       {rule}
  Mistake:    {mistake or "(none)"}
  Correction: {correction or "(none)"}
```

If project category was exported, add:
```
Project learnings exported to .task-lifecycle/learnings.json ({count} total).
Don't forget to commit this file so the team benefits from this learning.
```

## Notes

- **Project categories** (Architecture, Testing, Quality, Git, Performance) are written to `.task-lifecycle/learnings.json` and should be committed.
- **User categories** (Navigation, Editing, Context) are stored only in `~/.task-lifecycle/learnings.db` — personal, never committed.
- The DB uses FTS5 full-text search, so all fields (rule, mistake, correction) are searchable via `/search-learnings`.
- All 8 categories are searchable. Only project categories appear in the JSON export.
