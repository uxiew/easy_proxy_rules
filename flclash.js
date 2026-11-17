/**
 * FlClash 覆写脚本（占位符版 / 可提交仓库）
 * ================================================================
 * 由 build-flclash.js 自动生成 —— 请勿手改，改 smart.js 后重新构建
 *
 * 构建时间    : 2026-11-17 17:23:34
 * 源文件      : smart.js  sha256:735d7edf30ea  2521 行 / 126197 字节
 * 源码提交    : 0df25b4
 * 构建命令    : node build-flclash.js
 * 住宅节点    : （未配置）AI 走 AI 组
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
const USER_CONFIG = {
  "mode": "flclash",
  "residential": {
    "enabled": "auto",
    "primary": "",
    "nodes": [
      {
        "name": "🏠 住宅-JP",
        "type": "http",
        "server": "YOUR_HOST",
        "port": 0,
        "username": "YOUR_USERNAME",
        "password": "YOUR_PASSWORD"
      }
    ]
  }
};

// ---------- 可用键与默认值（只作参考，不要取消注释）----------
// 要改哪项，就在上面的 USER_CONFIG 里写哪项：
// {
//   "mode": "clash",
//   "residential": {
//     "enabled": true,
//     "group": "住宅出口",
//     "nodes": [],
//     "primary": "",
//     "pinOnly": true,
//     "pinMiss": "reject",
//     "prefer": "",
//     "nodePattern": "🏠|IP-|家宽|住宅|静态|[Rr]esi|RESI|[Ss]tatic|STATIC|[Ii][Ss][Pp]",
//     "escapeToAI": false,
//     "aiStrict": true,
//     "allAI": false,
//     "dedicatedPort": 0,
//     "upstream": {
//       "enabled": true,
//       "group": "前置-亚洲",
//       "inject": true,
//       "allowHttp": true,
//       "filter": "日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉|川崎|横浜|名古屋|港|HK|Hong|🇭🇰|台|TW|Tai|🇹🇼|韩|韓|首|爾|春川|🇰🇷|KR|Korea|新加坡|SG|坡|狮城|🇸🇬|Singapore|越南|VN|Viet|🇻🇳|马来|Malaysia|🇲🇾|泰国|TH|Thai|🇹🇭|菲律宾|PH|Philippin|🇵🇭"
//     }
//   },
//   "appProxy": {
//     "ports": [
//       {
//         "name": "residential-in",
//         "port": 7865,
//         "proxy": "住宅出口"
//       }
//     ],
//     "processes": [
//       {
//         "value": "com.whatsapp",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "com.talkatone.android",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "com.openai.chatgpt",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "com.anthropic.claude",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "^/Applications/Claude\\.app/",
//         "type": "path-regex",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "^/Applications/ChatGPT\\.app/",
//         "type": "path-regex",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "^/Applications/Antigravity\\.app/",
//         "type": "path-regex",
//         "proxy": "住宅出口"
//       },
//       {
//         "value": "/opt/homebrew/bin/agy",
//         "type": "path",
//         "proxy": "住宅出口"
//       }
//     ]
//   },
//   "traffic": {
//     "domesticDirect": true,
//     "appleDirect": true
//   },
//   "aiStaticToAI": [
//     "DOMAIN-SUFFIX,oaistatic.com",
//     "DOMAIN-SUFFIX,downloads.claude.ai",
//     "DOMAIN-SUFFIX,downloads.cursor.com",
//     "DOMAIN-SUFFIX,openaicom.imgix.net"
//   ],
//   "narrowTun": {
//     "enabled": true,
//     "includeAI": true,
//     "aiRouteAddress": [
//       "223.5.5.5/32",
//       "119.29.29.29/32",
//       "198.18.0.0/16"
//     ],
//     "routeAddress": [
//       "142.250.0.0/15",
//       "172.217.0.0/16",
//       "172.253.0.0/16",
//       "216.58.0.0/16",
//       "74.125.0.0/16",
//       "108.177.0.0/17",
//       "64.233.160.0/19",
//       "72.14.192.0/18",
//       "173.194.0.0/16",
//       "209.85.128.0/17",
//       "2001:4860::/32",
//       "2404:6800::/32",
//       "2607:f8b0::/32"
//     ],
//     "stack": "Mixed"
//   },
//   "regionPriority": {
//     "enabled": true,
//     "targets": {
//       "AUTO": [
//         "JP",
//         "SG",
//         "KR",
//         "HK",
//         "TW",
//         "US",
//         "UK",
//         "DE",
//         "FR",
//         "CA",
//         "EU"
//       ],
//       "AI": [
//         "JP",
//         "SG",
//         "KR",
//         "HK",
//         "TW",
//         "US",
//         "UK",
//         "DE",
//         "FR",
//         "CA",
//         "EU"
//       ]
//     },
//     "othersGroup": "OT",
//     "interval": 120
//   },
//   "webrtcGuard": {
//     "enabled": false
//   },
//   "keepSubGroups": true,
//   "modeGuard": true
// }

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
 * - 配置（x-smart / 手机端 config）：住宅节点的 server/port/username/password（密钥）
 * 两边通过「节点名」解耦：覆写里的节点名只要含「住宅」或「IP-」，就会被自动收编进组里。
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
 *
 * 【想改配置？】紧跟着的「第 0 部分」就是全部可调项，只有两个对象：
 *   DEFAULT_CONFIG  十个顶层键的默认值（mode / residential / appProxy / narrowTun …）
 *   USER_CONFIG     你的覆盖项，只写要改的键，对象逐字段合并
 * 再往下才是 CDN 源、节点清洗、分组、规则生成 —— 日常不用看。
 *
 * 【更推荐：不碰本文件】桌面端写覆写 YAML 的 x-smart，手机端写
 * flclash-credentials.json 的 config 段（构建时变成 flclash.js 顶部的 USER_CONFIG）：
 * 两边键名完全一致，住宅凭据都在 residential.nodes 里。
 * 远程引用本脚本时改这里才不会被下次更新冲掉，完整键表与校验行为见 docs/custom-config.md。
 */

// ============================================================
// 第 0 部分：配置（默认值 + 你的覆盖）
// ============================================================
// 只有两样东西：
//   DEFAULT_CONFIG —— 全部默认值，键名与 x-smart 完全一致（一般不用改）
//   USER_CONFIG    —— 你的覆盖项，只写要改的（三个入口里优先级最低的一个）
//
// 改配置不必动本文件，按机器分开写更省事：
//   桌面端：覆写 YAML 里的 x-smart（要排在 smart.js 之前）
//   手机端：flclash-credentials.json 的 config 段，构建时注入成文件顶部的 USER_CONFIG
//   单文件：直接改下面的 USER_CONFIG
// 键表 / 合并规则 / 校验行为见 docs/custom-config.md，桌面模板见 x-smart.example.yaml。
//
// 十个顶层键：
//   mode            跑在哪：'clash'（桌面）/ 'flclash'（手机）。构建脚本注入，平时不写
//   residential     住宅出口：锁哪一台、节点凭据、锁不上怎么办、跳板组
//   appProxy        应用级分流：专用端口 / 进程名 / 包名          ← 最常改
//   traffic         省流量：国内直连、Apple 直连
//   aiStaticToAI    AI 静态资源 / 安装包 → 机场（不烧住宅流量）
//   narrowTun       窄 TUN：只把 Google 网段塞进内核
//   regionPriority  AUTO / AI 按国家顺序选出口
//   webrtcGuard     拦 STUN 探测（默认关）
//   keepSubGroups   保留订阅自带策略组
//   modeGuard       内核被切成全局/直连时改回规则模式

const DEFAULT_CONFIG = {
  // ------------------------------------------------------------
  // 跑在哪：'clash' 桌面 / 'flclash' 手机
  // 桌面不写（默认 clash）；手机由 build-flclash.js 在文件顶部的 USER_CONFIG 里注入。
  // 差异全是「App 已经管了、脚本别插手」的部分：DNS 端口 / listeners / IPv6 / IP-ASN。
  // ------------------------------------------------------------
  mode: 'clash',

  // ------------------------------------------------------------
  // 住宅出口：本机 → 机场亚洲节点 → 住宅 IP
  // ------------------------------------------------------------
  residential: {
    // true 建住宅链 / false 不建（AI 规则改投 AI 组）/ 'auto' 看运行时有没有住宅节点
    enabled: true,
    group: '住宅出口', // 组名，规则引用它；别在覆写 YAML 里重复定义同名组
    // 住宅节点凭据，两端同一个位置：手机必填（没有覆写链），桌面也可以用
    // （等价于手里那份 +proxies，但 dialer-proxy 由脚本自动补）。
    // 每项：{ name, type, server, port, username, password }，name 要能命中 nodePattern
    // （带 🏠 / IP- / 住宅 之类），其余字段原样透传给内核（tls / sni / udp 都能写）。
    nodes: [],
    // 锁哪一台：只写节点名。完整匹配优先，没命中再按 includes（须恰好命中 1 台）。
    // 留空 = 不锁（全部住宅节点都进组，默认选第一台）；写了 nodes 时留空 = 锁第一台。
    primary: '',
    pinOnly: true, // 锁定后组里只放这一台：出口 IP 悄悄换一个，比断网更难排查
    pinMiss: 'reject', // 锁不上时：'reject' 只剩 REJECT / 'collect' 全收（旧行为）
    prefer: '', // 没锁定时默认选哪国（JS 正则，如 'JP'）；只重排不淘汰
    // 哪些节点名算住宅。只能写 Go RE2 ∩ JS RegExp 的交集：不能写 (?i)，大小写用字符类
    nodePattern: '🏠|IP-|家宽|住宅|静态|[Rr]esi|RESI|[Ss]tatic|STATIC|[Ii][Ss][Pp]',
    escapeToAI: false, // 应急口：true 时组里多一个 AI，可在面板切到机场
    aiStrict: true, // AI 服务商官方域名走住宅（ruleset/ai-strict.list）
    allAI: false, // 整个 ai.yaml 走住宅：会带上 googlevideo，几 GB 烧额度，默认关
    dedicatedPort: 0, // 旧字段；端口统一由 appProxy.ports 管，填非 0 会自动补一条
    // 上游跳板：住宅节点的 dialer-proxy 指向这个组
    upstream: {
      enabled: true,
      group: '前置-亚洲',
      // 订阅自带住宅节点上的 dialer-proxy 怎么处理：
      //   true / 'fill'  只补没有的（人在国内，必须机场当跳板 —— 默认就是这个）
      //   'strip'        全删掉（仅当「本机 → 网关」的直连路径干净可达时才快，
      //                   比如人在海外且与网关同区；人在国内直连日本网关会被墙
      //                   RST，症状与「住宅商拒了」一模一样，见 troubleshooting 坑 32）
      //   'override'     全改指 group（订阅把前置写成了手选组）
      //   false          一个字都不碰（连 residential.nodes 也不自动补 dialer-proxy）
      inject: true,
      allowHttp: true, // override 时是否也改写 type: http 的节点（v1.19.32 实测可通）
      // 只放多字 / 带国名的关键词：单字会误中（「日」→ 尼日利亚，「MY」→ Myanmar）
      filter: [
        '日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉|川崎|横浜|名古屋',
        '港|HK|Hong|🇭🇰',
        '台|TW|Tai|🇹🇼',
        '韩|韓|首|爾|春川|🇰🇷|KR|Korea',
        '新加坡|SG|坡|狮城|🇸🇬|Singapore',
        '越南|VN|Viet|🇻🇳',
        '马来|Malaysia|🇲🇾', // 不要写 MY：会误中 Myanmar（缅甸）
        '泰国|TH|Thai|🇹🇭',
        '菲律宾|PH|Philippin|🇵🇭',
      ].join('|'),
    },
  },

  // ------------------------------------------------------------
  // 应用级分流：不靠域名规则，直接把某个程序的流量按到指定出口
  // 两种手段，按「应用能不能自己填代理」来选：
  //   ports      专用端口（仅桌面）：进这个端口的流量完全跳过 rules
  //   processes  进程名 / 路径 / 包名（桌面 + Android）：插在 rules 最前面
  // 常见坑（App 自己解析 DNS、UDP 走不通、Electron 子进程）：docs/custom-config.md
  // ------------------------------------------------------------
  appProxy: {
    // name / port 都不能重复，否则内核起不来
    ports: [
      { name: 'residential-in', port: 7865, proxy: '住宅出口' }, // 默认开：住宅专用入口
      // { name: 'ai-in', port: 7866, proxy: 'AI' },   // 固定走机场 AI 组
      // { name: 'us-in', port: 7867, proxy: 'US' },   // 固定走美国组
    ],
    // type 省略 = 进程名；'path' = 绝对路径；'path-regex' = 路径正则；
    // 'name-regex' = 进程名正则；'uid' = Android
    // ⚠️ 名字写错不会报错，只会永不命中。Android 上进程名就是包名。
    processes: [
      { value: 'com.whatsapp', proxy: '住宅出口' },
      { value: 'com.talkatone.android', proxy: '住宅出口' },
      { value: 'com.openai.chatgpt', proxy: '住宅出口' },
      { value: 'com.anthropic.claude', proxy: '住宅出口' },
      // 桌面端 Electron：真正建连的是 Helper 子进程，用路径正则匹配整个 .app
      { value: '^/Applications/Claude\\.app/', type: 'path-regex', proxy: '住宅出口' },
      { value: '^/Applications/ChatGPT\\.app/', type: 'path-regex', proxy: '住宅出口' },
      { value: '^/Applications/Antigravity\\.app/', type: 'path-regex', proxy: '住宅出口' },
      { value: '/opt/homebrew/bin/agy', type: 'path', proxy: '住宅出口' },
    ],
  },

  // ------------------------------------------------------------
  // 省流量：机场按 GB 计费，这两类改直连
  // ------------------------------------------------------------
  traffic: {
    // GEOSITE,cn → DIRECT：GEOIP,CN 是 IP 规则，对 fake-ip 域名无效
    domesticDirect: true,
    // Apple 全家桶（iCloud / App Store / 系统更新）直连，有本地 CDN
    appleDirect: true,
  },

  // ------------------------------------------------------------
  // AI 静态资源 / 安装包 → 机场（不烧住宅流量）
  // 只挪「静态 + 安装包 + 图片 CDN」；主站不能动，*usercontent.com 和人机验证也不能动
  // ------------------------------------------------------------
  aiStaticToAI: [
    'DOMAIN-SUFFIX,oaistatic.com', // ChatGPT 前端资源
    'DOMAIN-SUFFIX,downloads.claude.ai', // Claude 桌面端安装包
    'DOMAIN-SUFFIX,downloads.cursor.com', // Cursor 安装包
    'DOMAIN-SUFFIX,openaicom.imgix.net', // OpenAI 图片 CDN
  ],

  // ------------------------------------------------------------
  // 窄 TUN：只把 Google 网段塞进内核
  // 为什么需要：language_server（Go + gRPC）不读系统代理，没有 TUN 时一直 SYN_SENT
  // ------------------------------------------------------------
  narrowTun: {
    enabled: true, // false = 完全不动 tun，交给面板
    includeAI: true, // 额外接管「系统 DNS + fake-ip 段」，收进 ChatGPT 后台常驻连接
    aiRouteAddress: [
      '223.5.5.5/32', // 系统 DNS
      '119.29.29.29/32', // 备用 DNS，兜住路由器下发的 ISP DNS
      '198.18.0.0/16', // fake-ip 段，域名流量进内核的入口
    ],
    // 实测见过的 Google 段（并集，不是官方完整列表）；换了后端就用 lsof 看它连哪
    routeAddress: [
      '142.250.0.0/15', // Google 主力段
      '172.217.0.0/16', // Google 前端 / gstatic
      '172.253.0.0/16', // googleapis VIP 段
      '216.58.0.0/16', // www.google.com
      '74.125.0.0/16', // Gmail / googleapis
      '108.177.0.0/17', // Google 账号体系
      '64.233.160.0/19',
      '72.14.192.0/18',
      '173.194.0.0/16',
      '209.85.128.0/17',
      '2001:4860::/32', // IPv6
      '2404:6800::/32', // IPv6 亚洲
      '2607:f8b0::/32', // IPv6
    ],
    stack: 'Mixed', // macOS 上 Mixed 实测可用；启动异常依次试 System → gvisor
  },

  // ------------------------------------------------------------
  // AUTO / AI = fallback[地区组…]：国家之间按顺序，国家内部挑最快
  // 想回「谁快用谁」把 enabled 设 false。加新地区组必须同步加进 targets（构建自检会拦）
  // ------------------------------------------------------------
  regionPriority: {
    enabled: true,
    targets: {
      AUTO: ['JP', 'SG', 'KR', 'HK', 'TW', 'US', 'UK', 'DE', 'FR', 'CA', 'EU'],
      AI: ['JP', 'SG', 'KR', 'HK', 'TW', 'US', 'UK', 'DE', 'FR', 'CA', 'EU'],
    },
    othersGroup: 'OT', // 只收没单列的国家，永远排最后；'' = 不留逃生口
    interval: 120,
  },

  // ------------------------------------------------------------
  // 拦 STUN 探测（默认关）：REJECT 3478/5349/19302-19309 + 域名含 stun
  // 会同时打断 Meet / 微信语音 / Discord / 游戏语音，只在不用语音时打开
  // ------------------------------------------------------------
  webrtcGuard: {
    enabled: false,
  },

  // ------------------------------------------------------------
  // 两个顶层开关
  // ------------------------------------------------------------
  keepSubGroups: true, // 保留订阅自带组：节点 dialer-proxy 可能引用它们，丢了内核会拒载
  modeGuard: true, // 全局 / 直连模式会绕过整份 rules
};

