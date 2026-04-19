---
name: session-quality-analysis
description: >
  Analyze the quality and cost/benefit of a Claude session. Extracts token usage,
  cost breakdown, efficiency metrics, and behavioral patterns from a session JSONL file.
  Use when you want to understand the ROI of a session or identify waste patterns.
---

# Session Quality Analysis

Analyze a session JSONL file and produce a cost/benefit report.

## Input

Provide one of:
- **Session ID** (e.g., `3b7ef735`) — partial or full UUID
- **Branch name** — finds the most recent session on that branch
- **Project path** — analyzes all recent sessions in that project

## Steps

### Step 1 — Locate Session File

Search in `~/.claude/projects/` for the session JSONL matching the input.

```bash
find ~/.claude/projects/ -name "*{session-id}*.jsonl" 2>/dev/null
```

If given a branch name, scan each project's JSONL files for `gitBranch` matching the branch.

### Step 2 — Extract Raw Metrics

Parse the JSONL and compute:

**Token usage:**
- `input_tokens` — direct input (usually tiny, most context is cached)
- `output_tokens` — generated output (main cost driver for quality work)
- `cache_creation_input_tokens` — context written to cache
- `cache_read_input_tokens` — context read from cache

**Cost estimate** (Sonnet pricing):
- Input: $3.00/M tokens
- Output: $15.00/M tokens
- Cache write: $3.75/M tokens
- Cache read: $0.30/M tokens

**Session health signals:**
- Duration (minutes)
- Turn count (assistant turns with usage)
- User message count
- Correction rate = corrections / user messages (target: < 5%)
- Agent spawns (parallel delegation = good)
- Skill invocations

**Tool usage quality:**
- `Bash` used for grep/cat — should use native Grep/Read tools instead
- Files edited without reading first — risk indicator
- Files re-read 3+ times — context loss indicator

### Step 3 — Score Cost/Benefit

```
Cost efficiency = output_tokens / total_cost_usd
  → Higher = more output per dollar

Cache efficiency = cache_read / (cache_write + cache_read)
  → Higher = context reuse is working well

Output ratio = output_tokens / (input + output + cache_write + cache_read)
  → Measures how much of the session produced actual work

Productivity = output_tokens / duration_minutes
  → Tokens generated per minute
```

### Step 4 — Identify Waste Patterns

Flag these as cost waste:
- **Session too long (> 4h)**: context accumulates → cache write explodes. Should `/compact` every ~60 min.
- **Cache write dominates cost**: session ran too long without compacting
- **High Bash-for-grep count**: each unnecessary Bash call wastes output tokens
- **Re-reads (3x+)**: Claude forgot file contents → context was already degraded
- **Edits without reads**: risky and wastes correction cycles

### Step 5 — Generate Report

Output a markdown report with:

```markdown
## Session Quality Report — {session_id_short}

### Cost Breakdown
| Category      | Tokens    | Cost     | % of Total |
|--------------|-----------|----------|------------|
| Output        | {N}K      | ${X}     | {P}%       |
| Cache Write   | {N}K      | ${X}     | {P}%       |
| Cache Read    | {N}K      | ${X}     | {P}%       |
| Input         | {N}K      | ${X}     | {P}%       |
| **TOTAL**     | {N}K      | **${X}** | 100%       |

### Session Health
- Duration: {N} min
- Turns: {N} | User messages: {N}
- Correction rate: {N}% (target: < 5%)
- Agent spawns: {N}
- Files edited: {N} | Files read: {N}

### Waste Signals
- {list of waste patterns found, or "None detected"}

### Cost/Benefit Score
- Output per dollar: {N} tokens/$
- Cache efficiency: {N}% reuse
- Productivity: {N} tok/min

### Verdict
{2-3 sentence summary: was this session worth the cost? What drove it up? What to do differently?}
```

## Quick Run

To generate metrics without LLM interpretation:

```bash
bun ~/.agents/scripts/session-eval.js {session-id} {project-cwd}
```

The eval file is saved to `.local-development/evals/{session-id}-eval.md` in the project.
