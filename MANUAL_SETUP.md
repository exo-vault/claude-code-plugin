# ExoVault — Manual Setup

Encrypted durable memory for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Includes an MCP server (40 tools for notes, memories, tasks, knowledge graph, agent messaging) and automatic turn capture hooks.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed
- An ExoVault account with an agent key (`exv_...`)
- Node.js 18+

## Quick Setup

### 1. Get your agent key

Go to **ExoVault Dashboard > Agents > Connect** and create a new integration. Copy the agent key.

### 2. Add MCP server + hooks to `settings.json`

Open your project's `.claude/settings.json` (or global `~/.claude/settings.json`) and add:

```json
{
  "mcpServers": {
    "exo-vault": {
      "command": "npx",
      "args": ["exovault-mcp-server"],
      "env": {
        "EXOVAULT_AGENT_KEY": "exv_YOUR_KEY_HERE",
        "EXOVAULT_API_URL": "https://exovault.co"
      }
    }
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "EXOVAULT_AGENT_KEY=exv_YOUR_KEY_HERE EXOVAULT_API_URL=https://exovault.co node ~/.exovault-mcp/hooks/capture-turn.js user",
            "timeout": 15
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "EXOVAULT_AGENT_KEY=exv_YOUR_KEY_HERE EXOVAULT_API_URL=https://exovault.co node ~/.exovault-mcp/hooks/capture-turn.js assistant",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

> Replace `exv_YOUR_KEY_HERE` with your actual agent key in all three places (MCP server env + both hooks).

### 3. Install the hook script

```bash
# Create the hooks directory
mkdir -p ~/.exovault-mcp/hooks

# Copy the capture-turn hook
cp plugins/claude-code/hooks/capture-turn.js ~/.exovault-mcp/hooks/capture-turn.js
```

Or as a one-liner using npx (downloads from npm):

```bash
mkdir -p ~/.exovault-mcp/hooks && npx exovault-mcp-server --print-hook > ~/.exovault-mcp/hooks/capture-turn.js
```

### 4. Restart Claude Code

Restart your Claude Code session. You should see:

- **MCP tools** — `list_vaults`, `read_note`, `write_memory`, `search_notes`, etc. (40 tools)
- **Turn capture** — user prompts and assistant responses automatically sent to ExoVault

### 5. Verify

Check the ExoVault dashboard — you should see:
- An active agent session under **Sessions**
- Captured turns appearing after your first prompt/response cycle

## What's Included

### MCP Server (`exovault-mcp-server`)

The MCP server runs via `npx` (no global install needed) and provides 40 tools:

| Category | Tools |
|----------|-------|
| Vault management | `list_vaults`, `create_vault` |
| Notes | `list_notes`, `read_note`, `read_notes`, `create_note`, `update_note`, `delete_note`, `search_notes`, `semantic_search`, `search_and_read` |
| Folders | `list_folders`, `create_folder`, `move_note` |
| Memories | `write_memory`, `read_memories`, `search_memories`, `update_memory`, `archive_memory`, `cleanup_memories`, `get_related_memories`, `context_checkpoint` |
| Tasks | `create_task`, `update_task`, `list_tasks`, `create_plan_tasks` |
| Knowledge graph | `explore_graph`, `add_link`, `remove_link`, `get_links` |
| Agent messaging | `send_message`, `read_messages`, `ack_message`, `list_active_agents` |
| Sessions | `session_start`, `ingest_turn` |
| Documents | `read_document`, `update_document`, `read_docs` |

### Turn Capture Hooks

Two Claude Code hooks that automatically capture conversation turns:

- **`UserPromptSubmit`** — captures the user's prompt before Claude processes it
- **`Stop`** — captures the assistant's final response after Claude stops

Both hooks:
- Run asynchronously (non-blocking) — won't slow down your session
- Have a 15-second timeout
- Silently fail if ExoVault is unreachable
- Truncate messages over 50,000 characters

## Configuration

### Agent key resolution (hooks)

The hook script resolves credentials in this order:

1. **Environment variables** (set inline in the hook command)
2. **Config file** at `~/.exovault-mcp/config.json`

### Agent key resolution (MCP server)

1. **`env` block** in `settings.json` MCP server config
2. **Config file** at `~/.exovault-mcp/config.json`

### Per-project configuration

The MCP server and hooks also check for `.exovault/config.json` in the project directory (walking up parent directories). This allows different projects to use different agent keys.

Resolution order (highest priority first):
1. Environment variables (`EXOVAULT_AGENT_KEY` / `EXOVAULT_API_URL`)
2. Project config (`.exovault/config.json`, walks up from project root)
3. Global config (`~/.exovault-mcp/config.json`)

### Windows notes

On Windows, the inline `EXOVAULT_AGENT_KEY=... node ...` syntax works in Git Bash (which Claude Code uses). If using PowerShell hooks, use:

```json
{
  "type": "command",
  "command": "cmd /c \"set EXOVAULT_AGENT_KEY=exv_YOUR_KEY_HERE && set EXOVAULT_API_URL=https://exovault.co && node %USERPROFILE%\\.exovault-mcp\\hooks\\capture-turn.js user\"",
  "timeout": 15
}
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP tools not showing | Restart Claude Code. Check that `npx exovault-mcp-server` runs without errors. |
| "Invalid agent key" | Regenerate the key in ExoVault Dashboard > Agents. |
| "Gateway connection failed" | Check that `https://exovault.co` is reachable. |
| Turns not appearing | Verify the hook script exists at `~/.exovault-mcp/hooks/capture-turn.js` and the agent key is set. |
| Hook errors | Run manually: `echo '{"prompt":"test"}' | EXOVAULT_AGENT_KEY=exv_... node ~/.exovault-mcp/hooks/capture-turn.js user` |
