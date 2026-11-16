# 配置项详解

`smart.js` 第 0 部分「用户配置区」的逐项说明，含住宅出口三态、住宅锁定与多台 IP、DNS、WebRTC
与未实现的多出口预案。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 七个配置对象与默认值

`smart.js` 开头就是 `// 第 0 部分：用户配置区`，按使用频率排了七个对象，**所有可调项都在这里**（之后的 CDN 源、节点清洗、分组、规则生成属于内部逻辑，日常不用动）：

| 顺序 | 对象                | 管什么                                |
| -- | ----------------- | ---------------------------------- |
| ①  | `APP_PROXY`       | 应用级分流：专用端口 / 进程名 / 路径正则 / Android 包名（最常改） |
| ②  | `RESIDENTIAL`     | 住宅出口：总开关、组名、跳板组、专用端口               |
| ③  | `TRAFFIC`         | 省流量：国内直连、Apple 直连                  |
| ④  | `AI_STATIC_TO_AI` | AI 静态资源 / 安装包 → 机场 AI 组            |
| ⑤  | `NARROW_TUN`      | 窄 TUN：只把 Google 段塞进内核（救 `language_server`） |
| ⑥  | `REGION_PRIORITY` | `AUTO`/`AI` 的国家优先顺序（全部地区组：JP → SG → KR → 港台 → 美英德法加 → 欧洲 → OT 兜底） |
| ⑦  | `WEBRTC_GUARD`    | 可选：拦截常见 STUN 探测（默认关，会打断语音通话，见下） |

| 配置                             | 默认              | 作用                                                                                                   |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `RESIDENTIAL.enabled`          | `true`          | 住宅出口三态开关：`true` = 有家宽（默认）；`false` = **没有家宽**（两组不生成、住宅节点移除、规则改投 `AI`）；`'auto'` = **仍有效但不推荐**，只判「运行时看不看得到住宅节点」而非「有没有家宽」，看不到即按无家宽处理（有覆写顺序陷阱，且占位符版会被强制覆盖）。见下文「没有家宽怎么办」 |
| `RESIDENTIAL.aiStrict`         | `true`          | AI 服务商走住宅（推荐）                                                                                        |
| `RESIDENTIAL.allAI`            | `false`         | 整个 `forAI` 走住宅——**别开**，`ai.yaml` 里有 `DOMAIN-REGEX,google.*`，会连 `googlevideo.com`（YouTube 视频流）一起烧住宅流量 |
| `APP_PROXY.ports`              | `[7865 → 住宅出口]` | 专用端口列表：端口整体绑到指定组/节点，跳过规则。见 [应用级分流](traffic-entry.md)                                                                    |
| `APP_PROXY.processes`          | `[]`（全注释）       | 进程/包名规则，插在 `rules` 最前。桌面写进程名，Android 写包名                                                             |
| `RESIDENTIAL.escapeToAI`       | `false`         | 是否把 `AI` 放进「住宅出口」当手动逃生口。默认 `false` = 住宅挂了只能阻断，不会静默换机场 IP                                             |
| `RESIDENTIAL.dedicatedPort`    | `0`（已迁移）        | **旧字段**，仅兼容用：填非 0 值且 `APP_PROXY.ports` 里没有 `residential-in` 时自动补一条                                   |
| `RESIDENTIAL.upstream.enabled` | `true`          | 建「前置-亚洲」组：住宅节点的 `dialer-proxy` 指向它                                                                   |
| `RESIDENTIAL.nodePattern`      | `🏠\|IP-`       | 住宅节点名匹配。**自己加的节点必须带 🏠 前缀或 IP- 前缀**，别用「住宅」二字匹配（机场自带住宅节点会混进来，见 [坑 9](troubleshooting.md)）                                            |
| `RESIDENTIAL.nodeName`         | `''`            | 要**锁定**的住宅节点名。留空 = 默认 `REJECT`（桌面首次使用在面板里选一次）；FlClash 构建时自动填成注入的主节点 → 手机开箱即用                                |
| `RESIDENTIAL.pinOnly`          | `true`          | **严格锁定**：`nodeName` 有值时组里只放这一台，其余住宅 IP 只注入、不进组 —— 指定 IP 挂了就是 `REJECT`，**不会**自动换到另一台住宅 IP。`false` = 全部住宅节点可选（旧行为） |
| `RESIDENTIAL.upstream.filter`  | 显式亚洲关键词         | 跳板池节点名匹配：日/港/台/韩/新/越/马/泰/菲（多字词，见 [坑 8](troubleshooting.md)）。**已与 `smartGroups.JP` 解耦**，改地区组不会连带改跳板池                         |
| `TRAFFIC.domesticDirect`       | `true`          | 追加 `GEOSITE,cn → DIRECT`（`GEOIP,CN` 对 fake-ip 域名无效）                                                  |
| `TRAFFIC.appleDirect`          | `true`          | Apple 全家桶直连（iCloud 同步/App Store 原来走机场，最费流量）                                                          |
| `WEBRTC_GUARD.enabled`         | `false`         | 拦截常见 STUN 探测：`DST-PORT 3478/5349/19302-19309` + `DOMAIN-KEYWORD,stun` → `REJECT`。**会同时打断 Google Meet、微信语音、游戏语音**，且拦不住「从未进入内核的 UDP」。见下文「WebRTC 探测要不要拦」 |

