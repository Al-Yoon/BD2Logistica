import util from "node:util";

const a = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

/** @param {string} s @param {string} code */
export function paint(s, code) {
  return `${code}${s}${a.reset}`;
}

export function bannerLine(width) {
  return paint("═".repeat(width), a.cyan + a.bold);
}

/**
 * @param {string} title
 * @param {string[]} lines
 */
export function framedBlock(title, lines) {
  const inner = [title, ...lines];
  const w = Math.min(
    72,
    Math.max(...inner.map((l) => stripAnsi(l).length), title.length) + 4,
  );
  const top = `┌${"─".repeat(w)}┐`;
  const bot = `└${"─".repeat(w)}┘`;
  const row = (t) => {
    const plain = stripAnsi(t);
    const pad = Math.max(0, w - plain.length - 2);
    return `│ ${t}${" ".repeat(pad)} │`;
  };
  console.log(paint(top, a.cyan));
  console.log(paint(row(paint(title, a.bold + a.white)), a.cyan));
  console.log(paint(`├${"─".repeat(w)}┤`, a.cyan));
  for (const ln of lines) {
    const parts = wrapPlain(stripAnsi(ln), w - 2);
    for (const p of parts) {
      console.log(paint(`│ ${p.padEnd(w - 2, " ")} │`, a.cyan));
    }
  }
  console.log(paint(bot, a.cyan));
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function wrapPlain(s, maxLen) {
  if (s.length <= maxLen) return [s];
  const out = [];
  let i = 0;
  while (i < s.length) {
    out.push(s.slice(i, i + maxLen));
    i += maxLen;
  }
  return out;
}

export function section(title) {
  const bar = "─".repeat(52);
  console.log();
  console.log(paint(bar, a.gray));
  console.log(paint(` ${title}`, a.bold + a.cyan));
  console.log(paint(bar, a.gray));
}

/**
 * @param {unknown} data
 * @param {{ maxArrayLength?: number }} [opts]
 */
export function printObject(data, opts = {}) {
  const { maxArrayLength = 20 } = opts;
  console.log(
    util.inspect(data, {
      colors: true,
      depth: 10,
      maxArrayLength,
      maxStringLength: 200,
      compact: false,
    }),
  );
}

export function success(msg) {
  console.log(paint("✓ ", a.green + a.bold) + msg);
}

export function warn(msg) {
  console.log(paint("! ", a.yellow + a.bold) + msg);
}

export function errorLine(msg) {
  console.log(paint("✗ ", a.red + a.bold) + msg);
}

export function hint(msg) {
  console.log(paint("  " + msg, a.dim));
}

export const ansi = a;
