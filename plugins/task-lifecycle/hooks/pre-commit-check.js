#!/usr/bin/env bun

/**
 * pre-commit-check.js — PreToolUse hook (matcher: Bash)
 *
 * Validates conventional commit format when `git commit` is detected.
 * Advisory only — warns but does not block the commit.
 *
 * Input:  { "tool_name": "Bash", "tool_input": { "command": "..." } }
 * Output: { "additionalContext": "..." } if invalid, {} if valid or not a commit
 */

const CONVENTIONAL_TYPES = [
  "feat", "fix", "test", "refactor", "chore",
  "docs", "style", "perf", "ci", "build",
];

// Matches: type(scope): summary  or  type: summary
const CONVENTIONAL_PATTERN = /^(feat|fix|test|refactor|chore|docs|style|perf|ci|build)(\([^)]+\))?!?: .+/;

/**
 * Extract commit message from a git commit command string.
 * Handles -m "msg", -m 'msg', heredoc (<<'EOF' ... EOF), and --message=msg.
 */
function extractCommitMessage(command) {
  // Heredoc pattern: git commit ... -m "$(cat <<'EOF'\n...\nEOF\n)"
  // or direct heredoc passed via shell substitution
  const heredocMatch = command.match(/<<['"']?(\w+)['"']?\n([\s\S]*?)\n\1/);
  if (heredocMatch) {
    return heredocMatch[2].trim();
  }

  // -m "message" or -m 'message'
  const mFlagDouble = command.match(/-m\s+"((?:[^"\\]|\\.)*)"/);
  if (mFlagDouble) return mFlagDouble[1];

  const mFlagSingle = command.match(/-m\s+'((?:[^'\\]|\\.)*)'/);
  if (mFlagSingle) return mFlagSingle[1];

  // --message="message" or --message='message'
  const messageFlagDouble = command.match(/--message="((?:[^"\\]|\\.)*)"/);
  if (messageFlagDouble) return messageFlagDouble[1];

  const messageFlagSingle = command.match(/--message='((?:[^'\\]|\\.)*)'/);
  if (messageFlagSingle) return messageFlagSingle[1];

  // -m message (unquoted, single word — rarely useful but handle it)
  const mFlagUnquoted = command.match(/-m\s+(\S+)/);
  if (mFlagUnquoted) return mFlagUnquoted[1];

  return null;
}

/**
 * Validate conventional commit format.
 * Returns null if valid, or an error string if invalid.
 */
function validateCommitMessage(message) {
  // Extract just the subject line (first line)
  const subject = message.split("\n")[0].trim();

  if (!CONVENTIONAL_PATTERN.test(subject)) {
    const type = subject.split(/[(:]/)[0];
    const knownType = CONVENTIONAL_TYPES.includes(type);

    if (!knownType) {
      return `Unknown commit type "${type}". Valid types: ${CONVENTIONAL_TYPES.join(", ")}.`;
    }
    return `Commit message does not match conventional commits format. Expected: type(scope): summary`;
  }

  // Extract summary part (everything after "type(scope): ")
  const summaryMatch = subject.match(/^[a-z]+(?:\([^)]+\))?!?: (.+)$/);
  const summary = summaryMatch ? summaryMatch[1] : subject;

  if (subject.length > 72) {
    return `Subject line is ${subject.length} chars (max 72). Shorten it.`;
  }

  if (summary && /^[A-Z]/.test(summary)) {
    return `Summary should start with a lowercase letter, got: "${summary[0]}".`;
  }

  if (summary && summary.endsWith(".")) {
    return `Summary should not end with a period.`;
  }

  return null;
}

async function main() {
  const raw = await Bun.stdin.text();
  const input = JSON.parse(raw);

  const command = input?.tool_input?.command ?? "";

  // Only activate for git commit commands
  if (!command.includes("git commit")) {
    console.log(JSON.stringify({}));
    return;
  }

  // Skip --amend without message (no new message to validate)
  if (command.includes("--amend") && !command.includes("-m") && !command.includes("--message")) {
    console.log(JSON.stringify({}));
    return;
  }

  const message = extractCommitMessage(command);

  if (!message) {
    // Could not extract message (e.g. interactive commit, --reuse-message, etc.)
    console.error("[pre-commit-check] Could not extract commit message — skipping validation");
    console.log(JSON.stringify({}));
    return;
  }

  const error = validateCommitMessage(message);

  if (error) {
    console.error(`[pre-commit-check] Invalid conventional commit: ${error}`);
    console.log(JSON.stringify({
      additionalContext: [
        `⚠️  Commit message does not follow conventional commits format.`,
        ``,
        `Error: ${error}`,
        ``,
        `Expected format: type(scope): summary (max 72 chars)`,
        `Valid types: ${CONVENTIONAL_TYPES.join(", ")}`,
        ``,
        `Examples:`,
        `  feat(auth): add OAuth2 login flow`,
        `  fix(api): handle null response from upstream`,
        `  chore: update dependencies`,
        ``,
        `Your message: "${message.split("\n")[0]}"`,
      ].join("\n"),
    }));
    return;
  }

  console.error(`[pre-commit-check] Commit message OK: "${message.split("\n")[0]}"`);
  console.log(JSON.stringify({}));
}

main().catch((err) => {
  console.error("[pre-commit-check] Unexpected error:", err.message);
  console.log(JSON.stringify({}));
});