// ------------------------------------------------------------
// 你的覆盖项：只写要改的键（对象逐字段合并，数组整体替换）
// ------------------------------------------------------------
//   const USER_CONFIG = {
//     residential: { primary: '🏠IP-JP', prefer: 'JP' },
//     appProxy: { ports: [{ name: 'ai-in', port: 7866, proxy: 'AI' }] },
//   };
// USER_CONFIG 已定义在本文件顶部（构建注入）

// 跑在哪：配置项 `mode`（'clash' 桌面 / 'flclash' 手机）。
// 手机端只接管「组 + 规则 + 节点」，DNS / IPv6 / listeners 全部交给 App，
// 否则会和 FlClash 自己的 DNS/TUN 打架，表现为「所有节点全部失效」。
// 名字只此一个：桌面不写（默认 clash），手机由构建脚本注入 USER_CONFIG.mode。
let FLCLASH_MODE = false;
function setMode(v) {
  FLCLASH_MODE = String(v || '').toLowerCase() === 'flclash';
}

// ------------------------------------------------------------
// 内部别名：下面所有逻辑读这些名字；DEFAULT_CONFIG 是唯一的默认值来源，
// 覆盖由 applyUserConfig() 就地合并进来。
// ------------------------------------------------------------
let RESIDENTIAL = DEFAULT_CONFIG.residential;
let APP_PROXY = DEFAULT_CONFIG.appProxy;
let TRAFFIC = DEFAULT_CONFIG.traffic;
let AI_STATIC_TO_AI = DEFAULT_CONFIG.aiStaticToAI;
let NARROW_TUN = DEFAULT_CONFIG.narrowTun;
let REGION_PRIORITY = DEFAULT_CONFIG.regionPriority;
let WEBRTC_GUARD = DEFAULT_CONFIG.webrtcGuard;
let KEEP_SUB_GROUPS = DEFAULT_CONFIG.keepSubGroups;
let MODE_GUARD = DEFAULT_CONFIG.modeGuard;
setMode(DEFAULT_CONFIG.mode); // 默认桌面；手机由 USER_CONFIG.mode 改成 'flclash'

// ------------------------------------------------------------
// 模式守卫：把内核钉在「规则」模式
// ------------------------------------------------------------
// 「全局」和「直连」会让内核绕过整份 rules：住宅出口 / AI / 前置-亚洲 全部空转，
// 日志里只剩 `using GLOBAL`，看起来像「住宅节点坏了」。
// 这个开关把模式改回 rule，并在日志里说清楚为什么。想交还面板控制就把 modeGuard 设 false。
// ⚠️ 守卫的边界（实测）：它只改「配置文件里的 mode」。Clash Party / FlClash 会在
//    覆写脚本跑完**之后**，把 App 界面里选的模式再写回内核 —— App 停在「全局」时，
//    脚本改的 rule 会被盖掉（work/config.yaml 重新生成后仍是 mode: global）。
//    所以运行期被切走，要在 App 界面切回「规则」（或调内核 API PATCH /configs），
//    守卫负责的只是「配置文件本身的默认值 + 留下日志线索」。
function enforceRuleMode(config) {
  if (!MODE_GUARD) return;
  const cur = config.mode;
  if (!cur || cur === 'rule') return;
  config.mode = 'rule';
  console.log(
    `[模式守卫] 内核原来是「${cur}」模式 → 已改回 rule：` +
      `全局/直连会绕过全部规则，「${RESIDENTIAL.group}」一次都不会被命中，` +
      'AI 的「住宅或阻断」等于关闭' +
      '；注意 App 界面若停在全局，仍会在脚本之后把模式写回 —— 请在界面切回「规则」',
  );
}

// ============================================================
// 以下为内部实现：CDN 源、自定义关键词、节点清洗、分组、规则生成
// ============================================================

// CDN 配置（可切换）
// ⚠️ 分两类源，别混用：
//
// 1) 第三方上游（Loyalsoldier / ACL4SSR）→ 走国内镜像 CDN_BASE
//    文件大、变动少，镜像的缓存延迟无所谓；jsDelivr 官方在国内多数网络 TLS 直接失败
//    （实测 HTTP 000），jsdmirror 实测 200。
//
// 2) 本仓库自己的规则集（ai-strict / ai / residential / *-extra / telegram / nsfw）
//    → 走 RAW_BASE（GitHub raw）
//    这些文件改得勤（比如给 ai-strict 加 Meta 域名），镜像的缓存会让人以为改了没生效：
//    实测 jsdmirror 在推送后仍返回旧版（75 条，而仓库已是 80 条），加 ?v=<时间戳> 也绕不过。
//    raw 实测拿到最新（80 条）。另外本文件里的 github / forGlobal 两个 provider 一直就是
//    走 raw 的，运行日志显示它们能正常加载（forGlobal 33k 条），说明内核拉取规则集是
//    经过隧道（日志里是 `dial AUTO ... --> raw.githubusercontent.com:443`），不存在
//    「内核没起来、没有代理可用」的问题。
const CDN_BASE_CN = 'https://cdn.jsdmirror.com/gh'; // 第三方上游用国内镜像
const CDN_BASE = CDN_BASE_CN;
// const CDN_BASE = `https://cdn.jsdelivr.net/gh`; // 海外网络可切回 jsDelivr 官方
// const CDN_BASE = "https://gcore.jsdelivr.net/gh";      // 备用：GCore CDN
// const CDN_BASE = "https://testingcf.jsdelivr.net/gh";  // 备用：Cloudflare CDN

// 本仓库规则集专用源：要即时生效，不能被 CDN 缓存拖住
const RAW_BASE = 'https://raw.githubusercontent.com/uxiew/easy_proxy_rules/refs/heads/main/ruleset';
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
// 【新增】机场占位/信息节点识别
// ===========================
// 机场常把「到期时间、剩余流量、官网、续费地址」等占位节点混在节点列表最前面，
// 它们多数是能通的真代理（探测 204 会成功），于是：
//   - url-test 组可能选中它们 → 所有走该组的流量出口变成未知服务器；
//   - fallback 组第一个存活成员是它们 → 整组流量被抢占（换落云订阅后 AI 组实测踩坑）。
// 所有带 filter 的组统一把这个正则并进 exclude-filter，把它们从自动收编里剔掉。
// 手动 select 不受影响（想看剩余流量还能在面板里点）。
const INFO_NODE_PATTERN =
  '套餐|剩余|到期|已用|重置|流量|官网|续费|地址|更新订阅|过期|有效|客户|下载|不显示|电报|频道|工单|建议|卡顿|试用|公告|维护|客服|网址|ㅤ';

// ===========住宅出口：这次到底建不建=========
// 「有没有家宽」没法靠猜：建组和写规则是静态的，而住宅节点来自覆写 YAML。
// 所以先判定、再让所有引用点读同一个结果：
//   1) main() 拿到最终 proxies（含 FlClash 注入的节点）之后判定一次；
//   2) 结果存进 residentialActive，getRules() / 建组 / listeners 全部读它；
//   3) 为 null 时（被外部当模块调用，例如从 smart.js 提取纯数据），
//      退回配置里的开关本身，行为与改造前一致。
let residentialActive = null;
const isResidentialOn = () =>
  residentialActive === null ? RESIDENTIAL.enabled !== false : residentialActive;
// 原来指向「住宅出口」的东西，没有家宽时统一改投 AI 组（机场出口）
const residentialPolicy = () => (isResidentialOn() ? RESIDENTIAL.group : 'AI');

// 「auto」的判据：residential.nodes 里真有可用节点，或运行时看得见名字命中的节点。
// 只数 server/port 齐全的 —— 占位符模板（YOUR_HOST / 端口 0）不算数。
function hasResidentialNode(proxies) {
  if (
    Array.isArray(RESIDENTIAL.nodes) &&
    RESIDENTIAL.nodes.some((n) => n && n.name && n.server && n.port)
  ) {
    return true;
  }
  if (!Array.isArray(proxies) || proxies.length === 0) return false;
  try {
    const matched = new RegExp(RESIDENTIAL.nodePattern);
    const info = INFO_NODE_PATTERN ? new RegExp(INFO_NODE_PATTERN) : null;
    return proxies.some(
      (p) => p && typeof p.name === 'string' && matched.test(p.name) && !(info && info.test(p.name)),
    );
  } catch {
    // nodePattern 写坏时宁可保留住宅链：静默换成机场出口比报错更危险
    return true;
  }
}

// 三态开关的唯一判定入口。优先级从上到下，先命中先生效：
//   显式 true/false > 'auto' 运行时探测
// 'auto' 仍然有效，但只在 main() 调到本函数时生效：它只负责「这次判成有家宽还是
// 无家宽」，判成无家宽之后的处理与 false 完全一致（不建两组 / 规则改 AI /
// 节点清理 / 7865 改绑 AI）。它判的是「运行时可见性」，不是「有没有家宽」；
// 未跑 main() 时 residentialActive 为 null，isResidentialOn() 会把 'auto' 当成 true。
// 主力住宅节点 = 「住宅出口」锁定的那一台（pinOnly: false 时只是默认选中项）。
//
// primary 只接受节点名（字符串），两种匹配方式，按顺序试：
//   1) 完整匹配：node.name === primary                 —— 自己起名时用，一字不差
//   2) includes：node.name 里包含 primary，且恰好 1 台  —— 订阅节点名带后缀/速度标记时用
// 命中 0 台或多台 → 返回 ''，由调用方按 pinMiss 处理（默认 REJECT）。绝不 return 第一个：
// 「锁不上」一旦变成「锁到别人」，就是「Claude 从日本变成美国登录」，而且不报错。
//
// 为什么不给别的形态：这脚本是通用的，不认识任何一家机场/住宅商的命名或地址结构。
// 序号由订阅下发顺序决定（重排/插占位节点就换人），端点会被「几百个 IP 共用一个网关」
// 的订阅一网打尽。出口 IP 只由「名字」唯一确定，锁不上就阻断。
let primaryInvalid = false;
let primaryInvalidWarned = false;
function primaryNameSetting() {
  const raw = RESIDENTIAL.primary;
  if (raw && typeof raw === 'object') {
    // 只接受节点名。写成对象（{ ip } / { server }）视为「配错了」→ 按锁不上处理（默认阻断）。
    // 不做兼容、不做猜测：出口 IP 锁不住的时候，阻断比「大概是他吧」安全得多。
    primaryInvalid = true;
    if (!primaryInvalidWarned) {
      primaryInvalidWarned = true;
      console.log('[住宅出口] primary 只接受节点名（字符串），当前是对象 → 按锁定失败处理');
    }
    return '';
  }
  return String(raw || '').trim();
}
// primary 写成了不支持的形态（用于住宅组：按 pinMiss 处理，绝不放行全部住宅节点）
const primaryMisconfigured = () => primaryInvalid;

// primary 配没配（'auto' 判定用）
const primaryNodeName = () => primaryNameSetting();

