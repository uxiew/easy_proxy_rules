#!/usr/bin/env node
// Claude Code 生效配置检查（只读，零网络）
//
// 目的：判定 Claude 的配置是不是「只设置了代理」：
//   1) 所有生效配置层里没有 ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN 等端点或密钥
//   2) HTTP(S)_PROXY 都指向 guard.conf 里的住宅专用入口（默认 http://127.0.0.1:7865）
//   3) NO_PROXY 不含 anthropic / 通配（否则 API 请求会绕过代理）
// 覆盖顺序：shell 环境 < 用户级 settings.json < settings.local.json < 项目级 .claude/ < 企业策略
// 输出 LEVEL<TAB>message，由 claude-guard.zsh 的 claude-check 统一上色。密钥值一律不输出。
//
// 与 guard.conf 共用 PORT / HOST，避免「守卫认 A、体检认 B」两套口径。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = os.homedir()
const CFG = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude')

// ---- 读同一份 guard.conf（解析规则与 claude-guard.zsh 保持一致）----
function readConf() {
  const out = {}
  try {
    for (const line of fs.readFileSync(path.join(HERE, 'guard.conf'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
      if (!m) continue
      out[m[1]] = m[2].replace(/\s*#.*$/, '').trim()
    }
  } catch { /* 缺失时回落默认值 */ }
  return out
}
const conf = readConf()
const HOST = conf.HOST || '127.0.0.1'
const PORT = /^\d+$/.test(conf.PORT || '') ? conf.PORT : '7865'
const EXPECT = `http://${HOST}:${PORT}`

// 下游（claude-check 的 while read、或手动 `| head`）提前关闭管道时静默退出，
// 不要抛未处理的 EPIPE 堆栈污染体检输出。
process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0) })

const emit = (lv, msg) => process.stdout.write(`${lv}\t${msg}\n`)
const short = (p) => (p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p)

const ENDPOINT_KEYS = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_URL',
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
]
const PROXY_KEYS = [
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
]
const LINK_KEYS = [...ENDPOINT_KEYS, ...PROXY_KEYS]

function load(p) {
  try {
    return { data: JSON.parse(fs.readFileSync(p, 'utf8')) }
  } catch (e) {
    return { error: e.code === 'ENOENT' ? 'not found' : e.message }
  }
}

// ---- 收集生效配置层（低 -> 高优先级）----
const layers = []
const add = (p, kind) => {
  if (!fs.existsSync(p)) return
  layers.push({ p, kind, ...load(p) })
}

add(path.join(CFG, 'settings.json'), '用户级')
add(path.join(CFG, 'settings.local.json'), '用户级 local')

// 项目级：沿当前目录向上找 .claude/settings*.json，越靠近 cwd 优先级越高
let d = process.cwd()
const projDirs = []
for (let i = 0; i < 12; i++) {
  if (d !== HOME) projDirs.push(d)
  if (d === HOME || d === path.parse(d).root) break
  const parent = path.dirname(d)
  if (parent === d) break
  d = parent
}
for (const dir of projDirs.reverse()) {
  add(path.join(dir, '.claude', 'settings.json'), '项目级')
  add(path.join(dir, '.claude', 'settings.local.json'), '项目级 local')
}
add('/Library/Application Support/ClaudeCode/managed-settings.json', '企业策略')
add('/etc/claude-code/managed-settings.json', '企业策略')

// ---- 合并链路变量：shell 为基线，配置层逐个覆盖 ----
const merged = {}
for (const k of LINK_KEYS) {
  if (process.env[k] !== undefined) merged[k] = { value: process.env[k], from: 'shell' }
}
const parseErrors = []
const layerNames = []
for (const L of layers) {
  if (L.error) {
    parseErrors.push(`${short(L.p)}: ${L.error}`)
    continue
  }
  const env = L.data && typeof L.data.env === 'object' && !Array.isArray(L.data.env)
    ? L.data.env : null
  layerNames.push(`${short(L.p)} (${L.kind}${env ? `, ${Object.keys(env).length} 项 env` : ', 无 env'})`)
  if (!env) continue
  for (const k of LINK_KEYS) {
    if (env[k] !== undefined) merged[k] = { value: String(env[k]), from: short(L.p) }
  }
}

