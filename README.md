# AI Orbiter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[Русская версия](README_RU.md)

> *"One ring to rule them all..."*

<p align="center">
  <img src="assets/logo.webp" alt="AI Orbiter" width="100%" height="auto">
</p>

Modern development with AI agents has become endless tool juggling. Claude Code has its own settings, OpenCode has its own, and Gemini and Codex require separate attention. Every time you add a new MCP server, you have to manually sync scattered JSON, JSONC, and TOML files across your system.

**AI Orbiter** is a unified control center for your AI environment. We turn configuration chaos into a coherent ecosystem where all tools work as one.

---

### 🛰️ Installation

```bash
curl -fsSL https://raw.githubusercontent.com/alesha-pro/ai-orbiter/main/install.sh | bash
```

After installation:
```bash
ai-orbiter start
```

<details>
<summary>Manual installation</summary>

```bash
git clone https://github.com/alesha-pro/ai-orbiter.git ~/.ai-orbiter
cd ~/.ai-orbiter && pnpm install && pnpm build && pnpm link --global
```

</details>

<details>
<summary>Uninstall</summary>

```bash
cd ~/.ai-orbiter && pnpm unlink --global && cd ~ && rm -rf ~/.ai-orbiter
```

</details>

**Requirements:**
- Node.js ≥18, pnpm
- Build tools for SQLite compilation:
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt install build-essential python3`

---

### ✨ Key Features

- **Unified Registry** — SQLite as single source of truth for all MCP servers
- **Smart Patches** — AST-preserving editing (comments and formatting stay intact)
- **Fingerprinting** — deduplication of identical servers, even if named differently
- **Conflict Resolver** — intelligent conflict resolution during import

---

### 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Orbiter                           │
├─────────────────────────────────────────────────────────────┤
│  apps/web          │  Next.js 14 + tRPC (UI & API)          │
│  packages/core     │  Core: DB, adapters, fingerprinting    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ Claude Code │  │  OpenCode   │  │  Codex CLI  │
     │   (JSONC)   │  │   (JSON)    │  │   (TOML)    │
     └─────────────┘  └─────────────┘  └─────────────┘
```

**Data Flow:**
1. **Scan** — adapters read client config files
2. **Normalize** — transform to unified `McpServer`
3. **Fingerprint** — SHA256 hash of configuration (without name!)
4. **Dedup** — servers with identical fingerprint are merged
5. **Apply** — write back via AST parser (jsonc-parser / @iarna/toml)

---

### 🔀 Conflict Resolver

When servers have the **same name** but **different configurations** — a conflict arises.

**Example:** `my-mcp` in Claude has `env: {KEY: "abc"}`, while in OpenCode — `env: {KEY: "xyz"}`.

**Resolution options:**

| Action | What happens |
|--------|--------------|
| **Merge** | Choose one client's config as base, apply to all |
| **Separate** | Rename: `my-mcp-claude`, `my-mcp-opencode` |
| **Skip** | Ignore conflict (server not imported) |

Bulk resolution is also available — apply one solution to all conflicts at once.

---

### 🛠 Ecosystem

| Client | Format | Config |
|--------|--------|--------|
| Claude Code | JSONC | `~/.claude.json` |
| OpenCode | JSON | `~/.config/opencode/opencode.json` |
| Codex CLI | TOML | `~/.codex/config.toml` |
| Gemini CLI | JSON | `~/.config/gemini/settings.json` |

**Stack:** Next.js 14, tRPC, SQLite (better-sqlite3), Turborepo.

---

### 🚀 Development

```bash
git clone https://github.com/alesha-pro/ai-orbiter.git
cd ai-orbiter
pnpm install && pnpm build
pnpm dev              # http://127.0.0.1:3457
```

---

### 📦 CLI

```bash
ai-orbiter start              # Start (port 3457)
ai-orbiter start -p 8080      # Custom port
ai-orbiter start --no-browser # Without auto-opening browser
```

---

*MIT License. Made for those who prefer to manage their tools, not adapt to them.*
