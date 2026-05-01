// src/plugins.js — Plugin loader for Cody

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import os from 'os';

const PLUGIN_DIRS = [
  path.join(os.homedir(), '.cody', 'plugins'),  // Global plugins
  // Project-level plugins (added dynamically based on cwd)
];

/**
 * A plugin is a JS file (ESM) that exports:
 * {
 *   name: string,                    // Plugin display name
 *   description: string,             // What it does
 *   tools: Array<{                   // Array of tools it provides
 *     name: string,
 *     description: string,
 *     input_schema: object,          // JSON Schema for inputs
 *     execute: async (input, cwd) => string  // Must return a string result
 *   }>
 * }
 */

async function loadPluginFile(filePath) {
  try {
    const url = pathToFileURL(filePath).href;
    const mod = await import(url);
    const plugin = mod.default ?? mod;

    if (!plugin.name || !Array.isArray(plugin.tools)) {
      console.warn(`  ⚠ Plugin ${filePath} missing required 'name' or 'tools' export — skipped`);
      return null;
    }

    // Validate each tool
    const validTools = plugin.tools.filter(tool => {
      if (!tool.name || !tool.description || !tool.input_schema || typeof tool.execute !== 'function') {
        console.warn(`  ⚠ Plugin tool "${tool.name}" in ${plugin.name} is malformed — skipped`);
        return false;
      }
      return true;
    });

    return { ...plugin, tools: validTools };
  } catch (err) {
    console.warn(`  ⚠ Failed to load plugin ${filePath}: ${err.message}`);
    return null;
  }
}

export async function loadPlugins(cwd) {
  const searchDirs = [...PLUGIN_DIRS, path.join(cwd, '.cody', 'plugins')];
  const plugins = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    let files;
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.mjs'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(dir, file);
      const plugin = await loadPluginFile(filePath);
      if (plugin) {
        plugins.push(plugin);
      }
    }
  }

  return plugins;
}

/**
 * Returns a formatted guide for writing plugins, for use in /plugin-help
 */
export function pluginGuide() {
  return `
Plugin Guide
============
Create a .js file in ~/.cody/plugins/ (global) or .cody/plugins/ (project-local).

Example plugin file:

  // ~/.cody/plugins/my-tools.js
  export default {
    name: 'My Custom Tools',
    description: 'Extra commands for my workflow',
    tools: [
      {
        name: 'deploy',
        description: 'Deploy the project to staging',
        input_schema: {
          type: 'object',
          properties: {
            environment: { type: 'string', description: 'Target: staging or prod' }
          },
          required: ['environment']
        },
        execute: async ({ environment }, cwd) => {
          // cwd is the project root
          const { execSync } = await import('child_process');
          return execSync(\`./deploy.sh \${environment}\`, { cwd, encoding: 'utf8' });
        }
      }
    ]
  };

Then restart Cody — it will auto-discover the plugin.
`.trim();
}