// 把 primary 解析成「本次节点列表里真实存在的那一台」。解析不出来 → ''。
function resolvePrimaryName(proxies) {
  const needle = primaryNameSetting();
  if (!needle) return '';
  const list = (Array.isArray(proxies) ? proxies : []).filter(
    (p) => p && typeof p.name === 'string',
  );
  // 完整匹配优先：名字一字不差就是它
  if (list.some((p) => p.name === needle)) return needle;
  // 没命中 → includes，必须唯一
  const hit = list.filter((p) => p.name.indexOf(needle) >= 0);
  if (hit.length === 1) return hit[0].name;
  if (hit.length > 1) {
    console.log(
      `[住宅出口] primary「${needle}」按 includes 命中 ${hit.length} 台节点` +
        `（${hit.slice(0, 3).map((p) => p.name).join(' / ')}${hit.length > 3 ? ' …' : ''}），` +
        '要求恰好命中 1 台 → 按 pinMiss 处理；把 primary 写长一点即可唯一确定',
    );
  }
  return '';
}

function resolveResidentialEnabled(config) {
  const setting = RESIDENTIAL.enabled;
  if (setting === true) return true;
  if (setting === false) return false;
  // 'auto'：只认「运行时真的看得到一个住宅节点」这一种证据
  if (primaryNodeName()) return true;
  return hasResidentialNode(config && config.proxies);
}

// ===========自动识别并分配 策略组=========
// ===========自动识别并分配 策略组=========
// ⚠️ 修复：移除了不兼容 Go 正则引擎的 or() 和 nor() 预查函数

// 【组名规则】回答"组名会不会和内置名冲突"：
// 1. 内核内置策略只有 4 个：DIRECT / REJECT / PASS / GLOBAL（外加规则里的 MATCH 关键字）。
//    这些名字**不能**拿来做自定义组名，否则会覆盖内置策略，规则行为直接乱掉。
// 2. AUTO、CATCH、AI、JP、US 这些都不在保留字里，和内核不冲突，可以放心用。
// 3. 真正的雷是「重名」：同一份配置里出现两个同名组，内核直接校验失败
//       ProxyGroup xxx: duplicate group name
//    所以覆写 YAML 里**不要**再定义 住宅出口 / AUTO / AI 这类本脚本已经建好的组。
// 4. 2026-11-05 起的组职责划分：
//      AUTO        —— 全量节点的 url-test，自动选最快（MATCH 之外的绝大多数规则都指向它）
//      CATCH       —— MATCH 兜底 + 手动总闸（AUTO / DIRECT / REJECT 三选一）
//      ADS_FILTER  —— 广告域名开关（REJECT / DIRECT 二选一）
//      AI          —— 机场 AI 组，按延迟选最快
//      住宅出口    —— 不在本对象里，由下方 include-all-proxies 动态生成
//    SPEED 已删除（与 AUTO 完全等价，纯重复测速）。

