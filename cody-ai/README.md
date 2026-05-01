# Cody — AI Coding Assistant

> A terminal-based AI coding agent powered by Claude. Understands your codebase, runs commands, handles git, executes tests, and more — all through natural language.

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/your-org/cody-ai/main/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/your-org/cody-ai/main/install.ps1 | iex
```

### Manual install (all platforms)

```bash
git clone https://github.com/your-org/cody-ai ~/.cody-ai
cd ~/.cody-ai && npm install
npm link   # or: ln -s ~/.cody-ai/bin/cody.js /usr/local/bin/cody
```

## Setup

Set your Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com)):

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Add to ~/.bashrc or ~/.zshrc
```

## Usage

Navigate to any project and start Cody:

```bash
cd your-project
cody
```

Or run a one-shot request and exit:

```bash
cody "explain the auth middleware"
cody "run the tests and fix any failures"
cody "stage everything and write a commit message"
```

## What Cody can do

Cody has a set of built-in tools it uses automatically depending on your request:

| Tool | What it does |
|------|-------------|
| `read_file` | Read any file in your project |
| `write_file` | Create or edit files |
| `list_directory` | Explore the project structure |
| `run_command` | Run shell commands (tests, git, builds, etc.) |
| `search_code` | Grep across the codebase |

### Example requests

```
"What does this codebase do? Give me an overview."
"Explain the getUserById function in src/db/users.js"
"Run the tests for src/api/auth.test.js — fix anything that's failing"
"Stage all my changes and write a commit message"
"Find every place we call the Stripe API"
"Refactor the payment handler to use async/await"
"Add input validation to the POST /users endpoint"
"Set up a basic CI workflow for GitHub Actions"
```

## Slash commands

While in the interactive session:

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/reset` | Clear conversation history |
| `/context` | Show what Cody knows about your project |
| `/tools` | List all available tools |
| `/plugin-help` | Guide to writing plugins |
| `/exit` | Quit |

## Plugins

Extend Cody with custom tools by dropping a `.js` file into:

- `~/.cody/plugins/` — available in all projects
- `.cody/plugins/` — available only in this project

**Example plugin** (`~/.cody/plugins/my-tools.js`):

```javascript
export default {
  name: 'My Tools',
  description: 'Custom workflow tools',
  tools: [
    {
      name: 'deploy',
      description: 'Deploy to staging environment',
      input_schema: {
        type: 'object',
        properties: {
          environment: { type: 'string', description: 'staging or production' }
        },
        required: ['environment']
      },
      execute: async ({ environment }, cwd) => {
        const { execSync } = await import('child_process');
        return execSync(`./scripts/deploy.sh ${environment}`, { cwd, encoding: 'utf8' });
      }
    }
  ]
};
```

Restart Cody — it will auto-discover the plugin.

See the `plugins/docker.js` file for a full example.

## How it works

1. **Context building** — On startup, Cody scans your project directory, builds a file tree, and reads key config files (package.json, pyproject.toml, README, etc.) to understand your project.

2. **Agentic loop** — Your request is sent to Claude along with the project context and tool definitions. Claude decides which tools to use, executes them, observes the results, and continues until the task is complete.

3. **Streaming** — Claude's responses stream to your terminal in real time, so you see progress as it happens.

4. **Conversation memory** — Each session maintains conversation history, so you can follow up on previous requests.

## Requirements

- Node.js 18+
- Anthropic API key
- git (for git-related features)
