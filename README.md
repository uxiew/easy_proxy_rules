# 代理分流规则配置

用于 **Clash Party / FlClash / mihomo** 的覆写（Override）脚本。整合主流规则集，自动生成代理分组，  
内置 DNS fake-ip 与 DoH 分流，支持「国内直连 / AI 走静态住宅 IP / 其余自动择优」三层分流。

---

## 端口分工

mihomo 会同时开几个入口，**用途完全不同**，配错会绕过规则或断流：

| 端口       | 类型                   | 是否走规则      | 流量去向                                    | 用在哪                             |
| -------- | -------------------- | ---------- | --------------------------------------- | ------------------------------- |
| **7890** | mixed（HTTP + SOCKS5） | ✅ 按规则匹配    | 国内 `DIRECT` / AI 服务商 `住宅出口` / 其余 `AUTO` | 系统代理、浏览器、日常默认                   |
| 7891     | SOCKS5               | ✅ 按规则匹配    | 同上                                      | 只支持 SOCKS5 的程序                  |
| 7892     | HTTP                 | ✅ 按规则匹配    | 同上                                      | 只支持 HTTP 代理的程序                  |
| **7865** | mixed（HTTP + SOCKS5） | ❌ **不走规则** | **强制「住宅出口」组**（静态住宅 IP）                  | Proxifier、Claude Code、不走系统代理的程序 |
| 7866+    | mixed                | ❌ 不走规则     | 由 `APP_PROXY.ports` 指定                  | 自建，见「应用级分流」                     |
| ~~9090~~ | HTTP                 | —          | 控制 API（`external-controller`，默认留空关闭）    | 调试 / 面板                         |

### 7865 和 7890 的区别（最容易搞混）

```
7890 ──► 规则匹配 ──► claude.ai 命中 ai-strict ──► 住宅出口
                  └─► baidu.com 命中 GEOSITE,cn ──► DIRECT
                  └─► youtube.com 未命中 ────────► AUTO（机场）

7865 ──► 跳过规则 ──────────────────────────────► 住宅出口（所有流量）
```

- **7890**：按域名分流，正常上网用这个。
- **7865**：不管访问什么域名，全部从静态住宅 IP 出去。给那些「不走系统代理」的程序用  
  （Electron 应用、游戏客户端、终端工具、Claude Code），配合 Proxifier 指向 `127.0.0.1:7865` 即可。

> 端口由 `smart.js` 顶部的 `APP_PROXY.ports` 控制（默认只有 7865 → 住宅出口），  
> 删掉/注释那一条即关闭。主入口端口（7890/7891/7892）由 Clash Party 的 `mihomo.yaml` 控制，本脚本不改。  
> 旧的 `RESIDENTIAL.dedicatedPort` 仍兼容，但只作为「补一条 residential-in」的兜底。

---

## 应用级分流（指定应用走指定组）

把「某个程序」直接按到「某个组 / 节点」，不依赖域名规则。**配置只有一处**：`smart.js` 开头「第 0 部分：用户配置区」里的 `APP_PROXY`（在文件第 77 行，打开文件就能看到）。

```js
const APP_PROXY = {
  // 方式一：专用端口（仅桌面端）
  ports: [
    { name: 'residential-in', port: 7865, proxy: '住宅出口' },   // 默认启用
    // { name: 'ai-in', port: 7866, proxy: 'AI' },
    // { name: 'us-in', port: 7867, proxy: 'US' },
  ],
  // 方式二：进程名 / 包名 / UID（桌面 + Android 通用）
  processes: [
    // { value: 'Telegram', proxy: 'US' },
    // { value: '/Applications/Cursor.app/Contents/MacOS/Cursor', type: 'path', proxy: 'AI' },
    // { value: 'org.telegram.messenger', proxy: 'US' },   // Android 包名
  ],
};
```

### 方式一：专用端口（桌面端）

| 字段      | 说明                             |
| ------- | ------------------------------ |
| `name`  | 监听名，**不能重复**（重复 = 配置加载失败）      |
| `port`  | 本机端口，监听在 `127.0.0.1`，**不能重复**  |
| `proxy` | 目标组名或节点名。写**组名**更稳——订阅更新后节点名会变 |

应用里把代理设为 `127.0.0.1:<port>` 即可，流量**完全跳过规则匹配**，整体从该组出去。  
端口类型是 `mixed`，HTTP 和 SOCKS5 都支持（Telegram 这类只认 SOCKS5 的客户端也能用）。

⚠️ **只在桌面端生效**。FlClash（Android）会跳过 `listeners`：手机应用基本没有「自填代理端口」  
这个入口（都走 VpnService），而且 Android 上多绑端口一旦被占用，内核会直接起不来。

### 方式二：进程 / 包名规则

生成的规则插在 `rules` **最前面**（`PROCESS-NAME` / `PROCESS-PATH` / `UID`），先于任何域名规则。  
顺序不能挪——放在 `DOMAIN-*` 之后会被直接截胡，等于没写。

**桌面端**：写进程名，或可执行文件绝对路径（`type: 'path'`）。

```bash
ps -Ao comm= | sed 's|.*/||' | sort -u    # 列出所有进程名
```

Electron 应用（Cursor / Slack / Notion）会派生多个 `xxx Helper` 子进程，`PROCESS-NAME` 只命中主二进制，  
Helper 的流量仍走默认规则——这种场景用专用端口（方式一）更彻底。

**Android**：进程名就是**包名**。

```bash
adb shell pm list packages | grep -i telegram    # → package:org.telegram.messenger
```

```js
{ value: 'org.telegram.messenger', proxy: 'US' },
{ value: 'com.android.chrome',     proxy: 'AUTO' },
{ value: 'com.tencent.mm',         proxy: 'DIRECT' },   // 微信直连，避免出口 IP 变化触发风控
```

Android 上是**三层**机制，别混：

| 层               | 在哪配                       | 决定什么                                  |
| --------------- | ------------------------- | ------------------------------------- |
| ① 哪些 App 进 VPN  | FlClash → 应用 页            | 没选中的 App 直接走物理网络，连内核都不进               |
| ② 进内核后走哪个组      | `APP_PROXY.processes`（包名） | 同一个 VPN 内，Telegram 走 US、Chrome 走 AUTO |
| ③ 同一 App 内按域名细分 | `rules`                   | 例如 Chrome 里 claude.ai 走住宅、其余走 AUTO    |

**验证包名规则是否真的命中**：看 FlClash 日志里连接后面的括号

```
[TCP] 192.168.1.5:51234(org.telegram.messenger) --> ...
```

有括号 = 内核拿到了包名，规则生效；**没有括号** = 内核拿不到进程信息，退回 UID：

```js
{ value: '10234', type: 'uid', proxy: 'US' },   // 生成 UID,10234,US
```

```bash
adb shell dumpsys package org.telegram.messenger | grep userId
```

⚠️ 包名 / 进程名写错**不会报错**，规则只是永不命中，表现是「配了但没效果」——所以务必先核对再重载。  
包名写的是**已安装应用**，改名/卸载后规则就失效了。

### App 自己解析 DNS / 直连 IP（WhatsApp、Talkatone 这类）

有些 App 不走系统 DNS：内部硬编码 `8.8.8.8:53`，拿到真实 IP 再去连。于是会看到三个连锁现象：