const smartGroups = {
  // --------------- 以下为静态代理组 ---------------
  AUTO: {
    // 【2026-11-05 改】原来写的是 proxies: ['US','JP','HK','SPEED']，
    // 而 SPEED 的 filter 是 '.*' —— 展开后 AUTO = US∪JP∪HK∪全部节点 = 全部节点。
    // 于是 AUTO 和 SPEED 成了成员完全相同的两个 url-test 组，
    // 同一批节点被两套健康检查各测一遍（浪费一倍探测开销），
    // 且 SPEED 没有任何规则引用，纯占面板。现在合并成一个：AUTO 直接吃全量。
    // ⚠️ 下面这段 filter 只在 ⑥ REGION_PRIORITY 关闭时生效；
    //    开启时（默认）AUTO 会被 applyRegionPriority() 改写成
    //    fallback[ JP → SG → KR → … → OT ]，成员完全由地区组顺序决定。
    filter: '.*',
    'exclude-filter': '套餐|剩余|到期|流量|官网', // 住宅节点/占位节点由 getFilterMatchedNodes 统一追加排除
    // interval: 300（每 5 分钟）测一轮，直接取最快且可用的节点。
    interval: 300,
    tolerance: 50,
    type: 'url-test',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/adjust.svg`,
  },
  AI: {
    // 【2026-11-05 改】fallback → url-test：按实测延迟取最快，而不是「按书写顺序取第一个活的」。
    // 原来的 fallback 只看顺序（JP 通就永远用 JP），JP 里挑到的是烂节点也只能忍着；
    // 现在每 200s 实测一轮，谁快用谁。
    type: 'url-test',
    interval: 200,
    // tolerance 的作用是「防抖」，不是「失败容差」：
    // 只有新节点的延迟比当前节点好 tolerance 毫秒以上才切，避免两个节点延迟接近时来回跳。
    // 设 200（而不是 50）是刻意的：AI 组跨国家，跳一次国家就可能触发 Google 的
    // 「异常活动」验证，宁可慢 200ms 也别频繁换出口。
    tolerance: 200,
    // ⚠️ 副作用：url-test 不像 fallback 那样保证「总是 JP 优先」。
    //    订阅里有 SG/US/DE/KR 节点时，可能出现「今天日本、明天新加坡」的国家跳变。
    //    在意账号地域稳定性的话，把上面 type 改回 'fallback' 即可（顺序即优先级）。
    //    当前订阅只剩日本节点，所以实际等价于「日本节点里挑最快」。
    // ⚠️ ⑥ REGION_PRIORITY 开启时（默认），本组会被改写成
    //    fallback[ JP → SG → KR → … → OT ]，下面的 proxies 只在 ⑥ 关闭时才用。
    proxies: ['JP', 'SG', 'KR', 'US', 'DE'],
    icon: 'https://github.com/DustinWin/ruleset_geodata/releases/download/icons/ai.png',
  },
  ADS_FILTER: {
    // 【2026-11-05 改】原来写 proxies: ['REJECT','AUTO']，但 expandGroup 会把 AUTO
    // 摊平成 100+ 个机场节点，这个组就变成了「REJECT + 107 个节点」的下拉框。
    // 语义上「广告域名走代理」毫无意义，除错时唯一有用的动作是「放行直连」，
    // 所以固定两个成员、不再展开：
    //   REJECT（默认，拦截广告/统计域名） / DIRECT（怀疑误杀时手动切过去放行）
    keepRefs: true,
    type: 'select',
    proxies: ['REJECT', 'DIRECT'],
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
    // 【2026-11-05 改】原来是「没有任何规则引用的死组」，成员还被展开成全量节点。
    // 现在让它当总闸：MATCH 的兜底目标从 AUTO 改成 CATCH，
    //   AUTO（默认，保持原有行为：未命中的流量走机场）
    //   DIRECT（怀疑某个站是代理导致打不开时，面板一键切直连排查，不用改配置重载）
    //   REJECT（断网模式，全部未知流量丢弃）
    // keepRefs 让 expandGroup 不要把它摊平成节点列表，否则「切到 DIRECT」这个能力就没了。
    keepRefs: true,
    type: 'select',
    proxies: ['AUTO', 'DIRECT', 'REJECT'],
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/fish.svg`,
  },
  // --------------- 以下为静态代理组 ---------------
  // 【2026-11-05 删除 SPEED】
  // 它原本是 filter: '.*' 的 url-test 组，但没有任何规则引用，
  // 只作为 AUTO 的成员被引用 —— 展开后 AUTO 与它成员完全相同，
  // 等于同一批节点被两套健康检查重复测速。合并进 AUTO 后删除。
  // 需要「手动挑一个最快的」时用「🚀 全部节点」，需要「自动挑」时用 AUTO。
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
    // ⚠️ 只用多字关键词，不要放单字「日」「東」「东」：
    //   [东帝汶]（东）、[尼日利亚]（日）、🇦🇶[到期: 2027年xx月xx日]（日）都会被单字误收，
    //   换订阅实测踩坑：前置组一度收进东帝汶+尼日利亚+到期信息节点。
    filter: '日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉|川崎|横浜|名古屋',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg`,
  },
  KR: {
    filter: '韩|韓|首|爾|春川|🇰🇷|KR|Korea',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/kr.svg`,
  },
  SG: {
    // ⚠️ 不要放单字「坡」：马来西亚节点常写「吉隆坡」，会被误收进新加坡组。
    //    2026-11-10 起 SG 组要做「优先于韩国」的地区组，误收的后果比原来严重得多
    //    （吉隆坡节点会被当成新加坡、优先于 KR 被选中），所以只用多字/全称关键词。
    filter: '新加坡|狮城|SG|Singapore|🇸🇬',
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

// ---------- 地区优先：把 AUTO / AI 改造成「国家顺序 fallback + 国内取最快」 ----------
// 放在 smartGroups 定义之后、main() 之前，靠改写 smartGroups 生效，
// 这样 main() 里的 expandGroup / activeGroups 不用改动就能识别新结构。
(function applyRegionPriority() {
  const cfg = REGION_PRIORITY;
  if (!cfg || !cfg.enabled) return;

  const targets = Object.entries(cfg.targets || {}).filter(([name]) => smartGroups[name]);
  if (!targets.length) return;

  // 所有被引用到的地区组，用来拼「其它地区」的排除正则
  const regionKeys = [...new Set(targets.flatMap(([, order]) => order || []))].filter(
    (k) => smartGroups[k] && smartGroups[k].filter,
  );

  // 1) 其它地区组：只收「没有单列的国家」，永远排在地区顺序最后一位。
  //    exclude-filter 把 targets 里所有地区组的 filter 拼起来排掉，
  //    保证「一个节点只属于一个组」——否则日本节点同时出现在 JP 和 OT 里，
  //    同一台被两套健康检查各测一遍，白烧探测。
  if (cfg.othersGroup && !smartGroups[cfg.othersGroup]) {
    smartGroups[cfg.othersGroup] = {
      type: 'url-test',
      filter: '.*',
      'exclude-filter': regionKeys.map((k) => smartGroups[k].filter).join('|'),
      interval: 300,
      tolerance: 50,
      icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/adjust.svg`,
    };
  }

  // 2) 目标组本身改成 fallback，成员是「地区组按顺序 + 其它地区」
  for (const [name, order] of targets) {
    const base = smartGroups[name];
    const members = [...(order || []), cfg.othersGroup].filter((k) => k && smartGroups[k]);
    if (!members.length) continue;
    console.log(`[地区优先] ${name} = fallback[ ${members.join(' → ')} ]（国家之间按顺序，国家内部挑最快）`);

    smartGroups[name] = {
      ...base,
      type: 'fallback',
      // keepRefs：不让 expandGroup 把地区组摊平成 100+ 个节点，否则顺序语义全丢
      keepRefs: true,
      proxies: members,
      interval: cfg.interval || base.interval,
      // 【2026-11-10】关掉 lazy：groupBaseOption 里 lazy=true 表示「第一次被用到才测」，
      // fallback 在没有任何健康数据时不知道该选谁，只能按内部顺序猜；
      // 实测冷启动第一波请求会因此落到后面的地区（或直接失败等重测）。
      // 关掉后配置一加载就把各地区的活/死测出来，顺序语义立刻生效 —— 和「前置-亚洲」同一个坑。
      lazy: false,
      // 原来「全量收编」的 filter 现在没用了，成员完全由 proxies 决定。
      // 这里置空而不是 delete，是因为 ...base 已经把它带进来了。
      filter: undefined,
      'exclude-filter': undefined,
    };
  }
})();

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
    url: `${RAW_BASE}/github.yaml`,
  },
  forGlobal: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: `${RAW_BASE}/global.yaml`,
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
    url: `${RAW_BASE}/ai.yaml`,
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
    url: `${RAW_BASE}/telegram.yaml`,
    path: './ruleset/uxiew/telegram.yaml',
  },
  // 🔞 魅力艺术
  forNSFW: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${RAW_BASE}/nsfw.list`,
    path: './ruleset/uxiew/nsfw.yaml',
  },

  // ===== 【整理】以下四个是本仓库自己的小规则集，把原先硬编码在脚本里的域名搬了出来 =====
  // 好处：增删域名只改 ruleset/*.list，smart.js 保持"只有逻辑没有规则内容"。
  // 格式：classical + text，每行 `DOMAIN-SUFFIX,xxx`（不带策略，策略由 RULE-SET 那一行决定）。
  // ⚠️ .list 文件里绝对不能写行尾注释：`DOMAIN-SUFFIX,a.com  # 注释` 会被整体当成域名，
  //    规则静默失效、永不匹配（mihomo v1.19 实测）。注释只能单独占一行。
  // AI 服务商官方域名（Claude / OpenAI / Grok …，连人机验证和遥测一起，必须同 IP）
  aiStrict: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${RAW_BASE}/ai-strict.list`,
    path: './ruleset/uxiew/ai-strict.yaml',
  },
  // 住宅出口域名（非 AI 的账号/支付/电商，怕共享 IP 风控的站点）
  residential: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${RAW_BASE}/residential.list`,
    path: './ruleset/uxiew/residential.yaml',
  },
  // 补充直连域名（原 directDomains + co.jp）
  directExtra: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${RAW_BASE}/direct-extra.list`,
    path: './ruleset/uxiew/direct-extra.yaml',
  },
  // Google 通用资产（原 customRules 里的 googleapis.cn / gstatic / googleplay 中文域名）
  autoExtra: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${RAW_BASE}/auto-extra.list`,
    path: './ruleset/uxiew/auto-extra.yaml',
  },
  // WebRTC 常见 STUN 探测拦截（可选，见顶部 ⑦ WEBRTC_GUARD）。
  // 只在打开时才定义 provider：关着的时候不产生任何下载请求。
  ...(WEBRTC_GUARD.enabled
    ? {
        webrtcGuard: {
          ...ruleProviderCommon,
          behavior: 'classical',
          format: 'text',
          url: `${RAW_BASE}/webrtc-guard.list`,
          path: './ruleset/uxiew/webrtc-guard.yaml',
        },
      }
    : {}),
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

  // ⚠️ 2026-11-04 实测修复：本机网络对外部 UDP 53 全部阻断
  //   dig @223.5.5.5 / @119.29.29.29 / @8.8.8.8 → 一律 i/o timeout（连续 3 次），
  //   ping 那些 IP 却正常，只有路由器 DNS(192.168.31.1) 能出结果。
  //   原来的「纯 IP 列表 + 域名型 DoH(https://doh.pub/dns-query)」会死在引导阶段：
  //   要解析 doh.pub 得先有 DNS，而唯一的 DNS 入口是已被阻断的 UDP 53 → 死循环。
  //   现象就是所有 DIRECT 域名解析失败，表现为「直连全部超时」。
  //   引导这里放路由器优先（唯一可用），再挂公网 IP 兜底（换到 UDP 53 可用的网络仍能工作）
  'default-nameserver': ['192.168.31.1', '223.5.5.5', '119.29.29.29'],

  // 解析节点域名的 DNS：用 **IP 型 DoH**，既不走 UDP 53，也不需要用域名去引导
  //   实测 jp.jisu16.top → 140.238.53.202（真实 Oracle 东京），未被污染
  'proxy-server-nameserver': [
    'https://1.12.12.12/dns-query',   // DNSPod（腾讯）IP 型 DoH
    'https://120.53.53.53/dns-query', // DNSPod 备用 IP
  ],

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
    // 一律写成 **IP 型**（https://1.12.12.12/dns-query）：
    //   域名型（https://doh.pub/dns-query）需要先解析 doh.pub，
    //   在 UDP 53 被阻断的网络里会直接卡死（实测 5s 超时 → 直连全挂）
    'geosite:cn': [
      'https://1.12.12.12/dns-query',   // DNSPod（腾讯）
      'https://120.53.53.53/dns-query', // DNSPod 备用 IP
    ],
    // 国外域名同样用 IP 型 DoH：加密查询不存在明文污染，
    // 实测 www.google.com / www.youtube.com / x.com / github.com 全部返回真实 IP
    'geosite:geolocation-!cn': [
      'https://1.12.12.12/dns-query',
      'https://120.53.53.53/dns-query',
    ],
  },

  // 兜底主 DNS（如果没有被上面的 nameserver-policy 命中，先向这里请求）
  nameserver: ['https://1.12.12.12/dns-query', 'https://120.53.53.53/dns-query'],

  // 兜底备用 DNS（防污染安全网）
  // ⚠️ 这里只留 Cloudflare，且它在本机只能经代理访问（直连 000，走代理 200/3.2s）。
  //   8.8.8.8 的 DoH 与 tls://8.8.4.4:853 在本机实测不可用（400 / 超时），已移除。
  //   平时几乎不会触发：fake-ip 模式下海外域名直接给 198.18.x 假 IP，真实解析在出口完成。
  fallback: ['https://1.1.1.1/dns-query'],

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
  //
  // 【没有家宽时】aiTarget 自动变成 'AI'：规则一条不少、顺序不变，只是把
  // 「住宅出口」这个落点换成机场 AI 组。这样没配住宅的人不再是「AI 全被阻断」，
  // 而是退回机场；配了住宅的人行为与之前完全一致。
  const aiTarget = residentialPolicy();
  const aiPolicy = RESIDENTIAL.allAI ? aiTarget : 'AI';
  const aiStrictPolicy = RESIDENTIAL.aiStrict ? aiTarget : aiPolicy;
  // Apple 流量去向（TRAFFIC.appleDirect 见文件顶部，默认直连省流量）
  const applePolicy = TRAFFIC.appleDirect ? 'DIRECT' : 'AI';

  const  whiteListRules= [
    // ===== 应用级分流：进程 / 包名 / UID（必须排在规则最前面）=====
    // 进程规则一旦命中就直接决定出口；排在任何 DOMAIN 规则之后都会被截胡。
    // 配置见文件顶部 APP_PROXY.processes。数组为空时不产生任何规则，等于没改。
    // 注意：值里不能带逗号，否则会被当成策略名截断。
    ...APP_PROXY.processes
      // FlClash（Android）上没有 /Applications，桌面路径类规则永远不会命中，直接跳过
      .filter(({ type }) => !(FLCLASH_MODE && (type === 'path' || type === 'path-regex')))
      .map(({ value, proxy, type }) => {
      // type → 内核规则类型；内核支持 PROCESS-NAME/PATH 及其 REGEX 版本 + UID。
      const KINDS = {
        path: 'PROCESS-PATH',
        'path-regex': 'PROCESS-PATH-REGEX',
        'name-regex': 'PROCESS-NAME-REGEX',
        uid: 'UID',
      };
      const kind = KINDS[type] || 'PROCESS-NAME';
      // 没有家宽时，指向「住宅出口」的进程规则改投 AI 组：
      // 否则规则引用了不存在的组，内核启动直接报 proxy not found，整份配置加载失败。
      const target = proxy === RESIDENTIAL.group ? residentialPolicy() : proxy;
      return `${kind},${value},${target}`;
    }),

    // 局域网与私有地址
    'GEOIP,LAN, DIRECT, no-resolve',
    'RULE-SET,private, DIRECT',
    'RULE-SET,applications, DIRECT',
    'RULE-SET,lancidr, DIRECT,no-resolve',

    // ===== WebRTC 常见 STUN 探测拦截（可选，默认关，见顶部 ⑦）=====
    // 位置很关键：必须排在所有必要技术规则之后、任何业务规则之前。
    //   - 放前面会把内网/节点流量一起拦掉；
    //   - 放后面会被进程规则、AI 规则先接走，等于没装。
    // 打开后会打断依赖 STUN 的语音/视频，取舍见 WEBRTC_GUARD 注释。
    ...(WEBRTC_GUARD.enabled ? ['RULE-SET,webrtcGuard, REJECT'] : []),

    // ===== Anthropic 的 IP 段 → 住宅出口（必须，否则同一账号两个出口 IP）=====
    // 原来这三条在 ruleset/ai.yaml 里，跟着 forAI 走 AI 组：
    // 域名走住宅、程序直连 IP 走机场 → 风控看到「同一会话两个 IP」，比用脏 IP 更糟。
    // fake-ip 模式下域名请求不会命中 IP 规则，但 Claude 桌面端 / SDK 直连 IP 时会。
    // 没有家宽时落点同样是 aiTarget = AI，保持「这类 IP 和 AI 域名同一个出口」。
    ...(RESIDENTIAL.aiStrict
      ? [
          // ⚠️ IP-ASN 需要 ASN 数据库（ASN.mmdb）。桌面端 Clash Party 自带这个文件，
          //    手机 FlClash 不一定有；缺了它内核会在启动时尝试下载，下载失败则**整份配置
          //    加载失败**（实测 `mihomo -t` 报 ASN 下载超时），表现就是「所有节点全部失效」。
          //    所以 FlClash 模式跳过它，只保留不依赖数据库的 IP-CIDR。
          ...(FLCLASH_MODE ? [] : [`IP-ASN,399358,${aiTarget},no-resolve`]),
          `IP-CIDR,160.79.104.0/21,${aiTarget},no-resolve`,
          `IP-CIDR6,2607:6bc0::/32,${aiTarget},no-resolve`,
        ]
      : []),

    // ===== AI 静态资源 / 安装包 → 机场 AI 组 =====
    // 必须排在 RULE-SET,aiStrict 之前：这个规则集是按后缀收编的，`claude.ai` 会把
    // downloads.claude.ai 一起卷进住宅。这里先命中，等于从住宅里把它摘出来。
    // 清单与理由见文件顶部 AI_STATIC_TO_AI。
    ...AI_STATIC_TO_AI.map((rule) => `${rule}, AI`),

    // ===== AI 服务商 → 住宅出口（最高优先级）=====
    // 必须排在 RULE-SET,forAI 之前：ai.yaml 里就有 DOMAIN-SUFFIX,anthropic.com，
    // 放在后面的话 forAI 先命中，Claude 会走机场，住宅出口永远轮不到。
    // 规则集内容见 ruleset/ai-strict.list（含 Claude 的 Turnstile、auth0、Persona、遥测）。
    // 没有家宽时整条规则保留，只把落点从住宅换成 AI（aiTarget），不会漏到 AUTO。
    ...(RESIDENTIAL.aiStrict ? [`RULE-SET,aiStrict, ${aiTarget}`] : []),

    // 住宅出口：非 AI 的账号/支付/电商，清单在 ruleset/residential.list
    // 没有家宽时同样保留，落点换成 AI：这些站点仍需固定出口，只是不再是住宅 IP。
    `RULE-SET,residential, ${aiTarget}`,

    // ===== Google 日本域名：必须抢在 directExtra 之前 =====
    // ruleset/direct-extra.list 里有 `DOMAIN-SUFFIX,co.jp`（日本站点直连），它会把
    // google.co.jp / accounts.google.co.jp 一起判成 DIRECT。而 Google 的日本站在
    // 国内网络下直连必然失败：DNS 拿到的是污染地址（阿里云 / Facebook 段），
    // TCP 也过不去，症状就是「google.com 正常、google.co.jp 打不开」。
    // 2026-11-06 实测日志：`dial DIRECT (match RuleSet/directExtra) --> accounts.google.co.jp:443
    // error: dial tcp 47.88.58.234:443: connect: connection refused`。
    // 目标组与下面的 `RULE-SET,google, AI` 一致，账号登录在 .com / .co.jp 之间跳转时不换出口 IP。
    'DOMAIN-SUFFIX,google.co.jp, AI',

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

  // ⚠️ 兜底必须放最后：它的前面任何一条规则都会被它截断。
  // 兜底目标从 AUTO 改成 CATCH，CATCH 默认成员就是 AUTO，行为不变；
  // 但需要临时「全站直连 / 全站断网」时，面板切一下 CATCH 即可，不用改配置重载。
  return [...whiteListRules, ...aiFallbackRules, ...customRules, 'MATCH, CATCH'];
}

// =========== 用户配置层：USER_CONFIG + 覆写 YAML 的 x-smart ===========
// 两个来源，一套键名，优先级从低到高：USER_CONFIG < x-smart。
// 手机端没有覆写链：构建脚本把 flclash-credentials.json 的 config 段直接写成
// 文件顶部的 USER_CONFIG —— 名字只有这一个，两端读的是同一个对象。
// 桌面端的推荐写法（写在任意一个排在 smart.js **之前**的覆写 YAML 里，比如「静态住宅节点」）：
//   x-smart:                           # ← 不要写 +x-smart
//     residential:
//       primary: '🏠IP-JP'              # 锁这一台（完整名，或名字里的唯一片段）
//       prefer: 'JP'
//       # upstream.inject 默认 fill（走前置）——人在国内直连住宅网关会被墙，
//       # 只有「人在海外且直连路径干净」才值得写 'strip'
//     narrowTun: { enabled: true }
//     keepSubGroups: true
// ⚠️ 为什么不是 `+x-smart`：Clash Party 的 deepMerge 只对**数组**认 `+` 前缀
//    （`+proxies` / `+rules`）；对象键不认，写 `+x-smart` 会得到一个叫「+x-smart」的键。
//    两种写法这里都兼容，但正确写法是不带 `+`。
// 合并规则：对象递归合并（upstream 只写 inject 不会把 group 抹掉），数组/标量整体替换。
// 每一项都过类型校验；键名写错就报警并列可用键 —— 静默吞掉一个错键，等于让人以为它生效了。
// 读完整段会从配置里删掉，避免内核因为陌生字段报警。

// 可覆盖的目标对象：键名 → 实际对象。以后新增配置对象，在这里登记一行就行。
const CONFIG_TARGETS = {
  residential: () => RESIDENTIAL,
  appProxy: () => APP_PROXY,
  traffic: () => TRAFFIC,
  narrowTun: () => NARROW_TUN,
  regionPriority: () => REGION_PRIORITY,
  webrtcGuard: () => WEBRTC_GUARD,
  aiStaticToAI: () => AI_STATIC_TO_AI,
};

// 不在上面那些对象里的顶层开关
const CONFIG_SWITCHES = {
  keepSubGroups: (v) => {
    KEEP_SUB_GROUPS = v;
  },
  modeGuard: (v) => {
    MODE_GUARD = v;
  },
};

// 顶层标量：值决定行为，不是开/关
const CONFIG_SCALARS = {
  mode: (v) => {
    setMode(v);
  },
};

// 只能取固定值的项：写错不是「类型不对」，而是拼错了一个枚举，必须拦下来。
const CONFIG_ENUMS = {
  mode: ['clash', 'flclash'],
  // 三态开关：true / false / 'auto'。默认值是布尔，按「类型」校验会把 'auto' 挡掉，
  // 所以这里必须先按枚举放行（以前写 enabled: 'auto' 是静默失效的）。
  'residential.enabled': [true, false, 'auto'],
  'residential.pinMiss': ['reject', 'collect'],
  'residential.upstream.inject': ['fill', 'strip', 'override', false],
  'narrowTun.stack': ['Mixed', 'gvisor', 'system'],
};

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function describeValue(v) {
  if (Array.isArray(v)) return '数组';
  if (v === null) return 'null';
  if (isPlainObject(v)) return '对象';
  if (typeof v === 'boolean') return '布尔 true/false';
  if (typeof v === 'number') return '数字';
  if (typeof v === 'string') return '字符串';
  return typeof v;
}
// 类型写错时不能「一律保留默认值」的键：保留默认值会让语义**相反**。
// 只有 residential.primary 属于这一类：默认值是 ''（不锁 → 收编全部住宅节点），
// 用户写了个对象（旧写法 { ip } / 拼错的字段）本意是「锁那一台」，
// 静默退回 '' 就成了「随便哪台住宅都行」——出口 IP 可能落到别的国家。
// 这里改成写入一个非法值，让 primaryNameSetting() 判成「锁定失败」→ 组里只剩 REJECT。
const CONFIG_GUARDS = {
  'residential.primary': (v, target, k, sink) => {
    if (typeof v === 'string') return false; // 正常字符串交给通用逻辑
    target[k] = { invalid: describeValue(v) };
    sink.bad.push(
      `residential.primary 只接受节点名（字符串），收到${describeValue(v)} ` +
        '—— 已按锁定失败处理（住宅出口只剩 REJECT）',
    );
    return true;
  },
};
// 类型对不上就拒绝：`pinOnly: 'true'`（字符串）在 JS 里是 truthy，会悄悄按 true 跑，
// 下次写 `'false'` 也一样 truthy —— 这类坑只能靠严格校验挡住。
function sameKind(cur, v) {
  if (Array.isArray(cur)) return Array.isArray(v);
  if (isPlainObject(cur)) return isPlainObject(v);
  return typeof v === typeof cur;
}

function applyConfigFields(path, target, patch, sink) {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    const here = path ? `${path}.${k}` : k;
    if (!Object.prototype.hasOwnProperty.call(target, k)) {
      sink.unknown.push(`${here}（可用：${Object.keys(target).join(' / ')}）`);
      continue;
    }
    const cur = target[k];
    if (isPlainObject(cur) && isPlainObject(v)) {
      applyConfigFields(here, cur, v, sink);
      continue;
    }
    // 语义不能「保留默认值」的键先判（见 CONFIG_GUARDS）
    const guard = CONFIG_GUARDS[here];
    if (guard && guard(v, target, k, sink)) continue;
    // 枚举先判：`upstream.inject` 的默认值是布尔 true，但合法的写法是 'fill' / 'strip' /
    // 'override' / false —— 按「默认值类型」校验会把 'strip' 当成类型错误挡掉。
    const allowed = CONFIG_ENUMS[here];
    if (allowed) {
      if (allowed.indexOf(v) < 0) {
        sink.bad.push(
          `${here} 只能是 ${allowed.map((x) => JSON.stringify(x)).join(' / ')}，` +
            `收到 ${JSON.stringify(v)}`,
        );
        continue;
      }
      target[k] = v;
      sink.applied.push(here);
      continue;
    }
    if (!sameKind(cur, v)) {
      sink.bad.push(`${here} 需要${describeValue(cur)}，收到${describeValue(v)}`);
      continue;
    }
    target[k] = v;
    sink.applied.push(here);
  }
}

