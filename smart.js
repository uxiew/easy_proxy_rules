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
 * 【想改配置？】不用翻文件：紧跟着的「第 0 部分：用户配置区」就是全部可调项，
 * 四个对象从上到下，每个都自带注释和模板，取消注释即生效：
 *   ① APP_PROXY        应用级分流：专用端口 / 进程名 / Android 包名   ← 最常改
 *   ② RESIDENTIAL      住宅出口：总开关、组名、跳板组、专用端口
 *   ③ TRAFFIC          省流量：国内直连、Apple 直连
 *   ④ AI_STATIC_TO_AI  AI 静态资源 / 安装包 → 机场 AI 组（不烧住宅流量）
 * 再往下才是 CDN 源、节点清洗、分组、规则生成 —— 日常不用看。
 */

// ============================================================
// 第 0 部分：用户配置区（日常只改这里，往下全是逻辑）
// ============================================================

// ------------------------------------------------------------
// ① APP_PROXY —— 应用级分流（最常用：指定某个 App 走哪个组/节点）
// ------------------------------------------------------------
// 目标：不依赖域名规则，直接把某个程序的流量按到指定出口。
// 两种手段，按「应用能不能自己填代理」来选：
//
//   方式一 ports（专用端口）—— 桌面端首选
//     mihomo 的 listeners 把某个端口整体绑到一个组/节点，进这个端口的流量
//     **完全跳过 rules 匹配**。应用里把代理填成 127.0.0.1:<端口> 就行。
//     优点：确定、可预测、零规则；缺点：应用得支持自定义代理（Telegram / Slack /
//     终端工具 / Proxifier 都支持）。
//     ⚠️ 仅桌面端生效。FlClash（Android）会跳过 listeners，两个原因：
//        1) 手机应用基本不提供「自定义代理」入口，都是走 VpnService；
//        2) Android 上多绑一个端口，一旦被占用内核会直接起不来，手机上排查成本极高。
//
//   方式二 processes（进程 / 包名）—— 桌面 + Android 通用
//     生成 PROCESS-NAME / PROCESS-PATH / UID 规则，插在 rules 最前面（先于任何域名规则）。
//     桌面端：进程名（Telegram、Discord）或可执行文件绝对路径（Electron 多进程用 path 更准）。
//             Electron 类 App（Claude / ChatGPT / Cursor / VS Code）真正的网络连接往往由
//             `Xxx Helper` 子进程发出，进程名精确匹配会漏 → 用 path-regex 匹配整个 .app。
//     Android：进程名就是**包名**，例如 org.telegram.messenger、com.android.chrome。
//     前提①：流量必须**先进内核**。桌面端只有两条路：应用把代理填成系统代理/专用端口，
//            或者开 TUN 虚拟网卡。不读系统代理的应用（Go/Rust 写的 language_server、agy，
//            以及用 Network.framework 的 App）不开 TUN 时连接直接走物理网卡，
//            规则一条都匹配不到，表现为「规则写对了但一直转圈」。
//     前提②：内核能拿到进程信息 —— 桌面端靠 find-process-mode（mihomo.yaml 已设 strict）
//            + TUN 的 socket 归属查询；Android 靠内核的 UID→包名映射。
//
// 【怎么改】只改下面这个对象，不用碰规则和分组逻辑：
//   1. 加端口：往 ports 里加一条（name 不能重复、port 不能重复，否则内核起不来）
//   2. 加应用：往 processes 里加一条，proxy 填**组名**（JP/HK/US/AI/AUTO/住宅出口…）
//      或节点名；填组名更稳，因为订阅更新后节点会改名。
//   3. 不想用某种方式：把对应数组清空（[]）即可。
const APP_PROXY = {
  // ---------- 方式一：专用端口（仅桌面端）----------
  // proxy 可以写组名，也可以写节点名；写节点名时注意换订阅会失效。
  ports: [
    // 默认启用：住宅专用入口。Claude Code / Proxifier 指向 127.0.0.1:7865 即整体走住宅。
    { name: 'residential-in', port: 7865, proxy: '住宅出口' },

    // 以下为模板，取消注释即生效（改完要重载配置）：
    // { name: 'ai-in', port: 7866, proxy: 'AI' }, // 固定走机场 AI 组（不烧住宅带宽）
    // { name: 'us-in', port: 7867, proxy: 'US' }, // 固定走美国组里最快的节点
    // { name: 'node-in', port: 7868, proxy: '[日本]₇' }, // 固定单个节点（换订阅易失效）
  ],

  // ---------- 方式二：进程 / 包名 / UID ----------
  // type 省略      = PROCESS-NAME        进程名精确匹配（macOS 上会被截断到 16 字符）
  // type: 'path'   = PROCESS-PATH        可执行文件绝对路径精确匹配
  // type: 'path-regex' = PROCESS-PATH-REGEX  路径正则（Go RE2），匹配整个 .app 目录最省事
  // type: 'name-regex' = PROCESS-NAME-REGEX  进程名正则（覆盖 Helper 子进程时用）
  // type: 'uid'    = UID                 Android 用
  // ⚠️ 写错的后果是「规则永不命中」，内核**不会报错**，所以务必先核对名字/包名。
  processes: [
    // ===== 已启用（改完需在 Clash Party / FlClash 里重载）=====
    // Android 包名：内核看到的进程名就是包名。桌面端同名应用请看下面用 PROCESS-NAME / PROCESS-PATH。
    // ⚠️ 这几条只**管得住 TCP**：WhatsApp / ChatGPT 的语音视频是 UDP，住宅节点 udp:false
    //    过不去，会落到 MATCH → CATCH → AUTO（见下方【常见坑】），属预期。
    { value: 'com.whatsapp', proxy: '住宅出口' },          // WhatsApp：信令走住宅（媒体仍走机场，见下）
    { value: 'com.talkatone.android', proxy: '住宅出口' }, // Talkatone：整体住宅；它自带 DNS，纯 IP 连接只能靠这条兜
    { value: 'com.openai.chatgpt', proxy: '住宅出口' },    // ChatGPT：AI 风控面，出口用住宅 IP
    { value: 'com.anthropic.claude', proxy: '住宅出口' },  // Claude：同上
    // { value: 'com.whatsapp.w4b', proxy: '住宅出口' },   // WhatsApp Business，需要时打开

    // ===== 已启用：桌面端 AI 客户端 → 住宅出口 =====
    // Claude 桌面端 / ChatGPT 桌面端都是 Electron：主进程叫 Claude / ChatGPT，
    // 但真正建连的常常是 `Xxx Helper`（network.mojom.NetworkService）子进程。
    // macOS 的进程名会被截断到 16 字符，精确匹配 Helper 不现实，所以用**路径正则**匹配
    // 整个 .app 包（主进程 + 所有 Helper 一次覆盖）。
    // ⚠️ App 装在别的目录（如 ~/Applications）时这里匹配不到，改成对应前缀。
    // ⚠️ 命中这条 = 该 App 的**全部** TCP 流量走住宅，包括图片/静态资源；
    //    UDP（语音/视频）会被导向 udp:false 的住宅节点 → 直接失败，属预期。
    //    要保持「语音走机场」就得对 UDP 单独放行，当前不这么做（见下方【常见坑】③）。
    { value: '^/Applications/Claude\\.app/', type: 'path-regex', proxy: '住宅出口' },  // Claude 桌面端
    { value: '^/Applications/ChatGPT\\.app/', type: 'path-regex', proxy: '住宅出口' }, // ChatGPT 桌面端

    // ----- Google Antigravity（AI IDE）+ 配套 CLI → 住宅出口 -----
    // 原来靠 Proxifier 规则「Antigravity / Antigravity Helper* / language_server* / agy / agentapi」
    // 走 Chain Clash-Static，现在等价迁到这里，Proxifier 可以退出。
    // Antigravity.app 也是 Electron：主进程 Antigravity + Antigravity Helper*，
    // 外加它自带的 language_server（在 Contents/Resources/bin/ 里，属于 App 包内），
    // 一条路径正则全部覆盖。
    // agy 是独立的 Homebrew 命令行工具（177MB 单文件），不在 App 包内，单独一条。
    { value: '^/Applications/Antigravity\\.app/', type: 'path-regex', proxy: '住宅出口' },
    { value: '/opt/homebrew/bin/agy', type: 'path', proxy: '住宅出口' },
    // 未安装 / 不在 PATH，先留模板；装上后取消注释即可：
    // { value: '^/Applications/Gemini\\.app/', type: 'path-regex', proxy: '住宅出口' },
    // { value: '^/Applications/Antigravity IDE\\.app/', type: 'path-regex', proxy: '住宅出口' },
    // { value: 'agentapi', proxy: '住宅出口' },

    // --- 桌面端：进程名 ---
    // { value: 'Telegram', proxy: 'US' },
    // { value: 'Discord', proxy: 'AUTO' },
    // --- 桌面端：Electron 多进程，用绝对路径更准 ---
    // { value: '/Applications/Cursor.app/Contents/MacOS/Cursor', type: 'path', proxy: 'AI' },
    // --- Android：包名（进程名就是包名）---
    // { value: 'org.telegram.messenger', proxy: 'US' },
    // { value: 'com.android.chrome', proxy: 'AUTO' },
    // { value: 'com.tencent.mm', proxy: 'DIRECT' }, // 微信直连，避免出口 IP 变化触发风控

    // --- 示例：WhatsApp（自带 DNS、媒体走 UDP 的典型，照这个抄就行）---
    // 桌面端进程名就叫 WhatsApp；Android 是包名，商务版为 com.whatsapp.w4b。
    // ⚠️ 指定到这里只**管得住 TCP**（信令 443/5222）：语音/视频是 UDP，
    //    住宅节点 udp:false 过不去，会落到 MATCH → CATCH → AUTO（见下方【常见坑】）。
    //    所以语音类 App 若把 proxy 填「住宅出口」，实际是「信令住宅 + 媒体机场」的混线。
    // { value: 'WhatsApp', proxy: '住宅出口' },        // macOS 桌面端
    // { value: 'com.whatsapp', proxy: '住宅出口' },    // Android（已在上面启用）
    // { value: 'com.whatsapp.w4b', proxy: '住宅出口' },// WhatsApp Business

    // --- Android：内核拿不到包名时，退回 UID ---
    // { value: '10234', type: 'uid', proxy: 'US' },
  ],
};