## DNS：一律用 IP 型 DoH，不要域名型

`nameserver` / `proxy-server-nameserver` / `nameserver-policy` 里全部写成  
`https://1.12.12.12/dns-query` 这种**带 IP 的 DoH**，不写 `https://doh.pub/dns-query`。

原因：域名型 DoH 必须先解析 `doh.pub` 才能建连，而这一步只能靠 `default-nameserver` 的明文 UDP 53。  
一旦网络把外部 UDP 53 掐掉（2026-11-04 实测本机正是如此），就会变成  
「解析 DoH 域名 → 超时 → 所有解析失败 → **连百度都打不开**」。  
IP 型 DoH 不需要任何引导，少一环就少一个死法（详见 [坑 15](troubleshooting.md)）。

`default-nameserver` 只负责解析**节点域名**（`jp.jisu16.top` 这类），所以放路由器 DNS 优先、  
公网 IP 兜底即可。

## WebRTC 探测要不要拦（`WEBRTC_GUARD`）

浏览器 WebRTC 打洞时直接向 STUN 服务器发 **UDP**，不吃 HTTP 代理，也不一定被 TUN 接管。  
[`ruleset/webrtc-guard.list`](../ruleset/webrtc-guard.list) 提供一份**默认关闭**的拦截清单：
`DST-PORT 3478/5349/19302-19309` + `DOMAIN-KEYWORD,stun` → `REJECT`（11 条）。

开关在 `smart.js` 第 0 部分 ⑦：

```js
const WEBRTC_GUARD = {
  enabled: false, // true = 拦截；会打断网页通话，见下
};
```

规则插入点固定在**内网/必要技术规则之后、AI 业务规则之前**——放前面会把内网和节点流量一起拦掉，
放后面会被进程规则、AI 规则先接走，等于没装。关着的时候连 `rule-providers` 都不生成，
不会产生任何下载请求。

**它拦不到什么（别把它当成「关闭 WebRTC」）：**

| 拦不到的情况 | 原因 |
| --- | --- |
| 自定义端口的 STUN、私有端口的 TURN 中继 | 只覆盖常见端口 |
| 纯 IP 探测（域名没被内核嗅探出来） | 关键字规则失效，只剩端口规则 |
| **从未进入内核的 UDP** | 系统代理模式 / App 自己发 / IPv6 未接管 —— 这是平台边界，规则层无解 |

最后一条正是 Android 上 `detectradar` 能拿到真实 IP 的原因：手机 FlClash 走 `VpnService`，
内核之外的 UDP 直接由系统发出去，规则再严也管不到（见 [坑 23](troubleshooting.md)）。

**代价**：会同时打断 Google Meet、微信/QQ 语音、Discord、游戏语音等一切依赖 STUN 打洞的功能。
宁可不通话也不想被探测时再打开；需要通话就单独放行对应域名/端口，并重新验证——放行即缩小防护范围。

## 住宅链路的上游怎么选（`dialer-proxy`）

