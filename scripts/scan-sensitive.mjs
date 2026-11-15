#!/usr/bin/env node
/**
 * 敏感信息扫描 —— 防止真实出口 IP / 凭据 / 私钥再次进入仓库
 * ================================================================
 * 设计取舍：本仓库的主题就是 IP 分流，docs/ 里合法出现大量公网 IP
 * （Google 段、Anthropic 段、公共 DoH 解析器）。所以**不做**「见到公网 IP 就拦」
 * 那种通用规则 —— 误报一多，迟早有人加 --no-verify 绕过。
 *
 * 改为三层：
 *   1. 精确名单：`.sensitive-patterns`（不入库）里逐行列出的真实出口地址/主机名，
 *      或环境变量 SENSITIVE_PATTERNS（CI 用 secret 注入）。命中即拦。
 *   2. 路径规则：凭据文件、私有构建产物、白名单、私钥后缀，一律不许入库。
 *   3. 形态规则：GitHub/Anthropic/AWS/Slack token、私钥头，纯模式匹配。
 *
 * 用法：
 *   node scripts/scan-sensitive.mjs --all            # 全仓 tracked 文件 + 全部提交信息
 *   node scripts/scan-sensitive.mjs --staged         # 暂存区（pre-commit）
 *   node scripts/scan-sensitive.mjs --range A..B     # 区间新增行 + 区间提交信息
 *   node scripts/scan-sensitive.mjs --message FILE   # 单条提交信息（commit-msg）
 *
 * 退出码：0 通过；1 命中；2 用法错误。输出不回显命中内容，只报位置与编号。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---------- 规则 ----------

const FORBIDDEN_PATH = [
  /^flclash-credentials\.json$/,
  /^flclash-private\.js$/,
  /^claude-guard\/allowed-exit-ips$/,
  /^\.sensitive-patterns$/,
  /\.(pem|key|p12|pfx|bundle)$/i,
  /(^|\/)\.env(\.|$)/,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/,
];

const SECRET_PATTERNS = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'Anthropic API key'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'OpenAI 风格 API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/, '私钥'],
];

const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.pdf', '.mp4']);

// ---------- 敏感值清单 ----------

function loadSensitive() {
  const values = [];
  const file = resolve(ROOT, '.sensitive-patterns');
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      values.push(line);
    }
  }
  const env = process.env.SENSITIVE_PATTERNS || '';
  for (const v of env.split(/[\n,;]+/)) {
    const t = v.trim();
    if (t) values.push(t);
  }
  // 去重、过滤过短（避免误伤），保留原始大小写做不区分大小写匹配
  return [...new Set(values)].filter((v) => v.length >= 7).map((v) => ({ v, re: new RegExp(escapeRe(v), 'i') }));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SENSITIVE = loadSensitive();

/** 返回该行命中的敏感值编号（1-based），无命中返回 0 */
function hitSensitive(line) {
  for (let i = 0; i < SENSITIVE.length; i++) if (SENSITIVE[i].re.test(line)) return i + 1;
  return 0;
}

function scanText(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const idx = hitSensitive(lines[i]);
    if (idx) hits.push({ line: i + 1, reason: `命中敏感值 #${idx}` });
    for (const [re, name] of SECRET_PATTERNS) {
      if (re.test(lines[i])) hits.push({ line: i + 1, reason: name });
    }
  }
  return hits;
}

function scanMessage(text, label) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const idx = hitSensitive(lines[i]);
    if (idx) out.push(`${label} 第 ${i + 1} 行: 命中敏感值 #${idx}`);
    for (const [re, name] of SECRET_PATTERNS) {
      if (re.test(lines[i])) out.push(`${label} 第 ${i + 1} 行: ${name}`);
    }
  }
  return out;
}

const badPath = (p) => FORBIDDEN_PATH.some((re) => re.test(p));

// ---------- 模式 ----------

function runAll() {
  const out = [];
  for (const f of git('ls-files').split('\n').filter(Boolean)) {
    if (badPath(f)) { out.push(`${f}: 禁止提交的文件`); continue; }
    if (SKIP_EXT.has(extname(f).toLowerCase())) continue;
    let text;
    try { text = readFileSync(resolve(ROOT, f), 'utf8'); } catch { continue; }
    for (const h of scanText(text)) out.push(`${f}:${h.line}: ${h.reason}`);
  }
  for (const chunk of git('log', '--all', '--format=%h%x09%B%x00').split('\0')) {
    const [sha, ...rest] = chunk.split('\t');
    if (!sha.trim()) continue;
    out.push(...scanMessage(rest.join('\t'), `提交 ${sha.trim()}`));
  }
  return out;
}

function runStaged() {
  const out = [];
  const files = git('diff', '--cached', '--name-only', '--diff-filter=ACM').split('\n').filter(Boolean);
  for (const f of files) {
    if (badPath(f)) { out.push(`${f}: 禁止提交的文件`); continue; }
    if (SKIP_EXT.has(extname(f).toLowerCase())) continue;
    let text;
    try { text = git('show', `:${f}`); } catch { continue; }
    for (const h of scanText(text)) out.push(`${f}:${h.line}: ${h.reason}`);
  }
  return out;
}

function runRange(range) {
  const out = [];
  let file = '';
  let lineNo = 0;
  for (const raw of git('diff', '--unified=0', range).split('\n')) {
    if (raw.startsWith('+++ b/')) { file = raw.slice(6); if (badPath(file)) out.push(`${file}: 禁止提交的文件`); continue; }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { lineNo = Number(hunk[1]); continue; }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      for (const h of scanText(raw.slice(1))) out.push(`${file}:${lineNo}: ${h.reason}`);
      lineNo++;
    } else if (raw.startsWith(' ')) {
      lineNo++;
    }
  }
  for (const chunk of git('log', range, '--format=%h%x09%B%x00').split('\0')) {
    const [sha, ...rest] = chunk.split('\t');
    if (!sha.trim()) continue;
    out.push(...scanMessage(rest.join('\t'), `提交 ${sha.trim()}`));
  }
  return out;
}

function runMessage(file) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) return [];
  return scanMessage(readFileSync(p, 'utf8'), `提交信息`);
}

// ---------- 入口 ----------

const args = process.argv.slice(2);
let findings;
if (args.includes('--all')) findings = runAll();
else if (args.includes('--staged')) findings = runStaged();
else if (args.includes('--message')) findings = runMessage(args[args.indexOf('--message') + 1]);
else if (args.includes('--range')) findings = runRange(args[args.indexOf('--range') + 1]);
else {
  console.error('用法: scan-sensitive.mjs --all | --staged | --range A..B | --message FILE');
  process.exit(2);
}

if (SENSITIVE.length === 0) {
  console.error('⚠ 未加载敏感值清单（.sensitive-patterns 缺失且无 SENSITIVE_PATTERNS）；本次只做路径与 token 检查。');
  console.error('  先运行: node scripts/sync-sensitive.mjs');
}

if (findings.length === 0) {
  console.log(`✓ 敏感信息扫描通过（${args[0]}，敏感值 ${SENSITIVE.length} 条）`);
  process.exit(0);
}

console.error('');
console.error('✗ 检测到疑似敏感信息，已阻止提交：');
for (const f of findings) console.error(`  - ${f}`);
console.error('');
console.error('处理方式：');
console.error('  · 真实出口 IP / 主机名改为打码或占位（如 203.0.113.7、YOUR_HOST）');
console.error('  · 凭据类文件不要入库，改为 .example 模板 + .gitignore');
console.error('  · 换了新 IP 之后运行 node scripts/sync-sensitive.mjs 更新清单');
console.error('');
process.exit(1);
