#!/usr/bin/env bun

/**
 * test-failure-check.js — PostToolUse hook (matcher: Bash)
 *
 * Detects test command failures and suggests capturing debugging patterns
 * as [LEARN] blocks in the learnings system.
 */

const TEST_COMMAND_PATTERNS = [
  /\bnpm\s+test\b/,
  /\bpnpm\s+test\b/,
  /\byarn\s+test\b/,
  /\bpytest\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
  /\bcomposer\s+test\b/,
  /\bphp\s+artisan\s+test\b/,
  /\bphpunit\b/,
];

const FAILURE_MARKERS = ['FAIL', 'FAILED', 'Error', 'AssertionError'];

function isTestCommand(command) {
  return TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

function hasFailureInOutput(output) {
  if (!output) return false;
  return FAILURE_MARKERS.some((marker) => output.includes(marker));
}

function main() {
  const chunks = [];

  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      process.stdout.write(JSON.stringify({}));
      return;
    }

    const command = input.tool_input?.command || '';
    const exitCode = input.tool_response?.exit_code;
    const output = input.tool_response?.output || '';

    if (!isTestCommand(command)) {
      process.stdout.write(JSON.stringify({}));
      return;
    }

    const failedByExitCode = typeof exitCode === 'number' && exitCode !== 0;
    const failedByOutput = hasFailureInOutput(output);

    if (!failedByExitCode && !failedByOutput) {
      process.stdout.write(JSON.stringify({}));
      return;
    }

    const result = {
      additionalContext: [
        'Test failure detected. If you identified a root cause or debugging pattern,',
        'consider capturing it for future sessions using a [LEARN] block:',
        '',
        '[LEARN]',
        'Category: Testing',
        'Rule: <the pattern or rule that would have prevented this failure>',
        'Mistake: <what went wrong>',
        'Correction: <how it was fixed>',
        '[/LEARN]',
        '',
        'This will be stored in the learnings DB and surfaced in future sessions.',
      ].join('\n'),
    };

    process.stdout.write(JSON.stringify(result));
  });
}

const timeout = setTimeout(() => {
  process.stderr.write('test-failure-check: timeout\n');
  process.stdout.write(JSON.stringify({}));
  process.exit(0);
}, 5000);
timeout.unref();

main();
