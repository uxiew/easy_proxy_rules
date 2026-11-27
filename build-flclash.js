#!/usr/bin/env node
/**
 * build-flclash.js —— 生成 FlClash 用的单文件覆写脚本
 * ------------------------------------------------------------
 * FlClash 没有覆写链（不能像 Clash Party 那样 script + YAML 依次叠加），
 * 只能跑一个脚本。这个脚本把「配置头 + smart.js 全文」拼成一份文件：
 *
 *   flclash.js           配置是占位符（提交进仓库，给别人参考）
 *   flclash-private.js   配置是真实值（.gitignore 排除，粘贴到手机用）
 *
 * 真实配置放在 flclash-credentials.json（同样 .gitignore 排除），
 * 键名与桌面端的 x-smart 完全一样 —— 一份配置，两端通用：
 *   {
 *     "config": {
 *       "mode": "flclash",
 *       "residential": {
 *         "primary": "🏠 住宅-JP",
 *         "nodes": [
 *           { "name": "🏠 住宅-JP", "type": "http", "server": "1.2.3.4",
 *             "port": 7012, "username": "xxx", "password": "xxx" }
 *         ]
 *       }
 *     }
 *   }
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

const PLACEHOLDER_NODE = {
  name: '🏠 住宅-JP',
  type: 'http',
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
  if (!s || s === PLACEHOLDER_NODE.server) return PLACEHOLDER_NODE.server;
  if (s.length <= 7) return s;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

// 把 DEFAULT_CONFIG 渲染成一段只读的注释块。
// 为什么要放：手机上没法像桌面那样用覆写链，用户打开文件第一眼就该看到
// 「有哪些键、当前默认值是什么」，而不是去翻 2000 行 smart.js。
function renderConfigComment(obj) {
  return JSON.stringify(obj, null, 2)
    .split('\n')
    .map((l) => `// ${l}`)
    .join('\n');
}

const DEFAULTS = require('./smart.js').DEFAULT_CONFIG || {};

// 凭据归一化：只认一种写法（config 段），旧的顶层 nodes / 单节点自动折进去并提示。
// 归一化之后，两端的配置就是同一个对象：手机 = USER_CONFIG，桌面 = x-smart。
function normalizeCred(raw) {
  const src = JSON.parse(JSON.stringify(raw || {}));
  const cfg = src.config && typeof src.config === 'object' && !Array.isArray(src.config) ? src.config : {};
  const legacyNodes = Array.isArray(src.nodes) && src.nodes.length ? src.nodes : src.server ? [src] : [];
  let legacy = false;
  if (legacyNodes.length) {
    legacy = true;
    // 顶层就是节点清单的旧写法：primary + nodes（或单节点）
    if (!Array.isArray(cfg.residential && cfg.residential.nodes) && !(cfg.residential || {}).nodes) {
      cfg.residential = Object.assign({}, cfg.residential, { nodes: legacyNodes });
    }
    if (src.primary && !(cfg.residential || {}).primary) {
      cfg.residential = Object.assign({}, cfg.residential, { primary: src.primary });
    }
  }
  // 手机端默认就是 flclash；用户显式写了别的（'clash'）也照办
  if (!cfg.mode) cfg.mode = 'flclash';
  return { cfg, legacy };
}

function header(cfg, m) {
  const defaultsComment = renderConfigComment(DEFAULTS);
  const resi = cfg.residential || {};
  const nodes = (Array.isArray(resi.nodes) ? resi.nodes : []).filter((n) => n && n.name && n.server && n.port);
  const isPublic = !nodes.length || nodes.some((n) => n.server === PLACEHOLDER_NODE.server);
  const primary = nodes.filter((n) => n.name === resi.primary)[0] || nodes[0] || null;
  const credLine = !primary
    ? '住宅节点    : （未配置）AI 走 AI 组'
    : isPublic
      ? `住宅节点    : ${primary.name}  ->  ${PLACEHOLDER_NODE.server}:${PLACEHOLDER_NODE.port}   (占位符，使用前请填真实凭据)`
      : `住宅节点    : ${primary.name}  ->  ${maskHost(primary.server)}:${primary.port}` +
        (nodes.length > 1 ? `   (+${nodes.length - 1} 台备用，只注入、不参与自动选择)` : '');

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
 * 本文件 = 配置 + smart.js 全文，与桌面端 Clash Party 同源同逻辑
 * （重建组/规则 + AI 走住宅 + 前置亚洲跳板 + 国内直连 + 占位节点清洗 + 应用级分流）。
 * 配置只有一份，就是下面这个 USER_CONFIG —— 键名与桌面端覆写 YAML 的 x-smart
 * 完全一致，同一条配置两端都能用，不用记两套。
 *
 * 安装：FlClash -> 工具 -> 覆写 -> 新建 -> 类型「脚本」-> 粘贴全文
 *       -> 对该订阅启用覆写 -> 打开 TUN
 * ================================================================
 */

