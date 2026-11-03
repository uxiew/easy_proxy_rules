/**
 * Clash Verge / Clash Party 智能分流覆写脚本
 *
 * 脚本功能：
 * 1. 节点清洗 - 移除不可用、倍率异常、广告推广等垃圾节点
 * 2. 智能分组 - 为 AI、流媒体建立专用自动组
 * 3. 省流模式 - 强制机场默认自动选择调整为 60分钟测速
 * 4. 规则注入 - 直连规则(端口/IP) > 专用规则 > 默认规则
 *
 * TUN模式SSH直连解决方案：
 * - 新增 directSSHIPs 配置SSH服务器IP/网段
 * - 新增 directPorts 配置直连端口(默认22)
 * - 规则优先级：端口直连 > IP直连 > 域名直连 > 专用规则
 *
 * 【本文件 vs 覆写 YAML 的职责边界】(新增)
 * 本文件会被提交到公共仓库，因此只放「逻辑」，不放任何服务器/账号/密码。
 * - 这里：建组「住宅出口」+ 决定"哪一类规则走哪个组"
 * - 覆写 YAML：住宅节点的 server/port/username/password/dialer-proxy（密钥）
 * 两边通过「节点名」解耦：覆写里的节点名只要含「住宅」或「WS-」，就会被自动收编进组里。
 *
 * 【规则内容去哪了】(新增)
 * 域名清单不再写在脚本里，全部在仓库的 ruleset/ 下，改域名不用动 JS：
 *   ruleset/residential.list  → 住宅出口（OpenAI/Claude/账号支付等）
 *   ruleset/direct-extra.list → 强制直连（国内常用 + co.jp）
 *   ruleset/auto-extra.list   → Google 通用资产（走机场 AUTO）
 *   ruleset/ai.yaml           → AI 平台规则集（forAI）
 * 脚本里只留三类没法放进规则集的：DOMAIN-KEYWORD / DST-PORT / IP-CIDR。
 *
 * 【⚠️ 多个覆写文件的应用顺序】(新增，踩坑点)
 * Clash Party 按「覆写列表」的顺序依次应用，本脚本是**整体替换**的：
 *     config['proxy-groups'] = ...   config.rules = ...   config['rule-providers'] = ...
 * 也就是说，排在 smart.js **前面**的 YAML 覆写，它加的 rules / proxy-groups /
 * rule-providers 会被本脚本整段丢掉（只有 proxies 能活下来，因为脚本不重建节点列表）。
 * 结论：所有 YAML 覆写都必须排在 smart.js **后面**，多写几个文件也不会互相覆盖，
 *       只要每个文件都用 `+` 前缀（`+proxies` / `+rules` / `+proxy-groups`）。
 */

// CDN 配置（可切换）
// ⚠️ 规则集是在「内核还没起来」时拉取的，那一刻没有代理可用，必须选国内直连能通的源。
//    jsDelivr 官方 CDN 在国内多数网络下 TLS 直接失败（实测 HTTP 000，已存在的旧文件也 000），
//    后果是 rule-provider 全部为空、所有流量掉进 MATCH → AUTO，国内站也绕道境外。
//    jsdmirror 实测 200，覆盖本仓库和 Loyalsoldier / ACL4SSR 上游。
const CDN_BASE_CN = 'https://cdn.jsdmirror.com/gh'; // 国内镜像（默认）
const CDN_BASE = CDN_BASE_CN;
// const CDN_BASE = `https://cdn.jsdelivr.net/gh`; // 海外网络可切回 jsDelivr 官方
// const CDN_BASE = "https://gcore.jsdelivr.net/gh";      // 备用：GCore CDN
// const CDN_BASE = "https://testingcf.jsdelivr.net/gh";  // 备用：Cloudflare CDN

// ===========================
// 第一部分：自定义关键词和规则
// ======= 自定义关键词 =======
// 代理关键词
const proxyKeywords = [
  // "example", 示例，可以添加需要代理的关键词
];

// 直连关键词
const directKeywords = [
  //"example",  示例，可以添加需要直连的关键词
];

// 【说明】原来这里的 directDomains 数组（baidu/qq/163/taobao/jd/cn/apple.com.cn）
// 已迁移到 ruleset/direct-extra.list。那 7 条其实全被 GEOSITE,cn 覆盖，属于冗余，
// 统一放文件里：以后加直连域名只改文件，不用动脚本，smart.js 也不会越写越长。

// 拦截关键词
const rejectKeywords = [
  //"example",  示例，可以添加需要拦截的关键词
  'adobe.io', //屏蔽Adobe正版检测可能违反软件许可协议
];

// 【直连端口】
// 作用：列表内的端口，强制不走代理，直接连接。
// 理由：解决TUN模式下特定端口流量被代理的问题(如SSH 22端口)。
const directPorts = [22];

// 【直连IP/网段】
// 作用：列表内的IP或CIDR网段，强制不走代理，直接连接。
// 理由：解决TUN模式下SSH服务器IP直连失效问题。
const directSSHIPs = [
  // "192.168.1.100",   // 单个IP地址
  // "10.0.0.0/8",      // CIDR网段格式
];

