#!/usr/bin/env node
/**
 * 生成 `.sensitive-patterns`（不入库）
 * ================================================================
 * 从本地真实凭据推导出「绝不能出现在仓库里」的字面值，供
 * scripts/scan-sensitive.mjs 精确匹配。换 IP / 换密码后重跑一次即可。
 *
 * 数据来源（都在 .gitignore 内）：
 *   - flclash-credentials.json      → config.residential.nodes（旧写法 nodes / 单节点也认）
 *   - claude-guard/allowed-exit-ips → 每一行有效 IPv4
 *
 * 只写清单，不回显任何值。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const OUT = resolve(ROOT, '.sensitive-patterns');

const values = new Set();
const sources = [];

const add = (v, why) => {
  const t = String(v ?? '').trim();
  if (t.length < 6) return;          // 太短易误伤（如 "jp"、"443"）
  if (/^YOUR_|placeholder|example|xxx/i.test(t)) return;
  values.add(t);
  sources.push(why);
};

const credPath = resolve(ROOT, 'flclash-credentials.json');
if (existsSync(credPath)) {
  try {
    const c = JSON.parse(readFileSync(credPath, 'utf8'));
    // 住宅节点现在住在 config.residential.nodes；旧写法（顶层 nodes / 单节点）一并认
    const nodes = [
      ...(Array.isArray(c.nodes) ? c.nodes : []),
      ...(c.config && c.config.residential && Array.isArray(c.config.residential.nodes)
        ? c.config.residential.nodes
        : []),
      ...(c.server ? [c] : []),
    ];
    nodes.forEach((n, i) => {
      if (!n || typeof n !== 'object') return;
      const tag = `credentials.nodes[${i}]`;
      add(n.server, `${tag}.server`);
      add(n.username, `${tag}.username`);
      add(n.password, `${tag}.password`);
    });
  } catch { console.warn('⚠ flclash-credentials.json 解析失败，跳过'); }
}

const allowPath = resolve(ROOT, 'claude-guard/allowed-exit-ips');
if (existsSync(allowPath)) {
  for (const raw of readFileSync(allowPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    add(line, 'allowed-exit-ips');
  }
}

if (values.size === 0) {
  console.error('✗ 没有可用的敏感值来源（缺 flclash-credentials.json 与 allowed-exit-ips）');
  process.exit(1);
}

const header = [
  '# 敏感值清单 —— 由 scripts/sync-sensitive.mjs 生成，请勿提交（已在 .gitignore）',
  '# 每行一个会被 scripts/scan-sensitive.mjs 拦截的字面值（不区分大小写）',
  `# 生成时间: ${new Date().toISOString()}`,
  `# 来源: ${[...new Set(sources)].join(', ')}`,
  '',
].join('\n');

writeFileSync(OUT, header + [...values].join('\n') + '\n', { mode: 0o600 });

console.log(`✓ 已写入 .sensitive-patterns：${values.size} 条（来源: ${[...new Set(sources)].join(', ')}）`);
console.log('  该文件已被 .gitignore 排除，内容不回显。');
console.log('  提示：换了出口 IP 或密码后，重新运行本脚本。');
