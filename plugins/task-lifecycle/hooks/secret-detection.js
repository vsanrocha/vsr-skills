#!/usr/bin/env bun

const SECRET_PATTERNS = [
  { name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "OpenAI API Key", regex: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "GitHub Token", regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: "Password assignment", regex: /password\s*=\s*['"][^'"]{3,}['"]/ },
  { name: "Secret assignment", regex: /secret\s*=\s*['"][^'"]{3,}['"]/ },
  { name: "Bearer token", regex: /Bearer\s+[a-zA-Z0-9._\-]{20,}/ },
  { name: "Private key field", regex: /private_key\s*[:=]\s*['"][^'"]{10,}['"]/ },
  { name: "PEM private key", regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+)?PRIVATE KEY-----/ },
];

const TEST_FILE_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /test_.*\.(js|ts|py)$/,
  /__tests__\//,
  /\/tests?\//,
  /\/fixtures?\//,
];

function isSkippedFile(filePath) {
  if (!filePath) return false;
  const basename = filePath.split("/").pop() || "";

  // Skip .env files
  if (basename === ".env" || basename.startsWith(".env.") || basename.startsWith(".env_")) {
    return true;
  }

  // Skip test files
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      return true;
    }
  }

  return false;
}

function detectSecrets(content) {
  const hits = [];
  for (const { name, regex } of SECRET_PATTERNS) {
    if (regex.test(content)) {
      hits.push(name);
    }
  }
  return hits;
}

const raw = await Bun.stdin.text();
const input = JSON.parse(raw);

const filePath = input?.tool_input?.file_path ?? "";
const content = input?.tool_input?.content ?? "";

if (isSkippedFile(filePath)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

const hits = detectSecrets(content);

if (hits.length === 0) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

const patternList = hits.join(", ");
console.error(`[secret-detection] Blocked write to ${filePath || "(unknown)"}: detected ${patternList}`);

console.log(JSON.stringify({
  decision: "block",
  reason: `Potential secret detected: ${patternList}. Remove hardcoded secrets before writing.`,
}));
