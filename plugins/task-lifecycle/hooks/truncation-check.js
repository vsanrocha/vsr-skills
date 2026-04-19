#!/usr/bin/env bun

// PostToolUse hook — Grep|Bash
// Detects truncated output and advises Claude to re-run with narrower scope.

const TRUNCATION_MARKERS = [
  "Output too large",
  "output was truncated",
  "truncated to",
  "...truncated...",
  "Results truncated",
  "[Truncated]",
  "too many results",
];

const input = JSON.parse(await Bun.stdin.text());
const { tool_name, tool_input, tool_response } = input;

const response = typeof tool_response === "string" ? tool_response : JSON.stringify(tool_response ?? "");

// Check for explicit truncation markers
const explicitTruncation = TRUNCATION_MARKERS.some((marker) =>
  response.toLowerCase().includes(marker.toLowerCase())
);

// Heuristic: Grep with suspiciously few lines of output
let heuristicTruncation = false;
if (tool_name === "Grep" && !explicitTruncation) {
  const lineCount = response.split("\n").filter((l) => l.trim()).length;
  if (lineCount > 0 && lineCount < 5) {
    heuristicTruncation = true;
  }
}

if (explicitTruncation || heuristicTruncation) {
  const filePath = tool_input?.file_path ?? tool_input?.path ?? tool_input?.command ?? "<target>";
  const reason = explicitTruncation
    ? "Output was truncated by the tool."
    : "Grep returned fewer than 5 lines — output may be truncated or scope too broad.";

  console.error(`[truncation-check] ${reason}`);

  console.log(
    JSON.stringify({
      additionalContext: `WARNING: ${reason} Read the full file at ${filePath} or re-run with narrower scope (single directory, stricter glob).`,
    })
  );
} else {
  console.log(JSON.stringify({}));
}
