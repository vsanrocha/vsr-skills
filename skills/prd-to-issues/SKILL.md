---
name: prd-to-issues
description: Break a PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices. Each issue is rich enough that an AI agent can execute it cold — without re-reading the PRD or re-exploring the repo — including real file paths with line references, contract mappings, test plan, runnable verify command, model/effort hints, out-of-scope guardrails, and gotchas. Use when user wants to convert a PRD to issues, create implementation tickets, or break down a PRD into work items.
---

# PRD to Issues

Break a PRD into independently-grabbable GitHub issues using vertical slices (tracer bullets). Each issue must be **self-contained**: an AI agent picking it up should have everything needed to execute accurately without context outside the issue body.

The bar: if the agent can't ship the slice from the issue alone, the issue is incomplete.

---

## Workflow

### 1. Locate the PRD

Accept input from any of these sources:

- **GitHub issue number/URL**: Fetch with `gh issue view <number> --comments`
- **File path**: Read the file directly
- **Inline text**: Use the text provided in the conversation
- **Conversation context**: If a **prd** / **write-spec** / **grill-me** session just completed, use that context

If the PRD is a GitHub issue, capture its number — every child issue will link back to it.

### 2. Explore the codebase (mandatory)

This step is what makes issues actionable. Do not skip it. Spawn an Explore agent for broad surveys when the codebase is unfamiliar.

**Detect stack and tooling:**

- Check for `composer.json` (PHP), `package.json` (Node), `go.mod` (Go), `pyproject.toml` (Python), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), etc.
- **Test runner** (used in every `Verify` block):
  - `composer.json` → `composer test` or `./vendor/bin/phpunit`
  - `package.json` → inspect `scripts.test`; common: `npm test`, `npx vitest run`, `npx jest`
  - `go.mod` → `go test ./...`
  - `pyproject.toml` → `pytest` or `python -m pytest`
  - `Cargo.toml` → `cargo test`
  - `pom.xml` → `mvn test`
  - `build.gradle` → `./gradlew test`
- **Lint / typecheck** commands (include in verify when project enforces them)
- **Default branch**: `git remote show origin | grep 'HEAD branch' | awk '{print $NF}'`

**Map the slice surface for every layer the PRD touches:**

- Real file paths for create / modify / read-for-context (verify they exist with Glob/Read before writing them into the issue)
- **Reference points as `path:line`** so the agent can jump straight to relevant patterns (e.g., `src/services/auth.ts:42`)
- Existing test files and fixtures to mirror
- API spec files (OpenAPI/Swagger/AsyncAPI) — endpoint slices must update them
- Migration/seed conventions
- Feature flag / config systems
- Logging / telemetry conventions

**Check for repo-level conventions:**

- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `CONTRIBUTING.md` — surface relevant rules in each issue's "Implementation notes"
- Commit convention (Conventional Commits, etc.) — note in the issue
- PR template — note any required sections

### 3. Draft vertical slices

Break the PRD into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end (schema → API → UI → tests), NOT a horizontal slice of one layer.

Slices may be **HITL** (human-in-the-loop — requires architectural decision, design review, or product sign-off) or **AFK** (can be implemented and merged autonomously). Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Each slice is independently executable AND independently verifiable
- If a slice description exceeds 3 paragraphs, split it
- A slice that touches >7 files is a smell — consider splitting
</vertical-slice-rules>

### 4. Assign model and effort hints

For each slice, suggest the Claude model and effort level the executing agent should use:

| Complexity | model | effort | Examples |
|-----------|-------|--------|----------|
| **Trivial** | `haiku` | `low` | Config changes, renaming, imports, documentation |
| **Simple** | `sonnet` | `medium` | CRUD endpoints, tests following existing patterns, adding fields |
| **Standard** | `sonnet` | `high` | New endpoints with business logic, service classes, integration tests |
| **Complex** | `opus` | `high` | Multi-file refactoring, architectural decisions, debugging, complex algorithms |
| **Critical** | `opus` | `max` | Core infrastructure, security-sensitive code, complex data migrations, payments, auth |

When in doubt, default to `sonnet` + `medium`.

### 5. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short imperative name (e.g., "Add policy validation endpoint")
- **Type**: HITL / AFK
- **Model/Effort**: suggested model and effort level
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which PRD user stories this addresses
- **Estimated file count**: rough count of files touched

Then ask:

- Does the granularity feel right? (too coarse / too fine)
- Are dependency relationships correct?
- Should any slices be merged or split further?
- Are HITL vs AFK assignments correct?
- Are model/effort assignments reasonable?
- Any slices missing? Any user stories not covered?

Iterate until the user approves.

