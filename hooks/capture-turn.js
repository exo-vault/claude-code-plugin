#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ExoVault turn capture hook for Claude Code.
 * Captures user prompts and assistant responses, POSTs to ingest-turn API.
 *
 * Usage (called by Claude Code hooks, not directly):
 *   echo '{"prompt":"hello"}' | node capture-turn.js user
 *   echo '{"last_assistant_message":"hi"}' | node capture-turn.js assistant
 *
 * Config resolution (first match wins):
 *   1. EXOVAULT_AGENT_KEY / EXOVAULT_API_URL env vars
 *   2. .exovault/config.json (walk up from CWD)
 *   3. ~/.exovault-mcp/config.json (global fallback)
 */

const { resolveConfig, CONFIG_PATH, FETCH_TIMEOUT_MS } = require("./shared-config.js");

const MAX_CONTENT_LENGTH = 50_000;
const MIN_CONTENT_LENGTH = 5;

/**
 * Extract content from hook input based on role.
 * Returns null if content should be skipped.
 */
function extractContent(input, role) {
  if (role === "user") {
    return input.prompt || null;
  }

  if (role === "assistant") {
    // Skip re-entry: stop_hook_active means Stop hook already fired
    if (input.stop_hook_active) return null;
    return input.last_assistant_message || null;
  }

  return null;
}

/**
 * Prepare the ingest-turn request body.
 */
function buildRequestBody(content, role, sessionId) {
  // Truncate oversized content
  let trimmed = content;
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    trimmed = trimmed.slice(0, MAX_CONTENT_LENGTH) + "\n[truncated]";
  }

  const body = {
    content: trimmed,
    role,
    agentId: "claude_code",
  };

  if (sessionId) {
    body.agentRunId = sessionId;
  }

  return body;
}

/**
 * POST a turn to the ExoVault ingest-turn API.
 */
async function postTurn(apiUrl, agentKey, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    await fetch(`${apiUrl}/api/agent/ingest-turn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main entry point — reads stdin, extracts content, POSTs to API.
 */
async function main() {
  const role = process.argv[2];
  if (role !== "user" && role !== "assistant") {
    process.exit(0);
  }

  // Read JSON from stdin
  let data = "";
  process.stdin.setEncoding("utf8");

  await new Promise((resolve) => {
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", resolve);
  });

  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0); // Invalid JSON — skip silently
  }
  const cwd = input.cwd || process.cwd();
  const config = resolveConfig(cwd);
  if (!config) {
    process.exit(0); // Not configured — silently skip
  }

  const content = extractContent(input, role);

  if (!content || content.length < MIN_CONTENT_LENGTH) {
    process.exit(0); // Too short or empty — skip
  }

  const body = buildRequestBody(content, role, input.session_id);
  await postTurn(config.apiUrl, config.agentKey, body);
}

// Export for testing, execute when run directly
if (typeof module !== "undefined") {
  module.exports = {
    extractContent,
    buildRequestBody,
    postTurn,
    resolveConfig,
    MAX_CONTENT_LENGTH,
    MIN_CONTENT_LENGTH,
    FETCH_TIMEOUT_MS,
    CONFIG_PATH,
  };
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    () => process.exit(0), // Silently swallow all errors
  );
}
