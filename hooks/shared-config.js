/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shared configuration for ExoVault Claude Code hooks.
 * Both capture-turn.js and inject-context.js import from here.
 */

const path = require("path");
const fs = require("fs");

const FETCH_TIMEOUT_MS = 10_000;

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "~";

/** Default config file path — same as the MCP server. */
const CONFIG_PATH = path.join(HOME_DIR, ".exovault-mcp", "config.json");

/** Default sessions directory for hook state tracking. */
const SESSIONS_DIR = path.join(HOME_DIR, ".exovault-mcp", "sessions");

/**
 * Walk up from startDir looking for `.exovault/config.json`.
 * Returns parsed config object or null if not found or invalid.
 * Stops when it reaches the filesystem/drive root.
 */
function findLocalConfig(startDir) {
  if (!startDir) return null;

  let dir = path.isAbsolute(startDir) ? startDir : path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, ".exovault", "config.json");
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.agentKey) return parsed;
        // JSON is valid but agentKey is missing — warn and keep walking
        process.stderr.write(`[exovault] Warning: ${candidate} has no agentKey field, skipping\n`);
      } catch {
        // File exists (confirmed by existsSync above) but has invalid JSON — warn and continue
        process.stderr.write(`[exovault] Warning: invalid JSON in ${candidate}, skipping\n`);
      }
    }
    const parent = path.dirname(dir);
    // Reached filesystem root
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve agent key and API URL from env vars, falling back to local project
 * config, then global config file. Returns { agentKey, apiUrl } or null if
 * not configured.
 *
 * Resolution order (highest to lowest):
 *   1. Env vars EXOVAULT_AGENT_KEY / EXOVAULT_API_URL
 *   2. CWD-local .exovault/config.json (walk up from cwd or process.cwd())
 *   3. Global ~/.exovault-mcp/config.json
 */
function resolveConfig(cwd) {
  // 1. Env vars take priority (operator override)
  let agentKey = process.env.EXOVAULT_AGENT_KEY || "";
  let apiUrl = process.env.EXOVAULT_API_URL || "";

  if (agentKey) {
    return {
      agentKey,
      apiUrl: (apiUrl || "https://exovault.co").replace(/\/+$/, ""),
    };
  }

  // 2. CWD-local .exovault/config.json (walk up)
  const localConfig = findLocalConfig(cwd || process.cwd());
  if (localConfig && localConfig.agentKey) {
    return {
      agentKey: localConfig.agentKey,
      apiUrl: (localConfig.apiUrl || "https://exovault.co").replace(/\/+$/, ""),
    };
  }

  // 3. Fall back to global config file
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const config = JSON.parse(raw);
    if (config.agentKey) {
      return {
        agentKey: config.agentKey,
        apiUrl: (config.apiUrl || "https://exovault.co").replace(/\/+$/, ""),
      };
    }
  } catch {
    // Config file missing or invalid — that's fine
  }

  return null;
}

module.exports = {
  resolveConfig,
  findLocalConfig,
  CONFIG_PATH,
  SESSIONS_DIR,
  FETCH_TIMEOUT_MS,
};