// ------------------------------------------------------------
// 【常见坑】App 自己解析域名 / 直接连 IP —— 为什么规则对它不生效
// ------------------------------------------------------------
// 现场（2026-11-05 Talkatone 实测，FlClash 连接详情）：
//   进程 com.talkatone.android(10410) / 规则 `Match` / 目标 `8.8.8.8:53`
//   代理链 CATCH → AUTO → 机场节点。App 其它流量都走住宅，唯独这条不走。
//
// 三个原因叠在一起，缺一个都不会出现这个现象：
//   1) App 内部硬编码了 DNS（Talkatone 查 8.8.8.8；不少游戏、银行、VoIP App 同款），
//      系统的 DNS 劫持接不住它，于是拿到的是**真实 IP**而不是 fake-ip；
//   2) 之后它连的是 IP，连接里没有域名 → 所有 DOMAIN-* 规则天然失配（面板显示 `Match`）；
//   3) 那条裸 DNS 是 UDP:53，而住宅节点 `udp: false`（socks5 住宅基本不支持 UDP），
//      注定只能落到 CATCH → AUTO，跟「有没有给它指定住宅」无关。
//
// 以后再遇到同类 App，按这个顺序处理（WhatsApp / Telegram / Discord 都一样）：
//   ① 出口只能靠 processes 指定 —— 域名规则救不了纯 IP 连接（示例见上面 WhatsApp 段）；
//   ② DNS 交给内核：FlClash 开「DNS 劫持 / Fake-IP」，裸 53 会被接管并返回 fake-ip，
//      连接重新带上域名，规则恢复可用，`8.8.8.8` 那条连接也会消失；
//      开不了劫持就退一步，加一条 `DST-PORT,53,<同国组>`（仍走机场，但解析地区与出口对齐）；
//   ③ 语音/视频媒体是 UDP，住宅永远接不住。二选一：接受「信令住宅 + 媒体机场」，
//      或让整个 App 走机场；**不要**为了统一去开住宅节点的 `udp: true`
//      （多数住宅商不支持 UDP，开了直接连不上，还得回滚）。
//
// 怎么确认已经生效 —— 看连接详情的「规则」一栏：
//   PROCESS-NAME / PROCESS-PATH / UID → processes 生效，按你指定的出口走
//   Match                             → 没命中任何规则，正在走 CATCH（多数是纯 IP 连接）