// ==========================================================
// 配置（唯一要改的地方；键名与桌面端 x-smart 相同）
// ==========================================================
// 只写要改的键：对象逐字段合并，数组整体替换；不写 = 用下面的默认值。
// 住宅凭据就在 residential.nodes 里，primary 决定锁定哪一台。
// 桌面端等价写法（覆写 YAML，排在 smart.js 之前）：
//   x-smart:
//     residential: { primary: '🏠IP-JP', nodes: [...] }
// 键表 / 合并规则 / 校验行为：docs/custom-config.md
const USER_CONFIG = ${JSON.stringify(cfg, null, 2)};

// ---------- 可用键与默认值（只作参考，不要取消注释）----------
// 要改哪项，就在上面的 USER_CONFIG 里写哪项：
${defaultsComment}

/**
 * 下面是运行时说明，读完可以忽略。
 *
 * FlClash 模式（由 config.mode = 'flclash' 打开）自动跳过的桌面专属项：
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
 */

// ================= smart.js 全文（勿手改） =================

`;
}

// smart.js 里有一行 const USER_CONFIG = {}; —— 构建时把它换成注释，
// 真正的配置已经写在文件顶部（置顶，打开就能看见）。
const USER_CONFIG_DECL = /^const USER_CONFIG = \{\};[^\n]*$/m;

function build(cfg, m) {
  if (!USER_CONFIG_DECL.test(smart)) {
    throw new Error('smart.js 里找不到 `const USER_CONFIG = {};`，无法注入顶部配置');
  }
  const body = smart.replace(USER_CONFIG_DECL, '// USER_CONFIG 已定义在本文件顶部（构建注入）');
  return header(cfg, m) + body;
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
// 地区组白名单（smart.js 里带 filter 的那批固定 key）。
// 用途：断言「AUTO 覆盖全部地区组」——只串 JP/SG/KR 而把其余丢进 OT 混选，
// 出口国家就会在港/台/美/英之间漂移。加新地区组时必须同步这里和 smart.js 的 targets。
const REGION_KEYS = ['JP', 'SG', 'KR', 'HK', 'TW', 'US', 'UK', 'DE', 'FR', 'CA', 'EU'];

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
  if (residential) {
    const members = residential.proxies || [];
    // fail-closed：REJECT 必须在列，否则节点全挂时组变空 → 内核塞 COMPATIBLE = 直连
    if (!members.includes('REJECT')) problems.push('住宅出口组没有 REJECT 兜底（节点挂了会组空/直连）');
    const resiMembers = members.filter((name) => !['REJECT', 'DIRECT', 'AI'].includes(name));
    if (resiMembers.length > 1) {
      problems.push(`住宅出口组里有多台住宅节点：${resiMembers.join(', ')}（出口 IP 会在它们之间漂移）`);
    }
    if (options.expectPin) {
      if (members[0] !== options.expectPin) {
        problems.push(`住宅出口首成员是「${members[0]}」，应为锁定的「${options.expectPin}」`);
      }
      if (residential['include-all-proxies']) {
        problems.push('锁定模式仍带 include-all-proxies（其它住宅节点会被内核收进组，等于没锁）');
      }
    }
  }
  if (upstream && (upstream.proxies || []).includes('DIRECT')) {
    problems.push('前置-亚洲组成员含 DIRECT（等于拆掉跳板、可能裸连住宅 IP）');
  }
  if (options.expectNoResidential && residential) {
    problems.push('无家宽构建仍生成了「住宅出口」组');
  }

  // AUTO / AI 的成员必须是「所有仍然存在的地区组，按国家顺序 + OT 收尾」
  for (const name of ['AUTO', 'AI']) {
    const group = groups.find((g) => g.name === name);
    if (!group) {
      problems.push(`缺少 ${name} 组`);
      continue;
    }
    if (group.type !== 'fallback') {
      problems.push(`${name} 的类型是 ${group.type}，应为 fallback（国家顺序即优先级）`);
      continue;
    }
    const members = group.proxies || [];
    const missing = REGION_KEYS.filter((k) => nameSet.has(k) && !members.includes(k));
    if (missing.length) problems.push(`${name} 未覆盖地区组：${missing.join(', ')}（出口会在国家之间漂移）`);
    const present = REGION_KEYS.filter((k) => nameSet.has(k));
    const ordered = members.filter((m) => present.includes(m));
    if (ordered.join(',') !== present.join(',')) {
      problems.push(`${name} 的地区成员顺序与 REGION_KEYS 不一致：${ordered.join(' → ')}`);
    }
    if (members.includes(name)) problems.push(`${name} 的成员里含自身`);
    const ot = members.indexOf('OT');
    if (ot >= 0 && ot !== members.length - 1) problems.push(`${name} 里的 OT 不在最后一位（会抢占地区组）`);
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

// smart.js 里的内联 STUN 清单必须与 ruleset/webrtc-guard.list 逐条一致：
// 清单是给人看的，代码才是实际运行的那份。漂移的后果是「文档写 11 条、实际拦 8 条」，
// 而泄露测试只会告诉你「还是泄露」，不会告诉你是哪一条没生效。
function checkWebrtcParity() {
  const src = fs.readFileSync(SMART_PATH, 'utf8');
  const block = src.match(/const WEBRTC_GUARD_RULES = \[([\s\S]*?)\];/);
  if (!block) return ['smart.js 里找不到 WEBRTC_GUARD_RULES'];
  const inline = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].trim());
  const file = (readList('ruleset/webrtc-guard.list') || []).map((parts) => parts.join(','));
  if (!inline.length) return ['WEBRTC_GUARD_RULES 为空'];
  if (inline.length !== file.length || inline.some((v, i) => v !== file[i])) {
    return [
      `WEBRTC_GUARD_RULES（${inline.length} 条）与 ruleset/webrtc-guard.list（${file.length} 条）不一致`,
    ];
  }
  return [];
}

function assertGenerated(targets) {
  const failures = [...checkWebrtcParity()];
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

// 占位符版：节点地址是占位符（端口 0，脚本不会注入），enabled 用 'auto'
// → 手机上找不到任何可用住宅节点，自动改走 AI 组，开箱不会把 AI 全阻断。
const publicCfg = {
  mode: 'flclash',
  residential: {
    enabled: 'auto',
    primary: '',
    nodes: [PLACEHOLDER_NODE],
  },
};
const publicText = build(publicCfg, m);
const targets = [{ label: 'flclash.js（占位符版）', text: publicText, expectNoResidential: true }];

const credPath = path.join(ROOT, 'flclash-credentials.json');
let privateText = null;
if (fs.existsSync(credPath) && !process.argv.includes('--public')) {
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { cfg, legacy } = normalizeCred(cred);
  if (legacy) {
    console.log('· flclash-credentials.json 是旧写法（顶层 nodes / 单节点）→ 已自动折进 config.residential');
  }
  const resi = cfg.residential || {};
  const all = Array.isArray(resi.nodes) ? resi.nodes : [];
  const nodes = all.filter((n) => n && n.name && n.server && n.port);
  if (!nodes.length) {
    console.error('✗ flclash-credentials.json 里没有可用住宅节点（需要 name / server / port）');
    process.exit(1);
  }
  if (nodes.length !== all.length) {
    console.error('✗ residential.nodes 里有节点缺 name / server / port（每一项都要齐全）');
    process.exit(1);
  }
  for (const n of nodes) {
    if (!n.type) {
      console.log(
        `· 节点「${n.name}」没写 type → 按 http 处理（多数静态住宅是 HTTP 代理）；` +
          'SOCKS5 端口请显式写 type: "socks5"',
      );
    }
  }
  // 只有 smart.js 里 pinOnly 真的开着时，才断言「锁定」形态：
  // pinOnly: false 是合法配置（全部住宅节点可选），不该被当成回归拦下来。
  // 正则锚定行首两空格的**配置行**，避开注释里出现的 "pinOnly: true" 字样。
  const pinOnlyOn = /^ {2}pinOnly:[ \t]*true\b/m.test(smart);
  // primary 可能指向订阅自带的住宅节点，所以「对不上注入的节点」只提醒不拦。
  const pinned = nodes.filter((n) => n.name === resi.primary)[0];
  if (resi.primary && !pinned) {
    console.log(
      `· residential.primary「${resi.primary}」不在 residential.nodes 里 —— ` +
        '若订阅里也没有同名节点，住宅出口会只剩 REJECT（AI 被阻断）',
    );
  }
  privateText = build(cfg, m);
  targets.push({
    label: 'flclash-private.js（私有版）',
    text: privateText,
    expectPin: pinOnlyOn && pinned ? pinned.name : '',
  });
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
