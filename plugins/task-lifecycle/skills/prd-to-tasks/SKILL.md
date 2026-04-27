---
name: prd-to-tasks
description: >
  Break a PRD, Jira issue, or spec into a per-task directory structure with
  manifest.json + task-N/task.json files. Supports three evaluation tiers
  (lite / standard / adversarial) and ralph harness fields. Saves output under
  .local-development/tasks/[branch-name]/. Use this skill whenever the user
  wants to convert a spec, PRD, or Jira ticket into implementation tasks,
  create a task breakdown, or prepare for the ralph execution loop.
---

# PRD to Tasks

Convert a specification document into a per-task directory structure ready for
the ralph execution loop with optional adversarial evaluation support.

---

## Workflow

### Step 1 — Locate the Spec

Accept input from any of these sources:

- **Jira issue key** (e.g., `APR-1234`): Fetch via **jira-assistant** skill or Atlassian MCP
- **File path**: Read the file directly
- **Inline text**: Use the text provided in the conversation
- **Conversation context**: If a **write-a-prd** or **grill-me** session just completed, use that context

### Step 2 — Explore the Codebase

Before writing tasks, understand the project:

- **Auto-detect stack**: Check for `composer.json` (PHP), `package.json` (Node), `go.mod` (Go), `pyproject.toml` (Python), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), etc.
- **Auto-detect test runner**:
  - `composer.json` → `composer test` or `./vendor/bin/phpunit`
  - `package.json` → `npm test` or `npx vitest` or `npx jest`
  - `go.mod` → `go test ./...`
  - `pyproject.toml` → `pytest` or `python -m pytest`
  - `Cargo.toml` → `cargo test`
  - `pom.xml` → `mvn test`
  - `build.gradle` → `./gradlew test`
- **Find real file paths** for the `files` field in each task
- **Identify existing patterns** — test conventions, naming, directory structure
- **Detect default branch**:
  ```bash
  git remote show origin | grep 'HEAD branch' | awk '{print $NF}'
  ```

### Step 3 — Extract Metadata

Populate the top-level fields of `manifest.json`:

- `feature`: The ticket ID (e.g., `APR-1234`)
- `title`: Human-readable title from the spec
- `branch`: Current branch name (`git branch --show-current`)
- `base_branch`: Auto-detected default branch

### Step 4 — Draft Vertical-Slice Tasks

Break the spec into tasks following these principles:

- **Vertical slices**: Each task is thin but complete — touches all layers needed for its slice (model, service, controller, test).
- **Independently executable**: Each task can be implemented and verified on its own.
- **Independently verifiable**: Each task has a `verify` command that proves it works.
- **Small and focused**: If a task description exceeds 3 paragraphs, split it.

### Step 5 — Assign Tiers

Assign a `tier` to each task based on complexity and risk:

| Tier | Signal | Files | Cost estimate |
|------|--------|-------|---------------|
| `lite` | Config, renaming, CRUD, simple additions, documentation | 1–2 | ~$0.15–0.30 |
| `standard` | New business logic, service classes, non-trivial endpoints | 3–5 | ~$0.50–1.00 |
| `adversarial` | Auth, payments, multi-service contracts, security-sensitive, >5 criteria | many | ~$1.50–3.00 |

**Tier assignment rules:**

- Default to `lite` when in doubt — it is always safe.
- Upgrade to `standard` when the task introduces non-trivial logic that benefits from an independent review pass.
- Upgrade to `adversarial` only when correctness is critical and mistakes are expensive (auth, payments, data migrations, public APIs).
- If the user has not configured the ralph harness, keep all tasks at `lite` for full backward compatibility.

Set derived fields automatically:

| Field | `lite` | `standard` | `adversarial` |
|-------|--------|------------|---------------|
| `max_retries` | `0` | `2` | `3` |
| `criteria_count` | — | 5 (default) | 7 (default) |
| `evaluator_model` | — | same as `model` | same as `model` |

### Step 6 — Quiz the User

Present the task breakdown to the user:

- Total number of tasks
- Tier distribution (how many lite / standard / adversarial)
- Execution order and parallelism (same priority = parallel)
- Dependencies between tasks
- Ask: "Is the granularity right? Too coarse? Too fine?"
- Ask: "Any missing tasks? Any tasks that should be combined?"
- Ask: "Any tier assignments you'd like to change?"

Adjust based on feedback.

### Step 7 — Write Output Files

Output directory: `.local-development/tasks/{branch-name}/`

