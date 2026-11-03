/**
 * FlClash / mihomo 系客户端「覆写脚本」
 * ------------------------------------------------------------
 * 作用：在订阅配置之上，追加「静态住宅出口」和「AI 走住宅」的分流。
 * 适用：FlClash（Android / Windows / macOS / Linux）
 * 用法：FlClash → 配置 → 覆写 → 新建 → 类型选「脚本」→ 粘贴本文件
 *
 * 只做四件事，不重建订阅自带的组和规则：
 *   1) 追加住宅节点（socks5，经任意日本节点中转）
 *   2) 追加「前置-日本」「住宅出口」两个组
 *   3) 把 ai-strict 规则集插到规则链最前，命中的域名走住宅
 *   4) 剔掉订阅组里的占位节点（到期/流量/官网），防 url-test 选中它们
 *
 * ⚠️ 下面 RESIDENTIAL 里有账号密码，这份文件只放本机，不要提交到任何仓库。
 */

// ============ 唯一需要改的地方 ============
const RESIDENTIAL = {
  name: '🏠 住宅-JP',
  server: 'YOUR_HOST',      // 住宅代理服务器地址
  port: 0,                  // 住宅代理端口
  username: 'YOUR_USERNAME',
  password: 'YOUR_PASSWORD',
  // 上游：任意日本节点自动择优；全部失效时落到 REJECT 阻断，不会跑到美/新/韩
  dialer: '前置-日本',
};

// 住宅组名（规则里引用它）
const RES_GROUP = '住宅出口';

// 机场占位/信息节点（到期、剩余流量、官网、续费地址……）。
// 它们常是能通的真代理：url-test/fallback 会选中它们当出口（换订阅实测踩坑，
// 「自动选择」选中占位节点后所有境外流量全挂——表现为「无法访问 google」）。
// 下面会把这些节点从订阅自带的组里剔掉，只保留手动可见。
const INFO_NODE_PATTERN =
  '套餐|剩余|到期|已用|重置|流量|官网|续费|地址|更新订阅|过期|有效|客户|下载|不显示|电报|频道|工单|ㅤ';

// AI 服务商精确域名清单（含 Turnstile / auth0 / Persona / 遥测）
// ⚠️ 用 raw 直链而不是 jsdmirror：镜像对本仓库文件的缓存更新很慢
//    （实测推送新规则后镜像仍返回旧版）；内核拉规则集走隧道，raw 可达。
const AI_STRICT_URL =
  'https://raw.githubusercontent.com/uxiew/easy_proxy_rules/refs/heads/main/ruleset/ai-strict.list';

// 国内直连（省流量）。订阅自带规则够用的话可以改 false
const CN_DIRECT = true;
// =========================================

function main(config) {
  config.proxies = config.proxies || [];
  config['proxy-groups'] = config['proxy-groups'] || [];
  config['rule-providers'] = config['rule-providers'] || {};
  config.rules = config.rules || [];

  // ---- 1. 住宅节点（先按名字去重，避免重复启动后叠加）----
  config.proxies = config.proxies.filter((p) => p.name !== RESIDENTIAL.name);
  config.proxies.push({
    name: RESIDENTIAL.name,
    type: 'socks5',
    server: RESIDENTIAL.server,
    port: RESIDENTIAL.port,
    username: RESIDENTIAL.username,
    password: RESIDENTIAL.password,
    udp: false,
    'skip-cert-verify': false,
    'dialer-proxy': RESIDENTIAL.dialer,
  });

  // ---- 2. 两个组 ----
  config['proxy-groups'] = config['proxy-groups'].filter(
    (g) => g.name !== RES_GROUP && g.name !== RESIDENTIAL.dialer
  );

  // 前置组：只收名字含「日本」的节点，REJECT 兜底（url-test 会跳过 REJECT，
  // 只有全部失效时才会选它 → 阻断，而不是掉到其它地区）
  const upstream = {
    name: RESIDENTIAL.dialer,
    type: 'url-test',
    proxies: ['REJECT'],
    'include-all-proxies': true,
    // 与 smart.js 的 smartGroups.JP 保持同一套匹配词（日本|JP|Japan|🇯🇵|东京|大阪|…），
    // 机场改成 JP-01 / 东京 / Japan 之类都能命中；改完记得同步 smart.js。
    // ⚠️ 只用多字关键词，不要放单字「日」「東」「东」：
    //   [东帝汶]（东）、[尼日利亚]（日）、🇦🇶[到期: 2027年xx月xx日]（日）会被单字误收
    filter: '日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉|川崎|横浜|名古屋',
    // 排除两类：
    //   1) 住宅节点本身（名字里的 JP 会命中 filter，形成 dialer 环）
    //   2) 机场占位/信息节点（能通但不是给流量用的，url-test 可能选中它们）
    'exclude-filter': `住宅|WS-|${INFO_NODE_PATTERN}`,
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
  };

  // 住宅组：select 单成员，节点挂了就阻断，不会自动切到机场 IP
  // 出口组：只有住宅节点本身，不放 AI 兜底。
  // select 不会自动切换，但「选中的节点消失」时内核会回落到第一个成员；
  // 第一个成员若是 AI，住宅节点一没就静默走机场（IP 变了都不知道）。
  // 这里脚本一定会注入节点，所以单成员即可，节点挂了直接阻断（fail-closed）。
  const resGroup = {
    name: RES_GROUP,
    type: 'select',
    proxies: [RESIDENTIAL.name],
  };

  config['proxy-groups'].unshift(resGroup, upstream);

  // ---- 2.5 清洗订阅自带组里的占位/信息节点 ----
  // 订阅的「落云/自动选择/故障转移」等组把到期、剩余流量、官网等占位节点
  // 排在成员列表最前面。url-test/fallback 组会把它们当真节点探测选中
  // （实测：选中后所有境外流量全挂，表现为「无法访问 google」）。
  // 只从组里剔掉，不删节点本身（面板手动点开仍能看到信息）。
  const infoRe = new RegExp(INFO_NODE_PATTERN, 'i');
  for (const g of config['proxy-groups']) {
    if (Array.isArray(g.proxies) && g.proxies.length > 0) {
      const cleaned = g.proxies.filter((p) => !infoRe.test(String(p)));
      if (cleaned.length > 0 && cleaned.length !== g.proxies.length) {
        g.proxies = cleaned;
      }
    }
  }

  // ---- 3. 规则 ----
  config['rule-providers'].aiStrict = {
    type: 'http',
    behavior: 'classical',
    format: 'text',
    url: AI_STRICT_URL,
    interval: 86400,
    path: './ruleset/flclash/ai-strict.list',
  };

  const head = [`RULE-SET,aiStrict,${RES_GROUP}`];
  if (CN_DIRECT) {
    head.push('GEOSITE,cn,DIRECT');
    head.push('GEOIP,CN,DIRECT,no-resolve');
  }

  // 去掉已存在的同名/同内容规则，避免订阅里本来就有的规则重复出现
  const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  const headSet = new Set(head.map(norm));
  const kept = config.rules.filter((r) => {
    const n = norm(r);
    if (n.startsWith('rule-set,aistrict,')) return false;
    return !headSet.has(n);
  });
  config.rules = head.concat(kept);

  return config;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = main;
}
