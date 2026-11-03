/**
 * FlClash / mihomo 系客户端「覆写脚本」
 * ------------------------------------------------------------
 * 作用：在订阅配置之上，追加「静态住宅出口」和「AI 走住宅」的分流。
 * 适用：FlClash（Android / Windows / macOS / Linux）
 * 用法：FlClash → 配置 → 覆写 → 新建 → 类型选「脚本」→ 粘贴本文件
 *
 * 只做三件事，不重建订阅自带的组和规则：
 *   1) 追加住宅节点（socks5，经任意日本节点中转）
 *   2) 追加「前置-日本」「住宅出口」两个组
 *   3) 把 ai-strict 规则集插到规则链最前，命中的域名走住宅
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

// AI 服务商精确域名清单（含 Turnstile / auth0 / Persona / 遥测）
const AI_STRICT_URL =
  'https://cdn.jsdmirror.com/gh/uxiew/easy_proxy_rules@main/ruleset/ai-strict.list';

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
    // 与 smart.js 的 smartGroups.JP 保持同一套匹配词（JP|日|東|东|大阪|埼玉|🇯🇵|Japan），
    // 机场改成 JP-01 / 东京 / Japan 之类都能命中；改完记得同步 smart.js
    filter: 'JP|日|東|东|大阪|埼玉|🇯🇵|Japan',
    // 必须排除住宅节点本身（名字里的 JP 会命中上面的 filter，形成 dialer 环）
    'exclude-filter': '住宅|WS-',
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
  };

  // 住宅组：select 单成员，节点挂了就阻断，不会自动切到机场 IP
  const resGroup = {
    name: RES_GROUP,
    type: 'select',
    proxies: [RESIDENTIAL.name],
  };

  config['proxy-groups'].unshift(resGroup, upstream);

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