Create the following structure:

```
.local-development/tasks/{branch}/
├── manifest.json        # Task index with order and dependencies
├── PROMPT.md            # Ralph execution instructions
├── progress.txt         # Empty execution log
├── task-1/
│   └── task.json        # Full task definition
├── task-2/
│   └── task.json
└── task-N/
    └── task.json
```

Create each directory if it does not exist.

---

## manifest.json Schema

```json
{
  "feature": "TICKET-ID",
  "title": "Human-readable title",
  "branch": "branch-slug",
  "base_branch": "main",
  "tasks": [
    {
      "id": "T1",
      "dir": "task-1",
      "title": "Short imperative title",
      "priority": 1,
      "blocked_by": [],
      "status": "pending",
      "tier": "lite"
    }
  ]
}
```

The `tasks` array in `manifest.json` is the index only — just enough for ralph to find the next eligible task. Full task details live in `task-N/task.json`.

---

## task-N/task.json Schema

```json
{
  "id": "T1",
  "title": "Short imperative title",
  "model": "sonnet",
  "effort": "medium",
  "status": "pending",
  "priority": 1,
  "blocked_by": [],
  "tier": "lite",
  "max_retries": 0,
  "files": {
    "create": ["path/to/new/file.ext"],
    "modify": ["path/to/existing/file.ext"],
    "read": ["path/to/reference/file.ext"]
  },
  "what": "Detailed implementation description including context, approach, and specifics.",
  "done_when": [
    "Criterion 1",
    "Criterion 2",
    "All tests pass"
  ],
  "verify": "test-runner-command --filter TestName"
}
```

For `standard` and `adversarial` tiers, include additional fields:

```json
{
  "id": "T3",
  "tier": "standard",
  "max_retries": 2,
  "criteria_count": 5,
  "evaluator_model": "sonnet",
  ...
}
```

### Field Rules

| Field | Rule |
|---|---|
| `id` | Sequential: T1, T2, T3... |
| `title` | Short imperative sentence (e.g., "Create policy validation service") |
| `model` | Suggested Claude model: `opus` for complex reasoning/architecture, `sonnet` for standard implementation (default), `haiku` for simple edits/config |
| `effort` | Claude effort level: `max` for complex tasks needing deep thinking, `high` for substantial work, `medium` for standard tasks (default), `low` for trivial changes |
| `status` | Always `"pending"` for new tasks |
| `priority` | Integer. Same priority = can run in parallel |
| `blocked_by` | Array of task IDs. Use `blocked_by`, NOT `depends_on` |
| `tier` | `"lite"` \| `"standard"` \| `"adversarial"`. Default `"lite"` |
| `max_retries` | `0` for lite, `2` for standard, `3` for adversarial |
| `criteria_count` | Number of evaluation criteria (standard/adversarial only). Default: 5 for standard, 7 for adversarial |
| `evaluator_model` | Model for the adversarial evaluator (standard/adversarial only). Default: same as `model` |
| `files.create` | Files that will be created by this task |
| `files.modify` | Existing files that will be modified |
| `files.read` | Files to read for context (not modified) |
| `what` | Detailed description. See special rules below |
| `done_when` | Array of acceptance criteria. MUST end with "All tests pass" |
| `verify` | Real shell command using auto-detected test runner |

---

## Special Task Rules

### Model and Effort Selection

Assign `model` and `effort` based on task complexity:

| Complexity | model | effort | Examples |
|-----------|-------|--------|----------|
| **Trivial** | `haiku` | `low` | Config changes, renaming, imports, documentation |
| **Simple** | `sonnet` | `medium` | CRUD endpoints, tests following existing patterns, adding fields |
| **Standard** | `sonnet` | `high` | New endpoints with business logic, service classes, integration tests |
| **Complex** | `opus` | `high` | Multi-file refactoring, architectural decisions, debugging, complex algorithms |
| **Critical** | `opus` | `max` | Core infrastructure changes, security-sensitive code, complex data migrations |

When in doubt, default to `sonnet` + `medium`.

### TDD Enforcement

Every task MUST include tests. The implementation order within each task is:

1. Write tests FIRST
2. Implement the feature
3. Verify tests pass

The `done_when` array MUST always end with `"All tests pass"`.

### API Spec Update

If the project maintains an API spec (OpenAPI, Swagger, AsyncAPI, etc.):

