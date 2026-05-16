# ExoVault — Claude Code Plugin

Encrypted durable memory for Claude Code. 40+ MCP tools for notes, memories, tasks, knowledge graph, and agent messaging. Automatic turn capture and context injection.

## Install

1. Install the plugin:

```bash
claude plugin install github:exo-vault/claude-code-plugin
```

2. Configure your agent key:

```bash
npx exovault connect <your-agent-key>
```

Get your key at [exovault.co/dashboard/agents](https://exovault.co/dashboard/agents)

3. Restart Claude Code

## What You Get

- **40+ MCP tools** — notes, memories, tasks, knowledge graph, agent messaging, pipelines
- **Automatic turn capture** — every prompt and response saved to your encrypted vault
- **Context injection** — relevant memories loaded at session start and on each prompt
- **Per-project config** — different agent keys for different projects/vaults

## Multiple Projects

Each project can use a different agent key (and vault):

```bash
cd ~/project-a && npx exovault connect exv_key_a
cd ~/project-b && npx exovault connect exv_key_b
```

Config is stored in `.exovault/config.json` per project (auto-added to `.gitignore`).

## Configuration

### Agent key resolution (priority order)

1. **Environment variables**: `EXOVAULT_AGENT_KEY` / `EXOVAULT_API_URL`
2. **Project config**: `.exovault/config.json` (walks up from project root)
3. **Global config**: `~/.exovault-mcp/config.json`

### Global setup (one key for all projects)

```bash
npx exovault connect <your-agent-key> --global
```

## Manual Setup (Alternative)

If you prefer not to use the plugin system, see [MANUAL_SETUP.md](MANUAL_SETUP.md).

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No MCP tools showing | Restart Claude Code. Verify `npx exovault-mcp-server` runs. |
| "Not configured" message | Run `npx exovault connect <key>` in your project directory. |
| Invalid agent key | Regenerate at [exovault.co/dashboard/agents](https://exovault.co/dashboard/agents). |
| Turns not appearing | Check that hooks are active: `claude plugin list` should show exovault. |