// ===========================
// 【新增】静态住宅 IP 出口（链式代理）
// ===========================
// 为什么这么拆：住宅代理的账号密码属于敏感信息，不能进会公开的 smart.js。
// 所以这里只做「建组 + 写规则」，连接信息全部由覆写 YAML 提供。
//
// 链路：本地 → 机场节点(dialer-proxy) → 住宅 IP → 目标站点
//   机场负责「跑得快」，住宅 IP 负责「脸干净」，这也是住宅代理在国内最稳的用法
//   （从国内直连海外住宅 IP 通常又慢又不稳，别省掉跳板）。
//
// 覆写 YAML 里要写的东西（示例见仓库 residential.example.yaml）：
//   proxies:
//     - name: '🏠 住宅-US'          # 名字必须能命中下面的 nodePattern
//       type: http                   # 或 socks5，按 Webshare 后台给的协议
//       server: x.x.x.x
//       port: 12345
//       username: 'xxx'
//       password: 'xxx'
//       dialer-proxy: AUTO           # 关键：用机场节点当跳板
//       udp: false                   # 住宅代理基本不支持 UDP
//   proxy-groups 不需要你写，本脚本会建「住宅出口」组并自动收编上面这个节点。
//
// 组内默认选中 AI，所以：没配住宅节点时行为与改造前完全一致，不会把配置搞挂；
// 配好之后在 Clash Party「代理」页把「住宅出口」切到 🏠 住宅-xxx 即生效（只需一次）。
const RESIDENTIAL = {
  enabled: true, // 一键开关：false = 完全回到改造前的行为
  group: '住宅出口', // 组名，规则引用它；不要在覆写 YAML 里重复定义同名组，否则内核报重名
  nodePattern: '住宅|WS-', // 节点名匹配（Go RE2 正则），覆写里的节点名必须能命中

  // 【方案 A｜当前采用】AI 服务商官方域名走住宅
  // ai-strict.list 里只放「有账号体系、会风控」的服务商（Claude / OpenAI / Grok / Perplexity …），
  // 连同它们的人机验证、登录托管、遥测域名一起走住宅——主站和验证必须同 IP，否则照样被拦。
  // 中转站、镜像站、API 代理不在这个文件里，继续走普通 AI 组（机场），不浪费住宅带宽。
  aiStrict: true,

  // 住宅专用入口端口：mihomo 的 listeners 会把这个端口整体绑到「住宅出口」组，
  // 进来的流量不再经过规则匹配。给 Proxifier / 不走系统代理的程序用（0 = 关闭）。
  // 用法：Proxifier 里添加 SOCKS5 代理 127.0.0.1:7865，规则里指定要强制走住宅的程序。
  dedicatedPort: 7865,

  // 【上游出口】住宅节点 dialer-proxy 指向的组：任意日本节点自动择优，全灭则阻断。
  // 为什么不固定单个节点、也不用全机场 AUTO：
  //   - AUTO 是 url-test 全量收编，中转可能跳到美/新/韩——出口 IP 没变，
  //     但中转路径的 ASN 和延迟特征每次都在变，对风控不友好；
  //   - 固定单节点最稳，但那一个节点挂了就全断，可用性太差。
  // 折中：只收「日本」节点。节点名必须含 filter 关键词，订阅改名后组会变空，
  // 此时 url-test 落到 REJECT 兜底（阻断而不是泄漏），把 filter 改成新关键词即可恢复。
  // 覆写 YAML 里的住宅节点写 dialer-proxy: 前置-日本 即可。
  upstream: {
    enabled: true,
    group: '前置-日本', // 组名，覆写 YAML 的 dialer-proxy 引用它；别重复定义同名组
    // 节点名匹配：留空 = 直接复用 smartGroups.JP 的 filter（JP|日|東|东|大阪|埼玉|🇯🇵|Japan），
    // 和地区组永远同步；要单独定制再填字符串。
    filter: '',
  },

  // 【多出口】额外的住宅出口：每个出口 = 出口组 + 上游组 + 规则集 三件套。
  // 场景：两个住宅 IP 同时在线，按服务商分流（如 Claude→日本、OpenAI→美国）。
  // 节点命名仍必须命中 nodePattern（住宅|WS-），且命中该出口的 nodeFilter；
  // 主出口（住宅出口）会自动排除这些节点，同一个节点不会进两个组、不会成环。
  // 没配该出口的节点也可以开着：出口组兜底到 AI（机场），对应服务商走机场不断流。
  extraExits: [
    {
      enabled: true,
      group: '住宅-US', // 出口组名，规则引用它；别在覆写 YAML 里重复定义
      // 收编哪些节点：名字含「住宅/WS-」且带美国标识（住宅-US、WS-US、住宅-美 …）
      nodeFilter: '住宅.*(US|美)|WS.*(US|美)',
      // 上游组：住宅节点的 dialer-proxy 指向它。region = 复用 smartGroups 的地区 filter
      upstream: { group: '前置-美国', region: 'US' },
      // 走本出口的规则集（在 ruleset/ 下，增删服务商改文件即可）
      rules: [{ provider: 'aiStrictUS', file: 'ai-strict-us.list' }],
    },
  ],

  // 【方案 B｜已关闭】整个 RULE-SET,forAI 走住宅
  // 为什么关掉：ai.yaml 是个大杂烩，除了 AI 服务商还塞了 Apple 全家桶、
  // DOMAIN-KEYWORD,google、DOMAIN-REGEX,google.*、sentry/datadog/auth0 等通用服务商。
  // 整段丢给住宅的后果：googlevideo.com（YouTube 视频流）也会命中 DOMAIN-REGEX,google.*，
  // 几 GB 流量按住宅计费，一小时烧掉一个月额度。
  // 想回到「一刀切」就把 aiStrict 设 false、这里设 true。
  allAI: false,

  // 走住宅出口的域名清单已迁出到 ruleset/（一行一个 DOMAIN-SUFFIX），
  //   ruleset/ai-strict.list   → AI 服务商及其验证/遥测依赖
  //   ruleset/residential.list → 非 AI 的账号/支付/电商
  // 以后增删站点直接改那两个文件，不用碰脚本。
};

// ===========================
// 【新增】省流量开关（国内直连）
// ===========================
// 机场流量是按 GB 算的，下面两类规则会把大量本该直连的流量送进代理，这里统一收口。
const TRAFFIC = {
  // GEOSITE,cn → DIRECT。原来只靠 RULE-SET,ChinaDomain/direct + GEOIP,CN 兜底，
  // 而 GEOIP,CN 是 IP 规则，对 fake-ip 域名无效，漏网的国内站会掉进 tld-not-cn → AUTO 白烧流量。
  domesticDirect: true,
  // Apple 全家桶（iCloud 同步 / App Store / 系统更新）原来是 RULE-SET,apple → AI、
  // RULE-SET,icloud → AUTO，等于把几个 GB 的更新包全走机场。国内/日本直连 Apple 都有 CDN，
  // 改成 DIRECT 是这份配置里最省流量的一刀。
  appleDirect: true,
};