function applyConfigLayer(label, src) {
  const sink = { applied: [], unknown: [], bad: [] };
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (CONFIG_TARGETS[k]) {
      const tgt = CONFIG_TARGETS[k]();
      // 数组目标（目前只有 aiStaticToAI）：整体替换。就地改内容——绑定是 const，
      // 但数组长度和元素都是可变的；这样其它地方已经拿到的引用不会失效。
      if (Array.isArray(tgt)) {
        if (!Array.isArray(v)) {
          sink.bad.push(`${k} 需要数组，收到${describeValue(v)}`);
          continue;
        }
        if (tgt.length && tgt.every((x) => typeof x === 'string') && !v.every((x) => typeof x === 'string')) {
          sink.bad.push(`${k} 的每一项都需要字符串（例如 'DOMAIN-SUFFIX,example.com'）`);
          continue;
        }
        tgt.length = 0;
        tgt.push(...v);
        sink.applied.push(`${k}[]`);
        continue;
      }
      if (!isPlainObject(v)) {
        sink.bad.push(`${k} 需要对象，收到${describeValue(v)}`);
        continue;
      }
      applyConfigFields(k, tgt, v, sink);
    } else if (CONFIG_SWITCHES[k]) {
      if (typeof v !== 'boolean') {
        sink.bad.push(`${k} 需要布尔 true/false，收到${describeValue(v)}`);
        continue;
      }
      CONFIG_SWITCHES[k](v);
      sink.applied.push(k);
    } else if (CONFIG_SCALARS[k]) {
      const allowed = CONFIG_ENUMS[k];
      if (typeof v !== 'string' || (allowed && allowed.indexOf(v) < 0)) {
        sink.bad.push(
          `${k} 只能是 ${(allowed || []).map((x) => JSON.stringify(x)).join(' / ')}，` +
            `收到 ${JSON.stringify(v)}`,
        );
        continue;
      }
      CONFIG_SCALARS[k](v);
      sink.applied.push(`${k}=${v}`);
    } else {
      sink.unknown.push(
        `${k}（可用：${[
          ...Object.keys(CONFIG_TARGETS),
          ...Object.keys(CONFIG_SWITCHES),
          ...Object.keys(CONFIG_SCALARS),
        ].join(' / ')}）`,
      );
    }
  }
  if (sink.applied.length) console.log(`[配置覆写] ${label}：已应用 ${sink.applied.join(' / ')}`);
  if (sink.unknown.length) console.log(`[配置覆写] ${label}：忽略未知项 ${sink.unknown.join('；')}`);
  if (sink.bad.length) {
    console.log(`[配置覆写] ${label}：${sink.bad.join('；')} —— 已忽略上述项（其余照常）`);
  }
}

function applyUserConfig(config) {
  const KEY = config['x-smart'] ? 'x-smart' : config['+x-smart'] ? '+x-smart' : '';
  /** @type {Array<[string, object]>} */
  const layers = [];
  if (isPlainObject(USER_CONFIG) && Object.keys(USER_CONFIG).length) {
    layers.push(['USER_CONFIG（脚本顶部；手机端是构建注入的那份）', USER_CONFIG]);
  }
  if (KEY && isPlainObject(config[KEY])) {
    layers.push([`覆写 YAML 的 ${KEY}`, config[KEY]]);
  } else if (KEY) {
    console.log(`[配置覆写] 覆写 YAML 的 ${KEY} 不是对象（是${describeValue(config[KEY])}） → 已忽略`);
  }
  for (const [label, src] of layers) applyConfigLayer(label, src);
  delete config['x-smart'];
  delete config['+x-smart'];
}

// ===== 住宅节点注入：residential.nodes =====
// 桌面和手机同一个位置。手机没有覆写链，只能靠它；桌面也可以用，省掉在 +proxies 里
// 手写 dialer-proxy 并自己保证字段齐全。
//   · 同名节点先删后插 —— 订阅更新后同名节点换了地址，以这里的为准；
//   · dialer-proxy 自动补成 upstream.group，除非 upstream.enabled = false / inject: 'strip' / inject: false；
//   · primary 留空时锁第一台：手机没有 store-selected，不锁的话组默认选中 REJECT，
//     手机上表现为「AI 站点全被阻断」（ChatGPT 报「非预期的 SSL 证书」）；
//   · primary 写了但对不上任何一台 → 一个字都不改，交给 pinMiss 处理（默认阻断）。
//     绝不自作聪明换成第一台：那就是「Claude 从日本变成美国登录」还不报错。
// 本轮由 residential.nodes 注入的节点对象：main() 后段「前置组匹配 0 台 → 自动降级 strip」
// 时，要把它们的 dialer-proxy 一并摘掉 —— 否则订阅节点降成了直连、自备节点还挂在一个
// 只剩 REJECT 兜底的组上，同类节点两种行为（踩过的真实不一致）。
let INJECTED_RESI_NODES = [];
function applyResidentialNodes(config) {
  const list = (Array.isArray(RESIDENTIAL.nodes) ? RESIDENTIAL.nodes : []).filter(
    (n) => n && n.name && n.server && n.port,
  );
  if (!list.length) return;
  // enabled: false 时不注入：节点的 dialer-proxy 指向「前置-亚洲」，而那一组此时不建，
  // 内核会 proxy not found 拒载整份配置（比「AI 走机场」严重得多）。
  if (RESIDENTIAL.enabled === false) {
    console.log('[住宅出口] residential.enabled = false：不注入 residential.nodes，AI 走 AI 组');
    return;
  }
  const up = RESIDENTIAL.upstream || {};
  // inject 语义与订阅节点那套完全一致：false = 一个字都不碰（连自备节点也不补），
  // strip = 直连；true / 'fill' / 'override' = 补上跳板
  const hop =
    up.enabled !== false && up.inject !== 'strip' && up.inject !== false ? up.group : '';
  const names = new Set(list.map((n) => n.name));
  config.proxies = (config.proxies || []).filter((p) => p && !names.has(p.name));
  INJECTED_RESI_NODES = [];
  let re = null;
  try {
    re = new RegExp(RESIDENTIAL.nodePattern);
  } catch {
    re = null;
  }
  for (const n of list) {
    const node = Object.assign({}, n, {
      name: n.name,
      // 协议按服务商给的填。写错的典型表现是「TCP 能连上、一握手就 reset」（坑 30）
      type: n.type || 'http',
      server: n.server,
      port: Number(n.port),
      udp: n.udp === undefined ? false : !!n.udp,
    });
    if (hop && !node['dialer-proxy']) node['dialer-proxy'] = hop;
    config.proxies.push(node);
    INJECTED_RESI_NODES.push(node);
    if (re && !re.test(n.name)) {
      console.log(
        `[住宅出口] 节点名「${n.name}」不含住宅关键词（${RESIDENTIAL.nodePattern}），` +
          '进不了住宅组 —— 名字里带上 🏠 / IP- / 住宅 之类',
      );
    }
  }
  const rawPrimary = RESIDENTIAL.primary;
  if (typeof rawPrimary === 'string' && !rawPrimary.trim()) {
    RESIDENTIAL.primary = list[0].name;
    console.log(`[住宅出口] residential.primary 留空 → 锁第一台「${list[0].name}」`);
  }
  console.log(
    `[住宅出口] residential.nodes 已注入 ${list.length} 台住宅节点` +
      `${hop ? `（dialer-proxy: ${hop}）` : '（直连住宅网关）'}`,
  );
}