### 6. Create the GitHub issues

Create issues in **dependency order** (blockers first) so `Blocked by` references resolve to real issue numbers.

Use `gh issue create --body-file <tmp>` rather than `--body "..."` — issue bodies are long and contain backticks, code fences, and shell-fragile characters. Write the body to a temp file first.

Apply labels for filtering: `slice`, plus `afk` or `hitl`, plus any project-specific labels (e.g., `backend`, `frontend`). Skip labels that don't already exist in the repo (check with `gh label list`).

If the parent PRD is in a milestone, add child issues to the same milestone.

Do NOT close or modify the parent PRD issue — only reference it.

After creating each issue, capture the issue number returned by `gh` so subsequent issues can reference it in `Blocked by`.

---

## Issue Body Template

Use this template verbatim. Every section is required unless marked optional. Empty sections must say "None" — not be omitted, so the agent knows it was considered.

<issue-template>
## Parent PRD

#<prd-issue-number>

## Summary

One or two sentences: what this slice delivers end-to-end and why it exists. Written so a stakeholder skimming the issue list understands the value.

## What to build

A concrete description of the end-to-end behavior across every layer this slice touches (model → service → controller → UI → test). Reference specific sections of the parent PRD rather than duplicating content.

For each layer, state the expected behavior in observable terms (inputs, outputs, side effects). Avoid layer-by-layer implementation steps — describe the *behavior*, not the *recipe*.

If this slice spans multiple services or layers (gateway, API aggregation, backend, worker), include a **Contracts & mappings** subsection (see below).

If the project maintains an API spec (OpenAPI/Swagger/AsyncAPI), state explicitly: "Update `<path/to/spec>` with the new/changed endpoint definitions."

### Contracts & mappings (only if multi-layer)

Document every boundary the slice crosses:

- **Layer A → Layer B**: input shape, output shape, field renames, type conversions, enum transformations, fields added/removed/transformed
- Repeat for each boundary

Without this, the executing agent will guess wrong at integration boundaries.

## Out of scope

Explicit list of things this slice will NOT do, even if tempting. Prevents scope creep by the executing agent.

- Item 1
- Item 2

(If nothing notable, write "None" — do not omit the section.)

## Files

**Create:**
- `path/to/new/file.ext` — purpose

**Modify:**
- `path/to/existing/file.ext:LINE` — what changes (cite the line if the change is localized)

**Read for context (do not modify):**
- `path/to/reference/file.ext:LINE` — why it matters (existing pattern, related logic, fixture source)

(If a section is empty, write "None".)

## Acceptance criteria

Specific, testable, observable. Each criterion should map to at least one test.

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3
- [ ] API spec updated (only if applicable)
- [ ] Lint and typecheck pass
- [ ] All tests pass

## Test plan

Describe what tests the agent must write **before** implementing (TDD).

- **Unit tests**: `path/to/test/file.ext` — what behaviors
- **Integration tests**: `path/to/test/file.ext` — what behaviors
- **Manual verification** (only for UI/UX slices): step-by-step what to click and what to see

Include at least one **negative test** (invalid input, missing auth, wrong state) for any non-trivial behavior.

## Verify

A single, real, runnable shell command (or a short sequence) the agent runs to confirm the slice works. Use the auto-detected test runner — never a placeholder.

```bash
<real command, e.g. npx vitest run path/to/test --reporter=verbose>
```

If the project requires lint/typecheck before merge, include them:

```bash
npx tsc --noEmit && npx eslint path/to/changed/files && npx vitest run path/to/test
```

## Risks & gotchas

Things that could trip up the executing agent. Drawn from the codebase exploration in step 2.

- Race condition risk in `path/to/file.ts:120` — note the existing lock pattern
- Existing tests in `path/to/test.ts` mock the DB — this slice must not (or must, depending on pattern)
- Feature flag `XYZ` controls rollout — slice must be flag-gated

(If none, write "None.")

## Implementation notes

- **TDD**: write tests first, then implement, then run verify.
- **Suggested model**: `sonnet` (or `opus` / `haiku`)
- **Suggested effort**: `medium` (or `low` / `high` / `max`)
- **Patterns to follow**: cite real `path:line` references from step 2 (e.g., "mirror the validator at `src/services/policy.ts:88`")
- **Commit convention**: e.g., Conventional Commits with scope = slice ID
- **Repo rules to honor**: cite `CLAUDE.md`, `AGENTS.md`, etc. if present

## Blocked by

- Blocked by #<issue-number> — <why>

Or "None — can start immediately" if no blockers.

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7

</issue-template>

---

## Special Slice Rules

### TDD Enforcement

