#!/usr/bin/env bun

// PostToolUse hook: marks session as having file edits.
// stop-verify.js checks this flag before running tsc/lint/tests.

const input = JSON.parse(await Bun.stdin.text());
const sessionId = input.session_id || "default";
await Bun.write(`/tmp/stop-verify-dirty-${sessionId}`, "1");
console.log(JSON.stringify({}));