- 连接里只有 IP、没有域名 → 所有 `DOMAIN-*` 规则天然失配，连接详情里「规则」显示 **`Match`**；
- 它那条裸 DNS 是 **UDP:53**，住宅节点 `udp: false` 过不去 → 掉进 `CATCH → AUTO`（机场）；
- 语音/视频的媒体流也是 UDP，同样进不了住宅 → 形成「信令走住宅、**媒体走机场**」的混线，  
  可能出现单通、无声、偶发重连。

Talkatone 实测现场：`进程 com.talkatone.android(10410)` / `规则 Match` / `目标 8.8.8.8:53` / `代理链 CATCH → AUTO → 机场`。

**处理顺序（照这套走，其它 App 一样）**

| 步骤 | 做什么                             | 作用                                                 |
| -- | ------------------------------- | -------------------------------------------------- |
| ①  | `APP_PROXY.processes` 写包名 / 进程名 | 唯一能按住「纯 IP 连接」的手段，域名规则救不了                          |
| ②  | FlClash 开「DNS 劫持 / Fake-IP」     | 裸 53 被内核接管 → 返回 fake-ip → 连接重新带上域名，规则恢复可用          |
| ②′ | 开不了劫持：加 `DST-PORT,53,US`        | 仍走机场，但解析地区与出口对齐，避免拿到亚洲边缘                           |
| ③  | 语音类别指望住宅                        | 住宅 socks5 不支持 UDP，**别**去开 `udp: true`，多数住宅商开了直接连不上 |

```js
// WhatsApp：桌面进程名 / Android 包名（商务版 com.whatsapp.w4b）
{ value: 'WhatsApp', proxy: 'US' },
{ value: 'com.whatsapp', proxy: 'US' },
{ value: 'com.whatsapp.w4b', proxy: 'US' },
```

判断是否生效：看连接详情的「规则」——`PROCESS-NAME` / `PROCESS-PATH` / `UID` 说明 processes 生效；  
`Match` 说明没命中任何规则，正在走 `CATCH`（纯 IP 连接的典型表现）。

> 同类清单（都自带 DNS 或大量 IP 直连）：Talkatone、WhatsApp、Telegram 语音、Discord 语音、  
> 部分手游与银行 App。它们的共同点：**规则看不到域名，UDP 也进不了住宅**。

---

## 使用

1. Clash Party → 覆写 → 新建 → 类型选 **远程**，填：
   ```
   https://raw.githubusercontent.com/uxiew/easy_proxy_rules/main/smart.js
   ```
   国内直连 GitHub 不稳的话，前面加加速前缀（如 `https://hk.gh-proxy.org/`）。
2. 设为**全局覆写**，模式切到「规则」（`global` 模式下所有规则失效）。
3. 想用静态住宅出口，再建一个本地 YAML 覆写，内容参考 [`residential.example.yaml`](residential.example.yaml)。

> ⚠️ 本脚本会**整体替换** `proxy-groups` / `rules` / `rule-providers` 三个字段。  
> 所以所有 YAML 覆写都必须排在 `smart.js` **之后**，否则它们的规则会被整段丢掉（`proxies` 不受影响）。

---

## 代理分组

`smart.js` 只生成下面这些组，名字固定、不要在其他覆写里重复定义（重名会让内核直接启动失败）。

| 组                                  | 类型       | 成员                                   | 干嘛的                                                                                                     |
| ---------------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `🚀 全部节点`                          | select   | `DIRECT` + 全部节点                      | 手动挑单个节点，绕开所有自动逻辑                                                                                        |
| `住宅出口`                             | select   | `🏠 住宅-JP` / `REJECT`（默认**不含** `AI`） | **AI 风控面专用出口**，`include-all-proxies` + `filter: 🏠\|WS-` 动态收编住宅节点；`escapeToAI: false` 时切不出机场 = 要么住宅要么断网 |
| `前置-亚洲`                            | url-test | 亚洲机场节点（日/港/台/韩/新/越/马/泰/菲）            | 住宅节点的 `dialer-proxy`，只负责「本机 → 机场亚洲 → 住宅」这一跳                                                             |
| `AUTO`                             | url-test | 全量节点                                 | 默认出口，`filter: '.*'` 吃全量，按延迟自动选最快                                                                        |
| `AI`                               | url-test | `JP/SG/US/DE/KR`                     | 机场 AI 组（Gemini、Google、中转站），**不含住宅节点**                                                                   |
| `CATCH`                            | select   | `AUTO` / `DIRECT` / `REJECT`         | `MATCH` 兜底 + **手动总闸**                                                                                   |
| `ADS_FILTER`                       | select   | `REJECT` / `DIRECT`                  | 广告/统计域名开关                                                                                               |
| `NSFW`                             | fallback | `JP/TW/KR/US/DE`                     | NSFW 规则出口                                                                                               |
| `TW/HK/JP/KR/SG/US/UK/FR/DE/CA/EU` | url-test | 对应地区节点                               | 地区组，按延迟自动选；节点数为 0 的组会被自动剔除                                                                              |

**几个容易踩的点：**

- **`AUTO` 已经没有 `SPEED` 这个成员了。** 早期版本里 `SPEED` 是 `filter: '.*'` 的独立组，  
  展开后成员与 `AUTO` 完全相同（都是全量），等于同一批节点被两套健康检查重复测速，且没有任何  
  规则引用它 —— 2026-11-05 合并进 `AUTO` 后删除。要手动挑最快用「🚀 全部节点」。
- **`前置-亚洲` 原来叫 `前置-日本`。** 2026-11-05 改的：只收日本节点时路径最短，但「所有日本节点  
  一起挂」就等于整条 AI 链路断掉。现在跳板池扩到亚洲（日/港/台/韩/新/越/马/泰/菲，30+ 个节点），  
  url-test 取最快——通常还是日本节点胜出，日本全挂时自动落到港/台/新，链路不断。  
  ⚠️ **改名是破坏性变更**：覆写 YAML 里的 `dialer-proxy` 必须同步改成 `前置-亚洲`，  
  否则内核报 `dialer-proxy 前置-日本 not found`，配置直接加载失败。
- **`CATCH` 是总闸，不是死组。** 末尾规则是 `MATCH, CATCH`，而 `CATCH` 默认成员就是 `AUTO`，  
  所以行为与旧的 `MATCH, AUTO` 完全一致。区别在于：某个站打不开、怀疑是代理导致的，  
  在面板里把 `CATCH` 切成 `DIRECT` 就整站直连，切 `REJECT` 就整站断网，**不用改配置重载**。
- **`ADS_FILTER` 只有两个成员。** 早期写的是 `[REJECT, AUTO]`，被展开逻辑摊平成  
  「REJECT + 100 多个机场节点」的下拉框 —— 「广告域名走代理」本身没有语义，除错时唯一有用的  
  动作是「放行直连」，所以现在是 `REJECT`（默认拦截）/ `DIRECT`（怀疑误杀时放行）。
- **`CATCH` / `ADS_FILTER` 用 `keepRefs: true` 标记跳过节点展开**（`expandGroup()` 里提前返回），  
  否则成员会被摊平成节点列表，切换能力就没了。这个标记在输出前会被删除，不会漏进 mihomo 配置。

---

## 文件结构