// ------------------------------------------------------------
// ② RESIDENTIAL —— 住宅出口（本机 → 机场亚洲节点 → 住宅 IP）
// ------------------------------------------------------------
// 为什么这么拆：住宅代理的账号密码属于敏感信息，不能进会公开的 smart.js。
// 所以这里只做「建组 + 写规则」，连接信息全部由覆写 YAML 提供。
//
// 链路：本地 → 机场节点(dialer-proxy) → 住宅 IP → 目标站点
//   机场负责「跑得快」，住宅 IP 负责「脸干净」，这也是住宅代理在国内最稳的用法
//   （从国内直连海外住宅 IP 通常又慢又不稳，别省掉跳板）。
//
// 覆写 YAML 里要写的东西（示例见仓库 residential.example.yaml）：
//   proxies:
//     - name: '🏠 住宅-US'          # 名字必须带 🏠 或 IP- 前缀（命中 nodePattern），
//                                   # 别用「住宅」二字做匹配词（机场自带住宅节点会混进来）
//       type: socks5                 # 必须是 socks5，不要用 http（见 README「七宗罪」）
//       server: x.x.x.x
//       port: 12345
//       username: 'xxx'
//       password: 'xxx'
//       dialer-proxy: 前置-亚洲       # 关键：用亚洲机场节点当跳板
//       udp: false                   # 住宅代理基本不支持 UDP
//   proxy-groups 不需要你写，本脚本会建「住宅出口」组并自动收编上面这个节点。
//
// 组内兜底：默认只有 `['住宅节点…', 'REJECT']` —— 节点失效时该组回落到阻断，
// **不会**静默走机场（出口 IP 悄悄变化比断网更危险）。
// 「根本没配住宅节点」是另一回事：那种情况由下面的 enabled: 'auto' 判定，
// 整条链不建、AI 规则改投 AI 组，而不是让 AI 全被 REJECT 卡死。
// 机场逃生口（AI）默认不进组，要应急得手动把 RESIDENTIAL.escapeToAI 改 true。
// 所以配好节点后，要在 Clash Party「代理」页把「住宅出口」切到 🏠 住宅-xxx 一次
// （store-selected 会记住）。
const RESIDENTIAL = {
  // 【三态开关】决定这次要不要建「住宅出口 / 前置-亚洲」这条链：
  //   'auto'（默认）—— 有住宅节点就建；一个都没有就整条不生成，AI 与账号类规则
  //                    改投 AI 组（机场出口）。给「没有家宽静态 IP」的人用：
  //                    不再是「AI 全被 REJECT」，而是退回机场，其余规则一字不改。
  //   true           —— 强制建。⚠️ 覆写 YAML 排在 smart.js **之后**时，脚本运行时
  //                    还看不到住宅节点，auto 会判成「没有」；这种排序必须显式 true。
  //                    把 residential.yaml 挪到 smart.js 之前也可以（proxies 两种顺序都保留）。
  //   false          —— 强制不建，等同没有家宽。
  enabled: 'auto',
  group: '住宅出口', // 组名，规则引用它；不要在覆写 YAML 里重复定义同名组，否则内核报重名
  // 组内第一个成员（= select 的默认值）。留空 → 默认 REJECT（需手动选一次）。
  // FlClash 构建时由钩子自动填成注入的节点名 → 手机开箱即用。
  nodeName: '',
  // 节点名匹配（Go RE2 正则），覆写里的节点名必须能命中这两个前缀之一：
  //   🏠       —— 手工命名，最稳（🏠 住宅-JP / 🏠 住宅-US）
  //   IP-      —— 服务商按 IP 出节点时的命名（IP-JP / IP-1.2.3.4）
  // 为什么用 `IP-` 而不是裸 `IP`：裸 IP 会命中 IPLC、IPV6、机场的「IPLC 专线」这类
  // 节点名；带横线能把这些全都排除掉。也不要写成 `IP` + 空格之类，名字里有空格就断。
  nodePattern: '🏠|IP-',
  // 【逃生口】住宅线路彻底挂掉时，是否允许在面板把「住宅出口」切到 AI（机场）应急。
  //   false（默认）= 组成员只有 住宅节点 + REJECT，**切不出机场** —— 要么住宅、要么断网。
  //   这正是 Claude Code 这类「宁可断开也不许换 IP」的场景需要的语义：
  //   出口 IP 悄悄从 61.***193 变成机场共享 IP，比直接报错危险得多。
  //   真要应急：改成 true → 重载 → 面板切到 AI → 用完改回 false。
  escapeToAI: false,
  // ⚠️ 命名约定：自己加的住宅节点必须带 🏠 前缀（如 🏠 住宅-JP / 🏠 住宅-US）
  //   或 IP- 前缀（如 IP-JP / IP-住宅-US）。两者命中同一个 nodePattern。
  //   不能用「住宅」两个字做匹配——很多机场自带「家宽住宅」「住宅IP」节点，
  //   会被误收进住宅出口（换订阅后实测踩坑：18 个机场住宅节点混了进来）。

  // 【方案 A｜当前采用】AI 服务商官方域名走住宅
  // ai-strict.list 里只放「有账号体系、会风控」的服务商（Claude / OpenAI / Grok / Perplexity …），
  // 连同它们的人机验证、登录托管、遥测域名一起走住宅——主站和验证必须同 IP，否则照样被拦。
  // 中转站、镜像站、API 代理不在这个文件里，继续走普通 AI 组（机场），不浪费住宅带宽。
  aiStrict: true,

  // 住宅专用入口端口 ——【已迁移】统一由文件顶部的 APP_PROXY.ports 管理，这里留 0。
  // 兼容：若这里填了非 0 值、且 APP_PROXY.ports 里没有 residential-in，脚本会自动补一条。
  // 想彻底关掉 7865：把 APP_PROXY.ports 里那条注释掉即可。
  dedicatedPort: 0,

  // 【上游出口】住宅节点 dialer-proxy 指向的组：任意亚洲节点自动择优，全灭则阻断。
  // 为什么只收「亚洲」而不是全机场 AUTO：
  //   - AUTO 是 url-test 全量收编，中转可能跳到美/欧——出口 IP 没变，
  //     但中转路径的 ASN 和延迟特征每次都在变，对风控不友好；
  //   - 早先只收日本，好处是最短路径，坏处是「所有日本节点一起挂」时整条 AI 链路断掉；
  //   - 现在收亚洲：HK/TW/KR/SG 到日本住宅都在几十毫秒量级，越南/马来/泰/菲稍远，
  //     但都还在同一个「亚洲近场」里，跳板池从 6 个变成 30+ 个。
  // 节点名必须含 filter 关键词；订阅改名后若一个都匹配不到，该组会退到 DIRECT
  // （这一跳不经机场，但住宅本身仍可连），把 filter 改成新关键词即可恢复。
  // 覆写 YAML 里的住宅节点写 dialer-proxy: 前置-亚洲 即可。
  upstream: {
    enabled: true,
    group: '前置-亚洲', // 组名，覆写 YAML 的 dialer-proxy 引用它；别重复定义同名组
    // 【2026-11-05 改】原来留空 = 复用 smartGroups.JP 的 filter（只收日本）。
    // 现在显式写亚洲关键词，和地区组的 filter 解耦（改地区组不会影响跳板池）。
    // 只放多字/带国名的关键词，绝不放单字：
    //   「日」会命中尼日利亚、「东」会命中东帝汶、「亚」会命中马来西亚/亚美尼亚，
    //   「MY」会命中 Myanmar —— 换订阅实测踩过这些坑（见 README 坑 14）。
    filter: [
      // 日本：原「前置-日本」的全部关键词，保持不动
      '日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉|川崎|横浜|名古屋',
      // 港台韩新：到日本住宅这一跳都在几十毫秒
      '港|HK|Hong|🇭🇰',
      '台|TW|Tai|🇹🇼',
      '韩|韓|首|爾|春川|🇰🇷|KR|Korea',
      '新加坡|SG|坡|狮城|🇸🇬|Singapore',
      // 东南亚：比日本远一点，作为「日本全挂」时的备选够用
      '越南|VN|Viet|🇻🇳',
      '马来|Malaysia|🇲🇾', // 不要写 MY：会误中 Myanmar（缅甸）
      '泰国|TH|Thai|🇹🇭',
      '菲律宾|PH|Philippin|🇵🇭',
    ].join('|'),
  },

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

// ------------------------------------------------------------
// ③ TRAFFIC —— 省流量开关（国内直连 / Apple 直连）
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// ④ AI_STATIC_TO_AI —— AI 静态资源/安装包走机场（不烧住宅流量）
// ------------------------------------------------------------
// 起因：ai-strict.list 是按「服务商后缀」整块收编的，`claude.ai` 这条后缀会顺带把
// `downloads.claude.ai`（桌面端安装包）一起拖进住宅出口。2026-11-04 实测一天住宅跑了
// 17.4 GB，其中纯下载/静态就占了一半：
//     persistent.oaistatic.com   4.3 GB（ChatGPT 前端资源）
//     downloads.claude.ai        2.8 GB（Claude 桌面端安装包）
//     downloads.cursor.com       1.4 GB（Cursor 安装包）
// 这些请求不带 Cookie、不带登录态、不参与 IP 画像 —— 风控看的是会话面，不是 CDN。
// 所以把它们挪到机场，住宅只留「真正会被判定地区/会话一致性」的域名。
//
// ⚠️ 三条边界，别越线：
//   1. 只挪「静态 + 安装包 + 图片 CDN」，主站（claude.ai / chatgpt.com）一个都不能动；
//   2. 不挪 *usercontent.com（附件下载的签名 URL 有极小概率绑 IP，挪了可能 404）；
//   3. 不挪 challenges.cloudflare.com / withpersona.com（人机验证与 KYC 必须和主站同 IP）。
// 这些规则由 getRules() 插在 RULE-SET,aiStrict 之前，先命中即生效，与规则集内容无关。
const AI_STATIC_TO_AI = [
  'DOMAIN-SUFFIX,oaistatic.com', // ChatGPT JS/CSS/字体/更新包
  'DOMAIN-SUFFIX,downloads.claude.ai', // Claude 桌面端安装包
  'DOMAIN-SUFFIX,downloads.cursor.com', // Cursor 安装包
  'DOMAIN-SUFFIX,openaicom.imgix.net', // OpenAI 图片 CDN
];

// ------------------------------------------------------------
// ⑤ NARROW_TUN —— 窄 TUN：只把 Google 网段塞进内核
// ------------------------------------------------------------
// 为什么需要它：Antigravity 的 language_server（Go + gRPC）不读系统代理，
//   也不吃 HTTPS_PROXY（grpc-go 不做 env proxy 解析），没有 TUN 时它直连
//   172.217.x / 142.251.x，状态永远是 SYN_SENT，界面「一直加载中」。
// 全量 TUN 能解决，但会把整机流量都塞进内核。这里只挂 Google 的段：
//   其余流量（包括默认路由）完全不进内核，对局域网 / Tailscale / 内网服务零影响。
//
// 判定成功的标志：
//   netstat -rn -f inet | grep utun1500     → 只列出下面这些段，没有 0.0.0.0/1
//   lsof -nP -a -p $(pgrep -f language_server) -iTCP | grep -v LISTEN
//                                           → 源地址是 198.18.0.1、状态 ESTABLISHED
//   Clash 连接页里该进程的链路 → 🏠 住宅出口
//
// ⚠️ 段要维护：它是「实测见过的 Google 段」的并集，不是官方完整列表。
//    某天 Antigravity 换了后端、连接卡在 SYN_SENT，就用 lsof 看它连到哪个段再补。
// ⚠️ 与「全量 TUN」互斥：如果你在 Clash Party 里手动开了全量 TUN，
//    这里设 true 只是把路由范围缩小，不会叠加出两套。
const NARROW_TUN = {
  // 只接管下面这些网段。false = 完全不动 tun 配置（保持 Clash Party 面板的开关说了算）。
  enabled: true,

  // ---- AI 客户端长连接（2026-11-07 新增，可单独关）----
  // ChatGPT 桌面端的 Remote Control / Codex enrollment 由后台进程建常驻 WebSocket，
  // 它不读 macOS 系统代理，自己用系统 DNS 解析 → 拿到被污染的假 IP → 直连超时，
  // 桌面端报 "Pairing code unavailable: Remote control failed to connect"。
  // 打开后额外接管「系统 DNS + fake-ip 段」：
  //   DNS 进内核被 dns-hijack 劫持 → Clash 返回 fake-ip(198.18.x.x)
  //   → 应用连 fake-ip 进内核 → 命中现有 PROCESS-PATH-REGEX / RULE-SET,aiStrict
  //   → 住宅出口。默认路由仍是 192.168.31.1，局域网 / Tailscale / 纯 IP 直连不受影响。
  // 关掉（includeAI: false）= 恢复「只接管 Google 段」的旧行为。
  //
  // ⚠️ 边界（契约）：这里只是把「域名解析后的连接」收进内核，**不是全量 TUN**。
  //    默认路由、局域网、纯 IP 直连都不动；出站仍按规则分流。
  //    不要因为这个开关去把 routeAddress 改成 0.0.0.0/0。
  includeAI: true,
  aiRouteAddress: [
    '223.5.5.5/32', // 系统 DNS（本机 scutil --dns 实测只有这一台）
    // default-nameserver 里的备用项，同时兜住「换网络后路由器 DHCP 下发的 ISP DNS」
    '119.29.29.29/32',
    '198.18.0.0/16', // fake-ip-range，域名流量进内核的入口
  ],

  // 想恢复整机 TUN：把 routeAddress 整个删掉（或改成 ['0.0.0.0/0'] 由面板控制）。
  routeAddress: [
    '142.250.0.0/15', // Google 主力段（142.250–142.251），language_server 最常连这里
    '172.217.0.0/16', // Google 前端 / gstatic
    '172.253.0.0/16', // googleapis 的 VIP 段（实测 172.253.120.x 会漏，必须单列）
    '216.58.0.0/16', // www.google.com
    '74.125.0.0/16', // Gmail / googleapis
    '108.177.0.0/17', // Google 账号体系
    '64.233.160.0/19', // Google 后端
    '72.14.192.0/18', // Google 后端
    '173.194.0.0/16', // Google 后端
    '209.85.128.0/17', // Google 后端
    '2001:4860::/32', // Google IPv6
    '2404:6800::/32', // Google IPv6（亚洲）
    '2607:f8b0::/32', // Google IPv6
  ],
  // macOS 上 Mixed 实测可用；启动异常时依次试 System → gVisor
  stack: 'Mixed',
};

// ============================================================
// ⑥ 地区优先（REGION_PRIORITY）—— AUTO / AI 按国家顺序选出口
// ============================================================
// 需求：优先日本 → 新加坡 → 韩国；这三个地区全都没有（或全挂）时，才用其他国家。
//
// 实现方式：把目标组从「全量 url-test」换成「fallback 套地区组」：
//   AUTO(地区) = fallback[ JP(地区) , SG(地区) , KR(地区) , OT(其它) ]
//   JP/SG/KR/OT 自己仍是 url-test → 国家内部挑最快的那台
//   fallback 按书写顺序取第一个「活的」成员 → 国家之间按顺序优先
// 两者嵌套正好是「先按国家顺序，国家内部挑最快」。
//
// 和旧行为（全量 url-test）的差别，用实测数据说：
//   旧：日本 42ms、新加坡 28ms → 永远挂在新加坡，出口国家在 JP/SG 之间漂移，
//       AI 站点会因此反复触发「异常活动」验证（这也是 AI 组 tolerance 调到 200 的原因）。
//   新：只要日本还有一台活的就待在日本；日本全挂 → 新加坡 → 韩国 → 其它。
//
// ⚠️ fallback 只判断「活/死」，不看延迟。日本节点比新加坡慢 20ms 也仍然选日本 ——
//    这是刻意的取舍：地域稳定 > 绝对速度。想要回「谁快用谁」，把 enabled 设 false。
// ⚠️ 地区组之间的健康检查只有一份开销：AUTO 和 AI 引用的是同一批 JP/SG/KR/OT，
//    不会因为两个目标组各测一遍而翻倍。
const REGION_PRIORITY = {
  enabled: true,

  // 目标组 → 地区顺序（越靠前越优先）。地区名必须是 smartGroups 里的 key（JP/SG/KR/TW/HK/US/DE...）。
  // 只写你信任的地区；没写进来的国家会落到下面的 othersGroup。
  targets: {
    AUTO: ['JP', 'SG', 'KR'],
    AI: ['JP', 'SG', 'KR'],
  },

  // 上述地区全不可用时落到哪个组。
  // '' = 不留逃生口，严格只在列出的国家里选（全挂就等于组空 → 回落到 DIRECT/AUTO 兜底）。
  othersGroup: 'OT',

  // fallback 组自己的检查节奏（它只关心成员活没活，所以比地区组快一点）
  interval: 120,
};

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

function hasResidentialNode(proxies) {
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

function resolveResidentialEnabled(config) {
  const setting = RESIDENTIAL.enabled;
  if (setting === true) return true;
  if (setting === false) return false;
  // 'auto'：只认「运行时真的看得到一个住宅节点」这一种证据
  if (RESIDENTIAL.nodeName) return true; // FlClash 构建时已注入
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
    proxies: ['JP', 'SG', 'US', 'DE', 'KR'],
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

  // 1) 其它地区组：全量收编，但把已单列的地区排掉。
  //    排掉是为了「一个节点只属于一个地区组」——
  //    否则日本节点同时出现在 JP 和 OT 里，同一台被两套健康检查各测一遍，白烧探测。
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

// FlClash（手机）模式：由下方钩子置 true。
// 手机端只接管「组 + 规则 + 节点」，DNS / IPv6 / listeners 全部交给 App，
// 否则会和 FlClash 自己的 DNS/TUN 打架，表现为「所有节点全部失效」。
let FLCLASH_MODE = false;

// 程序入口
function main(config) {
  // 验证配置
  if (!config) {
    throw new Error('配置对象为空');
  }

  // ===== FlClash 新版安全网（v0.9.1+）=====
  // v0.9.1 起 core/profile_base.go 的 mergeProfileBase 会做两件事：
  //   1) 用订阅原文覆盖 proxies / proxy-groups / sub-rules
  //      → 覆写脚本注入的节点和重建的分组**全部被丢弃**；
  //   2) 把覆写结果的 rules 追加在订阅 rules 前面（appendRules）。
  // 如果在这种版本上继续重建规则，规则会指向不存在的组，内核只能报错或全断网。
  // 特征：core 传给 host 的是「骨架配置」——proxies 与 rules 都是空的。
  const __isFlClash = typeof FLCLASH_RESIDENTIAL !== 'undefined' && FLCLASH_RESIDENTIAL;
  const __skeleton =
    __isFlClash &&
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

  // ===== FlClash 钩子（桌面端不会走到这里）=====
  // FlClash 没有覆写链，只能跑单个脚本：把 smart.js 全文拼在凭据头后面
  // （构建脚本 build-flclash.js 自动生成），凭据头定义全局变量 FLCLASH_RESIDENTIAL。
  // 桌面端（Clash Party）不定义它 → typeof 守卫跳过，节点仍由 YAML 覆写注入。
  if (typeof FLCLASH_RESIDENTIAL !== 'undefined' && FLCLASH_RESIDENTIAL) {
    FLCLASH_MODE = true;
    const c = FLCLASH_RESIDENTIAL; // { name, server, port, username, password }
    // 显式关掉住宅出口（enabled: false）时不要注入节点：
    // 它的 dialer-proxy 指向「前置-亚洲」，而那一组此时不会建 → proxy not found，
    // 整份配置加载失败（比「AI 走机场」严重得多）。
    if (c && c.server && c.port && RESIDENTIAL.enabled === false) {
      console.log('[FlClash] RESIDENTIAL.enabled = false：跳过住宅节点注入，AI 流量走 AI 组');
    } else if (c && c.server && c.port) {
      config.proxies = (config.proxies || []).filter((p) => p && p.name !== c.name);
      config.proxies.push({
        name: c.name, // 必须带 🏠 或 IP- 前缀（命中 nodePattern）
        type: 'socks5', // http + dialer-proxy 连不通（见 README 坑 5）
        server: c.server,
        port: Number(c.port),
        username: c.username,
        password: c.password,
        udp: false,
        'skip-cert-verify': false,
        'dialer-proxy': RESIDENTIAL.upstream.group,
      });
      console.log(`[FlClash] 已注入住宅节点 ${c.name}（dialer-proxy: ${RESIDENTIAL.upstream.group}）`);
      // 关键：把「住宅出口」的默认选中项设成这个节点。
      // 否则 select 组默认落在第一位（REJECT），手机上又没有 store-selected，
      // 每次启动 AI 站点全被阻断（ChatGPT App 报「非预期的 SSL 证书」）。
      RESIDENTIAL.nodeName = c.name;
    }
  }

  // ===== 判定：这次到底有没有家宽 =====
  // 必须在 FlClash 注入之后、getRules()/建组之前定下来（两处都读同一个结果）。
  // 没有家宽时：不建「住宅出口 / 前置-亚洲」，AI 与账号类规则改投 AI 组（机场出口），
  // 其余规则、顺序、分流全部不变。
  residentialActive = resolveResidentialEnabled(config);
  if (residentialActive) {
    console.log(`[住宅出口] 已启用：住宅节点命中 ${RESIDENTIAL.nodePattern}，AI 与账号类流量走住宅`);
  } else if (RESIDENTIAL.enabled === false) {
    console.log(
      `[住宅出口] RESIDENTIAL.enabled = false：不生成「${RESIDENTIAL.group}」与「${RESIDENTIAL.upstream.group}」，` +
        'AI 与账号类规则改投 AI 组（机场出口）。' +
        `⚠️ 这种模式下组名不存在：若覆写 YAML / 订阅里还有规则或 dialer-proxy 指向这两个名字，` +
        '内核会报 proxy not found 并拒绝加载整份配置。要么删掉那些引用，要么别用 false（用 auto）。',
    );
  } else {
    console.log(
      `[住宅出口] 未检测到住宅节点（${RESIDENTIAL.nodePattern}）：本次「${RESIDENTIAL.group}」组 = 纯转发到 AI（机场出口），` +
        '规则里的住宅落点也改投 AI；组名仍然存在，外部规则不会报 not found。' +
        `「${RESIDENTIAL.upstream.group}」留一个惰性占位组兜住 dialer-proxy 引用。` +
        '要真用住宅出口：把 residential.yaml 排在 smart.js 之前，或把 RESIDENTIAL.enabled 显式设为 true。',
    );
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
  //      DNS/TUN 抢端口 → 内核解析全废 → 所有节点「失效」（实测过，见 README 坑 14）。
  //   2) 为什么不能完全不碰：订阅自带的 DNS 是明文 UDP 53
  //      （223.5.5.5 / 119.29.29.29 / 114.114.114.114）。在「阻断海外 UDP 53」的网络里
  //      （比如家里 Wi-Fi，桌面端就是这么挂的，见坑 15），节点域名解析不了 → 节点全挂，
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
  // 为什么需要「第一个成员」可配置（RESIDENTIAL.nodeName）：
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
  //   FlClash 构建时由钩子把 nodeName 填成实际注入的节点名（自己生成的节点，
  //   必然存在）→ 开箱即用、无需健康检查。桌面端留空 → 默认 REJECT，
  //   在面板里选一次（store-selected 记住）。
  //
  // 顺序语义：
  //   - nodeName 在第一位 → 新配置默认就走住宅；
  //   - REJECT 第二 → 手动选中某个住宅节点、该节点后来从订阅里消失时，内核回落到
  //     第一个成员（nodeName）；nodeName 也消失时回落 REJECT = 阻断，
  //     不会静默走机场（出口 IP 悄悄变化比断网更危险）；
  //   - AI 只在 RESIDENTIAL.escapeToAI = true 时才进组，默认**不进**：
  //     这一类流量（Claude Code / 订阅制 AI）要的是「住宅或断网」，
  //     留着机场逃生口等于给「悄悄换出口」开了后门。
  //   - REJECT 必须始终在列：filter 一个都没匹配到时组会变空，内核塞 COMPATIBLE
  //     = 直连，真实 IP 直接泄漏（比走机场更糟）。
  //
  // 【2026-11-13 改】「住宅出口」现在**始终生成**（只有显式 enabled: false 才不建）。
  //
  // 上一版是「没有家宽就整组不建」，前提是「所有指向它的引用都由本脚本生成、都能改投 AI」。
  // 这个前提不成立：排在 smart.js **之后**的覆写 YAML、以及订阅自带的 rules，都可能手写
  //   DOMAIN, challenges.cloudflare.com, 住宅出口
  // 脚本改不到它们，组一消失就是
  //   rules[0] [DOMAIN, challenges.cloudflare.com, 住宅出口] error: proxy [住宅出口] not found
  // 整份配置加载失败（比「AI 走机场」严重得多）。所以组名必须永远存在，用成员来表达语义：
  //   有家宽 → [住宅节点, REJECT]（+AI 仅 escapeToAI）= fail-closed，切不出机场
  //   无家宽 → ['AI']                            = 纯转发，正是「退回默认 AI 组」
  // 保留 include-all-proxies + filter：万一覆写在后面注入了住宅节点，它会被收编进来，
  // 用户在面板里仍能手动切过去（默认第一项是 AI，行为稳定）。
  if (RESIDENTIAL.enabled !== false) {
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

    finalGroups.splice(1, 0, {
      name: RESIDENTIAL.group,
      type: 'select',
      // 无家宽时第一位必须是 AI：任何指向本组的外部规则都会落到机场出口，
      // 而不是像以前那样落到 REJECT 把 AI 全掐死。
      proxies: isResidentialOn()
        ? [RESIDENTIAL.nodeName, 'REJECT', ...(RESIDENTIAL.escapeToAI ? ['AI'] : [])].filter(Boolean)
        : ['AI', 'REJECT'],
      'include-all-proxies': true,
      filter: RESIDENTIAL.nodePattern,
      'exclude-filter': INFO_NODE_PATTERN,
      'include-all': false, // 防止内核二次筛选，保持成员完全由 filter 决定
    });
  }

  // 【2026-11-06 改】上游出口组不再用 REJECT 兜底。
  // 原来的 `proxies: ['REJECT']` 有两个实测副作用：
  //   1) 冷启动时本组还没测完速，Now() 落在第一个成员 = REJECT，
  //      而住宅节点的 dialer-proxy 指向本组 → 那一小段时间住宅全部连不上，
  //      表现就是「莫名其妙连不上住宅，等一会儿又好了」；
  //   2) REJECT 没有真实延迟，某些内核版本会把它判成「最快」，被反复选中。
  // 现在显式成员改成「第一个真正匹配 filter 的节点」（构建时算出来）：
  // 组里永远有一个真节点可用，不需要 REJECT；一个都匹配不到时才退 DIRECT
  // （这一跳不经机场，但住宅本身仍然可用，比阻断好）。
  // 兜底：即使住宅链整体关掉，只要还有节点的 dialer-proxy 指向「前置-亚洲」，
  // 这一组就必须存在 —— 否则内核报 proxy not found，整份配置加载失败
  // （住宅节点可能来自覆写 YAML，脚本关不掉，但能保证引用有效）。
  const upstreamReferenced = (config.proxies || []).some(
    (p) => p && p['dialer-proxy'] === RESIDENTIAL.upstream.group,
  );
  // 【2026-11-13 修】auto 判定「没有家宽」时，也必须建「前置-亚洲」。
  // 桌面端的住宅节点来自**排在 smart.js 之后**的覆写 YAML，脚本运行时根本看不见；
  // 一旦因为看不到节点就不建组，覆写随后注入的 `dialer-proxy: 前置-亚洲` 立刻悬空，
  // 内核直接报 `proxy [🏠 住宅-JP] dialer-proxy [前置-亚洲] not found`，
  // 整份配置加载失败（比「AI 走机场」严重得多，用户看到的是全部节点失效）。
  // 所以只有显式 `enabled: false` 才真正两组都不建 —— 那种情况请同时删掉覆写里的住宅节点
  // （FlClash 侧脚本会自己跳过注入，不需要你动手）。
  const buildUpstream =
    !!RESIDENTIAL.upstream &&
    RESIDENTIAL.upstream.enabled &&
    (isResidentialOn() || upstreamReferenced || RESIDENTIAL.enabled !== false);
  if (buildUpstream) {
    if (!isResidentialOn()) {
      console.log(
        `[住宅出口] 未启用：只保留「${RESIDENTIAL.upstream.group}」这一个惰性占位组，` +
          `避免排在后面的覆写注入住宅节点后报 proxy not found；「${RESIDENTIAL.group}」不生成。`,
      );
    }
    const upFilter = RESIDENTIAL.upstream.filter || smartGroups.JP.filter;
    const upExclude = [RESIDENTIAL.nodePattern, INFO_NODE_PATTERN].filter(Boolean).join('|');
    // 用同一套 filter 在本地算一个真实节点，保证 proxies 非空且能直连
    let firstUpstream = '';
    try {
      const reIn = new RegExp(upFilter);
      const reOut = upExclude ? new RegExp(upExclude) : null;
      firstUpstream =
        (config.proxies || []).map((p) => p.name).find((n) => reIn.test(n) && !(reOut && reOut.test(n))) || '';
    } catch {
      firstUpstream = ''; // filter 写坏时不要连累整份配置
    }
    if (!firstUpstream) {
      console.log(`[上游组] filter 没有匹配到任何节点，${RESIDENTIAL.upstream.group} 退到 DIRECT`);
    }
    // 【2026-11-07 改】不再写显式 `proxies: [firstUpstream]`。
    // 写成那样会得到一个「两个大阪、两个都被标成当前选中」的组：
    // 显式 members 一个「大阪」，include-all-proxies + filter 又收编一个「大阪」，
    // 内核按名单输出时不去重，面板按 `now === 成员名` 高亮 → 两个都打勾。
    // 现在成员完全交给 include-all-proxies + filter；只有本地一个都匹配不到时
    // 才用 DIRECT 兜底（否则 url-test 组为空，内核会塞 COMPATIBLE = 直连，
    // 这一跳变成不经机场，住宅链路可能直接连不上）。
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
    if (!firstUpstream) upstreamGroup.proxies = ['DIRECT'];
    // 【2026-11-13 修】没有家宽时把它降级成「惰性 select」。
    // 它在这次配置里的唯一职责是**兜住悬空引用**（覆写里的 dialer-proxy），
    // 而不是真的当跳板：不做 include-all-proxies 全量收编、不 attach 测速，
    // 否则连着 30 个亚洲节点每 5 分钟白测一轮，纯浪费。
    // 成员留「首个匹配到的亚洲节点 + DIRECT」两个：万一覆写确实注入了住宅节点，
    // 用户在面板里手动把它切过去还能用，不是个死组。
    if (!isResidentialOn()) {
      for (const key of ['include-all-proxies', 'filter', 'exclude-filter', 'url', 'interval',
        'tolerance', 'max-failed-times']) {
        delete upstreamGroup[key];
      }
      upstreamGroup.type = 'select';
      upstreamGroup.lazy = true;
      upstreamGroup.proxies = Array.from(new Set([firstUpstream, 'DIRECT'].filter(Boolean)));
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
  // （实测复现，见 README 坑 18）。之前用的订阅都是纯节点（0 条 rules），
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
}
