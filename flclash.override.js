/**
 * FlClash / mihomo 系客户端「覆写脚本」
 * ------------------------------------------------------------
 * 作用：在订阅配置之上，追加「静态住宅出口」和「AI 按出口分流」。
 * 适用：FlClash（Android / Windows / macOS / Linux）
 * 用法：FlClash → 配置 → 覆写 → 新建 → 类型选「脚本」→ 粘贴本文件
 *
 * 结构：EXITS 数组，每个出口 = 住宅节点 + 出口组 + 上游组 + 规则集。
 *   - 只追加组/规则/节点，不改动订阅自带的配置，订阅更新不受影响
 *   - 第一个出口是主出口（Claude 等默认走它），后续出口按服务商分流
 *   - 某出口没配节点也可以开着：出口组兜底 AI（机场），对应服务商不断流
 *
 * ⚠️ 下面 EXITS 里有账号密码，这份文件只放本机，不要提交到任何仓库。
 */

// ============ 唯一需要改的地方 ============
const CDN_BASE = 'https://cdn.jsdmirror.com/gh/uxiew/easy_proxy_rules@main/ruleset';
// 国内直连（省流量）。订阅自带规则够用的话可以改 false
const CN_DIRECT = true;

const EXITS = [
  {
    // 主出口：日本。Claude 全套 + 通用风控基础设施（Turnstile/auth0/stripe…）
    enabled: true,
    node: {
      name: '🏠 住宅-JP',
      server: 'YOUR_HOST',
      port: 0,
      username: 'YOUR_USERNAME',
      password: 'YOUR_PASSWORD',
    },
    group: '住宅出口',
    // 收编哪些节点：主出口宽匹配，自动排除下面其它出口的节点
    nodeFilter: '住宅|WS-',
    upstream: { name: '前置-日本', filter: 'JP|日|東|东|大阪|埼玉|🇯🇵|Japan' },
    rules: [{ provider: 'aiStrict', file: 'ai-strict.list' }],
  },
  {
    // 美国出口：OpenAI 全家（openai.com / sora / openai.azure.com → 美国住宅 IP）
    // 填好凭据后把 enabled 改成 true 即启用；没节点时开着也安全（兜底 AI 组）
    enabled: false,
    node: {
      name: '🏠 住宅-US',
      server: 'YOUR_US_HOST',
      port: 0,
      username: 'YOUR_US_USERNAME',
      password: 'YOUR_US_PASSWORD',
    },
    group: '住宅-US',
    nodeFilter: '住宅.*(US|美)|WS.*(US|美)',
    upstream: { name: '前置-美国', filter: 'US|美|🇺🇸|States|American|洛杉' },
    rules: [{ provider: 'aiStrictUS', file: 'ai-strict-us.list' }],
  },
];
// =========================================

function main(config) {
  config.proxies = config.proxies || [];
  config['proxy-groups'] = config['proxy-groups'] || [];
  config['rule-providers'] = config['rule-providers'] || {};
  config.rules = config.rules || [];

  const active = EXITS.filter((e) => e.enabled);
  if (!active.length) return config;

  // ---- 1. 住宅节点（先按名字去重，避免重复执行后叠加）----
  for (const exit of active) {
    config.proxies = config.proxies.filter((p) => p.name !== exit.node.name);
    config.proxies.push({
      name: exit.node.name,
      type: 'socks5', // ⚠️ 必须 socks5：http 类型配 dialer-proxy 实测连不通
      server: exit.node.server,
      port: exit.node.port,
      username: exit.node.username,
      password: exit.node.password,
      udp: false,
      'skip-cert-verify': false,
      'dialer-proxy': exit.upstream.name,
    });
  }

  // ---- 2. 每个出口两个组：出口组（select）+ 上游组（url-test）----
  config['proxy-groups'] = config['proxy-groups'].filter(
    (g) => !active.some((e) => e.group === g.name || e.upstream.name === g.name)
  );

  // 主出口要排除其它出口的节点：同一个节点不能进两个组（会分流错乱/成环）
  const extraFilters = active.slice(1).map((e) => e.nodeFilter);
  const newGroups = active.flatMap((exit, i) => {
    const exitGroup = {
      name: exit.group,
      type: 'select',
      // 只有节点自己：脚本一定会注入这个节点，不存在「没配节点」的情况；
      // 节点挂了就阻断（fail-closed），不依赖订阅里有没有叫 AI 的组
      proxies: [exit.node.name],
      'include-all-proxies': true,
      filter: exit.nodeFilter,
      ...(i === 0 && extraFilters.length
        ? { 'exclude-filter': extraFilters.join('|') }
        : {}),
      'include-all': false,
    };
    const upstreamGroup = {
      name: exit.upstream.name,
      type: 'url-test', // 自动选最快的该地区节点；REJECT 兜底防「组空→直连泄漏」
      proxies: ['REJECT'],
      'include-all-proxies': true,
      filter: exit.upstream.filter,
      // 住宅节点不能当自己出口的地理上游（名字里的 JP/US 会命中 filter，成环）
      'exclude-filter': '住宅|WS-',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
    };
    return [exitGroup, upstreamGroup];
  });
  config['proxy-groups'].unshift(...newGroups.slice().reverse());

  // ---- 3. 规则：每个出口的规则集插到最前，命中的域名走该出口 ----
  for (const exit of active) {
    for (const r of exit.rules) {
      config['rule-providers'][r.provider] = {
        type: 'http',
        behavior: 'classical',
        format: 'text',
        url: `${CDN_BASE}/${r.file}`,
        interval: 86400,
        path: `./ruleset/flclash/${r.file.replace(/\.list$/, '.yaml')}`,
      };
    }
  }

  const head = active.flatMap((exit) =>
    exit.rules.map((r) => `RULE-SET,${r.provider},${exit.group}`)
  );
  if (CN_DIRECT) {
    head.push('GEOSITE,cn,DIRECT');
    head.push('GEOIP,CN,DIRECT,no-resolve');
  }

  // 去掉已存在的同名/同内容规则，避免订阅里本来就有的规则重复出现
  const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
  const headSet = new Set(head.map(norm));
  const kept = config.rules.filter((r) => {
    const n = norm(r);
    if (/^rule-set,aistrict(us)?,/.test(n)) return false;
    return !headSet.has(n);
  });
  config.rules = head.concat(kept);

  return config;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = main;
}