```
smart.js                  主脚本：建组 + 生成规则（只有逻辑，没有域名清单）
flclash.js                FlClash 单文件覆写（占位符版，由 build-flclash.js 生成，勿手改）
build-flclash.js          生成器：凭据头 + smart.js 全文 → flclash.js / flclash-private.js
flclash-credentials.json  私有凭据（.gitignore 排除，生成私有版用）
flclash-private.js        生成的私有版（.gitignore 排除，粘贴到手机）
ruleset/
├── ai-strict.list        AI 服务商精确域名 → 住宅出口（含 Turnstile/auth0/Persona/遥测）
├── ai.yaml               AI 相关但走机场的部分（宽泛匹配、Google 全量、中转站）
├── residential.list      非 AI 的账号/支付/电商 → 住宅出口
├── direct-extra.list     补充直连域名
├── auto-extra.list       Google 通用资产 → AUTO
├── custom.list           自定义规则
└── nsfw.list             NSFW 规则
residential.example.yaml  住宅节点覆写模板（Clash Party 用，只放凭据，不提交）
```

### 两个 AI 清单为什么不能合并

一条 `RULE-SET` 只能指向一个策略组。住宅和机场是两个不同出口，**物理上必须是两个 rule-provider**。  
两者按「是否怕风控」划边界，不重复：

| 文件               | 目标组      | 装什么                                | 举例                                                        |
| ---------------- | -------- | ---------------------------------- | --------------------------------------------------------- |
| `ai-strict.list` | 住宅出口     | 有账号体系、会风控的服务商**精确域名**              | `claude.ai`、`challenges.cloudflare.com`、`withpersona.com` |
| `ai.yaml`        | AI 组（机场） | 宽泛 `KEYWORD`/`REGEX`、Google 全量、中转站 | `DOMAIN-REGEX,google.*`、`mcp.so`、`z.ai`                   |

---

## 关键配置项（`smart.js` 第 0 部分：用户配置区）

`smart.js` 开头就是 `// 第 0 部分：用户配置区`，按使用频率排了四个对象，**所有可调项都在这里**（之后的 CDN 源、节点清洗、分组、规则生成属于内部逻辑，日常不用动）：

| 顺序 | 对象                | 管什么                                |
| -- | ----------------- | ---------------------------------- |
| ①  | `APP_PROXY`       | 应用级分流：专用端口 / 进程名 / Android 包名（最常改） |
| ②  | `RESIDENTIAL`     | 住宅出口：总开关、组名、跳板组、专用端口               |
| ③  | `TRAFFIC`         | 省流量：国内直连、Apple 直连                  |
| ④  | `AI_STATIC_TO_AI` | AI 静态资源 / 安装包 → 机场 AI 组            |

| 配置                             | 默认              | 作用                                                                                                   |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------- |
| `RESIDENTIAL.enabled`          | `true`          | 住宅出口总开关                                                                                              |
| `RESIDENTIAL.aiStrict`         | `true`          | AI 服务商走住宅（推荐）                                                                                        |
| `RESIDENTIAL.allAI`            | `false`         | 整个 `forAI` 走住宅——**别开**，`ai.yaml` 里有 `DOMAIN-REGEX,google.*`，会连 `googlevideo.com`（YouTube 视频流）一起烧住宅流量 |
| `APP_PROXY.ports`              | `[7865 → 住宅出口]` | 专用端口列表：端口整体绑到指定组/节点，跳过规则。见「应用级分流」                                                                    |
| `APP_PROXY.processes`          | `[]`（全注释）       | 进程/包名规则，插在 `rules` 最前。桌面写进程名，Android 写包名                                                             |
| `RESIDENTIAL.escapeToAI`       | `false`         | 是否把 `AI` 放进「住宅出口」当手动逃生口。默认 `false` = 住宅挂了只能阻断，不会静默换机场 IP                                             |
| `RESIDENTIAL.dedicatedPort`    | `0`（已迁移）        | **旧字段**，仅兼容用：填非 0 值且 `APP_PROXY.ports` 里没有 `residential-in` 时自动补一条                                   |
| `RESIDENTIAL.upstream.enabled` | `true`          | 建「前置-亚洲」组：住宅节点的 `dialer-proxy` 指向它                                                                   |
| `RESIDENTIAL.nodePattern`      | `🏠\|WS-`       | 住宅节点名匹配。**自己加的节点必须带 🏠 前缀**，别用「住宅」二字匹配（机场自带住宅节点会混进来，见坑 9）                                            |
| `RESIDENTIAL.upstream.filter`  | 显式亚洲关键词         | 跳板池节点名匹配：日/港/台/韩/新/越/马/泰/菲（多字词，见坑 8）。**已与 `smartGroups.JP` 解耦**，改地区组不会连带改跳板池                         |
| `TRAFFIC.domesticDirect`       | `true`          | 追加 `GEOSITE,cn → DIRECT`（`GEOIP,CN` 对 fake-ip 域名无效）                                                  |
| `TRAFFIC.appleDirect`          | `true`          | Apple 全家桶直连（iCloud 同步/App Store 原来走机场，最费流量）                                                          |

### DNS：一律用 IP 型 DoH，不要域名型

`nameserver` / `proxy-server-nameserver` / `nameserver-policy` 里全部写成  
`https://1.12.12.12/dns-query` 这种**带 IP 的 DoH**，不写 `https://doh.pub/dns-query`。

原因：域名型 DoH 必须先解析 `doh.pub` 才能建连，而这一步只能靠 `default-nameserver` 的明文 UDP 53。  
一旦网络把外部 UDP 53 掐掉（2026-11-04 实测本机正是如此），就会变成  
「解析 DoH 域名 → 超时 → 所有解析失败 → **连百度都打不开**」。  
IP 型 DoH 不需要任何引导，少一环就少一个死法（详见坑 15）。

`default-nameserver` 只负责解析**节点域名**（`jp.jisu16.top` 这类），所以放路由器 DNS 优先、  
公网 IP 兜底即可。

### 住宅链路的上游怎么选（`dialer-proxy`）

出口 IP 由住宅节点决定（恒定），但**中转路径**由上游决定，三种选法：


| 方案                | 写法                     | 特点                                                                              |
| ----------------- | ---------------------- | ------------------------------------------------------------------------------- |
| **任意亚洲节点（推荐，默认）** | `dialer-proxy: 前置-亚洲`  | `url-test` 只收名字含亚洲国家关键词的节点自动择优（日本 6 + 港台韩新 24 + 东南亚 8）；全灭时落 `REJECT` 阻断，不会跳到美/欧 |
| 全机场自动             | `dialer-proxy: AUTO`   | 最快，但中转会跳地区——出口 IP 没变，中转 ASN/延迟特征每次都变，对风控不友好                                     |
| 固定单节点             | `dialer-proxy: 直连-日本3` | 最稳，但节点一挂全断；且订阅改名后配置直接校验失败（组引用了不存在的节点）                                           |

> 实测关键点：`REJECT` 放进 `url-test` **不会被抢占**——有活节点时选活节点，  
> 只有全部失效才落到 REJECT。所以「自动择优」和「fail-closed」可以同时拿到。

### 住宅出口组的成员顺序：`nodeName` → `REJECT` → `AI`