Every slice MUST include tests. The implementation order within each slice is:

1. Write tests FIRST (red)
2. Implement the feature across all layers (green)
3. Run `Verify` to confirm

Acceptance criteria MUST always end with `All tests pass` (and `Lint and typecheck pass` if the project enforces them).

### API Spec Update

If the project maintains an API spec (OpenAPI/Swagger/AsyncAPI):

- Add/modify endpoint definitions in the spec file
- Add a checkbox `[ ] API spec updated` to acceptance criteria
- Include spec validation in the `Verify` command if the project has one (e.g., `redocly lint`, `swagger-cli validate`)
- State the spec file path explicitly in `What to build`

Skip entirely if the project does not maintain an API spec.

### Multi-Service Contract Mapping

When a slice spans multiple services or layers, the `Contracts & mappings` subsection MUST document:

- The contract each layer expects (input/output shapes, types, enums)
- The mapping between layers (renames, type conversions, enum transformations)
- Any fields added, removed, or transformed at each boundary

Use concrete TypeScript / JSON shapes where helpful. Without this, the executing agent will guess and miss.

### File Paths Must Exist

Every path under `Files → Modify` and `Files → Read for context` MUST exist in the repo at the time of issue creation. Verify with Glob/Read before writing them. A wrong path is worse than no path — it sends the agent down a dead end.

`Files → Create` paths must follow the project's existing directory conventions (don't invent new top-level dirs without justification).

### Real Commands Only

`Verify` MUST be a real, runnable shell command. Never write `<run tests>`, `npm test # adjust as needed`, or shell pseudocode. If you can't produce a real command, the codebase exploration in step 2 was incomplete — go back.

### Out of Scope Is Mandatory

The `Out of scope` section is required even when empty (write "None"). Forcing the question prevents an agent from over-delivering or scope-creeping into adjacent work.

### Self-Containment Test

Before creating an issue, do this mental check: **if I gave this issue to a fresh agent in a clean checkout, with no access to the PRD or prior conversation, could it execute successfully?** If the answer is no, the issue is incomplete.

---

## Creating the issue with `gh`

Issue bodies are long and contain code fences, backticks, and characters that break shells. Always write the body to a temp file:

```bash
# Write body to a temp file (use the Write tool, not heredoc — works on Windows too)
# Then:
gh issue create \
  --title "<imperative title>" \
  --body-file /tmp/issue-body.md \
  --label slice,afk \
  --milestone "<milestone if any>"
```

Capture the returned issue number for `Blocked by` references in subsequent issues.

If a label doesn't exist, either create it (`gh label create`) or omit it. Don't fail the whole flow on a missing label.

---

## Post-Creation Summary

After creating all issues, present to the user:

```
Issues created:
  Parent PRD:    #<prd-number>
  Slices:        #<n1>, #<n2>, ..., #<nN>

Breakdown:
  Total:         {N} slices
  Type:          {X} AFK / {Y} HITL
  Parallel:      Slices #<list> can start immediately (no blockers)
  Order:         #<n1> → #<n2> → #<n3>,#<n4> (parallel) → #<n5>

Each issue contains:
  - Real file paths (create / modify / read) with line refs where useful
  - Contracts & mappings for multi-layer slices
  - Out-of-scope guardrails
  - Test plan with TDD ordering
  - Runnable verify command (with lint/typecheck if enforced)
  - Risks & gotchas surfaced from the codebase
  - Model/effort hints for the executing agent

Next steps:
  - AFK slices can be picked up by an agent immediately
  - HITL slices need <list reasons> before execution
```

---

## Rules

- **Self-contained issues** — the bar is "agent can ship from the issue alone".
- **Vertical slices** — each issue is thin but complete across all layers.
- **Codebase exploration is mandatory** — file paths, line refs, patterns, conventions all come from real inspection, not guesses.
- **`Verify` must be a real command** — auto-detected runner, executable as written.
- **TDD is mandatory** — tests first, implementation second. Acceptance criteria end with "All tests pass".
- **`Out of scope` is mandatory** — write "None" if empty, never omit.
- **Multi-service contracts must be mapped** — every boundary, every transformation.
- **API spec updates are part of the slice** — if the project maintains one.
- **Paths must exist** — verify before writing into the issue.
- **Stack-agnostic** — detect everything from the project's manifest files and conventions.
- **Auto-detect default branch** — never assume `main`.
- **Create in dependency order** — so `Blocked by` references resolve to real numbers.
- **Use `--body-file`** — never `--body "..."` for rich issue bodies.
- **Do NOT modify the parent PRD issue** — only create child issues that link back.
- **Reference other skills by name** — never by file path.