// ===========自动识别并分配 策略组=========
// ===========自动识别并分配 策略组=========
// ⚠️ 修复：移除了不兼容 Go 正则引擎的 or() 和 nor() 预查函数

// 【组名规则】回答"组名会不会和内置名冲突"：
// 1. 内核内置策略只有 4 个：DIRECT / REJECT / PASS / GLOBAL（外加规则里的 MATCH 关键字）。
//    这些名字**不能**拿来做自定义组名，否则会覆盖内置策略，规则行为直接乱掉。
// 2. AUTO、CATCH、AI、SPEED、JP、US 这些都不在保留字里，和内核不冲突，可以放心用。
// 3. 真正的雷是「重名」：同一份配置里出现两个同名组，内核直接校验失败
//       ProxyGroup xxx: duplicate group name
//    所以覆写 YAML 里**不要**再定义 住宅出口 / AUTO / AI 这类本脚本已经建好的组。
// 4. 顺带说明：CATCH 组目前没有被任何规则引用（纯兜底展示），保留是为了手动切流量时方便。

const smartGroups = {
  // --------------- 以下为静态代理组 ---------------
  AUTO: {
    proxies: ['US', 'JP', 'HK', 'SPEED'],   // , 'DIRECT'
    // 根据 interval: 300（每 5 分钟），拿测试网址（代码里写的是 Apple 的测试页）去挨个测试组里的节点。
    // 在浏览器输入网址时，Clash 会自动选择当前测速结果最快、且能连通的节点。
    interval: 300, // 每 5 分钟
    type: 'url-test',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/adjust.svg`,
  },
  AI: {
    // 关键修改：将类型改为 fallback
    type: 'fallback',
    // 建议缩短 interval，比如 200 秒探测一次，确保切换及时
    interval: 200,
    // 对于 fallback，这个值代表判定失败的容差
    tolerance: 50,
    // 顺序很重要：流量会从左往右按顺序探测，第一个（小日子）不通才跳下一个
    proxies: [ 'JP', 'SG', 'US', 'DE', 'KR'],
    icon: 'https://github.com/DustinWin/ruleset_geodata/releases/download/icons/ai.png',
  },
  ADS_FILTER: {
    proxies: ['REJECT', 'AUTO'], // 默认拦截，留备选项用于除错
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/bug.svg`,
  },
  // _DIRECT: {
  //   proxies: ['DIRECT'], // 强制必须直连，不留备选项
  //   icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/link.svg`,
  // },
  // _REJECT: {
  //   proxies: ['REJECT'], // 强制必须拦截，不留备选项
  //   icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/block.svg`,
  // },
  CATCH: {
    proxies: ['AUTO'], // 未知流量优先走代理，以防外网连不上
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/fish.svg`,
  },
  // --------------- 以下为静态代理组 ---------------
  SPEED: {
    tolerance: 50,
    type: 'url-test',
    filter: '.*', // 匹配所有节点
    'exclude-filter': '套餐|剩余|到期|流量|官网', // 使用原生的排除字段
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/speed.svg`,
  },
  NSFW: {
    type: 'fallback',
    interval: 200,
    tolerance: 50,
    proxies: ['JP', 'TW', 'KR', 'US', 'DE'],
    icon: 'https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Pornhub.png',
  },
  TW: {
    filter: '台|TW|Tai|🇹🇼',
    icon: `${CDN_BASE}/uxiew/easy_proxy_rules@main/assets/cn.svg`,
  },
  HK: {
    filter: '港|HK|Hong|🇭🇰',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/hk.svg`,
  },
  JP: {
    filter: 'JP|日|東|东|大阪|埼玉|🇯🇵|Japan',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg`,
  },
  KR: {
    filter: '韩|韓|首|爾|春川|🇰🇷|KR|Korea',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/kr.svg`,
  },
  SG: {
    filter: '新加坡|SG|坡|狮城|🇸🇬|Singapore',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/sg.svg`,
  },
  US: {
    type: 'url-test',
    tolerance: 100,
    filter: 'US|美|🇺🇸|States|American|洛杉',
    'exclude-filter': '日|俄|韩', // 直接写字符串即可
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/us.svg`,
  },
  UK: {
    filter: 'UK|英|🇬🇧|Kingdom|Britain|British|England',
    type: 'url-test',
    icon: `${CDN_BASE}/uxiew/easy_proxy_rules@main/assets/uk.svg`,
  },
  FR: {
    filter: 'FR|法国|🇫🇷',
    type: 'url-test',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/fr.svg`,
  },
  DE: {
    filter: 'DE|柏|德国|🇩🇪|Germany',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/de.svg`,
  },
  CA: {
    filter: 'CA|柏|加拿大|🇨🇦|Canada',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/ca.svg`,
  },
  EU: {
    filter:
      '时|🇧🇪|丹|🇩🇰|希|🇬🇷|爱|🇮🇪|荷兰|NL|🇳🇱|意|🇮🇹|卢森|葡|🇵🇹|西班|🇪🇸|奥地利|🇦🇹|芬|🇫🇮|瑞典|🇸🇪|RO|罗马尼亚‌|🇷🇴‌',
    proxies: ['DE', 'FR'],
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/eu.svg`,
  },
};

// ===========================

// ======== 配置代理组 ========
// 规则集通用配置
const ruleProviderCommon = {
  type: 'http',
  format: 'yaml',
  interval: 86400,
};

// 规则集提供者
const ruleProviders = {
  // 拦截规则集
  reject: {
    ...ruleProviderCommon,
    behavior: 'domain',
    type: 'http',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/reject.txt`,
    path: './ruleset/loyalsoldier/reject.yaml',
  },
  BanEasyListChina: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/BanEasyListChina.list`,
    path: './ruleset/acl4ssr/BanEasyListChina.yaml',
  },
  BanEasyList: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/BanEasyList.list`,
    path: './ruleset/acl4ssr/BanEasyList.yaml',
  },
  // 局域网与私有地址
  private: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/private.txt`,
    path: './ruleset/loyalsoldier/private.yaml',
  },
  applications: {
    ...ruleProviderCommon,
    behavior: 'classical',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/applications.txt`,
    path: './ruleset/loyalsoldier/applications.yaml',
  },
  lancidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/lancidr.txt`,
    path: './ruleset/loyalsoldier/lancidr.yaml',
  },
  // 通用服务代理规则集
  OneDrive: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/OneDrive.list`,
    path: './ruleset/acl4ssr/OneDrive.yaml',
  },
  icloud: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/icloud.txt`,
    path: './ruleset/loyalsoldier/icloud.yaml',
  },
  apple: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/apple.txt`,
    path: './ruleset/loyalsoldier/apple.yaml',
  },
  google: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/google.txt`,
    path: './ruleset/loyalsoldier/google.yaml',
  },
  GoogleCN: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/GoogleCN.list`,
    path: './ruleset/acl4ssr/GoogleCN.yaml',
  },
  telegramcidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/telegramcidr.txt`,
    path: './ruleset/loyalsoldier/telegramcidr.yaml',
  },
  github: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: 'https://raw.githubusercontent.com/uxiew/easy_proxy_rules/refs/heads/main/ruleset/github.yaml',
  },
  forGlobal: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: 'https://raw.githubusercontent.com/uxiew/easy_proxy_rules/refs/heads/main/ruleset/global.yaml',
  },
  // 国内直连
  ChinaMedia: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/ChinaMedia.list`,
    path: './ruleset/acl4ssr/ChinaMedia.yaml',
  },
  ChinaDomain: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/ChinaDomain.list`,
    path: './ruleset/acl4ssr/ChinaDomain.yaml',
  },
  direct: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/direct.txt`,
    path: './ruleset/loyalsoldier/direct.yaml',
  },
  // AI 服务规则集
  forAI: {
    ...ruleProviderCommon,
    behavior: 'classical',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/ai.yaml`,
    path: './ruleset/uxiew/ai.yaml',
  },
  cncidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/cncidr.txt`,
    path: './ruleset/loyalsoldier/cncidr.yaml',
  },
  // 国外代理
  proxy: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/proxy.txt`,
    path: './ruleset/loyalsoldier/proxy.yaml',
  },
  gfw: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/gfw.txt`,
    path: './ruleset/loyalsoldier/gfw.yaml',
  },
  'tld-not-cn': {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/tld-not-cn.txt`,
    path: './ruleset/loyalsoldier/tld-not-cn.yaml',
  },
  telegram: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/telegram.yaml`,
    path: './ruleset/uxiew/telegram.yaml',
  },
  // 🔞 魅力艺术
  forNSFW: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/nsfw.list`,
    path: './ruleset/uxiew/nsfw.yaml',
  },

  // ===== 【整理】以下四个是本仓库自己的小规则集，把原先硬编码在脚本里的域名搬了出来 =====
  // 好处：增删域名只改 ruleset/*.list，smart.js 保持"只有逻辑没有规则内容"。
  // 格式：classical + text，每行 `DOMAIN-SUFFIX,xxx`（不带策略，策略由 RULE-SET 那一行决定）。
  // ⚠️ .list 文件里绝对不能写行尾注释：`DOMAIN-SUFFIX,a.com  # 注释` 会被整体当成域名，
  //    规则静默失效、永不匹配（mihomo v1.19 实测）。注释只能单独占一行。
  // AI 服务商官方域名（Claude / Grok / Perplexity …，连人机验证和遥测一起，必须同 IP）
  aiStrict: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/ai-strict.list`,
    path: './ruleset/uxiew/ai-strict.yaml',
  },
  // OpenAI 全家 → 美国住宅出口（从 ai-strict.list 拆出，原因见该文件头注释）
  aiStrictUS: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/ai-strict-us.list`,
    path: './ruleset/uxiew/ai-strict-us.yaml',
  },
  // 住宅出口域名（非 AI 的账号/支付/电商，怕共享 IP 风控的站点）
  residential: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/residential.list`,
    path: './ruleset/uxiew/residential.yaml',
  },
  // 补充直连域名（原 directDomains + co.jp）
  directExtra: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/direct-extra.list`,
    path: './ruleset/uxiew/direct-extra.yaml',
  },
  // Google 通用资产（原 customRules 里的 googleapis.cn / gstatic / googleplay 中文域名）
  autoExtra: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/auto-extra.list`,
    path: './ruleset/uxiew/auto-extra.yaml',
  },
};

// ===========================
// 第三部分：DNS配置 (适用于 Mihomo / Clash Meta 内核)
// ===========================
const dnsConfig = {
  enable: true,                  // 启用内置 DNS 服务器
  listen: '0.0.0.0:1053',        // DNS 监听地址和端口
  ipv6: false,                   // 关闭 IPv6 解析，减少因本地不支持 IPv6 导致的奇葩网络问题
  'use-system-hosts': true,      // 优先读取系统 hosts 文件
  'respect-rules': true,         // 让 DNS 按照节点规则去解析，避免代理节点的 DNS 泄漏
  'cache-algorithm': 'arc',      // 缓存淘汰算法，arc 比 lru 性能更好

  // 解析代理节点域名的 DNS（必须是直连、纯净且快速的 IP）
  'default-nameserver': ['223.5.5.5', '119.29.29.29'],
  'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29', '114.114.114.114'],

  // Fake-IP 模式配置（极大提升网页秒开速度）
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-filter': [
    '*.lan',
    '*.local',
    '*.msftconnecttest.com',      // 微软网络连通性测试
    'localhost.ptlogin2.qq.com',  // QQ 快捷登录依赖
    '+.stun.*',                   // STUN 打洞协议
    'geosite:cn',                 // 核心！国内域名直连，返回真实 IP 以获得最优 CDN，不走 Fake-IP
  ],

  // 指定特定域名的 DNS 解析策略 (命中即拦截，不往下走 fallback)
  'nameserver-policy': {
    // 国内域名用国内 DoH DNS，防劫持且速度快
    'geosite:cn': [
      'https://doh.pub/dns-query',        // 腾讯
      'https://dns.alidns.com/dns-query', // 阿里
    ],
    // 国外域名直接用国外 DoH DNS
    'geosite:geolocation-!cn': [
      'https://1.1.1.1/dns-query',        // Cloudflare
      'https://8.8.8.8/dns-query',        // Google
    ],
  },

  // 兜底主 DNS（如果没有被上面的 nameserver-policy 命中，先向这里请求）
  nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],

  // 兜底备用 DNS（防污染安全网）
  // 当主 DNS 解析出的 IP 是海外 IP 时，采纳 fallback DNS 的结果以防 DNS 污染
  fallback: [
    'https://1.1.1.1/dns-query', // Cloudflare DoH
    'https://8.8.8.8/dns-query', // Google DoH
    'tls://8.8.4.4:853',         // Google DoT 作为补充
  ],

  // 防污染判断条件
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',            // 如果 nameserver 解析返回的 IP 不是中国 (CN)，则触发 fallback
    ipcidr: ['240.0.0.0/4', '0.0.0.0/8'], // 局域网和保留 IP 不会触发 fallback
    domain: ['+.google.com', '+.youtube.com', '+.github.com'], // 强制走 fallback 的域名清单
  },
};

// ===========================
// 第四部分：函数
// ===========================
//
const getRules = ()=>{
  // ======= 白名单模式 Rules 配置方式 =======
  // https://github.com/Loyalsoldier/clash-rules#%E7%99%BD%E5%90%8D%E5%8D%95%E6%A8%A1%E5%BC%8F-rules-%E9%85%8D%E7%BD%AE%E6%96%B9%E5%BC%8F%E6%8E%A8%E8%8D%90
  // 「AI 走住宅」的落点。
  // aiStrict 模式（默认）：只有 ai-strict.list 里的 AI 服务商官方域名走住宅，
  //   其余 AI 规则（中转站、镜像站、通用服务商）走普通 AI 组 = 机场。
  // allAI 模式：整个 RULE-SET,forAI 一刀切走住宅（默认关闭，会连带 YouTube 视频流）。
  const aiPolicy = RESIDENTIAL.enabled && RESIDENTIAL.allAI ? RESIDENTIAL.group : 'AI';
  const aiStrictPolicy = RESIDENTIAL.enabled && RESIDENTIAL.aiStrict ? RESIDENTIAL.group : aiPolicy;
  // Apple 流量去向（TRAFFIC.appleDirect 见文件顶部，默认直连省流量）
  const applePolicy = TRAFFIC.appleDirect ? 'DIRECT' : 'AI';

  const  whiteListRules= [
    // 局域网与私有地址
    'GEOIP,LAN, DIRECT, no-resolve',
    'RULE-SET,private, DIRECT',
    'RULE-SET,applications, DIRECT',
    'RULE-SET,lancidr, DIRECT,no-resolve',

    // ===== Anthropic 的 IP 段 → 住宅出口（必须，否则同一账号两个出口 IP）=====
    // 原来这三条在 ruleset/ai.yaml 里，跟着 forAI 走 AI 组：
    // 域名走住宅、程序直连 IP 走机场 → 风控看到「同一会话两个 IP」，比用脏 IP 更糟。
    // fake-ip 模式下域名请求不会命中 IP 规则，但 Claude 桌面端 / SDK 直连 IP 时会。
    ...(RESIDENTIAL.enabled && RESIDENTIAL.aiStrict
      ? [
          `IP-ASN,399358,${RESIDENTIAL.group},no-resolve`,
          `IP-CIDR,160.79.104.0/21,${RESIDENTIAL.group},no-resolve`,
          `IP-CIDR6,2607:6bc0::/32,${RESIDENTIAL.group},no-resolve`,
        ]
      : []),

    // ===== AI 服务商 → 住宅出口（最高优先级）=====
    // 必须排在 RULE-SET,forAI 之前：ai.yaml 里就有 DOMAIN-SUFFIX,anthropic.com，
    // 放在后面的话 forAI 先命中，Claude 会走机场，住宅出口永远轮不到。
    // 规则集内容见 ruleset/ai-strict.list（含 Claude 的 Turnstile、auth0、Persona、遥测）。
    ...(RESIDENTIAL.enabled && RESIDENTIAL.aiStrict
      ? [`RULE-SET,aiStrict, ${RESIDENTIAL.group}`]
      : []),

    // 额外住宅出口：紧跟主出口之后（仍排在 forAI 等大范围规则之前，不会被抢先）
    ...(RESIDENTIAL.enabled
      ? (RESIDENTIAL.extraExits || []).flatMap((exit) =>
          exit.enabled ? exit.rules.map((r) => `RULE-SET,${r.provider}, ${exit.group}`) : []
        )
      : []),

    // 住宅出口：非 AI 的账号/支付/电商，清单在 ruleset/residential.list
    ...(RESIDENTIAL.enabled ? [`RULE-SET,residential, ${RESIDENTIAL.group}`] : []),

    // 国内直连（GEOSITE,cn 是新增的兜底：GEOIP,CN 对 fake-ip 域名无效，
    // 漏网的国内站会掉进 tld-not-cn → AUTO 白烧机场流量）
    ...(TRAFFIC.domesticDirect ? ['GEOSITE,cn, DIRECT'] : []),
    'RULE-SET,ChinaMedia, DIRECT',
    'RULE-SET,ChinaDomain, DIRECT',
    'RULE-SET,direct, DIRECT',
    'RULE-SET,directExtra, DIRECT', // 补充直连：原 directDomains + co.jp，见 ruleset/direct-extra.list
    'RULE-SET,cncidr, DIRECT,no-resolve',
    'GEOIP,CN, DIRECT,no-resolve',

    // AI 服务规则 → aiPolicy（默认 'AI' 普通 AI 组；aiStrict.list 已提前把严格的 AI 服务商捞走）
    `RULE-SET,forAI, ${aiPolicy}`,

    // 通用服务代理规则
    `RULE-SET,apple, ${applePolicy}`,
    'RULE-SET,google, AI',
    'RULE-SET,github, AUTO',

    'RULE-SET,GoogleCN, AUTO',
    'RULE-SET,OneDrive, AUTO',
    `RULE-SET,icloud, ${TRAFFIC.appleDirect ? 'DIRECT' : 'AUTO'}`,
    'RULE-SET,autoExtra, AUTO', // 原 customRules 里的 googleapis.cn/gstatic/googleplay 域名，见 ruleset/auto-extra.list
    'RULE-SET,forGlobal, AUTO',
    'RULE-SET,telegramcidr, AUTO,no-resolve',
    'RULE-SET,telegram, AUTO,no-resolve',
    'RULE-SET,forNSFW, NSFW,no-resolve',

    // 国外代理
    'RULE-SET,proxy, AUTO',
    'RULE-SET,gfw, AUTO',
    'RULE-SET,tld-not-cn, AUTO',

    //拦截规则
    'RULE-SET,reject, REJECT',
    'RULE-SET,BanEasyListChina, ADS_FILTER',
    'RULE-SET,BanEasyList, ADS_FILTER',

    // ⚠️ 修复：将此处的兜底规则 'MATCH, AUTO' 移出该数组，移至整个规则集的最后面
  ];

  // 只剩「关键词 / 端口 / IP」这类没法塞进规则集文件的东西；域名规则已全部迁到 ruleset/*.list
  const customRules = [
    // 代理关键词规则
    ...proxyKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords}, AUTO`),
    // 直连关键词规则
    ...directKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords}, DIRECT`),
    // 拦截关键词规则
    ...rejectKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords}, REJECT`),
    // 【补齐】directSSHIPs 原来只在文件头注释里写了、代码里从未使用（死配置），这里补上
    ...directSSHIPs.map((ip) => `IP-CIDR,${ip}, DIRECT,no-resolve`),
    // 端口直连规则 (最高优先级 - TUN模式下优先匹配端口)
    ...directPorts.map((port) => `DST-PORT,${port}, DIRECT`),
  ];

  const aiFallbackRules = [
    // 强制同步时区（防风控时区泄露核心）
    // ⚠️ 必须留在机场组：NTP 走 UDP，而住宅代理基本不支持 UDP，丢给住宅会直接超时。
    `GEOSITE,category-ntp, AI`,

    // Anthropic 官方大类全量兜底 → aiStrictPolicy（aiStrict 开启时即住宅出口）
    // geosite 的 anthropic 分类比 ai-strict.list 更宽，但全是 Anthropic 自家域名，走住宅安全。
    `GEOSITE,anthropic, ${aiStrictPolicy}`,
  ];

  // ⚠️ 修复：将截断后续匹配的 'MATCH, AUTO' 放在最后执行
  return [...whiteListRules, ...aiFallbackRules, ...customRules, 'MATCH, AUTO'];
}