|                                                                    |                     |
| ------------------------------------------------------------------ | ------------------- |
| `住宅出口` 是 `select` 组，成员 = 住宅节点（\`filter: 🏠                         | WS-\` 动态收编）+ 三个固定项， |
| `smart.js` 里写的是 `proxies: [RESIDENTIAL.nodeName, 'REJECT', 'AI']`。 |                     |

`select` 组不会自动切换，但**选中的节点消失时内核回落到第一个成员**，所以顺序就是语义：

| 成员              | 作用                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------- |
| `nodeName`（第一位） | **默认选中项**。桌面端留空（默认落 `REJECT`，手动选一次，`store-selected` 记住）；FlClash 构建时由钩子填成注入的节点名 → **手机开箱即用** |
| `REJECT`（第二位）   | 回落哨兵：节点全没了就阻断，不会静默走机场，也不会变空组泄漏真实 IP                                                         |
| `AI`（第三位）       | 仅作手动逃生口：住宅线路彻底挂了能在面板切过去临时用，不会被自动选中                                                          |

| 情形                 | 结果                                     |
| ------------------ | -------------------------------------- |
| 选中住宅节点、节点正常        | 走住宅 ✅                                  |
| 选中住宅节点、节点挂了        | 连接失败（`select` 不切，符合 fail-closed）       |
| 住宅节点从配置里消失（改名/删掉）  | 回落第一位；`nodeName` 也没了就落 `REJECT` → 阻断 ✅ |
| filter 一个都没匹配到（组空） | 有 `REJECT` 兜底，不会空 ✅                    |
| 住宅线路彻底挂了，想临时用机场    | 手动选 `AI` 应急 ✅                          |

**为什么不用 `url-test` 自动择优**（试过，已回退）：`url-test` 的健康检查要经过  
`dialer-proxy: 前置-亚洲`，而 `前置-亚洲` 自己也是 `url-test`。冷启动时两者并发，  
住宅节点的第一次检查在 `前置-亚洲` 还没选出节点时执行 → 判 0ms 失败 → 要等  
`interval`（300s）才重测。实测开机后 5 分钟内 AI 全挂。所以改成**确定性的默认选中项**。

**实测（mihomo v1.19.32，同一份配置只改兜底项，且不提供住宅节点）**：

| 兜底写法                             | 组内实际成员                       | 当前选择 `now`   | 后果          |
| -------------------------------- | ---------------------------- | ------------ | ----------- |
| 不写（空组）                           | `["COMPATIBLE"]`             | `COMPATIBLE` | 直连，真实 IP 泄漏 |
| `['AI']`                         | `["AI"]`                     | `AI`         | 静默走机场       |
| `['REJECT']`                     | `["REJECT"]`                 | `REJECT`     | 阻断          |
| `[nodeName, 'REJECT', 'AI']`（当前） | `["🏠 住宅-JP","REJECT","AI"]` | `🏠 住宅-JP`   | 直接走住宅，无手动步骤 |

再验证「已选中住宅节点、随后节点消失」：`members` 变为 `["REJECT","AI"]`，  
`now` 回落到 `REJECT`，**不是 `AI`**，也不是 `COMPATIBLE`；此时 `PUT` 切到 `AI`  
返回 204、`now` 变 `AI`，逃生口确实可用。

**桌面端首次使用**：默认是 `REJECT`，AI 类站点打不开——在面板里把「住宅出口」  
切到住宅节点一次即可，`store-selected: true` 会记住。  
**手机端不需要这一步**（`nodeName` 已由构建脚本填好）。

**想要「住宅挂了就自动走机场」**：把 `smart.js` 里改成 `proxies: ['AI', 'REJECT']`，  
代价是「节点从配置里消失」那种情况会静默走机场。不推荐。

### 加第二个住宅节点（切换式，0 行代码）

|                        |                                   |
| ---------------------- | --------------------------------- |
| `住宅出口` 组靠 \`filter: 🏠 | WS-\` 动态收编，新节点加进覆写就自动出现，UI 里手动切换： |

1. 本地覆写的 `+proxies` 列表里加一段节点，**名字带 🏠 前缀**（如 `🏠 住宅-US`，不能用「住宅」二字当匹配词，见坑 10），`type: socks5`
2. `dialer-proxy` 可以整行删掉（本机直连 Webshare，非日本节点建议直连，绕日本反而慢）
3. UI 里把「住宅出口」切到新节点（`store-selected` 会记住）

|                                         |        |
| --------------------------------------- | ------ |
| 不会泄漏到别处：`AUTO`/`AI`/`前置-亚洲` 的排除项都含 \`🏠 | WS-\`。 |

> 新 IP 上线前先查一次欺诈评分（如 ip.net.coffee / scamalytics），脏 IP 别拿来登录账号。

### 多出口同时分流（设计预案，**未实现**）

上面的切换式是「同一时间只用一个出口」。如果想两个住宅 IP **同时在线**、按服务商分流  
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

|                                              |             |
| -------------------------------------------- | ----------- |
| 自己收进去形成 dialer 环（实测复现过），\`exclude-filter: 住宅 | WS-\` 必须带上。 |

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

---

## 客户端接入

### Claude Code

写进 `~/.claude/settings.json` 的 `env`，让所有 API 请求强制从住宅 IP 出去：

```json
{
  "env": {
    "HTTPS_PROXY": "http://127.0.0.1:7865",
    "HTTP_PROXY": "http://127.0.0.1:7865"
  }
}
```

> 用 7865 而不是 7890：Claude Code 会连 `api.anthropic.com`，虽然 ai-strict 也会把它导向住宅，  
> 但用专用端口更稳——即使某天规则集加载失败，API 请求也不会掉到机场 IP 上。  
> 副作用：住宅节点挂掉时 Claude Code 会完全不可用，临时改回 `7890` 即可。

**这个配置本身是 fail-closed 的**：`HTTPS_PROXY` 是「显式指定代理」，不是系统代理。  
Clash Party 退出后端口消失，客户端拿到的是 `ECONNREFUSED`，**不会**像系统代理那样静默回落直连。  
（实测：`curl -x http://127.0.0.1:59999 https://api.anthropic.com/` → `Failed to connect`，没有直连重试路径。）

真正会漏的是两种情况，都不在 Claude Code 里：

1. **不读 `settings.json` 的进程** —— 脚本里的 `curl`、Python 的 anthropic SDK、Cursor、IDE 插件只认  
   shell 环境变量，Clash Party 挂掉时它们会静默直连。要兜住就在 `~/.zshrc` 里加个启动前闸门：
   ```zsh
   claude() {
     local port=7865
     local cfg="$HOME/Library/Application Support/mihomo-party/work/config.yaml"
     if ! nc -z -G 1 -w 1 127.0.0.1 $port >/dev/null 2>&1; then
       echo "[claude 守卫] 127.0.0.1:$port 没有监听 —— 已阻止启动（无代理时直连会暴露真实 IP）" >&2
       return 1
     fi
     local expect ip
     expect=$(awk '/name: .*住宅-JP/{f=1} f && /server:/{gsub(/.*server: */,""); gsub(/"/,""); print; exit}' "$cfg" 2>/dev/null)
     ip=$(curl -s --max-time 6 -x "http://127.0.0.1:$port" https://api.ipify.org)
     if [ -z "$ip" ] || { [ -n "$expect" ] && [ "$ip" != "$expect" ] && [ "$CLAUDE_SKIP_IP_CHECK" != "1" ]; }; then
       echo "[claude 守卫] 出口 IP=${ip:-取不到}，住宅节点=$expect —— 已阻止启动" >&2
       echo "  确认无碍再绕过：CLAUDE_SKIP_IP_CHECK=1 claude ..." >&2
       return 1
     fi
     HTTP_PROXY="http://127.0.0.1:$port" HTTPS_PROXY="http://127.0.0.1:$port" \
       ALL_PROXY="http://127.0.0.1:$port" NO_PROXY="localhost,127.0.0.1" command claude "$@"
   }
   ```