// ---- 报告 ----
emit('INFO', `期望代理: ${EXPECT}（来自 ${path.join(HERE, 'guard.conf')}）`)
emit('INFO', `配置目录: ${short(CFG)}${process.env.CLAUDE_CONFIG_DIR ? '（CLAUDE_CONFIG_DIR 已设置）' : ''}`)
if (layers.length === 0) {
  emit('BAD', '找不到任何 Claude 配置文件 —— IDE/GUI 启动会直连暴露真实 IP')
} else {
  emit('INFO', `生效层 ${layers.length} 个: ${layerNames.join(' -> ')}`)
}
for (const e of parseErrors) emit('BAD', `配置解析失败: ${e}`)

const endpointHits = ENDPOINT_KEYS.filter((k) => merged[k])
const proxyMiss = []
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY']) {
  const m = merged[k]
  if (!m) proxyMiss.push(`${k} 未设置`)
  else if (m.from === 'shell') {
    proxyMiss.push(`${k} 配置层未设置（当前沿用 shell 的 ${m.value}，IDE/GUI 启动无代理）`)
  } else if (m.value !== EXPECT) proxyMiss.push(`${k}=${m.value}`)
}
const nop = merged.NO_PROXY || merged.no_proxy
const nopBad = !!(nop && (nop.value.includes('anthropic') || nop.value.trim() === '*'))
const clean = layers.length > 0 && parseErrors.length === 0 &&
  endpointHits.length === 0 && proxyMiss.length === 0 && !nopBad

if (clean) {
  emit('OK', '仅代理：链路项只有 HTTP(S)_PROXY / NO_PROXY，端点为官方 api.anthropic.com')
} else {
  emit('BAD', '配置已偏离「仅代理」，见下方明细')
}

for (const k of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY']) {
  const m = merged[k]
  if (m) emit('INFO', `${k.padEnd(12)} = ${m.value}  <- ${m.from}`)
}
for (const k of ['HTTP_PROXY', 'HTTPS_PROXY']) {
  const m = merged[k]
  if (m && m.from !== 'shell' && process.env[k] !== undefined && process.env[k] !== m.value) {
    emit('INFO', `配置层 ${m.from} 的 ${k} 优先于 shell（shell=${process.env[k]}）`)
  }
}

if (endpointHits.length === 0) {
  emit('OK', '无 ANTHROPIC_* 端点/密钥（shell 与所有配置层均未设置）')
} else {
  for (const k of endpointHits) {
    // 密钥值一律不输出；端点 URL 可以显示，便于确认来源
    const shown = /KEY|TOKEN/.test(k) ? '<值已隐藏>' : merged[k].value
    emit('BAD', `${k} = ${shown}  <- ${merged[k].from}`)
  }
}
for (const m of proxyMiss) emit('BAD', `代理异常: ${m}（期望 ${EXPECT}）`)
if (nopBad) emit('BAD', `NO_PROXY = ${nop.value} 含 anthropic/通配，API 请求会绕过代理`)

// ---- 备用配置：只汇总，绝不输出密钥 ----
try {
  const alts = fs.readdirSync(CFG)
    .filter((f) => /^settings\..+\.json$/.test(f) && f !== 'settings.local.json')
  let withEp = 0
  let worldReadable = 0
  for (const f of alts) {
    const p = path.join(CFG, f)
    const r = load(p)
    if (!r.error && r.data?.env && ENDPOINT_KEYS.some((k) => r.data.env[k] !== undefined)) withEp++
    try { if (fs.statSync(p).mode & 0o077) worldReadable++ } catch { /* ignore */ }
  }
  if (alts.length) {
    emit('INFO', `备用配置 ${alts.length} 份 settings.*.json，其中 ${withEp} 份含第三方端点/密钥（值已隐藏）`)
    if (worldReadable) emit('WARN', `${worldReadable} 份备用配置对同机其他用户可读（内含明文密钥）`)
    emit('INFO', '任一份被复制为 settings.json 都会让链路切到第三方中转')
  }
} catch { /* 配置目录不可读 */ }
