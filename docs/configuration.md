# 配置项详解

`smart.js` 第 0 部分（`DEFAULT_CONFIG`）各配置项的作用、边界与多台住宅 IP 策略。

> ← [文档索引](README.md) · [仓库首页](../README.md) · [自定义配置（`x-smart` / `USER_CONFIG`）](custom-config.md)

---

## 默认值与配置入口

`smart.js` 第 0 部分包含十个顶层配置键，**推荐通过覆写 YAML 的 `x-smart` 或构建配置 `USER_CONFIG` 覆盖，而不直接修改脚本**。完整键表、合并优先级与校验报错说明见 [自定义配置](custom-config.md)。

### 逐个键的默认值与作用

| 配置                             | 默认              | 作用                                                                                                   |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `residential.enabled`          | `true`          | 住宅出口三态开关：`true` = 有家宽（默认）；`false` = **没有家宽**（两组不生成、住宅节点移除、规则改投 `AI`）；`'auto'` = 看运行时有没有住宅节点（`residential.nodes` 或有名字命中 `nodePattern` 的节点），看不到即按无家宽处理；占位符版 `flclash.js` 用的就是它。见下文「没有家宽怎么办」 |
| `residential.nodes`            | `[]`            | 住宅节点凭据，桌面 / 手机同一个位置。每项 `{ name, type?, server, port, username, password, … }`，`dialer-proxy` 由脚本补；`primary` 留空时锁第一台 |
| `residential.aiStrict`         | `true`          | AI 服务商走住宅（推荐）                                                                                        |
| `residential.allAI`            | `false`         | 整个 `forAI` 走住宅——**别开**，`ai.yaml` 里有 `DOMAIN-REGEX,google.*`，会连 `googlevideo.com`（YouTube 视频流）一起烧住宅流量 |
| `appProxy.ports`              | `[7865 → 住宅出口]` | 专用端口列表：端口整体绑到指定组/节点，跳过规则。见 [应用级分流](traffic-entry.md)                                                                    |
| `appProxy.processes`          | **9 条**（4 条 Android 包名 + macOS `Claude.app` / `/opt/homebrew/bin/claude` / `ChatGPT.app` / `Antigravity.app` / `/opt/homebrew/bin/agy`） | 进程/包名规则，插在 `rules` 最前。桌面写进程名或路径，Android 写包名 |
| `residential.escapeToAI`       | `false`         | 是否把 `AI` 放进「住宅出口」当手动逃生口。默认 `false` = 住宅挂了只能阻断，不会静默换机场 IP                                             |
| `residential.dedicatedPort`    | `0`（已迁移）        | **旧字段**，仅兼容用：填非 0 值且 `appProxy.ports` 里没有 `residential-in` 时自动补一条                                   |
| `residential.upstream.enabled` | `true`          | 建「前置-亚洲」组：住宅节点的 `dialer-proxy` 指向它                                                                   |
| `residential.upstream.inject`  | `true`          | `dialer-proxy` 怎么处理：`'fill'`（默认，只补空的）/ `'strip'`（删掉，**仅人在海外且直连网关可达时**，人在国内直连会被墙，见 [坑 32](troubleshooting.md)）/ `'override'`（全改 `前置-亚洲`）/ `false`（一个字都不碰，连 `residential.nodes` 也不补）。前置组匹配不到节点时自动降级 `strip`。见下文「订阅自带住宅怎么接」 |
| `residential.nodePattern`      | `🏠\|IP-\|家宽\|住宅\|静态\|[Rr]esi\|RESI\|[Ss]tatic\|STATIC\|[Ii][Ss][Pp]` | 住宅节点名匹配。既认自己命名的 `🏠`/`IP-` 前缀，也认**订阅自带**的「家宽 / 住宅 / 静态 / ISP / RESI」变体。匹配宽不危险——`pinOnly` 会锁死一台；但 `pinOnly: false` 时必须收窄回 `🏠\|IP-`。见下文「家宽节点怎么认」 |
| `residential.primary`          | `''`            | **主力**住宅节点 = 组内锁定的那一台。**只写节点名**：先完整匹配，再按 includes 匹配（须恰好命中 1 台）。留空 = 用 `prefer` 排第一台。FlClash 构建时自动填成注入的主节点。见下文「锁哪一台」 |
| `residential.pinOnly`          | `true`          | **严格锁定**：`primary` 有值时组里只放这一台，其余住宅 IP 只注入、不进组 —— 指定 IP 挂了就是 `REJECT`，**不会**自动换到另一台住宅 IP。`false` = 全部住宅节点可选（旧行为） |
| `residential.pinMiss`          | `'reject'`      | 锁**不上**时（`primary` 命中 0 台或多台）：`'reject'` = 成员只剩 `REJECT`，AI 直接打不开；`'collect'` = 退回收编（默认选中订阅排序的第一台） |
| `residential.prefer`           | `''`            | 没配 `primary` 时，把指定国家的住宅节点排到组首（`'JP'` / `'日本\|东京'`）。只重排不淘汰 |
| `keepSubGroups`（顶层）        | `true`          | 保留订阅自带的策略组（名字不冲突时）。节点的 `dialer-proxy` 可能指向订阅自家组，丢掉它 = 内核 `Parse config error`，见 [坑 28](troubleshooting.md) |
| `modeGuard`（顶层）             | `true`          | 把内核钉在「规则」模式：面板上被切成「全局 / 直连」时自动改回 `rule` 并记日志。那两种模式会绕过整份规则，`住宅出口` 一次都不会命中，见 [坑 31](troubleshooting.md) |
| `residential.upstream.filter`  | 显式亚洲关键词         | 跳板池节点名匹配：日/港/台/韩/新/越/马/泰/菲（多字词，见 [坑 8](troubleshooting.md)）。**已与 `smartGroups.JP` 解耦**，改地区组不会连带改跳板池                         |
| `traffic.domesticDirect`       | `true`          | 追加 `GEOSITE,cn → DIRECT`（`GEOIP,CN` 对 fake-ip 域名无效）                                                  |
| `traffic.appleDirect`          | `true`          | Apple 全家桶直连（iCloud 同步/App Store 原来走机场，最费流量）                                                          |
| `webrtcGuard.enabled`         | `false`         | 拦截常见 STUN 探测：`DST-PORT 3478/5349/19302-19309` + `DOMAIN-KEYWORD,stun` → `REJECT`。**会同时打断 Google Meet、微信语音、游戏语音**，且拦不住「从未进入内核的 UDP」。见下文「WebRTC 探测要不要拦」 |

