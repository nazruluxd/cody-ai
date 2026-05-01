#!/usr/bin/env node
// bin/cody.js — Cody CLI entry point

import { createInterface } from 'readline';
import { Agent } from '../src/agent.js';
import { buildContext } from '../src/context.js';
import { builtinTools } from '../src/tools.js';
import { loadPlugins, pluginGuide } from '../src/plugins.js';
import { ui } from '../src/ui.js';

const VERSION = '1.0.0';

// ─── Help text ───────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${ui.bold('Cody — AI Coding Assistant')}  ${ui.gray(`v${VERSION}`)}

${ui.bold('Usage:')}
  cody                    Start interactive session in current directory
  cody "your request"     Run a single request and exit
  cody --help             Show this help

${ui.bold('Slash commands:')}
  /help                   Show this help
  /reset                  Clear conversation history
  /context                Show the current project context summary
  /tools                  List all available tools (built-in + plugins)
  /plugin-help            Guide to writing your own plugins
  /exit                   Exit Cody

${ui.bold('Example requests:')}
  "Explain what the auth middleware does"
  "Run the tests for src/utils.js and fix any failures"
  "Stage all my changes and write a commit message"
  "Refactor getUserById to use async/await"
  "Find everywhere we call the payments API"
  "Add error handling to the fetchUser function"
  "What does this codebase do? Give me a high-level overview"

${ui.bold('Plugins:')}
  Drop a .js plugin file into ${ui.cyan('~/.cody/plugins/')} (global) or 
  ${ui.cyan('.cody/plugins/')} in your project. Type /plugin-help for the full guide.

${ui.bold('Environment:')}
  ANTHROPIC_API_KEY       Required — your Anthropic API key
  `);
}

// ─── Slash command handler ───────────────────────────────────────────────────

async function handleSlashCommand(input, agent, context) {
  const parts = input.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'help':
      showHelp();
      return true;

    case 'reset':
      agent.reset();
      ui.success('Conversation history cleared.');
      return true;

    case 'context':
      console.log();
      ui.info('Project context:');
      console.log(ui.gray('  ' + context.summary));
      console.log();
      console.log(ui.dim(
        context.systemContext
          .split('\n')
          .slice(0, 40)
          .map(l => '  ' + l)
          .join('\n')
      ));
      console.log();
      return true;

    case 'tools':
      console.log();
      ui.info(`${agent.tools.length} tool(s) available:\n`);
      for (const tool of agent.tools) {
        console.log(`  ${ui.cyan(tool.name)}`);
        console.log(ui.gray(`    ${tool.description}`));
      }
      console.log();
      return true;

    case 'plugin-help':
      console.log('\n' + pluginGuide() + '\n');
      return true;

    case 'exit':
    case 'quit':
      console.log(ui.gray('\nGoodbye!\n'));
      process.exit(0);
      return true;

    default:
      ui.warn(`Unknown command: /${cmd}  — type /help for available commands.`);
      return true;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`cody v${VERSION}`);
    process.exit(0);
  }

  // Check for API key early
  if (!process.env.ANTHROPIC_API_KEY) {
    ui.error('ANTHROPIC_API_KEY is not set.\n');
    ui.hint('Add it to your shell profile:');
    ui.hint('  export ANTHROPIC_API_KEY=sk-ant-...\n');
    ui.hint('Get a key at: https://console.anthropic.com/');
    process.exit(1);
  }

  const cwd = process.cwd();

  ui.banner(VERSION);

  // Build codebase context
  process.stdout.write(ui.gray('  Scanning project...'));
  const context = await buildContext(cwd);
  process.stdout.write(` ${ui.green('✓')}\n`);
  ui.info(`${context.projectName} · ${context.fileCount} files indexed`);

  // Load plugins
  const plugins = await loadPlugins(cwd);
  const pluginTools = plugins.flatMap(p => p.tools);
  if (plugins.length > 0) {
    ui.info(`Plugins: ${plugins.map(p => ui.cyan(p.name)).join(', ')}`);
  }

  const allTools = [...builtinTools, ...pluginTools];

  // Create the agent
  const agent = new Agent({ context, tools: allTools, cwd });

  // ── Single-shot mode (argument passed) ──────────────────────────────────
  const singleShot = args.filter(a => !a.startsWith('-')).join(' ').trim();
  if (singleShot) {
    console.log();
    await agent.chat(singleShot);
    console.log();
    process.exit(0);
  }

  // ── Interactive REPL mode ────────────────────────────────────────────────
  console.log();
  ui.hint('Ask anything about your code. /help for commands. Ctrl+C to exit.');
  console.log();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 100,
  });

  // Handle Ctrl+C gracefully
  rl.on('SIGINT', () => {
    console.log(ui.gray('\nGoodbye!'));
    process.exit(0);
  });

  // Prompt loop
  function prompt() {
    rl.question(ui.prompt(), async (input) => {
      input = input.trim();

      if (!input) {
        prompt();
        return;
      }

      if (input.startsWith('/')) {
        await handleSlashCommand(input, agent, context);
        prompt();
        return;
      }

      console.log();
      await agent.chat(input);
      console.log();
      prompt();
    });
  }

  prompt();
}

main().catch(err => {
  console.error('\n' + ui.red('Fatal error: ') + err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
