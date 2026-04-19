---
name: insights
description: Shows a research digest: pending proposals by scope, recent experiment verdicts, metric trends from the last 10 ralph runs, and anomaly alerts.
---

Generate a research insights digest. Work through each step below, then output a single consolidated markdown summary.

## Step 1 — Locate Research Directories

Identify both research scopes:

- **Workflow scope** (global): `~/.agents/research/workflow/`
- **Project scope** (current project): `.local-development/research/`

Check if each directory exists. If a scope is missing, skip it and note it in the output.

## Step 2 — Count Pending Proposals

For each scope that exists, count `.md` files inside `proposals/`:

```shell
# Workflow proposals
ls ~/.agents/research/workflow/proposals/*.md 2>/dev/null | wc -l

# Project proposals
ls .local-development/research/proposals/*.md 2>/dev/null | wc -l
```

A proposal is considered **pending** if its file does not contain `status: validated`, `status: rejected`, or `status: inconclusive` in its frontmatter or body.

Count pending vs total for each scope separately.

## Step 3 — List Recent Experiment Results

For each scope, find the 5 most recent experiment directories (sorted by directory name, descending):

```shell
# Workflow experiments (last 5)
ls -d ~/.agents/research/workflow/experiments/*/ 2>/dev/null | sort -r | head -5

# Project experiments (last 5)
ls -d .local-development/research/experiments/*/ 2>/dev/null | sort -r | head -5
```

For each experiment found, read its `analysis.md` and extract:
- The experiment name (directory slug)
- The verdict: look for a line starting with `**Verdict:**`, `**Conclusion:**`, or `**Result:**`, or the first heading after `## Conclusion`
- If no verdict line is found, summarize in one word: `pending`

Show at most 5 experiments total (prioritize the most recent, mix scopes if both exist).

## Step 4 — Metric Trends

Find the most recent `metrics.jsonl` file for this project:

```shell
ls .local-development/*/metrics.jsonl 2>/dev/null | sort -r | head -1
```

If found, read the last 10 entries (each line is a JSON object) and compute:

| Metric | How to compute |
|--------|---------------|
| **Cost trend** | Average `cost_usd` of last 10 runs. Flag if latest run > 2x the average of prior 9. |
| **Retry rate** | Count runs where `retry_round > 0` divided by total. Flag if > 30%. |
| **Evaluator score trend** | Average of all values in `evaluator_scores` arrays across runs. Flag if average < 6.0. |

If `metrics.jsonl` does not exist or has fewer than 2 entries, skip this step and note it.

## Step 5 — Highlight Anomalies

Flag any of the following as **anomalies** in the output:

- **Cost spike**: latest run cost > 2x rolling average
- **High retry rate**: retry rate > 30% in last 10 runs
- **Low evaluator scores**: average evaluator score < 6.0
- **Proposal backlog**: > 10 pending proposals total across both scopes

Each anomaly gets a `⚠️` marker in the output.

## Step 6 — Output the Digest

Print a concise markdown summary with this structure:

```markdown
# Research Insights — <YYYY-MM-DD>

## Proposals
| Scope    | Pending | Total |
|----------|---------|-------|
| Workflow | N       | N     |
| Project  | N       | N     |

## Recent Experiments
| Experiment | Scope | Verdict |
|------------|-------|---------|
| slug       | WF/PR | validated / rejected / inconclusive / pending |
...

## Metric Trends (last 10 runs)
- **Avg cost/run:** $X.XX
- **Retry rate:** X% (N/10 runs had retries)
- **Avg evaluator score:** X.X / 10

## Anomalies
- ⚠️ <description if any>

(No anomalies detected.) ← if none
```

Keep the output under 40 lines. Omit sections that have no data.