## 模式守卫（`modeGuard`）

「全局」和「直连」两种模式会让内核**绕过整份 `rules`**：全局把一切投给内建的 `GLOBAL`
（成员是 `DIRECT` + `REJECT` + 全部节点，默认就选 `DIRECT`），直连则直接出门。此时
`住宅出口` / `AI` / `前置-亚洲` 全都空转，日志里只剩 `using GLOBAL` —— 看起来像
「住宅节点坏了」，实际是分流没跑。

默认 `modeGuard = true`：检测到 `mode: global` / `direct` 就改回 `rule`，并打一条日志说明
原因。面板上再点「全局」，下一次重载也会被改回来。

> ⚠️ 守卫的边界（实测）：它只改「配置文件里的 `mode`」。Clash Party / FlClash 会在覆写
> 脚本跑完**之后**，把 App 界面里选的模式写回内核 —— App 停在「全局」时，脚本改的
> `rule` 会被盖掉（`work/config.yaml` 重新生成后仍是 `mode: global`）。运行期被切走，
> 要在 App 界面切回「规则」，或调内核 API `PATCH /configs {"mode":"rule"}`；
> 守卫负责的是「配置文件默认值 + 日志里留下线索」。

```js
const modeGuard = false;   // 想交还面板控制时改成 false
```

> 为什么要钉死：AI 那条契约是「只走住宅，否则阻断」。全局模式一开，这条约束就静默失效，
> 而且不会有任何报错 —— 只有一条 `using GLOBAL`。

## DNS：一律用 IP 型 DoH，不要域名型

`nameserver` / `proxy-server-nameserver` / `nameserver-policy` 里全部写成
`https://1.12.12.12/dns-query` 这种**带 IP 的 DoH**，不写 `https://doh.pub/dns-query`。

原因：域名型 DoH 必须先靠明文 UDP 53 解析 `doh.pub` 才能建连；一旦所处网络阻断外部 UDP 53，
就会陷入引导死锁导致全部域名解析超时。IP 型 DoH 无需域名引导，详因与排查命令见 [坑 15](troubleshooting.md)。

