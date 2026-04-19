---
name: search-learnings
description: Search, list, or show stats for captured learnings in the learnings database
---

# /search-learnings — Search Learnings

Query the learnings database using full-text search. Useful for recalling patterns, rules, and corrections captured across sessions.

## How to invoke

```
/search-learnings <query>         # full-text search
/search-learnings --list          # list all learnings (most recent first)
/search-learnings --stats         # show counts by category
```

## Modes

### Search mode (default)

```
/search-learnings <query>
```

Runs an FTS5 full-text search across `rule`, `mistake`, `correction`, `category`, and `project` fields. Returns up to 10 results ranked by relevance.

```javascript
import { searchLearnings } from "../../db/learnings-db.js";

const results = searchLearnings(query, 10);
```

**Output format** (one block per result):

```
[{id}] {category}
  Rule:       {rule}
  Mistake:    {mistake or "(none)"}
  Correction: {correction or "(none)"}
  Source:     {source}   Added: {created_at}
```

If no results found:
```
No learnings found for "{query}".
Try broader terms or use /search-learnings --list to see all entries.
```

---

### List mode

```
/search-learnings --list
```

Returns all learnings ordered by most recent first. Uses `getRecentLearnings()` with a high limit (500).

```javascript
import { getRecentLearnings } from "../../db/learnings-db.js";

const results = getRecentLearnings(null, 500);
```

Group results by category in output:

```
## Architecture (3)
  [12] Always separate read models from write models in CQRS flows.
  [8]  ...

## Testing (5)
  [15] Never mock the database in integration tests.
  ...

## Git (2)
  ...
```

Show total count at the end: `Total: {n} learnings across {k} categories.`

---

### Stats mode

```
/search-learnings --stats
```

Query the DB directly to get counts by category:

```javascript
import { initDb } from "../../db/learnings-db.js";

const db = initDb();
const rows = db.prepare(`
  SELECT category, COUNT(*) as count
  FROM learnings
  GROUP BY category
  ORDER BY count DESC
`).all();
```

**Output format:**

```
Learnings by category:

  Architecture   ██████████  10
  Testing        ████████     8
  Quality        █████        5
  Git            ███          3
  Performance    ██           2
  Navigation     █            1
  Editing        █            1
  Context                     0

Total: 30 learnings
```

Use a simple ASCII bar chart (█ per 1 learning, max 20 chars wide, scale if needed).

---

## Notes

- Search uses FTS5 — queries support standard SQLite FTS5 syntax (e.g., `"exact phrase"`, `term1 OR term2`, `term*` for prefix).
- All categories are searchable: project (Architecture, Testing, Quality, Git, Performance) and user (Navigation, Editing, Context).
- To add a new learning manually, use `/learn`.
- Project learnings are also stored in `.task-lifecycle/learnings.json` (committable). User learnings are local-only in `~/.task-lifecycle/learnings.db`.
