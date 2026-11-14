#!/usr/bin/env node
/**
 * build-flclash.js —— 生成 FlClash 用的单文件覆写脚本
 * ------------------------------------------------------------
 * FlClash 没有覆写链（不能像 Clash Party 那样 script + YAML 依次叠加），
 * 只能跑一个脚本。这个脚本把「凭据头 + smart.js 全文」拼成一份文件：
 *
 *   flclash.js           凭据是占位符（提交进仓库，给别人参考）
 *   flclash-private.js   凭据是真实值（.gitignore 排除，粘贴到手机用）
 *
 * 真实凭据放在 flclash-credentials.json（同样 .gitignore 排除）：
 *   { "name": "🏠 住宅-JP", "server": "x.x.x.x", "port": 7012,
 *     "username": "xxx", "password": "xxx" }
 *
 * 用法：
 *   node build-flclash.js            # 两个文件都生成（有 credentials 时）
 *   node build-flclash.js --public   # 只生成占位符版
 *
 * ⚠️ smart.js 改动后必须重新生成，否则手机上跑的还是旧逻辑。
 *    生成的文件顶部会写入构建元信息（时间 / 源文件指纹 / 跳过项），
 *    拿到一份 flclash 配置时，看头部注释就知道它对应哪一版 smart.js。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SMART_PATH = path.join(ROOT, 'smart.js');
const smart = fs.readFileSync(SMART_PATH, 'utf8');

const PLACEHOLDER = {
  name: '🏠 住宅-JP',
  server: 'YOUR_HOST',
  port: 0,
  username: 'YOUR_USERNAME',
  password: 'YOUR_PASSWORD',
};

// ---------- 构建元信息 ----------

function gitHead() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function meta() {
  const sha = crypto.createHash('sha256').update(smart).digest('hex').slice(0, 12);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return {
    stamp,
    sha,
    lines: smart.split('\n').length,
    bytes: Buffer.byteLength(smart, 'utf8'),
    commit: gitHead(),
  };
}

function maskHost(host) {
  const s = String(host || '');
  if (!s || s === PLACEHOLDER.server) return PLACEHOLDER.server;
  if (s.length <= 7) return s;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function header(cred, m) {
  const isPublic = cred.server === PLACEHOLDER.server;
  const credLine = isPublic
    ? `住宅节点    : ${cred.name}  ->  ${PLACEHOLDER.server}:${PLACEHOLDER.port}   (占位符，使用前请填真实凭据)`
    : `住宅节点    : ${cred.name}  ->  ${maskHost(cred.server)}:${cred.port}`;

  const title = isPublic
    ? 'FlClash 覆写脚本（占位符版 / 可提交仓库）'
    : 'FlClash 覆写脚本（私有版 / 含真实凭据，勿提交勿分享）';

  return `/**
 * ${title}
 * ================================================================
 * 由 build-flclash.js 自动生成 —— 请勿手改，改 smart.js 后重新构建
 *
 * 构建时间    : ${m.stamp}
 * 源文件      : smart.js  sha256:${m.sha}  ${m.lines} 行 / ${m.bytes} 字节
 * 源码提交    : ${m.commit}
 * 构建命令    : node build-flclash.js
 * ${credLine}
 *
 * 本文件 = 凭据头 + smart.js 全文，与桌面端 Clash Party 同源同逻辑
 * （重建组/规则 + AI 走住宅 + 前置亚洲跳板 + 国内直连 + 占位节点清洗 + 应用级分流）。
 * 唯一差异：占位符版头部带 FLCLASH_NO_RESIDENTIAL = true，因为没有住宅节点可注入，
 * 该标记优先级高于 RESIDENTIAL.enabled（true / 'auto' 都会被覆盖），强制判定
 * 「没有家宽」→ 不建住宅链、AI 规则改投 AI 组（开箱即用，不会全阻断）。
 *
 * FlClash 模式自动跳过的桌面专属项（写了会和 App 打架）：
 *   dns.listen 0.0.0.0:1053    -> 跳过，端口交给 FlClash 绑定
 *   listeners 7865 住宅专用口   -> 跳过，手机上用不到
 *   ipv6 / domain-strategy      -> 跳过，交给 App
 *   IP-ASN 规则                 -> 跳过，需要 ASN.mmdb，缺了内核启动会卡 75 秒
 *
 * DNS（手机端只换上游，不碰端口）：
 *   上游 = IP 型 DoH 1.12.12.12 / 120.53.53.53，不依赖明文 UDP 53；
 *   enhanced-mode 保持 fake-ip，海外域名的真实解析在出口完成，
 *   所以 DNS 归属地与出口 IP 归属地一致（都是日本）。
 *
 * !! 手机端「全局模式」有坑 !!
 *   全局模式走的是内核自建的 GLOBAL 组，它的第一个成员固定是 DIRECT，
 *   所以新装/清数据后切全局 = 全部直连（真实 IP 直接暴露）。
 *   要用全局模式，先在代理页把 GLOBAL 手动选成「住宅出口」，否则等于关掉代理。
 *   推荐直接用「规则模式」，末尾 MATCH,CATCH 已经兜住所有流量
 *   （CATCH 默认成员是 AUTO，行为等价；需要全站直连/断网时切 CATCH 即可）。
 *
 * !! 版本兼容性（很重要）!!
 *   FlClash 的覆写是「追加 rules、不替换 rules」，本脚本已自动补齐订阅规则
 *   引用的规则集与组名，所以换任何订阅都不会再报 rule set / proxy not found。
 *   但 v0.9.1 起 FlClash 会用订阅原文覆盖覆写生成的 proxies / proxy-groups，
 *   等于废掉「注入住宅节点 + 重建分组」。检测到这种情况脚本会自动退化为
 *   「只修 DNS」，并在日志打印提示。
 *   想保留住宅出口与 AI 分流：请把 FlClash 留在 v0.8.98。
 *
 * 安装：FlClash -> 工具 -> 覆写 -> 新建 -> 类型「脚本」-> 粘贴全文
 *       -> 对该订阅启用覆写 -> 打开 TUN
 * ================================================================
 */
