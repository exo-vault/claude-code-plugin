#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ExoVault context injection hook for Claude Code.
 * Calls /api/agent/hook-context and prints the context block to stdout.
 * Claude Code captures stdout from sync hooks and injects it as context.
 *
 * Usage (called by Claude Code hooks, not directly):
 *   echo '{"session_id":"abc","prompt":"hello"}' | node inject-context.js session_start
 *   echo '{"session_id":"abc","prompt":"hello"}' | node inject-context.js prompt_submit
 *
 * Config resolution (first match wins):
 *   1. EXOVAULT_AGENT_KEY / EXOVAULT_API_URL env vars
 *   2. .exovault/config.json (walk up from CWD)
 *   3. ~/.exovault-mcp/config.json (global fallback)
 */

const path = require("path");
const fs = require("fs");
const { resolveConfig, SESSIONS_DIR } = require("./shared-config.js");

const INJECT_TIMEOUT_MS = 5_000;
const SESSION_START_TIMEOUT_MS = 8_000;
const STALE_SESSION_HOURS = 24;

// Session directory — overridable for testing
let _sessionsDir = SESSIONS_DIR;

/**
 * Build the request body for /api/agent/hook-context.
 */
function buildHookRequest(input, event) {
  const body = {
    sessionId: input.session_id || "unknown",
    event,
  };

  if (input.prompt) {
    body.prompt = input.prompt;
  }

  body.agentType = "claude_code";

  return body;
}

/**
 * Get the session state file path for a given session ID.
 */
function getSessionFilePath(sessionId) {
  return path.join(_sessionsDir, `${sessionId}.json`);
}

/**
 * Read session state (injectedMemoryIds) from file.
 * Returns { injectedMemoryIds: string[] } or null if not found/stale.
 */
function readSessionState(sessionId) {
  try {
    const filePath = getSessionFilePath(sessionId);
    const stat = fs.statSync(filePath);

    // Clean up stale files (>24h old)
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > STALE_SESSION_HOURS * 60 * 60 * 1000) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      return null;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write session state to file. Creates the sessions directory if needed.
 */
function writeSessionState(sessionId, state) {
  try {
    fs.mkdirSync(_sessionsDir, { recursive: true, mode: 0o700 });
    const filePath = getSessionFilePath(sessionId);
    fs.writeFileSync(filePath, JSON.stringify(state), { mode: 0o600 });
  } catch {
    // Non-critical — dedup just won't work for this session
  }
}

/**
 * Append new memory IDs to an existing session state file.
 */
function appendToSessionState(sessionId, newMemoryIds) {
  const existing = readSessionState(sessionId);
  const currentIds = existing ? existing.injectedMemoryIds || [] : [];
  const merged = [...new Set([...currentIds, ...newMemoryIds])];
  writeSessionState(sessionId, { injectedMemoryIds: merged });
}

/**
 * Clean up stale session files older than STALE_SESSION_HOURS.
 * Best-effort, non-blocking.
 */
function cleanupStaleSessions() {
  try {
    if (!fs.existsSync(_sessionsDir)) return;
    const files = fs.readdirSync(_sessionsDir);
    const cutoff = Date.now() - STALE_SESSION_HOURS * 60 * 60 * 1000;
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const filePath = path.join(_sessionsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch { /* ignore individual file errors */ }
    }
  } catch { /* ignore */ }
}

/**
 * Call /api/agent/hook-context and return the response.
 */
async function fetchHookContext(apiUrl, agentKey, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiUrl}/api/agent/hook-context`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null; // Fail silently — never block the agent
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build the "not configured" guidance message.
 * Printed to stdout on session_start — Claude Code captures it as context.
 */
function buildNotConfiguredMessage() {
  return (
    "ExoVault plugin installed but not configured.\n" +
    "Run: npx exovault connect <your-agent-key>\n" +
    "Get your key at https://exovault.co/dashboard/agents"
  );
}

/**
 * Main entry point — reads stdin, fetches context, prints to stdout.
 */
async function main() {
  const event = process.argv[2];
  if (event !== "session_start" && event !== "prompt_submit") {
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
    if (event === "session_start") {
      process.stdout.write(buildNotConfiguredMessage());
    }
    process.exit(0);
  }

  const body = buildHookRequest(input, event);
  const timeoutMs = event === "session_start" ? SESSION_START_TIMEOUT_MS : INJECT_TIMEOUT_MS;

  // For prompt_submit, load existing session state for dedup
  if (event === "prompt_submit") {
    const state = readSessionState(input.session_id);
    if (state && state.injectedMemoryIds && state.injectedMemoryIds.length > 0) {
      body.excludeMemoryIds = state.injectedMemoryIds;
    }
  }

  const result = await fetchHookContext(config.apiUrl, config.agentKey, body, timeoutMs);

  if (!result) {
    process.exit(0); // API failure — fail silently
  }

  // Update session state with newly injected memory IDs
  const sessionId = input.session_id;
  if (sessionId && result.injectedMemoryIds && result.injectedMemoryIds.length > 0) {
    if (event === "session_start") {
      writeSessionState(sessionId, { injectedMemoryIds: result.injectedMemoryIds });
    } else {
      appendToSessionState(sessionId, result.injectedMemoryIds);
    }
  }

  // Print context block to stdout — Claude Code captures this
  if (result.contextBlock) {
    process.stdout.write(result.contextBlock);
  }

  // Periodically clean up stale session files (non-blocking, best-effort)
  if (event === "session_start") {
    cleanupStaleSessions();
  }
}

/**
 * Override sessions directory (for testing only).
 */
function _setSessionsDirForTest(dir) {
  _sessionsDir = dir;
}

// Export for testing, execute when run directly
if (typeof module !== "undefined") {
  module.exports = {
    buildHookRequest,
    buildNotConfiguredMessage,
    getSessionFilePath,
    readSessionState,
    writeSessionState,
    appendToSessionState,
    cleanupStaleSessions,
    fetchHookContext,
    _setSessionsDirForTest,
    INJECT_TIMEOUT_MS,
    SESSION_START_TIMEOUT_MS,
    STALE_SESSION_HOURS,
  };
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    () => process.exit(0), // Silently swallow all errors
  );
}