`default-nameserver` 只负责解析节点域名（如 `node.example.com`），放路由器 DNS 优先、公网 IP 兜底即可。

## WebRTC 探测要不要拦（`webrtcGuard`）

浏览器 WebRTC 打洞时直接向 STUN 服务器发 **UDP**，不吃 HTTP 代理，也不一定被 TUN 接管。  
[`ruleset/webrtc-guard.list`](../ruleset/webrtc-guard.list) 提供一份**默认关闭**的拦截清单：
`DST-PORT 3478/5349/19302-19309` + `DOMAIN-KEYWORD,stun` → `REJECT`（11 条）。

开关在 `DEFAULT_CONFIG.webrtcGuard`（可用 `x-smart` 覆盖）：

```js
const webrtcGuard = {
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

## 家宽节点怎么认（`nodePattern`）

住宅链能不能建起来，第一步是「脚本认不认得出哪个节点是家宽」。认不出来 = `住宅出口` 里只剩
`REJECT` = AI 类站点全打不开。这一步由 `residential.nodePattern` 一个正则决定：

```js
nodePattern: '🏠|IP-|家宽|住宅|静态|[Rr]esi|RESI|[Ss]tatic|STATIC|[Ii][Ss][Pp]',
```

### 三层分工：识别 / 锁定 / 排除

| 层            | 谁负责                                      | 放宽的后果                                   |
| ------------ | ---------------------------------------- | --------------------------------------- |
| **识别**（是不是家宽） | `nodePattern`                            | 多认几个 → 候选池变大，**出口不变**（因为下一层锁死）          |
| **锁定**（用哪一台）   | `primary` + `pinOnly: true`              | 这是唯一能改变出口 IP 的层，默认锁一台                  |
| **排除**（不许当机场节点） | 各地区组 / `AUTO` / `前置-亚洲` 的 `exclude-filter` 自动并入 `nodePattern` | 多认几个 → 少几个可用跳板（住宅节点本来也不该当跳板）           |

「匹配宽一点」之所以安全，前提是 `pinOnly: true`（下一个问题：锁的是**哪一台**）。老版本文档说「别用『住宅』两个字」，
那是 `pinOnly` 还不存在时的结论：当时全部命中项都能被选中，机场自带的 18 个「家宽住宅」节点
直接进来抢出口，出口 IP 变成机场共享 IP。现在这条路径已经关了（[坑 10](troubleshooting.md)）。

> ⚠️ 反过来，**`pinOnly: false` 时必须把 `nodePattern` 收窄回 `🏠|IP-`**：
> 那种模式下每个命中项都能被选中，「宽匹配」会重新变成事故。

### 关键词覆盖表（订阅命名千奇百怪，先按这张表对）

| 类别        | 已覆盖                                                              | 说明                                        |
| --------- | ---------------------------------------------------------------- | ----------------------------------------- |
| 自己命名的前缀   | `🏠`、`IP-`                                                       | 最稳，改名只在你手里                               |
| 中文常见词     | `家宽`、`住宅`、`静态`                                                  | `静态｜ISP｜家宽 01`、`住宅IP-美国`、`静态住宅` 都能命中     |
| 英文 / 缩写   | `Resi`、`RESI`、`Static`、`STATIC`、`ISP`（含大小写变体）                   | 全大写很常见（`RESIDENTIAL-US`），所以两个大小写都写         |
| **故意不收**  | `原生`、`独享`、`私人`、`IP`（裸）                                          | 见下，收了会误伤                                 |

三条规则，改的时候照着走：

1. **多字优先**：`静态` 可以，`静` 不行；`ISP` 可以，`IS` 不行。单字会命中
   「东帝汶 / 尼日利亚 / 到期日」这类八竿子打不着的节点（[坑 8](troubleshooting.md)）。
2. **英文只能靠字符类表达大小写**：这个 pattern **同时**喂给内核（Go RE2）和脚本（客户端 JS
   引擎）。两边语法交集里没有内联旗标 —— 写 `(?i)` 会让脚本侧 `new RegExp` 直接抛异常，
   而异常被 `try/catch` 兜住后表现为「永远判有家宽」，比报错更难查。所以 `[Rr]esi|RESI`
   这种写法不是啰嗦，是唯一能跨引擎的写法。
3. **宁可更宽，不要更窄**：窄了（比如还是只写 `🏠|IP-`）的直接后果是「订阅自带家宽节点一个都
   认不出来」→ 建了住宅链但组里没节点 → AI 全断。宽了最坏是候选池里多几台，`pinOnly` 挡得住。

**为什么裸 `IP` 和 `原生` 不能收：**

| 关键词  | 会被谁命中                                        | 后果                          |
| ---- | -------------------------------------------- | --------------------------- |
| `IP`（裸） | `IPLC 专线`、`IPV6`、`IEPL`                     | 好跳板被排除出 `前置-亚洲`，可用池直接缩水     |
| `原生`   | `原生解锁-美国`（流媒体节点，很多机场的招牌）                     | 同上                          |
| `独享`   | `独享带宽`（普通中转套餐的广告词）                            | 同上                          |

### 怎么确认「这次认对了」

```bash
# 1) 面板/内核里实际存在的节点，哪些被 nodePattern 命中
SOCK=$(ls -t /tmp/mihomo-party-*.sock | head -1)
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies \
  | python3 -c "import sys,json,re;p=json.load(sys.stdin)['proxies'];r=re.compile('🏠|IP-|家宽|住宅|静态|[Rr]esi|RESI|[Ss]tatic|STATIC|[Ii][Ss][Pp]');print([k for k in p if r.search(k)])"