// 程序入口
function main(config) {
  // 验证配置
  if (!config) {
    throw new Error('配置对象为空');
  }

  applyUserConfig(config);

  // ===== FlClash 新版安全网（v0.9.1+）=====
  // v0.9.1 起 core/profile_base.go 的 mergeProfileBase 会做两件事：
  //   1) 用订阅原文覆盖 proxies / proxy-groups / sub-rules
  //      → 覆写脚本注入的节点和重建的分组**全部被丢弃**；
  //   2) 把覆写结果的 rules 追加在订阅 rules 前面（appendRules）。
  // 如果在这种版本上继续重建规则，规则会指向不存在的组，内核只能报错或全断网。
  // 特征：core 传给 host 的是「骨架配置」——proxies 与 rules 都是空的。
  const __skeleton =
    FLCLASH_MODE &&
    !(Array.isArray(config.proxies) && config.proxies.length > 0) &&
    !(Array.isArray(config.rules) && config.rules.length > 0);
  if (__skeleton) {
    // 只保留 DNS 修复（dns 不在被覆盖的字段里），其余原样返回，避免把手机搞断网。
    const d = Object.assign({}, dnsConfig);
    delete d.listen; // 手机上绝不能绑 1053，会和 FlClash 自己的 DNS 抢端口
    config.dns = d;
    console.log(
      '[FlClash] 检测到 v0.9.1+ 的骨架配置：该版本会丢弃覆写生成的节点与分组，' +
        '已跳过节点/分组/规则重建（只修 DNS）。若要保留住宅出口与 AI 分流，请降级到 v0.8.98。',
    );
    return config;
  }

  // ===== 模式守卫：把内核钉在「规则」模式（见文件顶部 MODE_GUARD）=====
  // 放在最前面：后面的分组 / 规则重建都建立在「规则模式生效」这个前提上，
  // 模式是 global 时它们建出来也一次不会被用到。
  enforceRuleMode(config);

  // ===== 住宅节点：residential.nodes（桌面 / 手机同一个位置）=====
  applyResidentialNodes(config);

  // ===== 判定：这次到底有没有家宽 =====
  // 必须在 FlClash 注入之后、getRules()/建组之前定下来（两处都读同一个结果）。
  // 没有家宽时：不建「住宅出口 / 前置-亚洲」，AI 与账号类规则改投 AI 组（机场出口），
  // 其余规则、顺序、分流全部不变。
  residentialActive = resolveResidentialEnabled(config);
  if (residentialActive) {
    console.log(
      `[住宅出口] 已启用：建完整住宅链（${RESIDENTIAL.group} + ${RESIDENTIAL.upstream.group} ` +
        'url-test 全量收编亚洲节点），AI 与账号类流量走住宅',
    );
  } else {
    const reason =
      RESIDENTIAL.enabled === false
        ? '显式 enabled: false'
        : RESIDENTIAL.enabled === 'auto'
          ? `auto 未检测到 ${RESIDENTIAL.nodePattern} 节点`
          : `没有可用的住宅节点（residential.nodes 为空，订阅里也没有名字命中 ${RESIDENTIAL.nodePattern} 的节点）`;
    console.log(
      `[住宅出口] 未启用（${reason}）：不生成「${RESIDENTIAL.group}」与「${RESIDENTIAL.upstream.group}」，` +
        'AI 与账号类规则改投 AI 组（机场出口），其余规则一字不改。',
    );
  }

  // 【2026-11-17 新增】订阅自带的住宅节点：补 / 删 / 改写 dialer-proxy
  // 背景：住宅节点以前只来自「覆写 YAML / FlClash 凭据」，这两种都是我们自己写 proxies，
  // 字段齐全（type / dialer-proxy 都手写）。订阅自带的家宽节点不是我们写的 ——
  // 它要么没有 dialer-proxy（本机裸连海外住宅 IP），要么写了个指向订阅自己组的
  // dialer-proxy（那个组在本配置里存不存在，取决于订阅长什么样）。
  // 这里只动 dialer-proxy 一个字段，server/port/密码一律不碰。
  // 模式语义见 RESIDENTIAL.upstream.inject 的注释。
  // 悬空（指向不存在的组）留给下面的「悬空修复」统一处理 —— 那时才知道最终组名。
  if (
    residentialActive &&
    RESIDENTIAL.upstream &&
    RESIDENTIAL.upstream.enabled &&
    RESIDENTIAL.upstream.inject !== false &&
    Array.isArray(config.proxies)
  ) {
    const rawInject = RESIDENTIAL.upstream.inject;
    let injectMode =
      rawInject === 'strip' || rawInject === 'override' ? rawInject : 'fill';
    // 【自动降级：没有可用跳板就别挂 dialer-proxy】
    // 前置组是 url-test + include-all-proxies，一个亚洲节点都匹配不到时只剩 REJECT 兜底；
    // 此时把住宅节点的 dialer-proxy 指过去 = 每个请求都先撞 REJECT → 住宅全断。
    // 有的订阅里根本没有亚洲机场节点，这份「亚洲前置」选不出东西。
    // 自动改成 strip（本机直连住宅网关），比留一个指向空组的 dialer-proxy 安全得多。
    let noUpstreamNode = false;
    if (injectMode !== 'strip' && RESIDENTIAL.upstream.filter) {
      try {
        const reIn = new RegExp(RESIDENTIAL.upstream.filter);
        const reOut = new RegExp(
          [RESIDENTIAL.nodePattern, INFO_NODE_PATTERN].filter(Boolean).join('|'),
        );
        noUpstreamNode = !(config.proxies || []).some(
          (p) =>
            p &&
            typeof p.name === 'string' &&
            reIn.test(p.name) &&
            !(reOut && reOut.test(p.name)),
        );
      } catch {
        noUpstreamNode = false;
      }
      if (noUpstreamNode) {
        // 自备节点同步降级：挂在一个只剩 REJECT 的组上 = 每个请求先撞 REJECT
        let deInjected = 0;
        for (const node of INJECTED_RESI_NODES) {
          if (node['dialer-proxy']) {
            delete node['dialer-proxy'];
            deInjected++;
          }
        }
        console.log(
          `[住宅出口] 前置组「${RESIDENTIAL.upstream.group}」在本次订阅里没有任何可用节点` +
            '（filter 匹配 0 台）→ 订阅住宅节点与 residential.nodes 一起降级为直连住宅网关' +
            `（摘掉 ${deInjected} 台自备节点的 dialer-proxy），不把住宅节点挂到一个空组上`,
        );
        injectMode = 'strip';
      }
    }
    let resiRe = null;
    try {
      resiRe = new RegExp(RESIDENTIAL.nodePattern);
    } catch {
      resiRe = null;
    }
    let infoRe = null;
    try {
      infoRe = INFO_NODE_PATTERN ? new RegExp(INFO_NODE_PATTERN) : null;
    } catch {
      infoRe = null;
    }
    let injected = 0;
    let stripped = 0;
    let rewritten = 0;
    let skippedHttp = 0;
    const injectedNames = [];
    for (const p of config.proxies) {
      if (!p || typeof p.name !== 'string' || !resiRe || !resiRe.test(p.name)) continue;
      if (infoRe && infoRe.test(p.name)) continue;
      const hasDialer = !!p['dialer-proxy'];
      const type = String(p.type || '').toLowerCase();
      const isHttp = type === 'http';

      if (injectMode === 'strip') {
        if (hasDialer) {
          delete p['dialer-proxy'];
          stripped++;
        }
        continue;
      }
      if (injectMode === 'override') {
        if (isHttp && !RESIDENTIAL.upstream.allowHttp) {
          skippedHttp++;
          continue;
        }
        if (p['dialer-proxy'] !== RESIDENTIAL.upstream.group) {
          p['dialer-proxy'] = RESIDENTIAL.upstream.group;
          if (hasDialer) rewritten++;
          else injected++;
          injectedNames.push(p.name);
        }
        continue;
      }
      // fill：只补空的
      if (hasDialer) continue;
      if (!type) {
        // 缺 type 的节点内核本来就会拒载，别在这上面加字段
        skippedHttp++;
        continue;
      }
      if (isHttp && !RESIDENTIAL.upstream.allowHttp) {
        skippedHttp++;
        continue;
      }
      p['dialer-proxy'] = RESIDENTIAL.upstream.group;
      injected++;
      injectedNames.push(p.name);
    }
    const sample = `${injectedNames.slice(0, 3).join(' / ')}${injectedNames.length > 3 ? ' …' : ''}`;
    if (injected) {
      console.log(
        `[住宅出口] 已给 ${injected} 个订阅自带住宅节点补上 dialer-proxy: ${RESIDENTIAL.upstream.group}` +
          `（${sample}）；人在海外、直连网关可达时想省这一跳，就把 RESIDENTIAL.upstream.inject 设 'strip'`,
      );
    }
    if (rewritten) {
      console.log(
        `[住宅出口] 已把 ${rewritten} 个订阅自带住宅节点的 dialer-proxy 改指 ${RESIDENTIAL.upstream.group}` +
          `（${sample}）`,
      );
    }
    if (stripped) {
      console.log(
        `[住宅出口] 已移除 ${stripped} 个订阅自带住宅节点的 dialer-proxy → 本机直连住宅网关` +
          '（inject: \'strip\'；仅当本机到网关的直连路径干净可达时才安全 —— ' +
          '人在国内直连海外网关会被墙 RST，症状与住宅商拒连相同，见 troubleshooting 坑 32）',
      );
    }
    if (skippedHttp) {
      console.log(
        `[住宅出口] ${skippedHttp} 个住宅节点是 http 类型/缺 type，跳过 dialer-proxy 注入` +
          '（http + 跳板连不通，见 docs/troubleshooting.md 坑 5；' +
          'inject: \'override\' + allowHttp: true 可强制改写）',
      );
    }
  }

  // 【没有家宽：把住宅链的残留节点也清掉】
  // 组不建了，但订阅/覆写里可能还有「🏠 / IP-」节点，或 dialer-proxy 指向这两个组名的
  // 节点。留着它们内核会报 proxy not found 并拒载整份配置，所以脚本能看见的一律移除。
  // ⚠️ 排在 smart.js **之后**才注入的覆写节点脚本看不到，那种情况要用户自己删掉
  // residential.yaml 里的 +proxies / +rules，脚本无法代劳（下面日志会明说）。
  // 普通组本来就通过 exclude-filter 排除了住宅节点，移除它们不会造成任何悬空引用。
  if (!residentialActive && Array.isArray(config.proxies)) {
    const chainTargets = new Set([RESIDENTIAL.group, RESIDENTIAL.upstream.group]);
    // 不用 hasResidentialNode()：它在 nodePattern 写坏时会返回 true（宁可保留住宅链），
    // 用在这里反而会把所有节点清空。清理必须保守：正则写坏就只按 dialer-proxy 清。
    let nameRe = null;
    try {
      nameRe = new RegExp(RESIDENTIAL.nodePattern);
    } catch {
      nameRe = null;
    }
    const before = config.proxies.length;
    config.proxies = config.proxies.filter((p) => {
      if (!p || typeof p.name !== 'string') return true;
      const byName = nameRe ? nameRe.test(p.name) : false;
      return !byName && !chainTargets.has(p['dialer-proxy']);
    });
    const removed = before - config.proxies.length;
    if (removed) {
      console.log(`[住宅出口] 未启用：已移除 ${removed} 个住宅/前置链节点，避免 dialer-proxy 悬空。`);
    }
    // 手机 FlClash 没有覆写链，别打这句误导人的提示
    if (!FLCLASH_MODE) {
      console.log(
        '[住宅出口] 未启用：请确保覆写 YAML 里也没有 +proxies 注入住宅节点、' +
          `或 +rules 指向「${RESIDENTIAL.group}」——排在 smart.js 之后的覆写脚本管不到，` +
          '残留会让内核报 proxy not found 并拒载。',
      );
    }
  }

  // 【FlClash（手机）只改路由，不动系统级配置】
  // 手机上的内核跑在 FlClash 的 VPN 服务里，DNS / TUN / 监听端口都由 App 统一管理。
  // 如果这里再覆盖 dns（桌面版写死了 listen: 0.0.0.0:1053 + respect-rules + fallback），
  // 会和 App 自己的 DNS 体系打架：内核解析全废 → 所有节点测速失败、全部「失效」。
  // 实测反馈：手机上应用全量脚本后「节点全部失效」，就是这个原因。
  // 所以 FlClash 模式只保留「组 + 规则 + 节点注入」，ipv6/listeners 沿用订阅/App，
  // DNS 只换上游（明文 UDP 53 → IP 型 DoH），绝不写 listen（见下方覆盖 DNS 段落）。
  if (!FLCLASH_MODE) {
    // 1. 严格关闭全局 IPv6 处理
    config['ipv6'] = false;

    // 2. 强制指定域名解析策略为仅用 IPv4 (适用于 Mihomo / Clash Meta 内核)
    config['domain-strategy'] = 'UseIPv4';

    //  确保开启了 UDP，因为 NTP (时间同步) 强制走 UDP 协议
    config['udp'] = true;

    // 3. 窄 TUN：只把 Google 段塞进内核（见文件顶部 ⑤ NARROW_TUN）
    //    必须写进 config，靠 PATCH /configs 热改的话一重载就丢。
    if (NARROW_TUN.enabled) {
      const tun = Object.assign({}, config.tun);
      const addr = NARROW_TUN.routeAddress.slice();
      if (NARROW_TUN.includeAI) addr.push(...NARROW_TUN.aiRouteAddress);
      tun.enable = true;
      tun.stack = NARROW_TUN.stack;
      tun['auto-route'] = true;
      tun['auto-detect-interface'] = true;
      tun['route-address'] = addr;
      // includeAI 关闭时不劫持 DNS：系统 DNS 不进 TUN，留 any:53 也收不到。
      // includeAI 打开时系统 DNS 已进 TUN，必须劫持才能让它返回 fake-ip。
      tun['dns-hijack'] = NARROW_TUN.includeAI ? ['any:53'] : [];
      config.tun = tun;
      console.log(
        `[NARROW_TUN] 接管 ${NARROW_TUN.routeAddress.length} 个 Google 网段` +
          (NARROW_TUN.includeAI
            ? ` + ${NARROW_TUN.aiRouteAddress.length} 段 DNS/fake-ip（AI 长连接）`
            : '') +
          '，默认路由保持不变',
      );
    }
  }

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
  // ── 桌面端：全量覆盖（listen 1053 / respect-rules / arc 缓存 / IP 型 DoH）
  // ── 手机端：**只补最小必要项，绝不碰 `listen`**
  //   1) 为什么不能全量覆盖：桌面这套写死了 `listen: 0.0.0.0:1053`，会和 FlClash 自己的
  //      DNS/TUN 抢端口 → 内核解析全废 → 所有节点「失效」（实测过，见 docs/troubleshooting.md 坑 14）。
  //   2) 为什么不能完全不碰：订阅自带的 DNS 是明文 UDP 53
  //      （223.5.5.5 / 119.29.29.29 / 114.114.114.114）。在「阻断海外 UDP 53」的网络里
  //      （比如家里 Wi-Fi，桌面端就是这么挂的，见 docs/troubleshooting.md 坑 15），节点域名解析不了 → 节点全挂，
  //      国内域名也解析不了 → 直连也打不开。
  //   3) 所以这里只做一件事：**把上游换成 IP 型 DoH（走 443，不受 UDP 53 影响）**，
  //      其余（ipv6 / use-hosts / respect-rules）沿用订阅，端口完全不碰。
  if (!FLCLASH_MODE) {
    config.dns = dnsConfig;
  } else {
    const subDns = config.dns && typeof config.dns === 'object' ? config.dns : {};
    // 订阅里的 DoH 基本都是**域名型**（doh.pub / dns.alidns.com / dns.google…）。
    // 要用它们必须先解析域名，而解析域名只能靠明文 UDP 53 —— 在阻断 UDP 53 的
    // 网络里就是死循环（坑 15）。这里统一换成 IP 型 DoH：走 443，零引导。
    // 注意 `rcode://success` 这类非 http 值要原样保留（订阅用它直接回空包拦广告）。
    const DOH_IP = ['https://1.12.12.12/dns-query', 'https://120.53.53.53/dns-query'];
    const isHostDoh = (s) =>
      typeof s === 'string' &&
      /^https?:\/\//i.test(s) &&
      !/^https?:\/\/\d{1,3}(\.\d{1,3}){3}(?::|\/)/.test(s);
    const fixDoh = (v) => {
      if (isHostDoh(v)) return DOH_IP.slice();
      if (Array.isArray(v)) {
        const kept = v.filter((x) => !isHostDoh(x));
        return kept.length ? kept.concat(DOH_IP) : DOH_IP.slice();
      }
      return v;
    };
    const subPolicy = subDns['nameserver-policy'] || {};
    const policy = {};
    Object.keys(subPolicy).forEach((k) => {
      policy[k] = fixDoh(subPolicy[k]);
    });

    config.dns = {
      ...subDns, // 保留订阅的 ipv6 / use-hosts / respect-rules / cache-algorithm 等
      'enhanced-mode': 'fake-ip', // 海外域名给假 IP → 出口侧解析，DNS 归属与出口一致
      'fake-ip-range': '198.18.0.1/16',
      // 订阅的 fake-ip-filter 比我们全（NTP / captive portal / 游戏域名），合并而不是覆盖
      'fake-ip-filter': [
        ...new Set([...(subDns['fake-ip-filter'] || []), '*.lan', '*.local', '+.stun.*', 'geosite:cn']),
      ],
      // 只接受纯 IP，仅作兜底（IP 型 DoH 不需要它引导，正常情况下用不到）
      'default-nameserver': ['223.5.5.5', '119.29.29.29'],
      // 节点域名 + 普通域名 + 直连域名，全部走 IP 型 DoH，彻底摆脱 UDP 53
      'proxy-server-nameserver': DOH_IP,
      'direct-nameserver': DOH_IP,
      nameserver: DOH_IP,
      // 订阅常把 geosite:cn / rule-set:cn 指到域名型 DoH，上面 fixDoh 已经换掉了
      'nameserver-policy': policy,
      // 订阅里的 fallback 是明文 1.1.1.1 / 8.8.8.8，在本网络里只会拖慢解析
      fallback: [],
      'fallback-filter': { geoip: false, ipcidr: ['240.0.0.0/4', '0.0.0.0/8'] },
    };
    // 关键：绝不写 listen，交给 FlClash 自己绑定
    delete config.dns.listen;
  }

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
    // ⚠️ 新增：住宅落地节点永远不参与地区组 / AUTO 的自动筛选。
    // 原因有两个，任一踩中都是灾难：
    //   1) AUTO 的 filter 是 '.*'，US/JP 等地区组也会按名字命中（如「🏠 住宅-US」含 US），
    //      节点一旦被 AUTO 选为普通出口，住宅流量按 GB 计费会被瞬间烧光；
    //   2) 住宅节点自己带着 dialer-proxy: AUTO，若它又被塞进 AUTO，
    //      就形成 AUTO → 住宅 → AUTO 的调用环，内核会直接异常。
    // 把住宅节点的匹配规则并进 exclude-filter，一处改动覆盖所有带 filter 的组。
    // 同时并进占位/信息节点正则（到期、剩余流量、官网……），防止 url-test/fallback
    // 选中占位节点（换订阅实测：AI 组第一个存活成员变成了「🇦🇶 [到期…]」）。
    const excludePattern = [
      groupConfig['exclude-filter'],
      RESIDENTIAL.nodePattern,
      INFO_NODE_PATTERN,
    ]
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

    // 【2026-11-05】keepRefs 组（CATCH / ADS_FILTER）不做递归展开：
    // 它们的成员是「组引用 + 内置策略」，本意就是让用户在面板里切换上游语义
    // （CATCH 切 AUTO / DIRECT / REJECT，ADS_FILTER 切 REJECT / DIRECT）。
    // 一旦被摊平成节点列表，这个能力就被抹掉了 —— 这正是之前 ADS_FILTER
    // 变成「REJECT + 107 个节点」下拉框的原因。
    if (groupConfig.keepRefs) {
      const refs = (groupConfig.proxies || []).filter(
        (p) => allProxyNames.includes(p) || BUILTIN_PROXIES.includes(p) || smartGroups[p],
      );
      expandCache.set(groupName, refs);
      return refs;
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

    // 【2026-11-10】keepRefs 组（CATCH / ADS_FILTER / AUTO / AI）引用的是「组名」，
    // 但被引用的组可能因为零节点被上面的 activeGroups 剔除
    // （典型：订阅里没有韩国节点 → KR 被去掉，而 AUTO 的 proxies 里还写着 'KR'）。
    // 不摘掉的话内核直接报 `proxy group AUTO: proxy KR not found`，整份配置加载失败。
    // 这里统一按「真实存在 / 内置策略 / 组仍然存活」过滤一遍。
    if (groupConfig.keepRefs) {
      const kept = combinedProxies.filter(
        (p) =>
          p !== name && // 自引用（AUTO 兜底时曾经写成 ['AUTO','DIRECT']）
          (allProxyNames.includes(p) || BUILTIN_PROXIES.includes(p) || activeGroups.has(p)),
      );
      if (kept.length !== combinedProxies.length) {
        const dropped = combinedProxies.filter((p) => !kept.includes(p));
        console.log(`[节点清洗] 组 "${name}" 移除失效引用: ${dropped.join(', ')}`);
      }
      combinedProxies = kept;
    }

    // 极端防空组崩溃兜底
    if (combinedProxies.length === 0) {
      if (requiredGroupsFromRules.has(name) && smartGroups.AUTO && name !== 'AUTO') {
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
    // keepRefs 是本脚本内部标记，不是 mihomo 的合法字段，漏出去会导致配置校验失败
    delete clashGroup.keepRefs;

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
  //     所以覆写 YAML 排在前面或后面都能被正确收编。
  // 注意：不要把本组写进 smartGroups，否则会被上面的 filter 展开逻辑当成静态组处理，
  //       filter 被删掉后就收编不到任何节点了。
  //
  // 【成员 = [住宅节点(可选)] + REJECT + AI】
  //
  // 为什么需要「第一个成员」可配置（RESIDENTIAL.primary）：
  //   select 组的默认值 = 第一个成员。以前第一位固定是 REJECT（fail-closed 回落点），
  //   于是「新设备 / 重装 App / 客户端没有 store-selected」启动后默认就是 REJECT，
  //   AI 站点全部连不上。手机端实测复现：chatgpt.com 在 TLS 握手里被 10ms 掐断，
  //   ChatGPT App 把它翻译成「非预期的 SSL 证书 / 网络配置问题」。
  //   桌面端因为 profile.store-selected: true 记住了手动选择，所以一直没暴露。
  //
  //   也试过用内层 url-test 组做「自动择优」，但 url-test 的健康检查依赖
  //   「前置-亚洲」已经选好节点，冷启动时两者并发 → 住宅节点被判失败，
  //   要等 interval（300s）才重测，等于开机 5 分钟内 AI 全挂。所以不用自动组。
  //
  //   FlClash 构建时由钩子把 primary 填成实际注入的节点名（自己生成的节点，
  //   必然存在）→ 开箱即用、无需健康检查。桌面端留空 → 默认 REJECT，
  //   在面板里选一次（store-selected 记住）。
  //
  // 顺序语义：
  //   - primary 在第一位 → 新配置默认就走住宅；
  //   - REJECT 第二 → 手动选中某个住宅节点、该节点后来从订阅里消失时，内核回落到
  //     第一个成员（primary）；primary 也消失时回落 REJECT = 阻断，
  //     不会静默走机场（出口 IP 悄悄变化比断网更危险）；
  //   - pinOnly: true（默认）时成员是封闭的 `[primary, REJECT]`，其它住宅节点根本不进组：
  //     指定 IP 挂了 / 消失 = 直接 REJECT，不存在「内核自动换到另一台住宅 IP」这条路径。
  //     多台住宅 IP 的用法是「一台主力 + 若干备用」，换机 = 改 primary 后重载
  //     （桌面改这里，手机改凭据里的 primary，两边是同一个词）。
  //   - AI 只在 RESIDENTIAL.escapeToAI = true 时才进组，默认**不进**：
  //     这一类流量（Claude Code / 订阅制 AI）要的是「住宅或断网」，
  //     留着机场逃生口等于给「悄悄换出口」开了后门。
  //   - REJECT 必须始终在列：filter 一个都没匹配到时组会变空，内核塞 COMPATIBLE
  //     = 直连，真实 IP 直接泄漏（比走机场更糟）。
  //
  // 【只在真的建住宅链时生成】isResidentialOn() 为 false 时整组不建，规则里的落点
  // 已由 residentialPolicy() 换成 AI 组，所以不会出现「规则指向不存在的组」。
  // 曾经为了兜住外部覆写里手写的 `DOMAIN,...,住宅出口`，做过一版「组名常驻 +
  // 成员塞 AI 纯转发」：结果住宅组变成能切到机场的普通组、语义全乱，已回退。
  // 那种外部引用应该由覆写自己修（ai-strict.list 里已有对应域名，删掉手写行即可）。
  if (isResidentialOn()) {
    // 【2026-11-07 新增】把「手动选择要能记住」这件事从面板依赖里解出来。
    // 住宅出口是 select 组：默认落在第一位 = REJECT（fail-closed，宁可断网
    // 也不静默换出口），用户在面板里点一次某个住宅节点后，必须能持久化，
    // 否则内核一重启就回到 REJECT，表现为「昨天还能用，今天 AI 全断」。
    //   store-selected: 记住每个 select 组当前选中的节点（写 work/cache.db）
    //   store-fake-ip:  记住 fake-ip 映射，DNS 缓存命中时不必重新解析
    // 幂等合并：面板生成器已经写过就保留原值，不覆盖面板的其它 profile 字段。
    config.profile = Object.assign(
      { 'store-selected': true, 'store-fake-ip': true },
      config.profile || {},
    );

    // 【2026-11-16 新增】严格锁定：primary 有值且 pinOnly 时，组里只放这一台。
    // 为什么不能沿用 include-all-proxies：多台住宅 IP 时会全部进组，一旦锁定的那台
    // 从配置里消失（改名/换订阅/改覆写），内核按「第一个存活成员」回落 → 落到另一台
    // 住宅节点上，出口 IP 悄悄变了，日志里只有一句「已切换到 xxx」。
    // 锁定模式把成员写死成 [primary, REJECT]：指定那台没了/挂了就是 REJECT，没有第二台可接手。
    //
    // 【2026-11-17 改】锁不上时不再退回收编，而且绝不把不存在的名字写进 proxies：
    //   旧写法无论如何都把 primaryName 塞进 proxies 再补 include-all-proxies，
    //   名字写错时得到的是「组里引用一个不存在的节点」→ 内核 proxy not found → 整份配置拒载
    //   （坑 7 的翻版），而注释里写的是「退回全收编」——代码和注释不一致。
    //   现在：pinOk → [primary, REJECT]；锁不上 → 按 pinMiss 走，见下。
    const primarySetting = primaryNameSetting();
    const primaryName = resolvePrimaryName(config.proxies);
    // 配了（哪怕是配错成对象）就算「有锁定意图」：锁不上就走 pinMiss，绝不放行全部住宅节点
    const primaryTarget = primarySetting || (primaryMisconfigured() ? '(不支持的写法)' : '');
    const pinOk = RESIDENTIAL.pinOnly && !!primaryName && allProxyNames.indexOf(primaryName) >= 0;
    const pinMissCollect = RESIDENTIAL.pinMiss === 'collect';
    if (RESIDENTIAL.pinOnly && primaryTarget && !pinOk) {
      console.log(
        `[住宅出口] 锁定目标「${primaryTarget}」不在本次节点列表（共 ${allProxyNames.length} 个）→ ` +
          (pinMissCollect
            ? '退回「全部住宅节点可选」模式（pinMiss: collect，出口可能落到任意一台住宅 IP）'
            : '组成员只留 REJECT（pinMiss: reject，出口不确定就不出去；改名/换 IP 后请更新 primary）'),
      );
    }
    // 【2026-11-17 新增】没收紧锁定时的默认项：把「住宅所在国」的节点排到最前面。
    // 为什么需要：有的订阅是「一台本地 + 两百台海外」放在一个组里，
    // 不配 primary 时组员按订阅顺序排，第一位是哪个国家完全看运气 ——
    // 用户在日本却默认从美国住宅出去，Claude 那边看到的就是「换了国家登录」。
    // 只重排、不淘汰：prefer 没命中的节点仍由 include-all-proxies 收在后面，
    // 面板里照样能手动切；真出问题就把 prefer 清空 / 换国家。
    // prefer 只在 JS 侧用（内核 filter 不参与），所以可以直接写 JS 正则。
    let preferredNames = [];
    if (!pinOk && RESIDENTIAL.prefer) {
      try {
        const prefRe = new RegExp(RESIDENTIAL.prefer);
        const resiRe = new RegExp(RESIDENTIAL.nodePattern);
        const infoRe = INFO_NODE_PATTERN ? new RegExp(INFO_NODE_PATTERN) : null;
        preferredNames = (config.proxies || [])
          .filter(
            (p) =>
              p &&
              typeof p.name === 'string' &&
              resiRe.test(p.name) &&
              !(infoRe && infoRe.test(p.name)) &&
              prefRe.test(p.name),
          )
          .map((p) => p.name)
          .slice(0, 20); // 保险：订阅给几百台同国住宅时不至于把面板刷爆
        if (preferredNames.length) {
          console.log(
            `[住宅出口] 按 prefer「${RESIDENTIAL.prefer}」把 ${preferredNames.length} 个住宅节点排到组首` +
              `（默认选中「${preferredNames[0]}」）`,
          );
        }
      } catch {
        preferredNames = [];
      }
    }
    const resiGroup = {
      name: RESIDENTIAL.group,
      type: 'select',
      // 成员里永远没有 AI：住宅出口只允许「住宅 / 阻断」，escapeToAI 是唯一例外且默认关。
      // 锁不上、或 primary 留空时，第一位是 prefer 命中的住宅节点，其次才是 REJECT：
      // 需要手动选一次时（store-selected 会记住），阻断永远排在可选节点之后。
      proxies: [
        ...(pinOk ? [primaryName] : []),
        ...preferredNames,
        'REJECT',
        ...(RESIDENTIAL.escapeToAI ? ['AI'] : []),
      ],
    };
    if (!pinOk && !(RESIDENTIAL.pinOnly && primaryTarget && !pinMissCollect)) {
      // 收编模式只在两种情况下出现：
      //   1) 没配 primary（桌面端留空，先让用户手动选）；
      //   2) pinOnly: false（明确要「多台都能选」）；
      //   3) 锁不上但显式写了 pinMiss: 'collect'。
      // 内核级收编：覆写 YAML 排在 smart.js 之后也没关系，节点注入后照样进组。
      resiGroup['include-all-proxies'] = true;
      resiGroup.filter = RESIDENTIAL.nodePattern;
      resiGroup['exclude-filter'] = INFO_NODE_PATTERN;
      resiGroup['include-all'] = false; // 防止内核二次筛选，保持成员完全由 filter 决定
    }
    finalGroups.splice(1, 0, resiGroup);
  }

  // 【2026-11-06 改】上游出口组不再用 REJECT 兜底。
  // 原来的 `proxies: ['REJECT']` 有两个实测副作用：
  //   1) 冷启动时本组还没测完速，Now() 落在第一个成员 = REJECT，
  //      而住宅节点的 dialer-proxy 指向本组 → 那一小段时间住宅全部连不上，
  //      表现就是「莫名其妙连不上住宅，等一会儿又好了」；
  //   2) REJECT 没有真实延迟，某些内核版本会把它判成「最快」，被反复选中。
  // 成员完全交给 include-all-proxies + filter 全量收编（亚洲节点一个不少），
  // 一个都匹配不到时才放 REJECT 兜底 —— 绝不放 DIRECT：前置组出现 DIRECT 就意味着
  // 住宅流量可能不经机场直连住宅 IP，等于把跳板这层整个拆掉。
  // 【没有家宽时整组不建】上游跳板只服务于住宅链，住宅链关掉它就没有存在意义。
  // main() 里已经把脚本能看见的住宅/前置链节点清掉了，所以这里不会残留
  // dialer-proxy 悬空；排在后面的覆写若还注入住宅节点，属于用户配置矛盾，
  // 由 main() 的日志提醒自行删除 —— 绝不为了兜住引用又把「前置-亚洲」建回来，
  // 否则「无家宽 = 不需要住宅和前置组」这条约定就被破坏了。
  const buildUpstream =
    !!RESIDENTIAL.upstream && RESIDENTIAL.upstream.enabled && isResidentialOn();
  if (buildUpstream) {
    const upFilter = RESIDENTIAL.upstream.filter || smartGroups.JP.filter;
    const upExclude = [RESIDENTIAL.nodePattern, INFO_NODE_PATTERN].filter(Boolean).join('|');
    // 只用来判断「filter 到底能不能匹配到节点」，不写进 proxies（见下方说明）
    let hasUpstream = false;
    try {
      const reIn = new RegExp(upFilter);
      const reOut = upExclude ? new RegExp(upExclude) : null;
      hasUpstream = (config.proxies || []).some(
        (p) => p && typeof p.name === 'string' && reIn.test(p.name) && !(reOut && reOut.test(p.name)),
      );
    } catch {
      hasUpstream = false; // filter 写坏时不要连累整份配置
    }
    // 【2026-11-07 改】不再写显式 `proxies: [首个匹配到的节点]`。
    // 写成那样会得到一个「两个大阪、两个都被标成当前选中」的组：
    // 显式 members 一个「大阪」，include-all-proxies + filter 又收编一个「大阪」，
    // 内核按名单输出时不去重，面板按 `now === 成员名` 高亮 → 两个都打勾。
    // 现在成员完全交给 include-all-proxies + filter 全量收编；
    // 只有本地一个都匹配不到时才放 REJECT（否则 url-test 组为空，内核会塞
    // COMPATIBLE = 直连）。用 REJECT 而不是 DIRECT：宁可断网也不裸连住宅 IP。
    const upstreamGroup = {
      name: RESIDENTIAL.upstream.group,
      type: 'url-test',
      'include-all-proxies': true,
      // 复用地区组 JP 的 filter，两处永远同步；留空即跟随，也可单独定制
      filter: upFilter,
      // 两个必须排除的对象：
      //   1) 住宅节点本身：节点名里的「JP」（如 🏠 住宅-JP）同样命中 filter，
      //      不排除的话住宅节点会被收进自己的上游组，形成 dialer 环；
      //   2) 机场占位/信息节点（到期、剩余流量、官网……）：本组是内核级
      //      include-all-proxies 收编，JS 侧的清洗管不到这里，必须显式排除，
      //      否则 url-test 可能把「🇦🇶 [到期…]」之类占位节点当前置（实测踩坑）。
      'exclude-filter': upExclude,
      url: 'http://www.gstatic.com/generate_204',
      // interval 保持 300：本组是**所有**住宅链路的跳板，发现故障要快。
      // 但「测得勤」不等于「切得勤」——切不切由下面的 tolerance 决定，
      // 所以这里不改 interval，只放宽 tolerance。
      interval: 300,
      // 【2026-11-07 改】tolerance 50 → 200。
      // tolerance 是「防抖阈值」：新节点必须比当前节点快 200ms 以上才切。
      // 写 50 的后果是：亚洲节点互相之间延迟差经常在 50~150ms 波动，
      // 于是每 300s 就可能换一次跳板，而住宅节点的 dialer-proxy 指向本组，
      // **跳板一换，经住宅出口的常驻连接（ChatGPT/Claude 的 WebSocket）全部断开**，
      // 客户端表现为「聊到一半提示网络错误」。牺牲 200ms 延迟换连接稳定性是值得的。
      tolerance: 200,
      // 连续失败 3 次就提前触发健康检查，不必干等下一个 interval。
      // 只在真失败时生效，不影响上面的防抖逻辑（正常波动不会累计失败）。
      'max-failed-times': 3,
      // 关掉 groupBaseOption 里的 lazy：lazy=true 表示「第一次被用到才测速」，
      // 冷启动后第一次住宅请求会在本组还没选出节点时发出 → 失败。
      // 关掉后启动即测速，住宅链路（dialer-proxy 指向本组）才能真正可用。
      lazy: false,
    };
    if (!hasUpstream) {
      console.log(`[上游组] filter 没有匹配到任何节点，${RESIDENTIAL.upstream.group} 用 REJECT 兜底（不放 DIRECT）`);
      upstreamGroup.proxies = ['REJECT'];
    }
    // 插到「住宅出口」后面，UI 里三个组挨在一起；用名字定位，避免硬编码下标
    const exitIdx = finalGroups.findIndex((g) => g.name === RESIDENTIAL.group);
    finalGroups.splice(exitIdx >= 0 ? exitIdx + 1 : 2, 0, upstreamGroup);
  }

  // 覆盖规则配置
  // ===== FlClash：补齐「订阅自带规则」引用的规则集与策略 =====
  // FlClash 的覆写**不是替换 rules**：core/profile_base.go 的 mergeProfileBase →
  // appendRules 会把覆写结果的 rules 追加在订阅原有 rules 的**前面**，
  // 而 proxy-groups / rule-providers 用的却是覆写结果这一套。
  // 于是订阅里的 `RULE-SET,category-ads-all,REJECT`（规则集缺失）和
  // `RULE-SET,overseas-ai,节点选择`（组缺失）都会让内核启动失败
  // （实测复现，见 docs/troubleshooting.md 坑 18）。之前用的订阅都是纯节点（0 条 rules），
  // 所以从没触发；换成带规则的订阅就炸。
  //
  // 本脚本的 rules 末尾是 `MATCH, CATCH` 兜底，订阅规则永远不可达，
  // 所以缺的规则集/策略只要「名字存在」即可，内容无关紧要。
  const finalProviders = Object.assign({}, ruleProviders);
  if (FLCLASH_MODE) {
    const subRules = Array.isArray(config.rules) ? config.rules : [];
    const subProviders = config['rule-providers'] || {};
    const legacyNames = new Set();
    subRules.forEach((r) => {
      const parts = String(r).split(',');
      if (parts[0].trim().toUpperCase() === 'RULE-SET' && parts[1] && parts[1].trim()) {
        legacyNames.add(parts[1].trim());
      }
    });
    // dns.nameserver-policy 里也可能写 `rule-set:xxx`，引用的规则集同样必须存在
    Object.keys((config.dns && config.dns['nameserver-policy']) || {}).forEach((k) => {
      if (String(k).indexOf('rule-set:') === 0) {
        String(k)
          .slice('rule-set:'.length)
          .split(',')
          .forEach((n) => n.trim() && legacyNames.add(n.trim()));
      }
    });

    if (legacyNames.size > 0) {
      // 订阅确实带规则集引用时才继承它的 provider 定义；纯节点订阅不额外下载。
      // 同时这一步保证幂等：脚本被重复执行时，config 里已经是上次合并的结果。
      Object.keys(subProviders).forEach((n) => legacyNames.add(n));
      legacyNames.forEach((name) => {
        if (finalProviders[name]) return;
        if (subProviders[name]) {
          // 订阅自己定义过：原样沿用，保证内容能加载
          finalProviders[name] = subProviders[name];
          console.log(`[FlClash] 保留订阅规则集「${name}」（订阅 rules 会被追加，缺 provider 内核起不来）`);
        } else {
          // 订阅只引用、没定义：给个空规则集占位，永不命中
          finalProviders[name] = {
            type: 'http',
            behavior: 'classical',
            format: 'text',
            url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/empty.list`,
            path: `./ruleset/legacy/${name.replace(/[^A-Za-z0-9_-]/g, '_')}.list`,
            interval: 86400,
          };
          console.log(`[FlClash] 订阅引用了未定义的规则集「${name}」，用空规则集占位`);
        }
      });
    }

    if (subRules.length > 0) {
      // 订阅规则的「目标」也必须存在：`RULE-SET,overseas-ai,节点选择` 里的
      // 「节点选择」是订阅自己的组，已被本脚本的组列表替换掉 → proxy not found。
      // 有些订阅（如 138top）压根不用 RULE-SET，只靠 594 条 DOMAIN 规则指向自己的组，
      // 所以这段不能跟上面的 provider 分支绑在一起。
      // 这些规则永不命中，补一个指向 REJECT 的占位组即可（万一命中也不泄漏真实 IP）。
      const builtin = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL']);
      const known = new Set(builtin);
      (config.proxies || []).forEach((p) => p && p.name && known.add(p.name));
      finalGroups.forEach((g) => g && g.name && known.add(g.name));
      subRules.forEach((r) => {
        const parts = String(r).split(',').map((s) => s.trim());
        let target = '';
        for (let i = parts.length - 1; i >= 1; i--) {
          if (parts[i] && parts[i].toLowerCase() !== 'no-resolve') {
            target = parts[i];
            break;
          }
        }
        if (!target || known.has(target)) return;
        known.add(target);
        finalGroups.push({ name: target, type: 'select', proxies: ['REJECT'] });
        console.log(`[FlClash] 订阅规则引用了不存在的策略「${target}」，已补 REJECT 占位组（永不命中）`);
      });
    }
  }
  // ===== 保留订阅自带的策略组（防 dialer-proxy 悬空）=====
  // 在覆盖之前先把订阅原文里的组捞出来：这些组可能正被**节点**引用
  // （订阅自带住宅节点的常见写法：几百个节点写着 dialer-proxy: 前置-机场）。
  // 详见文件顶部 KEEP_SUB_GROUPS 的注释。
  if (KEEP_SUB_GROUPS) {
    const subGroups = Array.isArray(config['proxy-groups']) ? config['proxy-groups'] : [];
    if (subGroups.length) {
      const ownNames = new Set(finalGroups.map((g) => g && g.name).filter(Boolean));
      const targets = new Set(ownNames);
      ['DIRECT', 'REJECT', 'PASS', 'GLOBAL'].forEach((n) => targets.add(n));
      const nodeList = Array.isArray(config.proxies) ? config.proxies : [];
      for (const p of nodeList) {
        if (p && typeof p.name === 'string') targets.add(p.name);
      }
      let kept = 0;
      const keptNames = [];
      for (const g of subGroups) {
        if (!g || typeof g.name !== 'string' || !g.name) continue;
        // 重名会让内核直接拒载（duplicate group name）→ 本脚本的版本优先
        if (ownNames.has(g.name)) continue;
        const members = Array.isArray(g.proxies) ? g.proxies.filter((m) => targets.has(m)) : [];
        const dynamic = !!(g['include-all-proxies'] || g['include-all'] || g.use);
        if (!members.length && !dynamic) continue; // 空组又不动态收编 → 纯噪音
        const copy = Object.assign({}, g);
        // 动态组兜底：url-test 空组会被内核塞 COMPATIBLE（= 直连泄漏，坑 6）
        copy.proxies = members.length ? members : ['REJECT'];
        finalGroups.push(copy);
        kept++;
        keptNames.push(g.name);
      }
      if (kept) {
        console.log(
          `[节点清洗] 保留 ${kept} 个订阅自带策略组（${keptNames.slice(0, 4).join(' / ')}` +
            `${keptNames.length > 4 ? ' …' : ''}），避免节点的 dialer-proxy 悬空`,
        );
      }
    }
  }

  // ===== 修悬空 dialer-proxy =====
  // 到这一步才第一次知道「最终一定存在的名字」：activeGroups 会淘汰空组，
  // 所以 inject 阶段判断不了 upstream.group 到底建没建。
  // 悬空对内核是硬错误（报 not found，该节点直接不可用，面板上看不出来），这里统一兜住：
  //   有 upstream.group → 改指它；没有 → 删掉（退回本机直连，比整台节点不可用强）。
  {
    const names = new Set(finalGroups.map((g) => g && g.name).filter(Boolean));
    ['DIRECT', 'REJECT', 'PASS', 'GLOBAL'].forEach((n) => names.add(n));
    const nodeList = Array.isArray(config.proxies) ? config.proxies : [];
    for (const p of nodeList) {
      if (p && typeof p.name === 'string') names.add(p.name);
    }
    const upstreamGroup =
      RESIDENTIAL.upstream && RESIDENTIAL.upstream.enabled ? RESIDENTIAL.upstream.group : '';
    const hasUpstream = !!(upstreamGroup && names.has(upstreamGroup));
    let fixedToUpstream = 0;
    let removedDangling = 0;
    for (const p of nodeList) {
      if (!p || typeof p !== 'object') continue;
      const dp = p['dialer-proxy'];
      if (!dp || typeof dp !== 'string' || names.has(dp)) continue;
      if (hasUpstream) {
        p['dialer-proxy'] = upstreamGroup;
        fixedToUpstream++;
      } else {
        delete p['dialer-proxy'];
        removedDangling++;
      }
    }
    if (fixedToUpstream) {
      console.log(
        `[节点清洗] ${fixedToUpstream} 个节点的 dialer-proxy 指向不存在的组，` +
          `已改指 ${upstreamGroup}（否则内核报 not found、这些节点直接不可用）`,
      );
    }
    if (removedDangling) {
      console.log(
        `[节点清洗] ${removedDangling} 个节点的 dialer-proxy 指向不存在的组且无可用前置，` +
          '已移除该字段（改本机直连）',
      );
    }
  }

  config['proxy-groups'] = finalGroups;
  config['rule-providers'] = finalProviders;
  config.rules = rules;

  // ===== 应用级分流：本地专用端口（listeners）=====
  // 每个端口是一个独立入口，进来就绑死到指定组/节点，完全跳过 rules 匹配。
  // 配置在文件顶部 APP_PROXY.ports，默认只有 7865（住宅出口）。
  //
  // FlClash 模式跳过：Android 应用基本没有「自己填代理端口」这条路（都走 VpnService），
  // 而且多绑一个端口一旦被占用，内核会直接起不来，手机上排查成本极高。
  // 手机端要用「指定应用」，走 APP_PROXY.processes 写包名，或用 FlClash 自带的应用分流。
  if (!FLCLASH_MODE) {
    const listeners = Array.isArray(config.listeners) ? config.listeners : [];
    const wanted = [...APP_PROXY.ports];

    // 兼容旧开关：RESIDENTIAL.dedicatedPort 非 0、且 ports 里没有同名条目时补一条。
    // （老配置里 dedicatedPort: 7865 仍然有效，不会因为这次重构把 7865 弄丢）
    if (
      isResidentialOn() &&
      Number(RESIDENTIAL.dedicatedPort) &&
      !wanted.some((p) => p.name === 'residential-in')
    ) {
      wanted.unshift({
        name: 'residential-in',
        port: Number(RESIDENTIAL.dedicatedPort),
        proxy: RESIDENTIAL.group,
      });
    }

    for (const item of wanted) {
      const port = Number(item && item.port);
      if (!port) continue;
      // 没有家宽时，这个入口改绑 AI 组：删掉端口会让已经填了 127.0.0.1:7865 的
      // 应用变成 connection refused（比换个出口更难排查）；改绑 AI 至少保持可用。
      const target = item.proxy === RESIDENTIAL.group ? residentialPolicy() : item.proxy;
      // 名字或端口重复都会让内核起不来：先到先得，后面重复的静默丢弃
      if (listeners.some((l) => l && (l.name === item.name || Number(l.port) === port))) continue;
      listeners.push({
        name: item.name,
        type: 'mixed', // mixed = HTTP + SOCKS5，通吃只支持其中一种的客户端
        port,
        listen: '127.0.0.1', // 只监听本机，不暴露到局域网
        proxy: target,
      });
    }

    if (listeners.length) config.listeners = listeners;
  }

  // 返回修改后的配置
  return config;
}

// Node.js 环境支持
if (typeof module !== 'undefined' && module.exports) {
  module.exports = main;
  // 供 build-flclash.js 把默认值渲染到 flclash.js 顶部（只读快照，改了不影响运行）
  module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
}