// ============ 住宅节点凭据（唯一需要改的地方） ============
const FLCLASH_RESIDENTIAL = {
  name: ${JSON.stringify(cred.name)}, // 必须带 🏠 或 IP- 前缀（命中 smart.js 的 nodePattern）
  server: ${JSON.stringify(cred.server)},
  port: ${JSON.stringify(Number(cred.port))},
  username: ${JSON.stringify(cred.username)},
  password: ${JSON.stringify(cred.password)},
};
${isPublic ? "// 占位符版没有真实凭据：告诉 smart.js 按「没有家宽」处理，AI 走 AI 组\nconst FLCLASH_NO_RESIDENTIAL = true;\n" : ''}// ==========================================================

// ================= smart.js 全文（勿手改） =================

`;
}

function build(cred, m) {
  return header(cred, m) + smart;
}

// ---------- 构建期自检 ----------
// 为什么在构建期做：生成物里一个悬空组名，到手机上就是 kernel 拒载整份配置、
// 表现为「所有节点失效」；一个关键域名落成 DIRECT，表现为「Claude 突然连不上」。
// 这些错在内核日志里往往只有一句 proxy not found，事后很难定位，所以提前拦住。
//
// 检查分两类：
//   静态 —— 规则集文件是否存在、条目数是否异常、关键域名有没有被误收进直连名单；
//   动态 —— 用 vm 真的跑一遍生成的脚本，检查最终 rules / proxy-groups 的形态。

const BUILTIN_POLICIES = new Set(['DIRECT', 'REJECT', 'PASS', 'GLOBAL']);
// 这些域名一旦第一条命中是 DIRECT，就等于把真实 IP 交给对方 / 把服务弄断。
const MUST_NOT_DIRECT = [
  'claude.ai',
  'api.anthropic.com',
  'challenges.cloudflare.com',
  'chatgpt.com',
  'gemini.google.com',
  'raw.githubusercontent.com',
];
// 本地规则集：能展开做「首条命中」模拟的只有这些；远程的（Loyalsoldier 等）跳过，
// 跳过只会让断言更保守（不误报），不会放过 DIRECT。
const LOCAL_SETS = {
  aiStrict: 'ruleset/ai-strict.list',
  residential: 'ruleset/residential.list',
  directExtra: 'ruleset/direct-extra.list',
  autoExtra: 'ruleset/auto-extra.list',
  webrtcGuard: 'ruleset/webrtc-guard.list',
  forNSFW: 'ruleset/nsfw.list',
};
// 条目数下限：防的是「规则集被清空 / 拉取到半截」，不是精确值。
// 数值取「当前条目数的 ~70%」：正常增删不会触发，被清空或截断一定触发。
const MIN_ENTRIES = {
  'ruleset/ai-strict.list': 60, // 当前 80
  'ruleset/residential.list': 2, // 当前 3
  'ruleset/direct-extra.list': 5, // 当前 8
  'ruleset/auto-extra.list': 2, // 当前 3
  'ruleset/webrtc-guard.list': 10, // 当前 11
};

function readList(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  return fs
    .readFileSync(full, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(',').map((part) => part.trim()));
}

function buildLocalSets() {
  const sets = {};
  for (const [name, file] of Object.entries(LOCAL_SETS)) sets[name] = readList(file) || [];
  return sets;
}

function domainMatches(kind, value, domain) {
  if (kind === 'DOMAIN') return domain === value;
  if (kind === 'DOMAIN-SUFFIX') return domain === value || domain.endsWith('.' + value);
  if (kind === 'DOMAIN-KEYWORD') return domain.includes(value);
  return false;
}

// 首条命中模拟：只认域名类规则和可展开的本地 RULE-SET，其余（GEOIP / GEOSITE /
// IP-CIDR / 远程规则集）一律跳过——对域名来说它们要么不适用，要么无法离线展开。
function firstHit(rules, sets, domain) {
  for (const rule of rules) {
    const parts = String(rule).split(',').map((part) => part.trim());
    const kind = (parts[0] || '').toUpperCase();
    if (kind === 'MATCH') return { rule, policy: parts[1] };
    if (kind === 'RULE-SET') {
      const set = sets[parts[1]];
      if (!set) continue;
      for (const entry of set) {
        if (entry.length >= 2 && domainMatches((entry[0] || '').toUpperCase(), entry[1], domain)) {
          return { rule, policy: parts[2], via: entry.join(',') };
        }
      }
      continue;
    }
    if (['DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD'].includes(kind) && parts.length >= 3) {
      if (domainMatches(kind, parts[1], domain)) return { rule, policy: parts[2] };
    }
  }
  return null;
}

function policyOf(rule) {
  const parts = String(rule).split(',').map((part) => part.trim());
  if ((parts[0] || '').toUpperCase() === 'MATCH') return parts[1];
  const last = parts[parts.length - 1] || '';
  return last.toLowerCase() === 'no-resolve' ? parts[parts.length - 2] : last;
}

function inspect(text, options) {
  const problems = [];
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: { log() {}, warn() {}, error() {} },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(text, sandbox, { filename: options.label });
  } catch (error) {
    return [`脚本加载失败：${error.message}`];
  }
  const main = sandbox.module.exports;
  if (typeof main !== 'function') return ['module.exports 不是 main()'];

  const config = {
    proxies: [
      { name: '🇯🇵 JP-01', type: 'ss', server: '192.0.2.1', port: 1 },
      { name: '🇸🇬 SG-01', type: 'ss', server: '192.0.2.2', port: 2 },
      { name: '🇺🇸 US-01', type: 'ss', server: '192.0.2.3', port: 3 },
    ],
    'proxy-groups': [],
    rules: [],
    dns: {},
    tun: {},
    'rule-providers': {},
  };
  try {
    main(config);
  } catch (error) {
    return [`main() 执行失败：${error.message}`];
  }

  const rules = (config.rules || []).map(String);
  const groups = config['proxy-groups'] || [];
  const providers = config['rule-providers'] || {};
  const names = groups.map((group) => group.name);
  const nameSet = new Set(names);

  if (rules.length < 40) problems.push(`规则只有 ${rules.length} 条，疑似规则集丢失`);
  if (!rules.length || !/^MATCH\s*,/.test(rules[rules.length - 1])) {
    problems.push('最后一条不是 MATCH 兜底');
  }
  if (new Set(names).size !== names.length) problems.push('存在重名策略组');

  // 悬空引用：规则的落点必须在组名或内置策略里
  for (const rule of rules) {
    const policy = policyOf(rule);
    if (!policy || (!BUILTIN_POLICIES.has(policy) && !nameSet.has(policy))) {
      problems.push(`悬空落点「${policy}」：${rule}`);
    }
  }
  // RULE-SET 引用的 provider 必须存在（FlClash 会补齐订阅的，但自身引用的必须有）
  for (const rule of rules) {
    const parts = rule.split(',').map((part) => part.trim());
    if ((parts[0] || '').toUpperCase() === 'RULE-SET' && parts[1] && !providers[parts[1]]) {
      problems.push(`规则集未定义：${parts[1]}`);
    }
  }

  // 关键域名：第一条命中不得是 DIRECT
  const sets = buildLocalSets();
  for (const domain of MUST_NOT_DIRECT) {
    const hit = firstHit(rules, sets, domain);
    if (!hit) continue;
    if (hit.policy === 'DIRECT') problems.push(`${domain} 被 DIRECT 截胡：${hit.rule}${hit.via ? `（${hit.via}）` : ''}`);
  }

  // 国内直连必须存在，且排在 forAI 之前（否则国内站被 AI 组接走烧流量）
  const iCn = rules.findIndex((rule) => /^(GEOSITE,cn|GEOIP,CN)/i.test(rule));
  const iForAI = rules.findIndex((rule) => /^RULE-SET,forAI,/i.test(rule));
  if (iCn < 0) problems.push('缺少国内直连兜底（GEOSITE,cn 或 GEOIP,CN）');
  else if (iForAI >= 0 && iCn > iForAI) problems.push('国内直连排在 forAI 之后，国内站会被 AI 组接走');

  // 住宅链语义：住宅组不许含 AI，前置组不许含 DIRECT
  const residential = groups.find((group) => group.name === '住宅出口');
  const upstream = groups.find((group) => group.name === '前置-亚洲');
  if (residential && (residential.proxies || []).includes('AI')) {
    problems.push('住宅出口组成员含 AI（会变成能切到机场共享 IP 的普通组）');
  }
  if (upstream && (upstream.proxies || []).includes('DIRECT')) {
    problems.push('前置-亚洲组成员含 DIRECT（等于拆掉跳板、可能裸连住宅 IP）');
  }
  if (options.expectNoResidential && residential) {
    problems.push('无家宽构建仍生成了「住宅出口」组');
  }

  // 规则集条目数下限（静态）
  for (const [file, min] of Object.entries(MIN_ENTRIES)) {
    const entries = readList(file);
    if (entries === null) {
      if (file.includes('webrtc-guard')) continue; // 可选规则集，允许不存在
      problems.push(`规则集文件缺失：${file}`);
    } else if (entries.length < min) {
      problems.push(`${file} 只有 ${entries.length} 条（下限 ${min}），疑似被清空或截断`);
    }
  }
  // 关键 AI 域名必须被 ai-strict 覆盖（否则会被 forAI 接走，走机场）
  const aiStrict = new Set((sets.aiStrict || []).map((entry) => entry[1]));
  for (const domain of ['claude.ai', 'anthropic.com', 'challenges.cloudflare.com', 'chatgpt.com']) {
    if (!aiStrict.has(domain)) problems.push(`ai-strict.list 缺少 ${domain}`);
  }
  // 直连名单不得误收关键 AI 域名
  for (const file of ['ruleset/direct-extra.list', 'ruleset/residential.list']) {
    for (const entry of readList(file) || []) {
      if (MUST_NOT_DIRECT.includes(entry[1])) problems.push(`${file} 把 ${entry[1]} 收进了规则集`);
    }
  }

  return problems;
}

function assertGenerated(targets) {
  const failures = [];
  for (const target of targets) {
    const problems = inspect(target.text, target);
    for (const problem of problems) failures.push(`[${target.label}] ${problem}`);
  }
  if (failures.length) {
    console.error('✗ 构建自检失败，未写出任何产物：');
    for (const failure of failures) console.error('  - ' + failure);
    process.exit(1);
  }
  console.log(`✓ 构建自检通过（${targets.length} 份产物：悬空引用 0、关键域名未被 DIRECT 截胡、规则集条目正常）`);
}

// ---------- 主流程 ----------

const m = meta();

const publicText = build(PLACEHOLDER, m);
// 占位符版头部带 FLCLASH_NO_RESIDENTIAL：必须走「无家宽」分支，不该再出现住宅组。
const targets = [{ label: 'flclash.js（占位符版）', text: publicText, expectNoResidential: true }];

const credPath = path.join(ROOT, 'flclash-credentials.json');
let privateText = null;
if (fs.existsSync(credPath) && !process.argv.includes('--public')) {
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (!cred.server || !cred.port) {
    console.error('✗ flclash-credentials.json 缺 server/port');
    process.exit(1);
  }
  privateText = build(cred, m);
  targets.push({ label: 'flclash-private.js（私有版）', text: privateText });
}

// 先全部校验，再落盘：任何一份不合格都不写出，避免坏产物覆盖上一版可用的文件。
assertGenerated(targets);

fs.writeFileSync(path.join(ROOT, 'flclash.js'), publicText, 'utf8');
console.log(`✓ flclash.js（占位符版，可提交）  源指纹 ${m.sha}`);

if (privateText) {
  fs.writeFileSync(path.join(ROOT, 'flclash-private.js'), privateText, 'utf8');
  console.log(`✓ flclash-private.js（私有版，勿提交）→ 粘贴到手机  源指纹 ${m.sha}`);
} else {
  console.log('（未找到 flclash-credentials.json，跳过私有版）');
}
