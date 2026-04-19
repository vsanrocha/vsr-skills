---
name: autoresearch
description: Run controlled experiments on approved research proposals. Validates hypotheses, executes A/B tests, records results in TSV, and updates proposal status.
---

Run controlled experiments on approved research proposals to improve the task-lifecycle workflow or project-specific configurations.

## Usage

- `/autoresearch <proposal-id>` — run experiment for a specific proposal
- `/autoresearch --list` — list all proposals with their status
- `/autoresearch --batch approved` — run all approved proposals sequentially

## Mode: --list

1. Determine research scope directories:
   - **Workflow (global):** `~/.agents/research/workflow/proposals/`
   - **Project (local):** `{project}/.local-development/research/proposals/`

2. Read all `.md` files from both directories.

3. Parse the YAML frontmatter of each proposal to extract: `id`, `scope`, `status`, `priority`, `category`.

4. Display a table:

```
ID                                  Scope     Status      Priority  Category
────────────────────────────────────────────────────────────────────────────
2026-04-04-haiku-for-simple-eval    workflow  approved    high      model-selection
2026-04-05-test-partitioning        project   proposed    medium    token-efficiency
2026-04-06-php-specialist-agent     workflow  rejected    low       agent-specialization
```

5. Show summary counts: `N proposed | N approved | N validated | N rejected | N inconclusive`.

## Mode: --batch approved

1. Run `--list` logic to find all proposals with `status: approved`.
2. For each approved proposal, execute the single-proposal workflow below (same as `/autoresearch <proposal-id>`).
3. After all experiments complete, display a summary table of results.

## Mode: Single Proposal (`/autoresearch <proposal-id>`)

### Step 1 — Locate and Read Proposal

1. Search for `<proposal-id>.md` in both research directories:
   - `~/.agents/research/workflow/proposals/<proposal-id>.md`
   - `{project}/.local-development/research/proposals/<proposal-id>.md`

2. If not found, report error and stop.

3. Read the full proposal file. Parse frontmatter and body sections:
   - `## Observation` — what was observed
   - `## Hypothesis` — what we believe will improve
   - `## Suggested Experiment` — how to test it
   - `## Evidence` — supporting data

### Step 2 — Validate Proposal

Check that the proposal is experiment-ready:

| Check | Criteria | If missing |
|-------|----------|------------|
| Hypothesis | Contains a testable claim with clear if/then structure | Ask user to refine the hypothesis |
| Metric | At least one measurable metric with a threshold | Ask user to define success criteria |
| Experiment design | Has control group, treatment group, and sample size | Draft a design and ask for approval |
| Status | Must be `approved` (not `proposed` or `rejected`) | Ask user to approve first, or pass `--force` |

If any check fails, report what's missing and stop. Do NOT proceed with incomplete experiment design.

### Step 3 — Create Experiment Directory

1. Determine the research root based on the proposal's `scope`:
   - `workflow` → `~/.agents/research/workflow/`
   - `project` → `{project}/.local-development/research/`

2. Create the experiment directory:
   ```
   {research_root}/experiments/{today}-{slug}/
   ```
   Where `{today}` is `YYYY-MM-DD` and `{slug}` is derived from the proposal ID.

3. Create subdirectory `data/` for supporting files.

### Step 4 — Write design.md

Write `{experiment_dir}/design.md` with the following structure:

```markdown
# Experiment: {proposal title}

**Proposal:** {proposal-id}
**Date:** {today}
**Scope:** {workflow|project}
**Category:** {category from proposal}

## Hypothesis

{Copy from proposal}

## Design

### Control Group
{Current behavior — describe what stays the same}

### Treatment Group
{Proposed change — describe what is different}

### Sample
- Size: {N tasks/invocations}
- Selection: {how tasks are chosen — e.g., "last 10 completed tasks with evaluator data"}
- Budget: {token/cost limit for the experiment}

### Metrics
| Metric | Measurement | Success Threshold |
|--------|------------|-------------------|
| {primary metric} | {how measured} | {threshold from proposal} |
| {secondary metric} | {how measured} | {threshold} |

### Failure Criteria
{When to abort or declare failure — from proposal}

## Execution Plan
{Step-by-step what the agent will do — numbered list}
```

**Ask the user to review and approve design.md before proceeding to execution.**

### Step 5 — Execute Experiment

Execute based on experiment type:

#### Replay Experiments (model selection, prompt variants)
- Find completed tasks with existing output (generator code, evaluator scores).
- Re-run the target phase (evaluator, generator, etc.) with the treatment configuration.
- Compare treatment results against control (existing) results.
- Use `plugins/task-lifecycle/scripts/evaluator.js` for re-evaluation if available.

#### Analysis Experiments (token efficiency, quality gates)
- Read `metrics.jsonl` from `.local-development/` directories.
- Aggregate and compare metrics across the relevant dimension.
- No new API calls needed — pure data analysis.

#### Live Experiments (parallelism, agent specialization)
- Inform the user that live experiments run on the NEXT N tasks.
- Write a config overlay file to `{experiment_dir}/config-override.json`.
- The config override will be picked up by ralph-harness.js on next run.
- Results are collected after tasks complete.

