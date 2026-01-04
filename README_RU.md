# AI Orbiter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

[English version](README.md)

> *«А одно кольцо — чтобы всеми править...»*

<p align="center">
  <img src="assets/logo.webp" alt="AI Orbiter" width="100%" height="auto">
</p>

Современная разработка с ИИ-агентами превратилась в бесконечное жонглирование инструментами. У Claude Code свои настройки, у OpenCode — свои, а Gemini и Codex требуют отдельного внимания. Каждый раз, когда вы добавляете новый MCP-сервер, вам приходится вручную синхронизировать разрозненные JSON, JSONC и TOML файлы в разных углах системы.

**AI Orbiter** — это единый центр управления вашим ИИ-окружением. Мы превращаем хаос конфигураций в стройную экосистему, где все инструменты работают как одно целое.

---

### 🛰️ Установка

```bash
curl -fsSL https://raw.githubusercontent.com/alesha-pro/ai-orbiter/main/install.sh | bash
```

После установки:
```bash
ai-orbiter start
```

<details>
<summary>Ручная установка</summary>

```bash
git clone https://github.com/alesha-pro/ai-orbiter.git ~/.ai-orbiter
cd ~/.ai-orbiter && pnpm install && pnpm build && pnpm link --global
```

</details>

<details>
<summary>Удаление</summary>

```bash
cd ~/.ai-orbiter && pnpm unlink --global && cd ~ && rm -rf ~/.ai-orbiter
```

</details>

**Требования:**
- Node.js ≥18, pnpm
- Build tools для компиляции SQLite:
  - **macOS:** `xcode-select --install`
  - **Linux:** `sudo apt install build-essential python3` 

---

### ✨ Ключевые возможности

- **Unified Registry** — SQLite как единый источник истины для всех MCP-серверов
- **Умные патчи** — AST-сохраняющее редактирование (комментарии и форматирование остаются на месте)
- **Fingerprinting** — дедупликация одинаковых серверов, даже если они называются по-разному
- **Conflict Resolver** — интеллектуальное разрешение конфликтов при импорте

---

### 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        AI Orbiter                           │
├─────────────────────────────────────────────────────────────┤
│  apps/web          │  Next.js 14 + tRPC (UI и API)          │
│  packages/core     │  Ядро: БД, адаптеры, fingerprinting    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
     │ Claude Code │  │  OpenCode   │  │  Codex CLI  │
     │   (JSONC)   │  │   (JSON)    │  │   (TOML)    │
     └─────────────┘  └─────────────┘  └─────────────┘
```

**Поток данных:**
1. **Scan** — адаптеры читают конфиг-файлы клиентов
2. **Normalize** — преобразование в унифицированный `McpServer`
3. **Fingerprint** — SHA256-хеш конфигурации (без имени!)
4. **Dedup** — серверы с одинаковым fingerprint объединяются
5. **Apply** — запись обратно через AST-парсер (jsonc-parser / @iarna/toml)

---

### 🔀 Conflict Resolver

Когда у серверов **одинаковое имя**, но **разные конфигурации** — возникает конфликт.

**Пример:** `my-mcp` в Claude имеет `env: {KEY: "abc"}`, а в OpenCode — `env: {KEY: "xyz"}`.

**Варианты разрешения:**

| Действие | Что происходит |
|----------|----------------|
| **Merge** | Выбираем конфиг одного клиента как базовый, применяем ко всем |
| **Separate** | Переименовываем: `my-mcp-claude`, `my-mcp-opencode` |
| **Skip** | Игнорируем конфликт (сервер не импортируется) |

Также доступно **bulk-разрешение** — применить одно решение ко всем конфликтам сразу.

---

### 🛠 Экосистема

| Клиент | Формат | Конфиг |
|--------|--------|--------|
| Claude Code | JSONC | `~/.claude.json` |
| OpenCode | JSON | `~/.config/opencode/opencode.json` |
| Codex CLI | TOML | `~/.codex/config.toml` |
| Gemini CLI | JSON | `~/.config/gemini/settings.json` |

**Стек:** Next.js 14, tRPC, SQLite (better-sqlite3), Turborepo.

---

### 🚀 Разработка

```bash
git clone https://github.com/alesha-pro/ai-orbiter.git
cd ai-orbiter
pnpm install && pnpm build
pnpm dev              # http://127.0.0.1:3457
```

---

### 📦 CLI

```bash
ai-orbiter start              # Запуск (порт 3457)
ai-orbiter start -p 8080      # Кастомный порт
ai-orbiter start --no-browser # Без автооткрытия браузера
```

---

*Лицензия MIT. Сделано для тех, кто предпочитает управлять инструментами, а не подстраиваться под них.*