出口 IP 由住宅节点决定（恒定），但**中转路径**由上游决定，三种选法：


| 方案                | 写法                     | 特点                                                                              |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------- |
| **任意亚洲节点（推荐，默认）** | `dialer-proxy: 前置-亚洲`  | `url-test` 全量收编名字含亚洲国家关键词的节点自动择优（日本 6 + 港台韩新 24 + 东南亚 8）；**组内不含 `DIRECT`**，一个亚洲节点都匹配不到时退 `REJECT`（阻断，不裸连）；`tolerance: 200` 防跳板抖动断长连接 |
| 全机场自动             | `dialer-proxy: AUTO`   | 最快，但中转会跳地区——出口 IP 没变，中转 ASN/延迟特征每次都变，对风控不友好                                     |
| 固定单节点             | `dialer-proxy: 直连-日本3` | 最稳，但节点一挂全断；且订阅改名后配置直接校验失败（组引用了不存在的节点）                                           |

> 实测关键点：`REJECT` 放进 `url-test` **不会被抢占**——有活节点时选活节点，  
> 只有全部失效才落到 REJECT。所以「自动择优」和「fail-closed」可以同时拿到。

## 住宅出口组：只锁一台，挂了就 `REJECT`

`住宅出口` 是 `select` 组，成员 = 锁定的那一台 + `REJECT`（仅 `escapeToAI: true` 时再多个 `AI`）：

```js
proxies: [RESIDENTIAL.nodeName, 'REJECT']   // escapeToAI: true 时 → [nodeName, 'REJECT', 'AI']
```

`nodeName` 有值且 `pinOnly: true`（默认）时，组里**只会出现这一台**住宅节点。  
其它住宅 IP 照样注入配置，但既不进本组，也被 `🏠|IP-` 排除在 `AUTO` / `AI` / 全部地区组之外 ——  
它们只是「摆在那里备用」，**不存在被自动选中的路径**。

| 成员                | 作用                                                            |
| ----------------- | ------------------------------------------------------------- |
| `nodeName`（第一位）   | **锁定项 + 默认选中项**。桌面端留空时默认落 `REJECT`（手动选一次，`store-selected` 记住）；FlClash 构建时自动填成注入的主节点 |
| `REJECT`（第二位）     | 回落哨兵：锁定的那台没了就阻断，不会静默走机场，也不会变空组泄漏真实 IP                        |
| `AI`（第三位，可选）     | 仅在 `escapeToAI: true` 时存在，作手动逃生口，不会被自动选中                        |

| 情形                    | 结果                                    |
| --------------------- | ------------------------------------- |
| 锁定的 IP 正常             | 走住宅 ✅                                 |
| 锁定的 IP 挂了（连不上/超时）     | 连接失败（`select` 不切换，符合 fail-closed）      |
| 锁定的 IP 从配置里消失（改名/删掉）  | 回落第一个存活成员 = `REJECT` → 阻断 ✅           |
| 组一个成员都没有              | 有 `REJECT` 兜底，不会空组直连 ✅                 |
| 想临时用机场                | 手动选 `AI` 应急（需 `escapeToAI: true`）✅    |

**为什么失败时不是「立刻 REJECT」而是「连接失败」**：`select` 不做健康检查，内核会一直把请求发给
你选中的那台，失败了就是失败 —— 结果同样是「流量没出去」，只是要等超时，而不是被内核主动拒绝。
想让内核在健康检查判死后主动落到 `REJECT`，只有 `fallback[pin, REJECT]` 这一条路，但那会把
「冷启动 5 分钟 AI 全挂」重新引回来（见下一段），所以不用。

**为什么不用 `url-test` / `fallback` 自动择优**（试过，已回退）：它们的健康检查要经过  
`dialer-proxy: 前置-亚洲`，而 `前置-亚洲` 自己也是 `url-test`。冷启动时两者并发，  
住宅节点的第一次检查在 `前置-亚洲` 还没选出节点时执行 → 判 0ms 失败 → `fallback` 会立刻退到
备选（`REJECT` 或另一台住宅 IP），要等 `interval`（300s）才重测。实测开机后 5 分钟内 AI 全挂。
所以改成**确定性的默认选中项**：不猜、不测、不改。

