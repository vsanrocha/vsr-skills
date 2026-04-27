---
name: task-flow-report
description: Analyze all Claude Code sessions for a Jira task, branch, or session ID — produces a rich interactive HTML artifact showing agents spawned, skills invoked, MCPs called, token breakdown, and session timeline. Use this skill whenever the user asks to "analyze a task flow", "report on a session", "how much did this task cost", "session analysis", "benchmark a task", "analise de sessão", "relatório de task", "quanto custou essa task", "quais agents foram usados", "quais skills foram chamadas", "quais MCPs foram usados", or wants to understand the effort/cost/time/tooling across all sessions for a task. Also triggers when the user provides a Jira ticket ID, branch name, or session ID and wants a flow analysis or tool breakdown.
---

# Task Flow Report

Generates an interactive HTML report analyzing all Claude Code sessions for a task — with full breakdown of agents spawned, skills invoked, MCP calls, native tools, tokens, and session timeline.

## Script

`~/.agents/scripts/task-flow-report.js`

## How It Works

Searches all session JSONL files across `~/.claude/projects/*/` matching sessions by:
1. **Git branch name** containing the search key (e.g., `APR-1698`)
2. **CWD path** containing the search key (catches worktree sessions)
3. **Session ID** direct match

For each matched session it extracts full tool_use records — categorizing tools into:
- **Native**: Read, Write, Edit, Bash, Grep, Glob, etc.
- **Agent calls**: subagent_type, description, foreground/background
- **Skill calls**: skill name and args
- **MCP calls**: grouped by server with tool breakdown

## Usage

```bash
# By Jira ticket, branch name, or any search key
bun ~/.agents/scripts/task-flow-report.js APR-1698

# By session ID
bun ~/.agents/scripts/task-flow-report.js f8075e8a-16ad-4411

# Custom output directory
bun ~/.agents/scripts/task-flow-report.js APR-1698 ~/reports/apr-1698/
```

## Output Files

All saved to `~/.agents/reports/<search-key>/`:

| File | Description |
|------|-------------|
| `report.html` | **Primary artifact** — interactive dark-themed dashboard |
| `report.md` | Markdown summary with tables |
| `sessions.jsonl` | Raw per-session metrics (JSON lines) |
| `summary.json` | Aggregated totals |

## When This Skill Triggers

1. **Identify the search key** — Jira ticket, branch name, or session ID. Ask if not clear.
2. **Run the script**:
   ```bash
   bun ~/.agents/scripts/task-flow-report.js <search-key>
   ```
3. **ALWAYS open the HTML report in the user's default browser immediately after the script finishes.** Do not skip this step — the whole point of the skill is the visual artifact:
   ```bash
   xdg-open ~/.agents/reports/<search-key>/report.html   # Linux
   open ~/.agents/reports/<search-key>/report.html        # macOS
   ```
4. **Present key findings** to the user (brief summary while they look at the report):
   - Sessions count, total duration, total tokens
   - Which agents were spawned and how many times
   - Which skills were invoked
   - Which MCP servers were active and with what intensity
   - Top native tools by usage count

## HTML Report Tabs

| Tab | Content |
|-----|---------|
| **Overview** | Stat cards, token breakdown bar, projects/branches |
| **Skills** | Skill tool invocations + slash commands used |
| **Agents** | Agent calls by type (foreground/background split, descriptions) |
| **MCPs** | MCP servers sorted by usage, tool-level breakdown |
| **Tools** | Native tool usage bar chart |
| **Timeline** | Per-session table with timing and top tools |

## Combining with Ralph Metrics

Ralph loop runs produce `metrics.jsonl` inside `.local-development/<task-dir>/` with cost_usd and methodology fields. To compare methodologies, run this skill for the interactive session and reference the ralph metrics separately for the autonomous loop runs.