# 2) 日志里应有这三行之一（有 inject 时是两行）
#   [住宅出口] 已启用：建完整住宅链…
#   [住宅出口] 已给 N 个订阅自带住宅节点补上 dialer-proxy: 前置-亚洲…
#   [住宅出口] 锁定目标 … 不在本次节点列表 → 组成员只留 REJECT
```

第 1 条命令的输出应该**包含你要锁的那台**、并且**不包含** `IPLC`／`原生解锁` 这类节点。
对不上就改 `nodePattern`——这是唯一需要改的地方，别去动组定义。

## 住宅链路的上游怎么选（`dialer-proxy`）

出口 IP 由住宅节点决定（恒定），但**中转路径**由上游决定，三种选法：


| 方案                | 写法                     | 特点                                                                              |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------- |
| **任意亚洲节点（推荐，默认）** | `dialer-proxy: 前置-亚洲`  | `url-test` 全量收编名字含亚洲国家关键词的节点自动择优（日本 6 + 港台韩新 24 + 东南亚 8）；**组内不含 `DIRECT`**，一个亚洲节点都匹配不到时退 `REJECT`（阻断，不裸连）；`tolerance: 200` 防跳板抖动断长连接 |
| 全机场自动             | `dialer-proxy: AUTO`   | 最快，但中转会跳地区——出口 IP 没变，中转 ASN/延迟特征每次都变，对风控不友好                                     |
| 固定单节点             | `dialer-proxy: 直连-日本3` | 最稳，但节点一挂全断；且订阅改名后配置直接校验失败（组引用了不存在的节点）                                           |

> 实测关键点：`REJECT` 放进 `url-test` **不会被抢占**——有活节点时选活节点，  
> 只有全部失效才落到 REJECT。所以「自动择优」和「fail-closed」可以同时拿到。

## 上游要不要按大洲拆？（`前置-亚洲` 的边界）

**不拆。按「住宅所在国」建一个组就够；第二台住宅在别的洲，再加第二个。**

链路是 `本机 ─L1→ 前置 ─L2→ 住宅 ─L3→ 目标`。住宅的洲已经由节点决定，前置只能影响 `L1+L2`，
所以「按洲拆」的真实收益只有一句：让 `L2` 变成近场短跳。代价却是：

- 订阅里常常凑不齐七个洲 → 空 `url-test` 组被内核塞 `COMPATIBLE`（直连泄漏，[坑 6](troubleshooting.md)）；
- 多出来的组永远没人引用，却照样健康检查、刷日志；
- 洲太粗：亚洲内部日本与新加坡能差 60ms+，不如现有的地区组。

所以住宅在日本就用亚洲前置，住宅在北美就用北美前置。**跨洲前置 = 两次长途**，
这种情况下宁可整行删掉 `dialer-proxy`，变成「本机 → 住宅」一跳。

判断该不该换前置，要测**住宅节点自己**的延迟（完整链 `L1+L2`），不是面板上前置组那个 ms：

```bash
curl -s --noproxy '*' --unix-socket "$SOCK" \
  "http://localhost/proxies/<住宅节点名 URL 编码>/delay?timeout=5000&url=https://www.google.com/generate_204"
