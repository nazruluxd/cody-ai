// src/context.js — Scans the working directory and builds codebase context

import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

// Files/dirs always excluded
const HARD_IGNORE = [
  '.git', 'node_modules', '.next', '.nuxt', 'dist', 'build', 'out',
  '__pycache__', '.venv', 'venv', 'env', '.env', 'target', 'vendor',
  '.cache', 'coverage', '.nyc_output', '.turbo', '.svelte-kit',
  '*.min.js', '*.min.css', '*.lock', 'package-lock.json', 'yarn.lock',
  'pnpm-lock.yaml', '*.map', '*.log',
];

// Config/doc files to always read for project understanding
const KEY_FILES = [
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml',
  'composer.json', 'Gemfile', 'requirements.txt', 'README.md', 'README',
  '.env.example', 'docker-compose.yml', 'Dockerfile', 'Makefile',
  'tsconfig.json', '.eslintrc.json', '.eslintrc.js', 'vite.config.js',
  'vite.config.ts', 'next.config.js', 'next.config.mjs',
];

// Max file size to include in context (bytes)
const MAX_KEY_FILE_SIZE = 8_000;
// Max tree entries to include
const MAX_TREE_ENTRIES = 300;

function loadGitignore(dir) {
  const ig = ignore().add(HARD_IGNORE);
  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath, 'utf8'));
  }
  return ig;
}

function buildTree(dir, ig, rootDir, entries = [], depth = 0) {
  if (depth > 6 || entries.length >= MAX_TREE_ENTRIES) return entries;

  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  // Dirs first, then files
  items.sort((a, b) => {
    if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
    return a.isDirectory() ? -1 : 1;
  });

  for (const item of items) {
    if (entries.length >= MAX_TREE_ENTRIES) break;

    const rel = path.relative(rootDir, path.join(dir, item.name));
    const relForCheck = item.isDirectory() ? rel + '/' : rel;

    if (ig.ignores(relForCheck) || ig.ignores(rel)) continue;

    const indent = '  '.repeat(depth);
    if (item.isDirectory()) {
      entries.push(`${indent}${item.name}/`);
      buildTree(path.join(dir, item.name), ig, rootDir, entries, depth + 1);
    } else {
      entries.push(`${indent}${item.name}`);
    }
  }

  return entries;
}

function readKeyFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_KEY_FILE_SIZE) {
      const content = fs.readFileSync(filePath, 'utf8');
      return content.slice(0, MAX_KEY_FILE_SIZE) + '\n... (truncated)';
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function detectLanguages(entries) {
  const extCounts = {};
  for (const e of entries) {
    const ext = path.extname(e).toLowerCase();
    if (ext) extCounts[ext] = (extCounts[ext] || 0) + 1;
  }
  return Object.entries(extCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext]) => ext.slice(1))
    .join(', ');
}

export async function buildContext(cwd) {
  const ig = loadGitignore(cwd);
  const treeEntries = buildTree(cwd, ig, cwd);
  const fileCount = treeEntries.filter(e => !e.trimStart().endsWith('/')).length;

  // Read key config/doc files
  const keyFileContents = [];
  for (const name of KEY_FILES) {
    const filePath = path.join(cwd, name);
    if (fs.existsSync(filePath)) {
      const content = readKeyFile(filePath);
      if (content) {
        keyFileContents.push({ name, content });
      }
    }
  }

  const languages = detectLanguages(treeEntries);
  const projectName = path.basename(cwd);

  // Build the summary string for the system prompt
  const summaryParts = [`Project: ${projectName}`, `Languages: ${languages || 'unknown'}`, `Files: ${fileCount}`];
  const summary = summaryParts.join(' · ');

  // Full context for system prompt
  let systemContext = `## Project: ${projectName}\n`;
  systemContext += `Working directory: ${cwd}\n`;
  if (languages) systemContext += `Primary languages: ${languages}\n`;
  systemContext += `\n## File Tree\n\`\`\`\n${treeEntries.join('\n')}\n\`\`\`\n`;

  for (const { name, content } of keyFileContents) {
    systemContext += `\n## ${name}\n\`\`\`\n${content}\n\`\`\`\n`;
  }

  return { summary, systemContext, fileCount, projectName, cwd };
}
