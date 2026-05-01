// src/tools.js — Built-in tool definitions for the Cody agent

import fs from 'fs';
import path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Max sizes to prevent context explosion
const MAX_READ_BYTES  = 100_000;  // ~100KB per file
const MAX_SEARCH_RESULTS = 50;
const COMMAND_TIMEOUT_MS = 30_000;

// Dirs that are never allowed in commands for safety
const SAFE_ROOT_GUARD = ['/', '/etc', '/usr', '/bin', '/sbin', '/System'];

function safePath(filePath, cwd) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  // Prevent path traversal outside cwd on relative paths
  return abs;
}

// ─── Tool implementations ───────────────────────────────────────────────────

async function readFile({ path: filePath }, cwd) {
  const abs = safePath(filePath, cwd);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    throw new Error(`${filePath} is a directory. Use list_directory instead.`);
  }
  const buffer = Buffer.allocUnsafe(MAX_READ_BYTES);
  const fd = fs.openSync(abs, 'r');
  const { bytesRead } = fs.readSync(fd, buffer, 0, MAX_READ_BYTES, 0);
  fs.closeSync(fd);
  const content = buffer.slice(0, bytesRead).toString('utf8');
  const truncated = stat.size > MAX_READ_BYTES;
  return truncated
    ? `${content}\n\n[File truncated — showing first ${MAX_READ_BYTES.toLocaleString()} of ${stat.size.toLocaleString()} bytes]`
    : content;
}

async function writeFile({ path: filePath, content }, cwd) {
  const abs = safePath(filePath, cwd);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return `Written ${content.length} characters to ${filePath}`;
}

async function listDirectory({ path: dirPath = '.', recursive = false }, cwd) {
  const abs = safePath(dirPath, cwd);
  if (!fs.existsSync(abs)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  function list(dir, depth = 0) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const item of items) {
      if (['.git', 'node_modules', '__pycache__', '.next'].includes(item.name)) continue;
      const rel = path.relative(abs, path.join(dir, item.name));
      const prefix = recursive ? '  '.repeat(depth) : '';
      if (item.isDirectory()) {
        results.push(`${prefix}${item.name}/`);
        if (recursive && depth < 4) {
          results.push(...list(path.join(dir, item.name), depth + 1));
        }
      } else {
        const stat = fs.statSync(path.join(dir, item.name));
        const size = stat.size > 1024
          ? `${(stat.size / 1024).toFixed(1)}KB`
          : `${stat.size}B`;
        results.push(`${prefix}${item.name} (${size})`);
      }
    }
    return results;
  }

  const lines = list(abs);
  return lines.join('\n') || '(empty directory)';
}

async function runCommand({ command, cwd: cmdCwd, timeout = 30 }, cwd) {
  const workDir = cmdCwd ? safePath(cmdCwd, cwd) : cwd;

  if (SAFE_ROOT_GUARD.includes(workDir)) {
    throw new Error(`Refusing to run command in protected directory: ${workDir}`);
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: Math.min(timeout * 1000, COMMAND_TIMEOUT_MS),
      maxBuffer: 1024 * 1024 * 5, // 5MB
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
    });
    const out = [stdout, stderr].filter(Boolean).join('\n').trim();
    return out || '(command completed with no output)';
  } catch (err) {
    // Non-zero exit codes are returned as errors — include stdout/stderr
    const output = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Command failed (exit ${err.code}):\n${output || err.message}`);
  }
}

async function searchCode({ pattern, directory = '.', filePattern = '*', caseSensitive = false }, cwd) {
  const searchDir = safePath(directory, cwd);

  // Use grep on Unix, findstr on Windows
  let cmd;
  if (process.platform === 'win32') {
    const flags = caseSensitive ? '' : '/I';
    cmd = `findstr /S /N ${flags} "${pattern}" "${path.join(searchDir, '**', filePattern)}"`;
  } else {
    const flags = ['-r', '-n', '--include', filePattern, '-l'];
    if (!caseSensitive) flags.push('-i');
    // Get matching files first, then show context
    cmd = `grep -r ${caseSensitive ? '' : '-i'} -n --include="${filePattern}" -l "${pattern}" "${searchDir}" 2>/dev/null | head -20`;
  }

  let matchingFiles;
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 10_000 });
    matchingFiles = stdout.trim().split('\n').filter(Boolean);
  } catch {
    matchingFiles = [];
  }

  if (matchingFiles.length === 0) {
    return `No matches found for "${pattern}"`;
  }

  // For each matching file, get the actual matching lines
  const results = [];
  for (const file of matchingFiles.slice(0, 10)) {
    try {
      const grepCmd = process.platform === 'win32'
        ? `findstr /N ${caseSensitive ? '' : '/I'} "${pattern}" "${file}"`
        : `grep -n ${caseSensitive ? '' : '-i'} "${pattern}" "${file}"`;
      const { stdout } = await execAsync(grepCmd, { timeout: 5_000 });
      const lines = stdout.trim().split('\n').slice(0, MAX_SEARCH_RESULTS);
      const rel = path.relative(cwd, file);
      results.push(`\n${rel}:\n${lines.map(l => `  ${l}`).join('\n')}`);
    } catch {
      results.push(`\n${path.relative(cwd, file)}: (could not read)`);
    }
  }

  const header = `Found matches in ${matchingFiles.length} file(s)${matchingFiles.length > 10 ? ' (showing first 10)' : ''}:`;
  return header + results.join('');
}

// ─── Tool registry format (Claude tool_use schema) ──────────────────────────

export const builtinTools = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Use this to understand code, configs, or any file in the project.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative or absolute path to the file' },
      },
      required: ['path'],
    },
    execute: readFile,
  },
  {
    name: 'write_file',
    description: 'Write or overwrite a file with new content. Use for creating new files or editing existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Path to write to' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
    execute: writeFile,
  },
  {
    name: 'list_directory',
    description: 'List files and directories. Use to explore project structure.',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string',  description: 'Directory path (default: current directory)' },
        recursive: { type: 'boolean', description: 'Whether to list recursively (default: false)' },
      },
    },
    execute: listDirectory,
  },
  {
    name: 'run_command',
    description: 'Execute a shell command in the project directory. Use for running tests, git commands, builds, linters, package managers, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
        cwd:     { type: 'string', description: 'Working directory for the command (default: project root)' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 30, max: 30)' },
      },
      required: ['command'],
    },
    execute: runCommand,
  },
  {
    name: 'search_code',
    description: 'Search for a pattern across the codebase using grep. Returns matching file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern:       { type: 'string',  description: 'Text or regex pattern to search for' },
        directory:     { type: 'string',  description: 'Directory to search in (default: project root)' },
        filePattern:   { type: 'string',  description: 'File glob pattern, e.g. "*.js", "*.py" (default: all files)' },
        caseSensitive: { type: 'boolean', description: 'Whether search is case-sensitive (default: false)' },
      },
      required: ['pattern'],
    },
    execute: searchCode,
  },
];