2. **代理活着但出口被切走** —— 「住宅出口」被点成 `AI`，端口是通的但用的是机场 IP，  
   比断网更危险（同账号 IP 跳变）。上面守卫的第二个闸门就是拦这个。

> ⚠️ `NO_PROXY` 只写 `localhost,127.0.0.1`，**不要**把 `anthropic.com` 加进去 —— 加一条就让所有代理努力归零。

### Claude Code 常驻会话（`~/.claude/remote` 的 ccd-cli）

远程 / 常驻会话由守护进程 `~/.claude/remote/srv/<hash>/server` 拉起若干 `ccd-cli` 子进程，  
每个子进程各自读 `settings.json` 的 `env`，**不需要单独配代理**。它们对 `api.anthropic.com`  
用的是 HTTP/2 长连接，空闲时只有心跳，所以面板里会长期挂着 `0 B/s` 的几行，属正常现象。

一条命令确认「全都走住宅、没有直连」：

```bash
lsof -nP -iTCP:7865 -sTCP:ESTABLISHED                    # 每个 ccd-cli 应有一条
lsof -nP -a -p <PID> -iTCP -sTCP:ESTABLISHED             # 只应出现 127.0.0.1:7865，无 x.x.x.x:443
```

- 出现 `x.x.x.x:443` 直连 → 该会话没拿到 env（多半是旧版本残留进程），关掉重开。
- 旧版本（如 `2.1.309`）遗留的会话会一直占着长连接，`kill <PID>` 即可，守护进程和其他会话不受影响。
- 守护进程本身不联网（只有 unix socket），所以「让它走住宅」实际就是「让每个子进程拿到 `env`」。

### 硬阻断（可选，需要 sudo）

想把「万一没走代理」彻底堵死，在 pf 层封掉 Anthropic 网段的直连（本机代理不受影响）。

> ⚠️ **只跑 `sudo pfctl -a <名字> -f -` 是没有效果的。** `-a` 只是把规则塞进一个命名
> anchor，而 macOS 默认的 `/etc/pf.conf` 里只挂了 `anchor "com.apple/*"`，没有任何一处
> 引用自定义 anchor。规则确实进了内核（`pfctl -a com.easyproxy -sr` 能看到两行），但
> 主规则集永远不会跳到它 —— 表现为 `nc -z 160.79.104.10 443` 照样通。

**永久生效**（写规则文件 + 在主规则集里挂 anchor）：

```bash
# 1) 规则文件
sudo tee /etc/pf.anchors/com.easyproxy >/dev/null <<'EOF'
# 只拦直连 Anthropic，经 127.0.0.1:7865 的流量不受影响
block drop out quick proto tcp to 160.79.104.0/21
block drop out quick inet6 proto tcp to 2607:6bc0::/32
EOF

# 2) 挂到主规则集末尾（缺这步等于没配）
printf '\nanchor "com.easyproxy"\nload anchor "com.easyproxy" from "/etc/pf.anchors/com.easyproxy"\n' | sudo tee -a /etc/pf.conf

# 3) 重载（会清空并重读主规则集，系统服务的 anchor 会在用到时重新挂回）
sudo pfctl -f /etc/pf.conf

# 4) 验证
sudo pfctl -a com.easyproxy -sr     # 应打印两行 block
nc -z -G 3 -w 3 160.79.104.10 443   # 现在应当失败/超时
```

**只想临时试、不想改 `/etc/pf.conf`**：塞进 `com.apple` 的子 anchor 即可。主规则集里
`anchor "com.apple/*"` 是通配点，新建的子 anchor 会被自动求值。

```bash
sudo pfctl -a com.apple/easyproxy -f /etc/pf.anchors/com.easyproxy
nc -z -G 3 -w 3 160.79.104.10 443   # 应立即失败
```

重启或重载主规则集后失效，适合先验证再落盘。

撤销：

```bash
sudo pfctl -a com.easyproxy -F rules          # 清掉规则
sudo pfctl -a com.apple/easyproxy -F rules    # 临时版则清这个
```

要永久关掉，再删掉 `/etc/pf.conf` 末尾两行（`anchor "com.easyproxy"` 与 `load anchor …`）。

> 经 `127.0.0.1:7865` 的流量不会被拦：Clash 连的是住宅 IP `61.***193`，不在 Anthropic 网段。  
> `pfctl -e` 打印 `pf already enabled` 属正常提示，不是错误。

### Proxifier

1. `Profile → Proxy Servers → Add`：`127.0.0.1:7865`，协议 **SOCKS5**
2. `Profile → Proxification Rules → Add`：Applications 选目标程序，Action 选刚建的代理
3. Default 规则设 `Direct`，别再套 7890

> ⚠️ Proxifier 与 Clash 的 **TUN 模式会冲突**（流量被两边重复拦截，容易成环）。开 TUN 时把 Proxifier 停掉。

### Android：FlClash / v2rayNG

两者内核完全不同，决定了一个能用、一个用不了：

|                     | FlClash                      | v2rayNG                                |
| ------------------- | ---------------------------- | -------------------------------------- |
| 内核                  | **mihomo**（和 Clash Party 同款） | Xray / v2fly                           |
| Clash YAML          | ✅ 订阅、内置编辑器、覆写脚本              | ❌ 完全不认                                 |
| 策略组 / rule-provider | ✅                            | ❌ 没有这个概念                               |
| `dialer-proxy` 链式   | ✅                            | 只能手写 Xray JSON 的 `sockopt.dialerProxy` |

**FlClash（推荐）** 用 [`flclash.js`](flclash.js) —— **与桌面端同一份 smart.js 全量逻辑**：  
FlClash 没有覆写链（不能 script + YAML 叠加），所以用构建脚本把「凭据头 + smart.js 全文」  
拼成单文件，组/规则和 Clash Party 完全一致（AUTO/AI/前置-亚洲/住宅出口/AI 走住宅/国内直连/占位节点清洗）。

生成与安装：

1. 凭据写进 `flclash-credentials.json`（`.gitignore` 已排除），格式：  
   `{ "name": "🏠 住宅-JP", "server": "...", "port": 7012, "username": "...", "password": "..." }`
2. `node build-flclash.js` → 得到 `flclash-private.js`
3. 全文复制 → FlClash → 工具 → 覆写 → 新建 → 类型「脚本」→ 粘贴
4. 对订阅启用该覆写 → 开 TUN

**smart.js 改动后必须重新生成**（`node build-flclash.js`）并重新粘贴到手机，否则手机跑的还是旧逻辑。  
生成器头部注释有提醒；`flclash.js`（占位符版）也会一并重新生成提交，方便对照。

