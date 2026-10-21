# AgentDeck ⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6.svg?logo=windows)](https://github.com/kanishakusingai/agentdeck)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron%2044-47848F.svg?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/UI-React%2019%20%2B%20TypeScript-61DAFB.svg?logo=react)](https://react.dev/)

> **AgentDeck** is an open-source, personal desktop workspace and super-app for AI coding agents (inspired by [BridgeMind](https://www.bridgemind.ai/)). It multiplexes multiple agent terminals, provides push-to-talk voice dictation with local Whisper AI, and lets you orchestrate CLI agents in a unified, dockable layout.

---

## ✨ Features

- **Multi-Agent Dockview Canvas**: Dock, split, tab, and arrange multiple terminal panes side-by-side using `dockview-react` and `xterm.js`.
- **Works with Any Coding Agent**: Native support for **Claude Code**, **OpenAI Codex**, **OpenCode**, **Kiro CLI**, PowerShell, and Bash.
- **Dedicated Terminal Composer**: Each active terminal pane has its own advanced message input with slash-command discovery and multi-line support.
- **Push-to-Talk Voice Dictation**: Hands-free voice coding powered by a local HuggingFace Whisper model running directly on your machine.
- **Persistent Workspaces**: Preserves your terminal layouts, open tabs, and workspaces across app restarts.
- **Full-Text Thread Search**: Search across transcripts and conversation histories with instant filtering.
- **Native Windows Controls**: Native minimize, maximize, and close title bar controls with custom blue/zinc dark theme styling.
- **100% Local & Private**: No cloud telemetry or third-party servers required. Your API keys and source code stay on your computer.

---

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/) (v44) with [electron-vite](https://electron-vite.org/)
- **Frontend**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS v4](https://tailwindcss.com/)
- **Terminal & Layout**: `@xterm/xterm`, `@lydell/node-pty`, `dockview-react`
- **Voice / AI**: `@huggingface/transformers` (local Whisper speech-to-text)
- **Testing**: [Vitest](https://vitest.dev/) (unit tests) & [Playwright](https://playwright.dev/) (end-to-end Electron tests)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ or v24 recommended)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kanishakusingai/agentdeck.git
   cd agentdeck
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start in development mode**:
   ```bash
   npm run dev
   ```

---

## 📦 Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Launch the app in development with live-reloading |
| `npm test` | Run Vitest unit tests |
| `npm run typecheck` | Run TypeScript checks across main, preload, and renderer processes |
| `npm run test:e2e` | Run Playwright end-to-end test suite |
| `npm run dist` | Package and build the Windows installer executable (`.exe`) |

---

## 🏗️ Architecture

```
agentdeck/
├── src/
│   ├── main/           # Electron main process (PTYs, process runner, store, voice worker)
│   ├── preload/        # Secure typed contextBridge IPC bridge
│   ├── renderer/       # React 19 UI (dockview canvas, terminal panels, composers)
│   └── shared/         # Shared TypeScript interfaces, types, and schemas
├── e2e/                # Playwright end-to-end Electron tests
└── docs/               # Specifications and architecture documentation
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/kanishakusingai/agentdeck/issues).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free for personal and commercial use.