**实测（mihomo v1.19.32，同一份配置只改兜底项，且不提供住宅节点）**：

| 兜底写法                             | 组内实际成员                       | 当前选择 `now`   | 后果          |
| -------------------------------- | ---------------------------- | ------------ | ----------- |
| 不写（空组）                           | `["COMPATIBLE"]`             | `COMPATIBLE` | 直连，真实 IP 泄漏 |
| `['AI']`                         | `["AI"]`                     | `AI`         | 静默走机场       |
| `['REJECT']`                     | `["REJECT"]`                 | `REJECT`     | 阻断          |
| `[nodeName, 'REJECT', 'AI']`（当年测法，带逃生口） | `["🏠 住宅-JP","REJECT","AI"]` | `🏠 住宅-JP`   | 直接走住宅，无手动步骤 |

现在默认不带 `AI`（`escapeToAI: false`），成员就是前两项，上面几行的结论不变。

再验证「已选中住宅节点、随后节点消失」：`members` 变为 `["REJECT","AI"]`，  
`now` 回落到 `REJECT`，**不是 `AI`**，也不是 `COMPATIBLE`；此时 `PUT` 切到 `AI`  
返回 204、`now` 变 `AI`，逃生口确实可用。

**桌面端首次使用**（`nodeName` 留空）：默认是 `REJECT`，AI 类站点打不开——在面板里把「住宅出口」  
切到住宅节点一次即可，`store-selected: true` 会记住。  
**手机端不需要这一步**（构建脚本已把主节点锁定进组）。

**想要「住宅挂了就自动走机场」**：把 `smart.js` 里改成 `proxies: ['AI', 'REJECT']`，  
代价是「节点从配置里消失」那种情况会静默走机场。不推荐。

## 没有家宽怎么办（`RESIDENTIAL.enabled` 三态开关）

**以前没有家宽静态 IP = AI 全被阻断**：`住宅出口` 组只有 `REJECT`，而 `aiStrict` /
`residential` / Anthropic IP 段 / ChatGPT+Claude 进程规则全都指向它。
现在按「有没有家宽」选一个值即可，差别只在**两个组在不在**、**规则落点**：

| `enabled` | 什么时候用 | `住宅出口` | `前置-亚洲` | 规则落点 |
| --- | --- | --- | --- | --- |
| `true`（**默认**） | 有家宽 | `nodeName` 有值 → 锁定 `[🏠节点, REJECT]`；留空 → `[REJECT]` + `filter: 🏠\|IP-` 收编全部 | `url-test`，`include-all-proxies` 全量收编亚洲节点 | 照旧指向 `住宅出口` |
| `'auto'`（不推荐） | 订阅**自带**住宅节点，且脚本一运行就能看到 | 看得到节点才建，否则不生成 | 同上 | 看得到 → `住宅出口`；看不到 → `AI`（**看不到 ≠ 没有家宽**） |
| `false` | **没有家宽** | **不生成** | **不生成**（无条件） | 全部改投 `AI` 组 |

**`false` 和 `'auto'` 判成「没有家宽」后，行为完全一致**：两组都不生成、住宅链节点移除、
相关规则全部改投 `AI`、7865 改绑 `AI`。区别只在「这次判定是谁做的」。

### `'auto'` 还有效吗？——有效，代码没删，但它判的不是「有没有家宽」

判定逻辑仍在 `resolveResidentialEnabled()` 里，2026-11-13 的改动只是把
「判成无家宽之后做什么」统一成和 `false` 一样，并**没有取消 `auto` 模式**。
它判的是「脚本这次运行时能不能看到住宅节点」：看不到就按无家宽处理，
所以**有家宽也会被误判成没有**（见下文顺序陷阱）。另外它只在跑完整 `main()` 时生效。
实测四种输入：