> **手机上「指定某个 App 走某个组」**：`listeners` 在 FlClash 模式会被跳过（手机没有自填代理端口这条路），  
> 用 `APP_PROXY.processes` 写**包名**，例如 `{ value: 'org.telegram.messenger', proxy: 'US' }`。  
> 详见 [应用级分流](#应用级分流指定应用走指定组)。最外层「哪些 App 进 VPN」由 FlClash 的「应用」页控制。

生成的文件**顶部自带构建元信息**，拿到任何一份 flclash 配置，看头部就知道它对应哪一版逻辑：

```
 * 构建时间    : 2026-11-04 15:09:27
 * 源文件      : smart.js  sha256:651817c34211  1191 行 / 55351 字节
 * 源码提交    : e4ad6dc
 * 构建命令    : node build-flclash.js
 * 住宅节点    : 🏠 住宅-JP  ->  61.***193:7012
```

同一份头部还会列出「手机端跳过了哪些桌面专属项」和「全局模式的坑」，  
所以不需要再回头翻 README 就能判断这份脚本是不是最新的。

> **FlClash 模式只改路由 + DNS 上游，不动系统级配置**（`FLCLASH_MODE`）。  
> 手机上内核跑在 App 的 VPN 服务里，监听端口 / IPv6 策略都由 App 统一管，脚本再覆盖就会打架。

|   |   |   |   |   |
| - | - | - | - | - |

> | 项                                 | 桌面端      | 手机端             | 原因                                          |
> | --------------------------------- | -------- | --------------- | ------------------------------------------- |
> | `dns.listen`（`0.0.0.0:1053`）      | 覆盖       | **跳过**          | 会和 FlClash 自己的 DNS/TUN 抢端口                  |
> | `dns` 上游                          | IP 型 DoH | **也换 IP 型 DoH** | 订阅自带的是明文 UDP 53，在阻断 UDP 53 的网络里会整体失效（见坑 15） |
> | `listeners`（7865 专用口）             | 开启       | **跳过**          | 手机上没有 Proxifier/Claude Code，白多一个失败点         |
> | `ipv6: false` / `domain-strategy` | 设置       | **跳过**          | 交给 App，避免 IPv6-only 网络下出问题                  |
> | `IP-ASN` 规则                       | 保留       | **跳过**          | 需要 ASN 数据库，手机上没有会让内核启动卡 75 秒（见坑 13）         |
>
> 手机端 DNS 只做三件事：`enhanced-mode` 保持 fake-ip、上游换成 IP 型 DoH、  
> 补上 `fake-ip-filter`（含 `geosite:cn`）。**绝不写 `listen`**。  
> 实测：节点域名 `hk02.poke-mon.xyz` / `ptxlv6-01.78778m.cn` 全部走  
> `https://1.12.12.12:443/dns-query` 解析，日志里零 `UDP 53`、零 `i/o timeout`。

> **手机端「全局模式」是个陷阱**——它走内核自建的 `GLOBAL` 组，第一个成员固定是 `DIRECT`。  
> 实测新配置启动后 `GLOBAL.now = DIRECT`，也就是说**切全局 = 全部直连，真实 IP 直接暴露**。  
> 要用全局模式，先在代理页把 `GLOBAL` 手动选成「住宅出口」；更推荐直接用规则模式  
> （末尾 `MATCH, CATCH` 已经兜住所有流量，`CATCH` 默认成员是 `AUTO`）。详见坑 16。

> **手机端 ChatGPT App 报「网络配置问题 / 非预期的 SSL 证书」**——先看「住宅出口」当前选中什么。  
> 如果显示 `REJECT`，说明默认选中项没生效（旧版脚本，或桌面端那种没有 `store-selected` 的客户端）。  
> 内核层面这个错误是「TLS 握手中被 10ms 掐断」，不是证书被中间人：
>
> ```bash
> # 桌面端复现/验证：now=REJECT 时必然 000
> curl -s -m 20 -x http://127.0.0.1:7890 -o /dev/null -w "%{http_code}\n" https://chatgpt.com/
> ```
>
> 现版本 `flclash-private.js` 已把 `住宅出口` 的默认选中项设成注入的住宅节点，重新粘贴即可。

> 为什么改成全量而非订阅自带规则：订阅的规则把 `github.com`/`x.com` 路由到它自己的  
> 「落云」组，该组的「自动选择」依赖订阅给的成员列表——订阅侧一坏（比如 url-test 选中  
> 占位节点）手机就跟着全挂。全量重建后这些域名走 `forGlobal/github → AUTO`（真节点，  
> 占位节点已剔），和电脑端行为一致。

> **手机上代理页看不到「GLOBAL / 全局」组，是正常的。** `GLOBAL` 是内核自建的策略组，  
> 不是配置里的组；FlClash 把「全局」做成一个模式开关，规则模式下不渲染它。  
> 手机上看到的 `住宅出口 / 前置-亚洲 / AUTO / AI / …` 就是全部，不缺东西。  
> 另注意 `forGlobal` 是**规则集名**（走 `AUTO`），和 `GLOBAL` 组无关，见坑 17。

**v2rayNG** 只能做「订阅 + 域名/IP 分流 + 分应用」，做不到 AI 走住宅——  
Xray 没有策略组和 `dialer-proxy` 的 UI，硬做要手写完整 JSON 且没有自动切换，不值得。

> 7865 专用端口（listeners）在手机上没有用途（没有 Proxifier/Claude Code），  
> 但保留无害；`RESIDENTIAL.dedicatedPort` 设 0 可关。

---


## 踩过的坑（改配置前必看）

1. **`.list` 文件绝对不能写行尾注释**
   `DOMAIN-SUFFIX,a.com  # 注释` 会被整体当成域名，规则静默失效、永不匹配。
   注释只能单独占一行。`ai-strict.list` 曾因此丢掉 23 条规则。

2. **规则引用不存在的组 → 整个配置校验失败**
   `proxy [X] not found`，内核直接起不来。改名前先确认规则同步改。

3. **组名/节点名不能重复**
   `duplicate group name` / `proxy xxx is the duplicate name` 都会让配置 failed。
   内核保留字只有 `DIRECT / REJECT / PASS / GLOBAL`，`AUTO`、`AI`、`CATCH` 都是普通名字，不冲突。

4. **规则集分两类源：第三方走国内镜像，本仓库走 raw**
   - 第三方上游（Loyalsoldier / ACL4SSR）→ `cdn.jsdmirror.com`。文件大、变动少，缓存延迟无所谓；
     jsDelivr 官方在国内多数网络 TLS 失败（实测 HTTP 000）。
   - 本仓库自己的规则集 → `raw.githubusercontent.com`。改得勤，镜像缓存会让人以为「改了没生效」：
     实测推送后 jsdmirror 仍返回旧版（75 条，仓库已是 80 条），加 `?v=<时间戳>` 也绕不过；raw 立即拿到 80 条。
   - 「内核启动前没有代理可用」这个担心是多余的：日志显示内核拉规则集走的是隧道
     （`dial AUTO ... --> raw.githubusercontent.com:443`），`github` / `forGlobal` 一直走 raw，加载正常。
   - 镜像缓存文件在 `work/ruleset/uxiew/`（属主 root），**用户态删不掉**；要立即刷新用
     `PUT /providers/rules/<名字>`（走 socket API），或改 `path` 换新文件名。

5. **mihomo 的 `http` 类型配 `dialer-proxy` 连不通**
   实测四种组合，只有 `type: socks5` + `dialer-proxy` 能通（`http` 无论跳板填组名还是具体节点都超时）。
   住宅节点一律用 `socks5`。

6. **策略组变空 ≠ 阻断，而是直连泄漏**
   组没有任何可用成员时，内核塞 `COMPATIBLE` 占位符，等价直连——经它出去的 IP 和本机一致。
   用 `filter` 动态收编节点的组，必须加 `REJECT` 兜底：节点全灭时阻断，而不是静默走真实 IP。
   **`REJECT` 必须在成员列表里**，否则组会变空；但**第一位是「默认选中项」**，
   所以第一位放 `nodeName`（FlClash 自动填）/ 留空回落 `REJECT`（桌面端手动选一次），
   顺序语义见上文「住宅出口组的成员顺序」。

7. **写死节点名 ≠ fail-closed，而是 fail-loud**
   组里 `proxies: ['某节点']` 是强引用，订阅改名后 `'X' not found`，**整份配置校验失败、应用起不来**。
   所以动态组用 `filter` + `REJECT` 兜底，而不是写死名字。

8. **过滤器里的单字关键词会误收（换订阅必踩）**
|  |  |  |  |  |
| --- | --- | --- | --- | --- |
   旧 JP 过滤器 `JP|日|東|东|…` 里的单字被新订阅的节点名击穿：
   `[东帝汶]₁`（含「东」）、`[尼日利亚]₂`（含「日」）、`🇦🇶 [到期: 2027年02月02日]`（含「日」）
   全进了「前置-亚洲」；AI 组（fallback）的第一个存活成员一度是到期信息节点。
|  |  |  |  |  |  |  |  |
| --- | --- | --- | --- | --- | --- | --- | --- |
   **只写多字关键词**：`日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉`。换订阅后先看一眼组里有没有怪东西。

9. **机场占位/信息节点必须从自动组里剔掉**
   「到期时间、剩余流量、官网、续费地址」这类占位节点很多是**能通的真代理**（探测 204 成功），
   url-test/fallback 会把它们当真节点选中——换订阅实测：AI 组被「🇦🇶 [到期…]」抢占；
   FlClash 上订阅自带的「自动选择」选中占位节点后**所有境外流量全挂**（表现为「无法访问 google」）。
   - `smart.js`：`INFO_NODE_PATTERN` 正则统一并进所有带 filter 组的排除逻辑（JS 侧）+ 前置组的
     `exclude-filter`（内核侧，两处都要，见 smart.js 注释）；
   - FlClash 走同一份 smart.js（`flclash.js` = 构建脚本拼接的全量版），同一套清洗自动生效。

10. **住宅节点的匹配词不能是「住宅」两个字**
    很多机场自带「家宽住宅」「住宅IP」节点。用 `住宅` 做 `nodePattern` 时，换订阅后
|  |  |
| --- | --- |
    实测 18 个机场住宅节点混进了「住宅出口」。改成 `🏠|WS-`，自己加的节点名固定带 🏠 前缀。

11. **`select` 组的默认值 = 第一个成员，而 `store-selected` 不一定开着**
    桌面端 Clash Party 的配置里有 `profile.store-selected: true`，手动选过就记住；
    手机 FlClash 上这份记忆可能不存在 → **每次启动都回到第一个成员**。
    如果第一位是 `REJECT`，表现就是「AI 站点全挂」：`chatgpt.com` 在 TLS 握手中
    被 10ms 掐断，ChatGPT App 把它翻译成**「网络配置问题 / 非预期的 SSL 证书」**
    （不是被中间人，也不是节点被封）。
    解决：把「默认选中项」显式写进第一位（`RESIDENTIAL.nodeName`，FlClash 构建时自动填）。

12. **`url-test` 的健康检查会依赖 `dialer-proxy` 指向的组，冷启动有竞态**
    用 url-test 组做「住宅节点自动择优」时，它的首次健康检查要经过「前置-亚洲」，
    而「前置-亚洲」自己也是 url-test。两者并发启动 → 住宅节点在跳板还没选出节点时
    就被判 0ms 失败 → 要等 `interval`（300s）才重测。实测开机后 5 分钟内 AI 全挂。
    结论：**依赖链式跳板的组不要用健康检查做默认选择**，用确定性的 `select` 默认值。

13. **`IP-ASN` 规则需要 ASN 数据库，手机上会让内核启动卡死**
    `IP-ASN,399358,住宅出口` 这条规则依赖 `ASN.mmdb`。桌面端 Clash Party 自带这个文件，
    手机 FlClash 不一定有——缺了它内核会在启动时尝试下载，实测：
    同一份配置，**含 IP-ASN 启动耗时 74.8 秒，去掉后 0.2 秒**。
    这 75 秒里 App 里所有节点都显示「失效」，用户看到的就是「全部不能用了」。
    现在 FlClash 模式会跳过 `IP-ASN`，只保留不依赖数据库的 `IP-CIDR` / `IP-CIDR6`。

14. **手机上别用桌面那套 `dns`（尤其 `listen: 0.0.0.0:1053`）**
    FlClash 的 TUN 自己管 DNS，脚本再覆盖会抢端口/绕成环。手机端 DNS 交给 App 与订阅；
    真出问题时在 FlClash 设置里开「DNS 覆盖」，而不是改脚本。

15. **网络阻断外部 UDP 53 时，域名型 DoH 会死在引导阶段（表现为「直连也超时」）**
    2026-11-04 实测：`dig @223.5.5.5` / `@119.29.29.29` / `@8.8.8.8` 全部 `i/o timeout`
    （连续 3 次都一样），但 `ping 223.5.5.5` 通、路由器 DNS `192.168.31.1` 能正常解析。
    原来的 `default-nameserver: ['223.5.5.5', …]` 配上 `nameserver: ['https://doh.pub/dns-query', …]`
    正好踩中死循环：**要解析 `doh.pub` 得先有 DNS，而唯一可用的入口是被阻断的 UDP 53**。
    症状不是「代理连不上」，而是**所有直连域名解析失败**——内核日志刷
    `dial DIRECT (match GeoSite/cn) … error: dns resolve failed: read udp …->223.5.5.5:53: i/o timeout`，
    用户感知就是「直连也超时、百度都打不开」。

    修法两条，缺一不可：
    - DoH 一律写成 **IP 型**：`https://1.12.12.12/dns-query`（DNSPod）。
      它不需要任何域名引导，加密查询也不存在明文污染——实测
      `www.google.com` / `www.youtube.com` / `x.com` / `github.com` 全返回真实 IP，
      `jp.jisu16.top → 140.238.53.202`（真实 Oracle 东京）。
    - `default-nameserver` 把路由器 DNS 放第一位兜底（`192.168.31.1`），后面再挂公网 IP，
      换到 UDP 53 正常的网络时仍然工作。

    顺带把 `https://1.1.1.1` / `https://8.8.8.8` 从 `nameserver` / `fallback` 里拿掉了：
    它们在本机直连是 `000`（5s 超时），只能经代理访问（3.2s，且 8.8.8.8 返回 400），
    留在主链路上只会拖慢每一次解析。

    排查命令：

    ```bash
    dig +time=2 +tries=1 @223.5.5.5 www.baidu.com        # 超时 → UDP 53 被阻断
    dig +time=2 +tries=1 @192.168.31.1 www.baidu.com     # 有结果 → 路由器 DNS 可用
    curl -s -H 'accept: application/dns-json' \
      'https://1.12.12.12/dns-query?name=www.baidu.com&type=A'   # 200 → IP 型 DoH 可用
    ```

    修复前后对比（同一台机器，经 `7890` 访问）：

    | 站点 | 修复前 | 修复后 |
    | --- | --- | --- |
    | `www.baidu.com` | 000（5.0s 超时） | **200（0.07s）** |
    | `www.taobao.com` | 000 | **200（0.12s）** |
    | `www.google.com` | 000 | **200（0.65s）** |
    | `www.youtube.com` | 000 | **200（0.57s）** |
    | `x.com` | 000 | **200（0.73s）** |

16. **`GLOBAL` 组的默认值不是「住宅出口」，而是 `DIRECT`（直连泄漏）**
    `GLOBAL` 是**内核自建**的组，成员顺序固定是 `DIRECT`、`REJECT`、然后才是所有节点和组——
    **配置里改不了这个顺序，override 也插不进去**。于是「`select` 默认 = 第一个成员」这条规律
    在 GLOBAL 上就变成了：**新设备 / 清缓存 / 重装 App 之后，切到全局模式 = 所有流量直连**。

    桌面端现在显示 `GLOBAL now=住宅出口`，那是 `profile.store-selected: true` 记住的**手动选择**，
    不是配置给的默认值。把 `~/Library/Application Support/mihomo-party/work/cache.db` 删掉就原形毕露。

    **手机端更直接**：用同一份 `flclash-private.js` 构建出的配置、`mode: global` 启动，实测

    ```
    GLOBAL type: Selector  now: DIRECT
    成员前 6: ['DIRECT', 'REJECT', '剩余流量：58.86 GB', '距离下次重置剩余：9 天', …]
    ```

    也就是说 FlClash 切「全局模式」= 全部直连。这一条对手机比桌面更危险，
    因为手机上没有任何缓存记住过你的手动选择。

    结论：**别依赖全局模式**。规则模式（默认）末尾有 `MATCH, CATCH` 兜底，行为等价且更细。
    真要用全局模式，切过去先确认选中项是 `住宅出口`（链路：`住宅出口 → 🏠 住宅-JP → 前置-亚洲 → 亚洲节点`）。
    注意全局模式下**所有**流量都烧住宅流量，机场订阅等于白买。

17. **`forGlobal` 和 `GLOBAL` 没有任何关系，只是名字撞了**
    - `forGlobal` 是**规则集**：`ruleset/global.yaml`（blackmatrix7 的 `Global.list`，33,214 行
      国外域名大全），命中后走 `RULE-SET,forGlobal, AUTO` → **`AUTO` 组**
    - `GLOBAL` 是**内核内置策略组**，配置里根本没有这个组，只在全局模式下生效

    看日志 / 查分流时别把两者搞混——`forGlobal` 命中的流量和住宅出口毫无关系。

18. **FlClash 的覆写「只追加规则、不替换规则」→ 换带规则的订阅必炸（`not found rule-set`）**

    FlClash 合并配置的地方（`core/profile_base.go` 的 `mergeProfileBase`）是这样写的：

    ```go
    // 最终 rules = 覆写脚本返回的 rules + 订阅原有 rules（追加，不是替换）
    rules, _ := appendRules(mappingValue(root, "rules"), mappingValue(profile, "rules"))
    ```

    而 `rule-providers` / `proxy-groups` 用的是**覆写结果**那一套。

    后果：订阅自带的 42 条规则会跟在我们 38 条规则后面，它们引用的
    `category-ads-all`、`awavenue-ads` 在我们的 provider 里根本不存在 →
    内核直接 `rule set [xxx] not found` 启动失败；订阅规则指向自己的组
    （`节点选择`、`🛑 广告拦截`…）时则是 `proxy [xxx] not found`。

    为什么以前没事：之前的订阅都是**纯节点**（0 条 rules），追加 0 条自然无感。
    138top 那种 594 条 DOMAIN 规则的订阅一样会炸，只是报的是 `proxy not found`。

    现在 `smart.js` 的 `FLCLASH_MODE` 分支会自动兜底：

    - 订阅 rules 引用到的规则集 → 有定义就沿用，没定义就指向 `ruleset/empty.list` 空集占位
    - 订阅 rules 引用到的组名 → 补一个 `proxies: ['REJECT']` 的占位组

    这些订阅规则永远不会命中（我们的 `MATCH, CATCH` 排在它们前面），所以手机上会多出
    几个名字眼熟、但只有一个 REJECT 成员的组，属正常现象。

19. **FlClash v0.9.1+ 会丢弃覆写生成的节点和分组**

    同一个 `mergeProfileBase` 里还有这一段：

    ```go
    var profileBaseSections = []string{"proxies", "proxy-groups", "sub-rules"}
    for _, key := range profileBaseSections {
        setMappingValue(root, key, mappingValue(profile, key)) // 用订阅原文覆盖覆写结果
    }
    ```

    也就是说 **v0.9.1 起，覆写脚本改不了节点和分组**，只能改 DNS / TUN / 其它配置，
    以及往订阅规则前面插规则。这直接废掉了本项目 FlClash 端「注入住宅节点 + 重建分组」的核心。

    `smart.js` 里加了骨架检测：脚本拿到的配置如果既没有节点也没有规则，说明走的是新路径，
    此时**只修 DNS、不重建任何东西**（否则所有规则都会指向不存在的组，直接断网）。

    想保留完整功能（住宅出口 / AI 分流），**FlClash 请留在 v0.8.98**；
    升级到 v0.9.x 后手机端只能拿到订阅原本的能力 + DNS 修复。

---

## 验证分流是否生效

```bash
# 看某个域名实际走了哪个出口（Claude 域名会走住宅）
curl -x http://127.0.0.1:7890 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='

# 验证住宅专用端口（7865）—— 访问任何域名都应返回住宅 IP
curl -x socks5h://127.0.0.1:7865 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='
```

> 别用 `api.ip.sb` 验证住宅出口——它走 `forGlobal → AUTO`，显示机场 IP 是正常的。

最直接的证据是内核日志，它会打出命中的规则和最终出口：

```bash
SOCK=$(ls -t /tmp/mihomo-party-*.sock | head -1)
curl -s --noproxy '*' --unix-socket "$SOCK" "http://localhost/logs?level=info" > /tmp/live.log &
sleep 1 && curl -x http://127.0.0.1:7890 -o /dev/null https://claude.ai/
# 输出形如：
#   [TCP] ... --> claude.ai:443 match RuleSet(aiStrict) using 住宅出口[🏠 住宅-JP]
```

组内实际成员 / 当前选择也可以直接查：

```bash
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['proxies'];print(p['住宅出口']['all'], p['住宅出口']['now'])"
```

---

## 其他

- **PAC**：系统代理 → 代理模式 PAC（`PAC.js`）
- **module**：iOS Shadowrocket 模块（`rules.module`）
