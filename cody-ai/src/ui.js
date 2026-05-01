// src/ui.js — Terminal formatting helpers using raw ANSI codes (no deps needed)

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  gray:    '\x1b[90m',
  white:   '\x1b[37m',
  bgBlue:  '\x1b[44m',
};

const isCI = process.env.CI || !process.stdout.isTTY;
const color = (code, str) => isCI ? str : `${code}${str}${C.reset}`;

export const ui = {
  bold:    (s) => color(C.bold,    s),
  dim:     (s) => color(C.dim,     s),
  cyan:    (s) => color(C.cyan,    s),
  green:   (s) => color(C.green,   s),
  yellow:  (s) => color(C.yellow,  s),
  red:     (s) => color(C.red,     s),
  blue:    (s) => color(C.blue,    s),
  magenta: (s) => color(C.magenta, s),
  gray:    (s) => color(C.gray,    s),

  info:    (s) => console.log(`${color(C.cyan,   '  ℹ')} ${s}`),
  success: (s) => console.log(`${color(C.green,  '  ✓')} ${s}`),
  warn:    (s) => console.log(`${color(C.yellow, '  ⚠')} ${s}`),
  error:   (s) => console.log(`${color(C.red,    '  ✗')} ${s}`),
  hint:    (s) => console.log(color(C.gray, `  ${s}`)),

  prompt: () => `${color(C.bold + C.cyan, '❯')} `,

  toolStart: (name, input) => {
    const preview = JSON.stringify(input)
      .replace(/^{|}$/g, '')
      .replace(/"(\w+)":/g, '$1:')
      .slice(0, 80);
    console.log(`\n${color(C.gray, `  ⚙ ${name}(`)}${color(C.gray, preview)}${color(C.gray, ')')}`);
  },

  toolResult: (output, isError = false) => {
    const lines = String(output).split('\n');
    const maxLines = 20;
    const shown = lines.slice(0, maxLines);
    const prefix = color(C.gray, '  │ ');
    const colorFn = isError ? (s) => color(C.red, s) : (s) => color(C.gray, s);
    shown.forEach(l => console.log(prefix + colorFn(l)));
    if (lines.length > maxLines) {
      console.log(color(C.gray, `  │ … (${lines.length - maxLines} more lines)`));
    }
  },

  banner: (version) => {
    console.log();
    console.log(color(C.bold + C.cyan, '  ◆ Cody') + color(C.gray, ` v${version} — AI Coding Assistant`));
    console.log(color(C.gray, '  Powered by Claude · Type /help for commands\n'));
  },

  separator: () => console.log(color(C.gray, '  ' + '─'.repeat(50))),
};