| 输入 | 判定 | 结果 |
| --- | --- | --- |
| 订阅里自带 `🏠 住宅-JP` | 有家宽 | 完整住宅链，14 条规则指住宅，7865 → `住宅出口` |
| 一个住宅节点都没有 | 无家宽 | 两组不生成，52 条规则指住宅 **0** 条 / 落 AI **19** 条，7865 → `AI` |
| 有节点 `dialer-proxy: 前置-亚洲` 但名字不命中 `🏠\|IP-` | 无家宽 | 该节点被移除（防悬空），其余同上 |
| FlClash 公共版（`FLCLASH_NO_RESIDENTIAL`） | **强制无家宽** | 同上，`enabled` 写任何值都被覆盖 |

判定优先级（`resolveResidentialEnabled()` 从上到下，先命中先生效）：

1. `FLCLASH_NO_RESIDENTIAL`（`flclash.js` 占位符版头部注入）→ 无条件判无家宽；
2. `enabled: true` → 有家宽；`enabled: false` → 无家宽；
3. `enabled: 'auto'` → `RESIDENTIAL.nodeName` 有值（FlClash 私有版注入）即判有家宽，
   否则看 `config.proxies` 里有没有名字命中 `🏠|IP-` 的节点（`nodePattern` 正则写坏时
   `hasResidentialNode()` 兜底返回 `true`，宁可保留住宅链）。

另外两个「有效」的边界，别把 `auto` 当成可靠的自动探测：

- `FLCLASH_NO_RESIDENTIAL` 优先级最高：`flclash.js` 公共占位符版里即使写成 `'auto'`
  也会被**强制判无家宽**；
- 判定只在 `main()` 里做一次并写进 `residentialActive`。若把 `smart.js` 当模块引入、
  只提取 `getRules()` 等纯数据（没跑 `main()`），`residentialActive` 为 `null`，
  `isResidentialOn()` 退回 `RESIDENTIAL.enabled !== false` → `'auto'` **等同 `true`**、
  完全不探测。所以「`auto` 有效」仅限正常覆写执行路径。

⚠️ **`'auto'` 的覆写顺序陷阱（这就是默认不用它的原因）**：第 3 步只能看到「脚本运行时
已经存在的节点」。Clash Party 按覆写列表顺序执行，`residential.yaml` 排在 `smart.js`
**之后**时，脚本还没见过住宅节点 → 误判无家宽 → AI 静默走机场共享 IP，**不报任何错**。
所以：

- 住宅节点来自**后置覆写 YAML** → 用 `true`：`nodeName` 留空时组靠内核级
  `include-all-proxies + filter` 收编，排前排后都能进组（见 [坑 21](troubleshooting.md)）；
  想同时锁定某一台，得保证那台在脚本运行时已经存在（FlClash 注入满足；桌面后置覆写不满足，
  会退回「全部可选」并打一行日志）；
- 住宅节点**订阅自带**、脚本一运行就能看到 → 才用 `'auto'`；
- 确实没有家宽 → 用 `false`，别指望 `auto` 替你判断。

**成员里永远不写 `AI`，前置组里永远不写 `DIRECT`**。住宅出口只允许「住宅 / 阻断」两种结果；
前置组出现 DIRECT 就等于把机场跳板这层拆掉，住宅流量可能裸连住宅 IP。
曾经做过一版「组名常驻 + `住宅出口` 成员塞 `AI` 纯转发 + `前置-亚洲` 降级惰性 select」，
用来兜住外部覆写里手写的 `DOMAIN, challenges.cloudflare.com, 住宅出口`：结果是住宅组变成
能切到机场共享 IP 的普通组、前置组丢光亚洲节点还混进 DIRECT，语义全乱，已回退。
那些手写规则本来就该自己修（`ruleset/ai-strict.list` 里已有对应域名，删掉手写行即可）。

「换成 `AI`」的落点：4 条 Android 包名 + 4 条桌面进程/路径 + `IP-ASN`/`IP-CIDR`/`IP-CIDR6`
（Anthropic 段）+ `RULE-SET,aiStrict` + `RULE-SET,residential` + `GEOSITE,anthropic` + 7865 端口。
**规则条数、顺序、其它分流全部不变**，只是「住宅出口」这个词被换成了「AI」。
`false` 时 7865 改绑 `AI` 而不是删掉，免得已经填了 `127.0.0.1:7865` 的应用变成 connection refused。

