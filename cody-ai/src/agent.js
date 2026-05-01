// src/agent.js — Agentic loop using Claude with streaming and tool use

import Anthropic from '@anthropic-ai/sdk';
import { ui } from './ui.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 20;  // Safety cap on agentic loops

const SYSTEM_PROMPT = (context) => `\
You are Cody, an expert AI coding assistant running in the terminal.
You have deep knowledge of the user's codebase and help them write, understand, test, refactor, and manage code.

## Capabilities
You can read files, write files, search code, list directories, and run shell commands.
When you need to understand something, read the relevant files first.
When asked to run tests, use the appropriate test runner for the project (jest, pytest, cargo test, go test, etc.).
When asked to do git operations, use git commands via run_command.

## Behavior
- Be concise and direct. Skip unnecessary preamble.
- When writing a commit message, follow conventional commits format when appropriate.
- When editing a file, read it first so you understand the full context.
- When running commands, show the user what you're doing and why.
- For multi-step tasks, think through the steps, then execute them.
- If a command fails, analyze the error and try to fix it automatically.
- Never make up file contents — always read files before editing them.

## Codebase Context
${context.systemContext}

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

export class Agent {
  constructor({ context, tools, cwd }) {
    this.context = context;
    this.tools = tools;
    this.cwd = cwd;
    this.history = [];
    this.client = new Anthropic();  // Reads ANTHROPIC_API_KEY from env

    // Build tool map for fast lookup
    this.toolMap = {};
    for (const tool of tools) {
      this.toolMap[tool.name] = tool;
    }

    // Format tools for the API (strip the 'execute' function)
    this.apiTools = tools.map(({ name, description, input_schema }) => ({
      name,
      description,
      input_schema,
    }));
  }

  reset() {
    this.history = [];
  }

  async chat(userMessage) {
    this.history.push({ role: 'user', content: userMessage });

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      let assistantContent = [];
      let currentText = '';
      let inToolUse = false;

      try {
        const stream = await this.client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT(this.context),
          tools: this.apiTools,
          messages: this.history,
        });

        // Stream text output to terminal
        stream.on('text', (text) => {
          process.stdout.write(text);
          currentText += text;
        });

        stream.on('content_block_start', (evt) => {
          if (evt.content_block.type === 'tool_use') {
            // Flush any pending text
            if (currentText) {
              assistantContent.push({ type: 'text', text: currentText });
              currentText = '';
            }
            inToolUse = true;
          }
        });

        stream.on('content_block_stop', () => {
          inToolUse = false;
        });

        const message = await stream.finalMessage();

        // Ensure trailing newline after streamed text
        if (currentText && !currentText.endsWith('\n')) {
          process.stdout.write('\n');
        }

        // Record the full assistant message in history
        this.history.push({ role: 'assistant', content: message.content });

        // If no tool calls, we're done
        if (message.stop_reason !== 'tool_use') {
          break;
        }

        // Execute all tool calls
        const toolUseBlocks = message.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const toolCall of toolUseBlocks) {
          ui.toolStart(toolCall.name, toolCall.input);

          let resultContent;
          let isError = false;

          const tool = this.toolMap[toolCall.name];
          if (!tool) {
            resultContent = `Tool "${toolCall.name}" not found.`;
            isError = true;
          } else {
            try {
              resultContent = await tool.execute(toolCall.input, this.cwd);
            } catch (err) {
              resultContent = `Error: ${err.message}`;
              isError = true;
            }
          }

          // Display tool output
          if (resultContent) {
            ui.toolResult(resultContent, isError);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: String(resultContent ?? ''),
            ...(isError && { is_error: true }),
          });
        }

        // Add tool results to history and continue the loop
        this.history.push({ role: 'user', content: toolResults });
        console.log(); // Space before next assistant response

      } catch (err) {
        if (err.status === 401) {
          ui.error('Invalid API key. Set ANTHROPIC_API_KEY in your environment.');
        } else if (err.status === 429) {
          ui.error('Rate limit hit. Please wait a moment and try again.');
        } else if (err.status >= 500) {
          ui.error(`Anthropic API error (${err.status}). Try again in a moment.`);
        } else {
          ui.error(`Error: ${err.message}`);
        }
        // Remove the last user message so the history stays valid
        this.history.pop();
        break;
      }
    }

    if (rounds >= MAX_TOOL_ROUNDS) {
      ui.warn('Reached maximum tool call limit. Starting fresh context for next message.');
    }
  }
}