```

连测 10 次看中位数和抖动，差 15% 以内别折腾 —— 换前置会断一次常驻连接（WebSocket）。

## 住宅出口组：只锁一台，挂了就 `REJECT`

`住宅出口` 是 `select` 组，成员 = 锁定的那一台 + `REJECT`（仅 `escapeToAI: true` 时再多个 `AI`）：

```js
proxies: [residential.primary, 'REJECT']   // escapeToAI: true 时 → [primary, 'REJECT', 'AI']
```

`primary` 有值且 `pinOnly: true`（默认）时，组里**只会出现这一台**住宅节点。  
其它住宅 IP 照样注入配置，但既不进本组，也被 `nodePattern` 排除在 `AUTO` / `AI` / 全部地区组之外 ——  
它们只是「摆在那里备用」，**不存在被自动选中的路径**。

| 成员                | 作用                                                            |
| ----------------- | ------------------------------------------------------------- |
| `primary`（第一位）   | **锁定项 + 默认选中项**。桌面端留空时默认落 `REJECT`（手动选一次，`store-selected` 记住）；FlClash 构建时自动填成注入的主节点 |
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

**为什么不用 `url-test` / `fallback` 自动择优**：它们的健康检查要经过 `dialer-proxy: 前置-亚洲`，
而 `前置-亚洲` 自己也是 `url-test`。冷启动并发时，住宅节点的首次检查往往在 `前置-亚洲`
选出节点前执行而判 0ms 失败，导致立刻退到备选并卡满一个 `interval`（300s）。
因此改为确定性的 `select` 默认选中项：不猜、不测、不自动切。

**各兜底写法在无住宅节点时的内核行为（mihomo v1.19.32）**：

| 兜底写法 | 组内实际成员 | 当前选择 `now` | 后果 |
| --- | --- | --- | --- |
| 不写（空组） | `["COMPATIBLE"]` | `COMPATIBLE` | 直连，真实 IP 泄漏 |
| `['AI']` | `["AI"]` | `AI` | 静默走机场 |
| `['REJECT']` | `["REJECT"]` | `REJECT` | 阻断 |
| `[primary, 'REJECT', 'AI']`（开启 `escapeToAI` 且节点存在） | `["🏠 住宅-JP","REJECT","AI"]` | `🏠 住宅-JP` | 直接走住宅；节点消失后 `now` 回落 `REJECT`，仅手动可切 `AI` |

默认不带 `AI`（`escapeToAI: false`），成员只有前两项。

**桌面端首次使用**（`primary` 留空）：默认是 `REJECT`，AI 类站点打不开——在面板里把「住宅出口」  
切到住宅节点一次即可，`store-selected: true` 会记住。  
**手机端不需要这一步**（构建脚本已把主节点锁定进组）。

**想要「住宅挂了就自动走机场」**：把 `smart.js` 里改成 `proxies: ['AI', 'REJECT']`，  
代价是「节点从配置里消失」那种情况会静默走机场。不推荐。

## 自定义家宽节点该写哪些字段（`type` / `dialer-proxy`）

住宅节点有三种来源，需要你写的字段不同：

| 来源 | 谁写 `type` | 谁写 `dialer-proxy` | 你要做的 |
| --- | --- | --- | --- |
| `residential.nodes`（桌面 `x-smart` / 手机 `config` 段，**推荐**） | 你（不写默认 `http`） | 脚本自动补 | 填 name / server / port / 账号 |
| 覆写 YAML `+proxies` | 你 | 你（填组名 `前置-亚洲`） | 全字段手写 |
| 订阅自带 | 订阅 | 脚本自动补（`upstream.inject`） | 什么都不用写 |

| 字段 | 必填 | 作用 | 写错的后果 |
| --- | --- | --- | --- |
| `name` | ✅ | 节点唯一身份：组引用、`primary` 锁定全靠它 | 重名 → 内核拒载（[坑 3](troubleshooting.md)） |
| `type` | ✅ | `socks5`（推荐）或 `http` | 漏写 → 整份配置拒载，不是「这个节点不生效」 |
| `server` / `port` | ✅ | 住宅网关 | — |
| `username` / `password` | 多数 | 住宅代理认证 | 少见 → 节点一直超时 |
| `udp` | 建议 `false` | 住宅商基本不支持 UDP | 写 `true` → 连不通 |
| `dialer-proxy` | 建议 | 出站连接由谁建立；不填 = **本机直连海外住宅 IP** | 指向不存在的名字 → 整份配置拒载 |

> `type: http` 可以配 `dialer-proxy`（v1.19.32 实测生效，见 [坑 5](troubleshooting.md)）。
> `dialer-proxy` 指向 `url-test` 组时跳板会自己换，换一次断一次长连接 —— 所以那组带 `tolerance: 200`。

### 订阅自带家宽节点：只缺 `dialer-proxy`

订阅给的是「能连的节点」，不是「能当链尾的节点」。命中的节点没有 `dialer-proxy` 时，
脚本补上 `前置-亚洲`（`upstream.inject`，默认开），server/port/密码一个字不动。
只有「人在海外、直连网关干净可达」才值得设 `inject: 'strip'`——人在国内直连海外
网关会被墙（TCP 通、数据即 RST），症状与住宅商拒连几乎一样，见 [坑 32](troubleshooting.md)。

## 锁哪一台（`primary`）

`primary` 只写**节点名**，两种匹配方式：

| 写法 | 示例 | 说明 |
| --- | --- | --- |
| 完整匹配 | `'🏠 住宅-JP'` | 一字不差（emoji、全角都算） |
| includes | `'住宅-JP'` | 名字里含这段，且**恰好命中 1 台** |

解析顺序：完整匹配 → includes 唯一命中 → 都不行就按 `pinMiss` 处理（默认阻断）。
写成对象（`{ ip }` / `{ server }`）会被当作锁定失败，不会静默忽略。

```js
primary: '🏠 住宅-JP',   // 完整名
primary: '住宅-JP',      // 订阅节点名带速度标记时，抄一段稳定的片段
```

**不要用序号，也不要按 `server`/`port` 锁定**：序号由订阅下发顺序决定（重排、插一条占位节点就换人，
而且锁错了不报错）；端点会被「几百个 IP 共用一个网关」的订阅一次命中几百台。名字是唯一的身份，
锁不住就阻断——这比猜一台安全。

| `pinMiss` | 组成员 | 表现 |
| --- | --- | --- |
| `'reject'`（默认） | `['REJECT']` | AI 类站点直接打不开，日志有提示 |
| `'collect'` | `REJECT` + 全部命中项 | 退回收编，默认选中 `prefer` 那台（可能任何一国） |

没配 `primary` 时，组员是 `prefer` 命中的节点 + `REJECT`，再全量收编；`prefer` 只决定默认选谁，不淘汰。

## 订阅自带住宅怎么接（`inject` 四模式）

`inject` 的判据是「**本机到住宅网关的直连路径干不干净**」，不是订阅长什么样：

| 值 | 行为 | 什么时候用 |
| --- | --- | --- |
| `'fill'`（默认） | 只给没写 `dialer-proxy` 的补 `前置-亚洲` | 人在国内（直连海外网关会被墙）；跨洲也一样 |
| `'strip'` | 删掉 `dialer-proxy`，本机直连住宅网关 | **仅**人在海外且到网关的线路干净（与住宅同国 / 同区时少一跳更快） |
| `'override'` | 全部改成 `前置-亚洲` | 订阅写了手选组，但默认选中别的洲 |
| `false` | 不碰 | 你要手动接管（连 `residential.nodes` 也不自动补） |

`前置-亚洲` 一个节点都匹配不到时（订阅里全是欧洲节点是常态），脚本自动降到 `strip` ——
不会把住宅挂到一个只有 `REJECT` 的空组上。

### 写在覆写 YAML 里（`x-smart`）

建议把本机差异项（`primary` / `inject` / `prefer` 等）写在**排在 `smart.js` 之前**的本地覆写 YAML 里，避免改动主脚本：

```yaml
x-smart:            # ← 不带 +，且必须排在 smart.js 之前
  residential:
    primary: '住宅-JP'
    prefer: 'JP'
    # upstream 不写 = fill（挂前置）。只有人在海外才写 inject: strip