```js
enabled: true,   // 默认：有家宽。覆写 YAML 排在 smart.js 前/后都能用
// enabled: 'auto',  // 订阅自带住宅节点，脚本自己判定（有覆写顺序陷阱，见上）
// enabled: false,   // 没有家宽：两组都不生成，AI 退回机场
```

无家宽时（`false`，或 `auto` 判成无家宽）脚本还会把**能看见的住宅链节点**一并移除
（名字命中 `🏠|IP-`，或 `dialer-proxy` 指向 `前置-亚洲` / `住宅出口`），两个组名从此
彻底不存在、也不留悬空引用。普通组本来就用 `exclude-filter` 排除了住宅节点，
移除它们不会造成任何引用失效。

> ⚠️ **脚本管不到「排在它后面的覆写」**。若 `residential.yaml` 排在 `smart.js` **之后**
> 注入 `+proxies` 住宅节点，或 `+rules` 里手写规则指向 `住宅出口`，内核会报
> `proxy [住宅出口] not found` 并拒载整份配置。无家宽时要把这两类引用一起删掉
> （`ai-strict.list` 里已有 `challenges.cloudflare.com` / `withpersona.com`，手写行本来就是重复的）。
> 脚本会打日志提醒，但不会为了兜住引用又把「前置-亚洲」偷偷建回来。

判断结果会打在客户端日志里，搜 `[住宅出口]`；括号里就是这次判定由谁做出：

```text
[住宅出口] 已启用：建完整住宅链（住宅出口 + 前置-亚洲 url-test 全量收编亚洲节点），AI 与账号类流量走住宅
[住宅出口] 未启用（显式 enabled: false）：不生成「住宅出口」与「前置-亚洲」，AI 与账号类规则改投 AI 组…
[住宅出口] 未启用（auto 未检测到 🏠|IP- 节点）：（同上）
[住宅出口] 未启用（FlClash 占位符版，无住宅凭据）：（同上）
[住宅出口] 未启用：已移除 N 个住宅/前置链节点，避免 dialer-proxy 悬空。
```

验证（无家宽时的预期）：

```bash
# 面板里不该出现 住宅出口 / 前置-亚洲
curl -s -H "Authorization: Bearer <secret>" 127.0.0.1:9090/proxies | jq -r '.proxies|keys[]' | grep -E '住宅|前置'
# 规则里不该再有指向 住宅出口 的条目
curl -s -H "Authorization: Bearer <secret>" 127.0.0.1:9090/rules | jq -r '.rules[]|"\(.type),\(.payload),\(.proxy)"' | grep -c 住宅出口
```

## 多台住宅 IP：一台主力 + 若干备用

`pinOnly: true`（默认）下，同一时间只有**一台**住宅 IP 参与出口，其余只作备用。
这是刻意的：出口 IP 从 A 悄悄变成 B，等于账号「换城市登录」，风控代价比断网大得多。

**桌面端（Clash Party 覆写 YAML）**：节点写在 `+proxies` 里（都带 🏠 或 IP- 前缀），
再把 `smart.js` 的 `RESIDENTIAL.nodeName` 写成主力那台的**完整名字**：

```yaml
+proxies:
  - name: '🏠 住宅-JP'      # ← nodeName 指向这台
    type: socks5
    server: 203.0.113.10
    port: 12345
    username: 'xxx'
    password: 'xxx'
    udp: false
    dialer-proxy: 前置-亚洲
  - name: '🏠 住宅-US'      # 备用：注入但不进组
    type: socks5
    server: 203.0.113.11
    port: 1080
    username: 'xxx'
    password: 'xxx'
    udp: false
    dialer-proxy: 前置-亚洲
```

```js
nodeName: '🏠 住宅-JP',   // 名字必须一字不差（含 emoji），写错会退回「全部可选」并打日志
```

换主力 = 改 `nodeName` 后重载；面板「住宅出口」里只会看到这一台。

> 非日本节点可以整行删掉 `dialer-proxy` 直连 Webshare（绕日本反而慢）；删掉就是「本机 → 住宅 IP」一跳。

**手机端（FlClash 私有版）**：`flclash-credentials.json` 写成数组，`primary` 指定主力：