- Add the task's endpoint to the spec document
- The `verify` command should validate the spec is valid
- Include this in the `what` field: "Update API spec with the new endpoint definition"
- Skip this if the project does not maintain an API spec

### Multi-Service Contract Mapping

When a task spans multiple services or layers (e.g., a gateway, an API aggregation layer, a backend service), the `what` field MUST explicitly document:

- The contract each layer expects (input/output shapes, types, enums)
- The mapping between layers (field renaming, type conversions, enum transformations)
- Any fields added, removed, or transformed at each boundary

---

## Ralph Support Files

After writing all task files, create two additional files in the output directory:

### PROMPT.md

```markdown
# Ralph Execution Prompt

You are executing tasks from `manifest.json` in this directory.

## Stack (MANDATORY)
Read `.claude/rules/project-stack.mdc` before starting any task. Load all skills listed there. Follow the test runner, lint command, and patterns defined in that file.

## Loop

1. Read `manifest.json`
2. Find the highest-priority task with status `"pending"` where ALL `blocked_by` tasks have status `"done"`
3. Read the full task definition from `{dir}/task.json`
4. Implement the task following TDD: write tests first, then implement
5. Run the `verify` command to confirm it passes
6. Update the task status to `"done"` in BOTH `manifest.json` and `{dir}/task.json`
7. Append progress to `progress.txt`
8. Use the conventional-commits skill to commit with the task ID in the scope (e.g., `feat(T1): implement validation service`)
9. Repeat from step 1

## Tier Behavior

- **lite**: Implement and commit directly after tests pass.
- **standard**: After implementation, ralph-harness will spawn an evaluator. Wait for PASS before committing.
- **adversarial**: ralph-harness runs contract negotiation first, then the generator-evaluator loop. Do not commit until PASS.

If running without ralph-harness (plain claude --resume), treat all tiers as lite.

## Completion

When ALL tasks in `manifest.json` have status `"done"`, output:

<promise>COMPLETE</promise>

## Rules

- One task at a time
- Never skip the verify step
- Never mark a task as done if verify fails
- If a task is blocked, move to the next eligible task
- If stuck after 3 attempts on a task, mark it as `"blocked"` and move on
```

### progress.txt

```
# Progress Log — {feature title}
```

(Empty file with just the header line.)

---

## Post-Write Summary

After creating all files, present to the user:

```
Files created:
  manifest: .local-development/tasks/{branch}/manifest.json
  prompt:   .local-development/tasks/{branch}/PROMPT.md
  progress: .local-development/tasks/{branch}/progress.txt
  tasks:    task-1/task.json ... task-N/task.json

Task breakdown:
  Total:         {N} tasks
  Tiers:         {X} lite / {Y} standard / {Z} adversarial
  Parallel:      Tasks {list} can start immediately (no blockers)
  Order:         T1 → T2 → T3,T4 (parallel) → T5

To run with plain claude (all tasks treated as lite):
  cd <project-root>
  claude --resume .local-development/tasks/{branch}/PROMPT.md

To run with ralph harness (tier-aware):
  cd <project-root>
  bun plugins/task-lifecycle/scripts/ralph-harness.js . tasks/{branch} --all
```

---

## Backward Compatibility

If the user has not set up the ralph harness:

- Assign `tier: "lite"` to all tasks
- Set `max_retries: 0` for all tasks
- Omit `criteria_count` and `evaluator_model`
- The plain `claude --resume PROMPT.md` workflow works unchanged

The per-task directory structure is always created (even for lite-only runs) because ralph reads from `manifest.json` + `task-N/task.json` in all modes.

---

## Rules

- **Vertical slices** — each task is thin but complete across all layers.
- **`blocked_by`, not `depends_on`** — this is the field name in the schema.
- **`verify` must be a real command** — auto-detect the test runner, do not guess.
- **TDD is mandatory** — tests first, implementation second. `done_when` ends with "All tests pass".
- **API spec for endpoints** — if the project maintains an API spec, include spec update in endpoint tasks.
- **Multi-service contract mapping in `what`** — when multiple layers are involved, document all contracts and the mapping between them.
- **This skill is stack-agnostic** — detect everything from the project's manifest files and conventions.
- **Never hardcode paths** — resolve relative to the project root.
- **Auto-detect default branch** — never assume `main` without checking.
- **Reference other skills by name** — never by file path.
- **Always create ralph support files** — PROMPT.md and progress.txt alongside manifest.json.
- **Default tier is `lite`** — never assign a higher tier without clear justification.