```

`x-smart` 支持第 0 部分的全部顶层键，逐字段合并后会自动从最终配置中剔除。完整键表、手机端 `USER_CONFIG` 写法与校验行为见 [自定义配置](custom-config.md) 与模板 [`x-smart.example.yaml`](../x-smart.example.yaml)。

## 没有家宽怎么办（`residential.enabled` 三态开关）

**以前没有家宽静态 IP = AI 全被阻断**：`住宅出口` 组只有 `REJECT`，而 `aiStrict` /
`residential` / Anthropic IP 段 / ChatGPT+Claude 进程规则全都指向它。
现在按「有没有家宽」选一个值即可，差别只在**两个组在不在**、**规则落点**：

| `enabled` | 什么时候用 | `住宅出口` | `前置-亚洲` | 规则落点 |
| --- | --- | --- | --- | --- |
| `true`（**默认**） | 有家宽 | `primary` 有值 → 锁定 `[🏠节点, REJECT]`；留空 → `[REJECT]` + `filter: <nodePattern>` 收编全部；锁不上 → 按 `pinMiss`（默认只剩 `REJECT`） | `url-test`，`include-all-proxies` 全量收编亚洲节点 | 照旧指向 `住宅出口` |
| `'auto'`（不推荐） | 订阅**自带**住宅节点，且脚本一运行就能看到 | 看得到节点才建，否则不生成 | 同上 | 看得到 → `住宅出口`；看不到 → `AI`（**看不到 ≠ 没有家宽**） |
| `false` | **没有家宽** | **不生成** | **不生成**（无条件） | 全部改投 `AI` 组 |

**`false` 和 `'auto'` 判成「没有家宽」后，行为完全一致**：两组都不生成、住宅链节点移除、
相关规则全部改投 `AI`、7865 改绑 `AI`。区别只在「这次判定是谁做的」。

### `'auto'` 的判定边界：它只看「脚本运行时能不能看见节点」

`'auto'` 模式仍可用，判定逻辑在 `resolveResidentialEnabled()` 中，判成无家宽后的行为与 `false` 完全一致。
但需要注意：它判的是「脚本这次运行时能不能看到住宅节点」（而非你是否真的配了家宽），
因此**有家宽也可能因覆写顺序被误判成没有**，且只在跑完整 `main()` 时生效。四种常见场景：

| 输入 | 判定 | 结果 |
| --- | --- | --- |
| 订阅里自带 `🏠 住宅-JP` | 有家宽 | 完整住宅链，AI 规则指住宅，7865 → `住宅出口` |
| 一个住宅节点都没有 | 无家宽 | 两组不生成，AI 规则改投 `AI`，7865 → `AI` |
| 有节点 `dialer-proxy: 前置-亚洲` 但名字不命中 `nodePattern` | 无家宽 | 该节点被移除（防悬空），其余同上 |
| FlClash 公共版（`flclash.js`，`enabled: 'auto'` + 占位符节点） | 无家宽 | 同上，粘上去就能用；把 `nodes` 填成真的即走完整住宅链 |

判定优先级（`resolveResidentialEnabled()` 从上到下，先命中先生效）：

1. `enabled: true` → 有家宽；`enabled: false` → 无家宽；
2. `enabled: 'auto'` → `residential.primary` 有值即判有家宽；否则看
   `residential.nodes` 里有没有 `server/port` 齐全的节点（占位符 `YOUR_HOST` / 端口 0 不算），
   再看 `config.proxies` 里有没有名字命中 `nodePattern` 的节点（正则写坏时
   `hasResidentialNode()` 兜底返回 `true`，宁可保留住宅链）。

一个「有效」的边界，别把 `auto` 当成可靠的自动探测：

- 判定只在 `main()` 里做一次并写进 `residentialActive`。若把 `smart.js` 当模块引入、
  只提取 `getRules()` 等纯数据（没跑 `main()`），`residentialActive` 为 `null`，
  `isResidentialOn()` 退回 `residential.enabled !== false` → `'auto'` **等同 `true`**、
  完全不探测。所以「`auto` 有效」仅限正常覆写执行路径。

⚠️ **`'auto'` 的覆写顺序陷阱（这就是默认不用它的原因）**：第 3 步只能看到「脚本运行时
已经存在的节点」。Clash Party 按覆写列表顺序执行，`residential.yaml` 排在 `smart.js`
**之后**时，脚本还没见过住宅节点 → 误判无家宽 → AI 静默走机场共享 IP，**不报任何错**。
所以：

- 住宅节点来自**后置覆写 YAML** → 用 `true`：`primary` 留空时组靠内核级
  `include-all-proxies + filter` 收编，排前排后都能进组（见 [坑 21](troubleshooting.md)）；
  想同时锁定某一台，得保证那台在脚本运行时已经存在（FlClash 注入满足；桌面后置覆写不满足，
  会退回「全部可选」并打一行日志）；
- 住宅节点**订阅自带**、脚本一运行就能看到 → 才用 `'auto'`；
- 确实没有家宽 → 用 `false`，别指望 `auto` 替你判断。

**成员里永远不写 `AI`，前置组里永远不写 `DIRECT`**。住宅出口只允许「住宅 / 阻断」两种结果；
前置组出现 DIRECT 就等于把机场跳板这层拆掉，住宅流量可能裸连住宅 IP。
若外部覆写里曾手写 `DOMAIN, challenges.cloudflare.com, 住宅出口` 等规则，在 `enabled: false` 时直接删掉手写行即可（`ruleset/ai-strict.list` 已包含对应域名）。

「换成 `AI`」的落点：4 条 Android 包名 + 3 条桌面路径（`Claude.app` / `/opt/homebrew/bin/claude` / `ChatGPT.app`）+ `IP-ASN`/`IP-CIDR`/`IP-CIDR6`
（Anthropic 段）+ `RULE-SET,aiStrict` + `RULE-SET,residential` + `GEOSITE,anthropic` + 7865 端口。
**规则条数、顺序、其它分流全部不变**，只是「住宅出口」这个词被换成了「AI」。
`false` 时 7865 改绑 `AI` 而不是删掉，免得已经填了 `127.0.0.1:7865` 的应用变成 connection refused。

```js
enabled: true,   // 默认：有家宽。覆写 YAML 排在 smart.js 前/后都能用
// enabled: 'auto',  // 订阅自带住宅节点，脚本自己判定（有覆写顺序陷阱，见上）
// enabled: false,   // 没有家宽：两组都不生成，AI 退回机场
```

无家宽时（`false`，或 `auto` 判成无家宽）脚本还会把**能看见的住宅链节点**一并移除
（名字命中 `nodePattern`，或 `dialer-proxy` 指向 `前置-亚洲` / `住宅出口`），两个组名从此
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
[住宅出口] 未启用（auto 未检测到 住宅节点）：（同上）
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

**桌面端（Clash Party 覆写 YAML）**：节点写在 `+proxies` 里（带 🏠 或 IP- 前缀最省事），
再把 `smart.js` 的 `residential.primary` 指向主力那台（写节点名，见上文「锁哪一台」）：

```yaml
+proxies:
  - name: '🏠 住宅-JP'      # ← primary 指向这台
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
primary: '🏠 住宅-JP',   // 完整名（含 emoji，一字不差）；也可以只写唯一片段 '住宅-JP'
```

换主力 = 改 `primary` 后重载；面板「住宅出口」里只会看到这一台。
锁不上时按 `pinMiss` 处理：默认 `'reject'` → 组成员只剩 `REJECT`（AI 打不开，但**不会**悄悄
换到另一台住宅 IP），日志里有 `[住宅出口] 锁定目标 … 不在本次节点列表`。

> **住宅与前置不在同一洲时，可以整行删掉 `dialer-proxy` 直连**：
> 跨洲前置是两次长途，删掉就是「本机 → 住宅」一跳。判据见上文「上游要不要按大洲拆」。

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
都用 `exclude-filter` 把 `nodePattern` 命中的节点排除了（现在这个 pattern 也覆盖
「家宽 / 住宅 / 静态 / ISP」，所以订阅自带的家宽节点同样不会被当成跳板）。

**验证锁定有没有生效**：查 `住宅出口` 的 `all`，锁定成功时是 `["🏠 住宅-JP","REJECT"]` 两项；
锁不上（`pinMiss: 'reject'`）时是 `["REJECT"]` 一项。只有写了 `pinMiss: 'collect'` 才会冒出
第二台住宅节点，见 [验证分流是否生效](verification.md)。

> 新 IP 上线前先查一次欺诈评分（如 ip.net.coffee / scamalytics），脏 IP 别拿来登录账号。