// 程序入口
function main(config) {
  // 验证配置
  if (!config) {
    throw new Error('配置对象为空');
  }

  // 1. 严格关闭全局 IPv6 处理
  config['ipv6'] = false;

  // 2. 强制指定域名解析策略为仅用 IPv4 (适用于 Mihomo / Clash Meta 内核)
  config['domain-strategy'] = 'UseIPv4';

  //  确保开启了 UDP，因为 NTP (时间同步) 强制走 UDP 协议
  config['udp'] = true;

  const proxyCount = config?.proxies?.length ?? 0;
  const proxyProviderCount = config?.['proxy-providers']
    ? Object.keys(config['proxy-providers']).length
    : 0;

  /** @type {Set<string>} */
  const BUILTIN_POLICIES = new Set(['DIRECT', 'REJECT', 'PASS', 'GLOBAL']);

  /**
   * 从单条规则字符串中提取最终策略组名（用于验证组是否必须保留）。
   * 规则格式常见为：
   * - TYPE,<arg>,<policy>[,...]
   * - MATCH,<policy>
   * @param {string} ruleStr
   * @returns {string | null}
   */
  function extractPolicyGroupName(ruleStr) {
    if (!ruleStr || typeof ruleStr !== 'string') {
      return null;
    }

    const ruleLine = ruleStr.trim();
    if (!ruleLine || ruleLine.startsWith('#')) {
      return null;
    }

    const parts = ruleLine.split(',').map((part) => part.trim());
    if (parts.length < 2) {
      return null;
    }

    const ruleType = parts[0].toUpperCase();
    const policyIndex = ruleType === 'MATCH' ? 1 : 2;
    if (!parts[policyIndex]) {
      return null;
    }

    const policy = parts[policyIndex];
    const normalized = policy.toUpperCase();
    if (BUILTIN_POLICIES.has(normalized)) {
      return null;
    }

    return policy;
  }

  // 统计规则中引用到的策略组名；引用到规则组的组即使暂时无节点也必须保留，避免配置校验失败。
  const requiredGroupsFromRules = new Set();
  const rules = getRules();
  for (const rule of rules) {
    const policyGroup = extractPolicyGroupName(rule);
    if (policyGroup && smartGroups[policyGroup]) {
      requiredGroupsFromRules.add(policyGroup);
    }
  }

  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error('配置文件中未找到任何代理节点');
  }

  // 【改造】原先这里硬编码了一个静态住宅节点（含 server/username/password 和
  // 一个并不存在的入口组 '港台日新韩-自动'），已整体删除，原因：
  //   1) 本文件要提交到公共仓库，任何真实凭据都会泄露；示例值又容易被误当成真配置；
  //   2) 入口组 '港台日新韩-自动' 在 smartGroups 里根本不存在，
  //      一旦放开 push，dialer-proxy 会指向空组，内核直接报错。
  // 现在住宅节点由覆写 YAML 提供，节点名命中 RESIDENTIAL.nodePattern 即自动进组，
  // 前置跳板（dialer-proxy）也写在覆写 YAML 里，推荐填 AUTO / JP / US 这类本脚本建好的组。
  if (!config.proxies) {
    config.proxies = [];
  }

  // 覆盖DNS配置
  config.dns = dnsConfig;

  // 代理组通用配置
  const groupBaseOption = {
    interval: 300,
    // ⚠️ 修复 1：放宽 timeout 避免冷门或延迟波动节点被客户端强行隐藏
    timeout: 10000,
    //url: "https://www.gstatic.com/generate_204",
    //url: 'http://www.apple.com/library/test/success.html',
    // ⚠️ 修复 2：使用谷歌无内容 HTTPS 测速，防明文 HTTP 被运营商劫持/阻断
    url: 'https://www.gstatic.com/generate_204',
    lazy: true,
    'max-failed-times': 5,
    hidden: false,
  };

  // {
  //   ...groupBaseOption,
  //   name: '🔗 链式-住宅IP',
  //   type: 'url-test',
  //   proxies: [myStaticNode.name], // 此时连接该节点会自动经过 entranceGroupName
  // },

  // ===========================
  // 覆盖代理组配置：JS 递归展开版
  // ===========================

  // 1. 收集当前订阅所有原始节点名称
  const allProxyNames = Array.isArray(config.proxies)
    ? config.proxies.map((p) => p.name).filter(Boolean)
    : [];

  const BUILTIN_PROXIES = ['DIRECT', 'REJECT', 'GLOBAL'];

  // 2. 判断某个组自身 filter 能匹配到哪些真实节点
  function getFilterMatchedNodes(groupConfig) {
    if (!groupConfig.filter) return [];

    const filterRegex = new RegExp(groupConfig.filter, 'i');
    // ⚠️ 新增：住宅落地节点永远不参与地区组 / SPEED 的自动筛选。
    // 原因有两个，任一踩中都是灾难：
    //   1) SPEED 的 filter 是 '.*'，US/JP 等地区组也会按名字命中（如「🏠 住宅-US」含 US），
    //      节点一旦被 AUTO 选为普通出口，住宅流量按 GB 计费会被瞬间烧光；
    //   2) 住宅节点自己带着 dialer-proxy: AUTO，若它又被塞进 AUTO，
    //      就形成 AUTO → 住宅 → AUTO 的调用环，内核会直接异常。
    // 把住宅节点的匹配规则并进 exclude-filter，一处改动覆盖所有带 filter 的组。
    const excludePattern = [groupConfig['exclude-filter'], RESIDENTIAL.nodePattern]
      .filter(Boolean)
      .join('|');
    const excludeRegex = excludePattern ? new RegExp(excludePattern, 'i') : null;

    return allProxyNames.filter((pName) => {
      const included = filterRegex.test(pName);
      const excluded = excludeRegex ? excludeRegex.test(pName) : false;
      return included && !excluded;
    });
  }

  // 3. 缓存，避免重复计算
  const expandCache = new Map();

  // 4. 递归展开某个组最终应该包含的节点
  function expandGroup(groupName, visiting = new Set()) {
    if (expandCache.has(groupName)) {
      return expandCache.get(groupName);
    }

    const groupConfig = smartGroups[groupName];
    if (!groupConfig) {
      return [];
    }

    // 防止循环引用：A -> B -> A
    if (visiting.has(groupName)) {
      console.log(
        `[节点清洗] 检测到循环引用，已跳过: ${[...visiting, groupName].join(' -> ')}`,
      );
      return [];
    }

    visiting.add(groupName);

    let result = [];

    // 4.1 展开当前组自己的 filter 匹配节点
    result.push(...getFilterMatchedNodes(groupConfig));

    // 4.2 展开当前组 proxies 中的内容
    if (Array.isArray(groupConfig.proxies)) {
      for (const p of groupConfig.proxies) {
        if (allProxyNames.includes(p) || BUILTIN_PROXIES.includes(p)) {
          // 真实节点或内置策略
          result.push(p);
        } else if (smartGroups[p]) {
          // 引用的是另一个智能组：递归展开其具体节点
          result.push(...expandGroup(p, visiting));
        }
      }
    }

    visiting.delete(groupName);

    // 去重
    result = [...new Set(result)];

    expandCache.set(groupName, result);
    return result;
  }

  // 5. 计算所有活跃组
  const activeGroups = new Set();

  Object.keys(smartGroups).forEach((name) => {
    const expanded = expandGroup(name);
    if (expanded.length > 0 || requiredGroupsFromRules.has(name)) {
      activeGroups.add(name);
    }
  });

  // 6. 组装最终 proxy-groups
  const finalGroups = [];

  Object.entries(smartGroups).forEach(([name, groupConfig]) => {
    if (!activeGroups.has(name)) {
      console.log(`[节点清洗] 组 "${name}" 无匹配节点或有效引用，已自动去除`);
      return;
    }

    let combinedProxies = expandGroup(name);

    // 极端防空组崩溃兜底
    if (combinedProxies.length === 0) {
      if (requiredGroupsFromRules.has(name) && smartGroups.AUTO) {
        // 规则显式引用且该组为空时，优先回退到 AUTO，避免误直连；保留 DIRECT 兜底。
        combinedProxies = ['AUTO', 'DIRECT'];
      } else {
        combinedProxies = ['DIRECT'];
      }
    }

    const clashGroup = {
      ...groupBaseOption,
      name,
      // 取消地区组（带 filter 的组）被默认强制判定为 url-test。
      type: groupConfig.type || (groupConfig.filter ? 'url-test' : 'select'),
      ...groupConfig,
      proxies: combinedProxies,
      'include-all': false,
    };

    // 关键：禁止 Clash 内核再次二次 filter
    delete clashGroup.filter;
    delete clashGroup['exclude-filter'];

    finalGroups.push(clashGroup);
  });

  // 假设 config.proxies 存放了你所有的原始节点
  // 我们强制创建一个名为 "🚀 全部节点" 的 Select (手动选择) 组，
  // 不做任何正则筛选，直接把所有节点全塞进去
  const allProxies = config.proxies.map(p => p.name);

  finalGroups.unshift({
    name: "🚀 全部节点",
    type: "select",
    proxies: ["DIRECT", ...allProxies]
  });

  // 【新增】住宅出口组：插在「全部节点」之后，方便在 UI 里一眼找到。
  // 这里用 include-all-proxies + filter 做「动态收编」，而不是把节点名写死：
  //   - 节点由覆写 YAML 提供，本脚本在它之前运行，根本拿不到节点名；
  //   - include-all-proxies 的成员是内核在「所有覆写合并完之后」才计算的，
  //     所以覆写 YAML 排在前面或后面都能被正确收编；
  //   - proxies 里先放一个 AI 作为兜底：没配住宅节点时该组 = [AI]，
  //     规则命中后走 AI，与改造前的分流结果一致，不会出现空组报错。
  // 注意：不要把本组写进 smartGroups，否则会被上面的 filter 展开逻辑当成静态组处理，
  //       filter 被删掉后就收编不到任何节点了。
  if (RESIDENTIAL.enabled) {
    // 额外出口的节点收编条件：主出口必须排除它们，同一个节点不能进两个组
    const extraFilters = (RESIDENTIAL.extraExits || [])
      .filter((e) => e.enabled)
      .map((e) => e.nodeFilter);
    finalGroups.splice(1, 0, {
      name: RESIDENTIAL.group,
      type: 'select',
      proxies: ['AI'], // 兜底项，配好住宅节点后在 UI 里手动切过去（只需一次，会记忆）
      'include-all-proxies': true,
      filter: RESIDENTIAL.nodePattern,
      ...(extraFilters.length ? { 'exclude-filter': extraFilters.join('|') } : {}),
      'include-all': false, // 防止内核二次筛选，保持成员完全由 filter 决定
    });
  }

  // 【新增】额外住宅出口：上游组 + 出口组
  for (const exit of RESIDENTIAL.extraExits || []) {
    if (!RESIDENTIAL.enabled || !exit.enabled) continue;
    // 上游组：region 指向 smartGroups 的地区 filter（留空 filter 字段即跟随）
    const regionFilter =
      exit.upstream.filter || (smartGroups[exit.upstream.region] || {}).filter || '';
    if (!regionFilter) {
      console.warn(`[smart.js] 出口 ${exit.group} 的上游 filter 为空，上游组收不到任何节点`);
    }
    finalGroups.push({
      name: exit.upstream.group,
      type: 'url-test',
      proxies: ['REJECT'],
      'include-all-proxies': true,
      filter: regionFilter,
      // 住宅节点不能当自己出口的地理上游（节点名里的 US/美 会命中 filter，成环）
      'exclude-filter': RESIDENTIAL.nodePattern,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
    });
    // 出口组：select 单一来源，没配节点时兜底 AI（机场），对应服务商不断流
    finalGroups.push({
      name: exit.group,
      type: 'select',
      proxies: ['AI'],
      'include-all-proxies': true,
      filter: exit.nodeFilter,
      'include-all': false,
    });
  }

  // 【新增】上游出口组：住宅节点 dialer-proxy 指向它，只收日本节点自动择优。
  // REJECT 必须放在 proxies 里兜底，原因（实测）：
  //   - url-test 有活节点时不会选 REJECT（REJECT 不参与延迟竞争）；
  //   - 但 filter 一个都匹配不到时，组会变空，内核塞进 COMPATIBLE = 直连，
  //     真实 IP 静默泄漏。加了 REJECT 后空组 → 阻断，fail-closed。
  if (RESIDENTIAL.enabled && RESIDENTIAL.upstream && RESIDENTIAL.upstream.enabled) {
    finalGroups.splice(2, 0, {
      name: RESIDENTIAL.upstream.group,
      type: 'url-test',
      proxies: ['REJECT'],
      'include-all-proxies': true,
      // 复用地区组 JP 的 filter，两处永远同步；留空即跟随，也可单独定制
      filter: RESIDENTIAL.upstream.filter || smartGroups.JP.filter,
      // 必须排除住宅节点本身：节点名里的「JP」（如 🏠 住宅-JP）同样命中上面的 filter，
      // 不排除的话住宅节点会被收进自己的上游组，形成 dialer 环
      'exclude-filter': RESIDENTIAL.nodePattern,
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
    });
  }

  // 覆盖规则配置
  config['proxy-groups'] = finalGroups;
  config['rule-providers'] = ruleProviders;
  config.rules = rules;

  // ===== 住宅专用入口端口（给 Proxifier / 其他客户端「强制走住宅」用）=====
  // mihomo 的 listeners 可以把某个端口整体绑定到一个策略组，不再经过规则匹配。
  // 用途：某些程序（Electron 应用、游戏、终端工具）不走系统代理，
  //      用 Proxifier 指向这个端口，就能让它们的所有流量强制从住宅 IP 出去，
  //      不必再为每个域名写规则。
  // 关闭方法：把 RESIDENTIAL.dedicatedPort 设为 0。
  if (RESIDENTIAL.enabled && RESIDENTIAL.dedicatedPort) {
    const port = Number(RESIDENTIAL.dedicatedPort);
    const listeners = Array.isArray(config.listeners) ? config.listeners : [];
    // 避免重复注册（覆写可能被多次执行）
    const exists = listeners.some((l) => l && l.name === 'residential-in');
    if (!exists) {
      listeners.push({
        name: 'residential-in',
        type: 'mixed',
        port,
        listen: '127.0.0.1',
        proxy: RESIDENTIAL.group,
      });
    }
    config.listeners = listeners;
  }

  // 返回修改后的配置
  return config;
}

// Node.js 环境支持
if (typeof module !== 'undefined' && module.exports) {
  module.exports = main;
}