For each variant (control/treatment), record:
- `experiment_id` — matches directory name
- `variant` — "control" or "treatment"
- `metric_name` — what was measured
- `metric_value` — the measurement
- `tokens` — tokens consumed (if applicable)
- `cost` — cost in USD (if applicable)
- `status` — "success", "failure", or "error"

### Step 6 — Record Results in results.tsv

Write `{experiment_dir}/results.tsv` with tab-separated values:

```
experiment_id	variant	metric_name	metric_value	tokens	cost	status	notes
2026-04-10-haiku-eval	control	score_task_3_pagination	8	12000	0.21	success	opus baseline
2026-04-10-haiku-eval	treatment	score_task_3_pagination	8	1800	0.02	success	haiku run
```

Also **append** a summary row to the master `{research_root}/results.tsv`:

```
experiment_id	variant	metric_name	metric_value	tokens	cost	status	notes
2026-04-10-haiku-eval	summary	agreement_rate	0.82	-	0.45	validated	haiku viable with conditions
```

If the master `results.tsv` does not exist, create it with the header row first.

### Step 7 — Write analysis.md

Write `{experiment_dir}/analysis.md`:

```markdown
# Analysis: {experiment title}

**Date:** {today}
**Duration:** {how long the experiment took}
**Total cost:** {sum of all variant costs}

## Results Summary

{2-3 sentence summary of what happened}

## Data

{Key findings from results.tsv — highlight the most important metrics}

| Metric | Control | Treatment | Delta | Significant? |
|--------|---------|-----------|-------|-------------|
| {metric} | {value} | {value} | {+/-value} | {yes/no} |

## Verdict: {VALIDATED | REJECTED | INCONCLUSIVE}

{Explanation of the verdict — why this result, what confidence level}

## Recommendation

{If VALIDATED: specific config change to apply — model, parameter, prompt}
{If REJECTED: what we learned, whether to retry with different parameters}
{If INCONCLUSIVE: what additional data would help, suggested follow-up}

## Proposed Config Change

{Only if VALIDATED — the exact change to make}

\`\`\`json
{
  "phase": "evaluator",
  "condition": "criteria_count <= 4 AND no security criteria",
  "model": "claude-haiku-4-5-20251001",
  "previous": "claude-opus-4-6"
}
\`\`\`
```

### Step 8 — Update Proposal Status

1. Read the original proposal file.
2. Update the `status` field in the YAML frontmatter:
   - `validated` — experiment confirms the hypothesis
   - `rejected` — experiment disproves the hypothesis
   - `inconclusive` — not enough data or mixed results
3. Add an `experiment` field to the frontmatter linking to the experiment directory:
   ```yaml
   experiment: experiments/{date}-{slug}
   experiment_date: {today}
   ```
4. Write the updated proposal file back.

### Step 9 — Report to User

Present a concise summary:

```
## Experiment Complete: {title}

**Verdict:** {VALIDATED ✅ | REJECTED ❌ | INCONCLUSIVE ⚠️}
**Cost:** ${total_cost}
**Key finding:** {one sentence}

Results: {path to results.tsv}
Analysis: {path to analysis.md}

{If VALIDATED: "Recommended config change written to analysis.md. Apply it? (y/n)"}
```

## Proposal Template Reference

When agents need to write new proposals (via research-reminder hook or manually), they should follow this template:

```markdown
---
id: "{date}-{slug}"
scope: workflow | project
status: proposed
priority: low | medium | high
category: model-selection | token-efficiency | skill-improvement | agent-specialization | parallelism | quality-gates | developer-experience
observed_in:
  project: "{project-name}"
  task: "{task-id}"
  session: "{session-id}"
  phase: "{phase}"
created: {YYYY-MM-DD}
---

# {Title — clear description of what could be improved}

## Observation

{What was observed during execution — specific, with data}

## Hypothesis

{Testable claim — "If we change X, then Y will improve by Z%"}

## Suggested Experiment

### Design
{Control group, treatment group, sample size}

### Metric
{Primary and secondary metrics with thresholds}

### Data needed
{What existing data is required}

### Expected outcome
{What each result means for the workflow}

## Evidence

{Links to metrics.jsonl lines, costs, durations — concrete data}
```

## Research Directory Structure

```
~/.agents/research/workflow/          # Global workflow research
├── proposals/                        # Agent-written improvement ideas
├── experiments/                      # Executed experiments
│   └── {date}-{slug}/
│       ├── design.md
│       ├── results.tsv
│       ├── analysis.md
│       └── data/
└── results.tsv                       # Master results log

{project}/.local-development/research/  # Project-specific research
├── proposals/
├── experiments/
│   └── {date}-{slug}/
│       ├── design.md
│       ├── results.tsv
│       ├── analysis.md
│       └── data/
└── results.tsv
```

## Principles

1. **Annotate, don't act.** Agents observe and write proposals. Humans approve.
2. **One variable at a time.** Each experiment changes exactly one thing.
3. **Fixed budget.** Experiments use the same task set for fair comparison.
4. **Measure, then decide.** No changes without data. Gut feelings become hypotheses.
5. **Simple wins.** If removing a step produces equal quality, remove it.
6. **Human gatekeeper.** No experiment runs without human approval. No config change applies without human confirmation.