```json
{
  "primary": "🏠 住宅-JP",
  "nodes": [
    { "name": "🏠 住宅-JP", "server": "203.0.113.10", "port": 7012, "username": "xxx", "password": "xxx" },
    { "name": "🏠 住宅-US", "server": "203.0.113.11", "port": 7013, "username": "xxx", "password": "xxx" }
  ]
}
```

`node build-flclash.js` 会把两台都注入私有版，只把 `primary` 那台放进「住宅出口」。  
换主力 = 改 `primary` → 重新构建 → 重新粘贴；手机上不用手改任何东西。
旧的单节点写法 `{ "name": ..., "server": ..., ... }` 仍然有效，等价于 `nodes` 只有一项。

**想让面板里能随手切换多台**：把 `pinOnly` 改成 `false`，全部住宅节点都会进组（旧行为）。
代价是「锁定的那台消失」时内核会回落到另一台住宅 IP —— 只有自己不介意换出口时才用。

**备用节点不烧流量、也不参与测速**：它们不在任何组里，`AUTO` / `AI` / 地区组、`前置-亚洲`
都用 `exclude-filter: 🏠|IP-` 把住宅节点排除了。

**验证锁定有没有生效**：查 `住宅出口` 的 `all` 应该只有 `["🏠 住宅-JP","REJECT"]` 两项，
冒出第二台住宅节点就是 `nodeName` 没对上、退回了「全部可选」，见
[验证分流是否生效](verification.md)。

> 新 IP 上线前先查一次欺诈评分（如 ip.net.coffee / scamalytics），脏 IP 别拿来登录账号。

## 多出口同时分流（设计预案，**未实现**）

上面那套「主力 + 备用」是「同一时间只用一个出口」。如果想两个住宅 IP **同时在线**、按服务商分流  
（如 Claude→日本住宅、OpenAI→美国住宅），需要给 smart.js 加一套多出口机制。  
方案已经想清楚，记录在此，需要时照此落地（预计 50 行重构 + 一份规则清单 + FlClash 同步）：

**1. 三件套结构**。每个出口 = 出口组（select）+ 上游组（url-test）+ 规则集（rule-provider）：

```js
RESIDENTIAL.extraExits = [
  {
    enabled: true,
    group: '住宅-US',                              // 出口组，规则引用它
    nodeFilter: '住宅.*(US|美)|WS.*(US|美)',        // 收编哪些节点
    upstream: { group: '前置-美国', region: 'US' }, // region 复用 smartGroups 的地区 filter
    rules: [{ provider: 'aiStrictUS', file: 'ai-strict-us.list' }],
  },
];
```

**2. 节点归属必须互斥**。主出口（住宅出口）要加 `exclude-filter` 排除其它出口的  
`nodeFilter`——`🏠 住宅-US` 同时含「住宅」和「US」，不排除的话它会进两个组，分流错乱。

**3. 上游组必须排除住宅节点**。`前置-美国` 的 filter 含 `US`，会把 `🏠 住宅-US`
自己收进去形成 dialer 环（实测复现过），`exclude-filter: 🏠|IP-` 必须带上。

**4. 规则集按服务商拆文件**。`ai-strict.list` 保留主出口的服务商，新增  
`ai-strict-us.list` 放另一个出口的。想挪服务商 = 在两个文件之间搬域名行，不改代码。

**5. 共享域名只能选一个家**。`challenges.cloudflare.com`（Turnstile 人机验证）是  
Claude 和 OpenAI 登录页**共用**的，一条规则只能指向一个出口。主站和验证不同出口  
会被风控判会话异常，所以它跟谁，另一家的登录验证就带着对方的出口 IP——这是  
双出口方案固有的缝隙，只能权衡（建议跟使用最频繁、风控最严的那家走）。

**6. 没配节点要能兜底**。出口组里放一个 `AI` 作兜底成员：该出口的节点没配或挂掉时，  
对应服务商走机场，整体不断流。注意兜底成员引用的组必须真实存在。

**7. FlClash 侧的差异**。手机脚本里出口组**不能**引用 `AI` 兜底——FlClash 常配精简  
订阅，没有叫 AI 的组，引用不存在的组整个配置校验失败（实测）。出口组只放节点自身。
