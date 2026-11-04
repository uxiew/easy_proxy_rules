# 代理分流规则配置

用于 **Clash Party / FlClash / mihomo** 的覆写（Override）脚本。整合主流规则集，自动生成代理分组，
内置 DNS fake-ip 与 DoH 分流，支持「国内直连 / AI 走静态住宅 IP / 其余自动择优」三层分流。

---

## 端口分工

mihomo 会同时开几个入口，**用途完全不同**，配错会绕过规则或断流：

| 端口 | 类型 | 是否走规则 | 流量去向 | 用在哪 |
|---|---|---|---|---|
| **7890** | mixed（HTTP + SOCKS5） | ✅ 按规则匹配 | 国内 `DIRECT` / AI 服务商 `住宅出口` / 其余 `AUTO` | 系统代理、浏览器、日常默认 |
| 7891 | SOCKS5 | ✅ 按规则匹配 | 同上 | 只支持 SOCKS5 的程序 |
| 7892 | HTTP | ✅ 按规则匹配 | 同上 | 只支持 HTTP 代理的程序 |
| **7865** | mixed（HTTP + SOCKS5） | ❌ **不走规则** | **强制「住宅出口」组**（静态住宅 IP） | Proxifier、Claude Code、不走系统代理的程序 |
| ~~9090~~ | HTTP | — | 控制 API（`external-controller`，默认留空关闭） | 调试 / 面板 |

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

> 端口由 `smart.js` 的 `RESIDENTIAL.dedicatedPort` 控制，设为 `0` 即关闭。
> 主入口端口（7890/7891/7892）由 Clash Party 的 `mihomo.yaml` 控制，本脚本不改。

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

| 文件 | 目标组 | 装什么 | 举例 |
|---|---|---|---|
| `ai-strict.list` | 住宅出口 | 有账号体系、会风控的服务商**精确域名** | `claude.ai`、`challenges.cloudflare.com`、`withpersona.com` |
| `ai.yaml` | AI 组（机场） | 宽泛 `KEYWORD`/`REGEX`、Google 全量、中转站 | `DOMAIN-REGEX,google.*`、`mcp.so`、`z.ai` |

---

## 关键配置项（`smart.js` 顶部）

| 配置 | 默认 | 作用 |
|---|---|---|
| `RESIDENTIAL.enabled` | `true` | 住宅出口总开关 |
| `RESIDENTIAL.aiStrict` | `true` | AI 服务商走住宅（推荐） |
| `RESIDENTIAL.allAI` | `false` | 整个 `forAI` 走住宅——**别开**，`ai.yaml` 里有 `DOMAIN-REGEX,google.*`，会连 `googlevideo.com`（YouTube 视频流）一起烧住宅流量 |
| `RESIDENTIAL.dedicatedPort` | `7865` | 住宅专用入口端口，`0` = 关闭 |
| `RESIDENTIAL.upstream.enabled` | `true` | 建「前置-日本」组：住宅节点的 `dialer-proxy` 指向它 |
| `RESIDENTIAL.nodePattern` | `🏠\|WS-` | 住宅节点名匹配。**自己加的节点必须带 🏠 前缀**，别用「住宅」二字匹配（机场自带住宅节点会混进来，见坑 9） |
| `RESIDENTIAL.upstream.filter` | 空（跟随 `smartGroups.JP`） | 上游节点名匹配词，默认 `日本\|JP\|Japan\|🇯🇵\|东京\|大阪\|…`（多字词，见坑 8），与地区组永远同步 |
| `TRAFFIC.domesticDirect` | `true` | 追加 `GEOSITE,cn → DIRECT`（`GEOIP,CN` 对 fake-ip 域名无效） |
| `TRAFFIC.appleDirect` | `true` | Apple 全家桶直连（iCloud 同步/App Store 原来走机场，最费流量） |

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

| 方案 | 写法 | 特点 |
|---|---|---|
| **任意日本节点（推荐，默认）** | `dialer-proxy: 前置-日本` | `url-test` 只收名字含「日本」的节点自动择优；全灭时落 `REJECT` 阻断，不会跳到美/新/韩 |
| 全机场自动 | `dialer-proxy: AUTO` | 最快，但中转会跳地区——出口 IP 没变，中转 ASN/延迟特征每次都变，对风控不友好 |
| 固定单节点 | `dialer-proxy: 直连-日本3` | 最稳，但节点一挂全断；且订阅改名后配置直接校验失败（组引用了不存在的节点） |

> 实测关键点：`REJECT` 放进 `url-test` **不会被抢占**——有活节点时选活节点，
> 只有全部失效才落到 REJECT。所以「自动择优」和「fail-closed」可以同时拿到。

### 住宅出口组的成员顺序：`nodeName` → `REJECT` → `AI`

`住宅出口` 是 `select` 组，成员 = 住宅节点（`filter: 🏠|WS-` 动态收编）+ 三个固定项，
`smart.js` 里写的是 `proxies: [RESIDENTIAL.nodeName, 'REJECT', 'AI']`。

`select` 组不会自动切换，但**选中的节点消失时内核回落到第一个成员**，所以顺序就是语义：

| 成员 | 作用 |
|---|---|
| `nodeName`（第一位） | **默认选中项**。桌面端留空（默认落 `REJECT`，手动选一次，`store-selected` 记住）；FlClash 构建时由钩子填成注入的节点名 → **手机开箱即用** |
| `REJECT`（第二位） | 回落哨兵：节点全没了就阻断，不会静默走机场，也不会变空组泄漏真实 IP |
| `AI`（第三位） | 仅作手动逃生口：住宅线路彻底挂了能在面板切过去临时用，不会被自动选中 |

| 情形 | 结果 |
|---|---|
| 选中住宅节点、节点正常 | 走住宅 ✅ |
| 选中住宅节点、节点挂了 | 连接失败（`select` 不切，符合 fail-closed） |
| 住宅节点从配置里消失（改名/删掉） | 回落第一位；`nodeName` 也没了就落 `REJECT` → 阻断 ✅ |
| filter 一个都没匹配到（组空） | 有 `REJECT` 兜底，不会空 ✅ |
| 住宅线路彻底挂了，想临时用机场 | 手动选 `AI` 应急 ✅ |

**为什么不用 `url-test` 自动择优**（试过，已回退）：`url-test` 的健康检查要经过
`dialer-proxy: 前置-日本`，而 `前置-日本` 自己也是 `url-test`。冷启动时两者并发，
住宅节点的第一次检查在 `前置-日本` 还没选出节点时执行 → 判 0ms 失败 → 要等
`interval`（300s）才重测。实测开机后 5 分钟内 AI 全挂。所以改成**确定性的默认选中项**。

**实测（mihomo v1.19.32，同一份配置只改兜底项，且不提供住宅节点）**：

| 兜底写法 | 组内实际成员 | 当前选择 `now` | 后果 |
|---|---|---|---|
| 不写（空组） | `["COMPATIBLE"]` | `COMPATIBLE` | 直连，真实 IP 泄漏 |
| `['AI']` | `["AI"]` | `AI` | 静默走机场 |
| `['REJECT']` | `["REJECT"]` | `REJECT` | 阻断 |
| `[nodeName, 'REJECT', 'AI']`（当前） | `["🏠 住宅-JP","REJECT","AI"]` | `🏠 住宅-JP` | 直接走住宅，无手动步骤 |

再验证「已选中住宅节点、随后节点消失」：`members` 变为 `["REJECT","AI"]`，
`now` 回落到 `REJECT`，**不是 `AI`**，也不是 `COMPATIBLE`；此时 `PUT` 切到 `AI`
返回 204、`now` 变 `AI`，逃生口确实可用。

**桌面端首次使用**：默认是 `REJECT`，AI 类站点打不开——在面板里把「住宅出口」
切到住宅节点一次即可，`store-selected: true` 会记住。
**手机端不需要这一步**（`nodeName` 已由构建脚本填好）。

**想要「住宅挂了就自动走机场」**：把 `smart.js` 里改成 `proxies: ['AI', 'REJECT']`，
代价是「节点从配置里消失」那种情况会静默走机场。不推荐。

### 加第二个住宅节点（切换式，0 行代码）

`住宅出口` 组靠 `filter: 🏠|WS-` 动态收编，新节点加进覆写就自动出现，UI 里手动切换：

1. 本地覆写的 `+proxies` 列表里加一段节点，**名字带 🏠 前缀**（如 `🏠 住宅-US`，不能用「住宅」二字当匹配词，见坑 10），`type: socks5`
2. `dialer-proxy` 可以整行删掉（本机直连 Webshare，非日本节点建议直连，绕日本反而慢）
3. UI 里把「住宅出口」切到新节点（`store-selected` 会记住）

不会泄漏到别处：`AUTO`/`AI`/`前置-日本` 的排除项都含 `🏠|WS-`。

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
自己收进去形成 dialer 环（实测复现过），`exclude-filter: 住宅|WS-` 必须带上。

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

### Proxifier

1. `Profile → Proxy Servers → Add`：`127.0.0.1:7865`，协议 **SOCKS5**
2. `Profile → Proxification Rules → Add`：Applications 选目标程序，Action 选刚建的代理
3. Default 规则设 `Direct`，别再套 7890

> ⚠️ Proxifier 与 Clash 的 **TUN 模式会冲突**（流量被两边重复拦截，容易成环）。开 TUN 时把 Proxifier 停掉。

### Android：FlClash / v2rayNG

两者内核完全不同，决定了一个能用、一个用不了：

| | FlClash | v2rayNG |
|---|---|---|
| 内核 | **mihomo**（和 Clash Party 同款） | Xray / v2fly |
| Clash YAML | ✅ 订阅、内置编辑器、覆写脚本 | ❌ 完全不认 |
| 策略组 / rule-provider | ✅ | ❌ 没有这个概念 |
| `dialer-proxy` 链式 | ✅ | 只能手写 Xray JSON 的 `sockopt.dialerProxy` |

**FlClash（推荐）** 用 [`flclash.js`](flclash.js) —— **与桌面端同一份 smart.js 全量逻辑**：
FlClash 没有覆写链（不能 script + YAML 叠加），所以用构建脚本把「凭据头 + smart.js 全文」
拼成单文件，组/规则和 Clash Party 完全一致（AUTO/AI/前置-日本/住宅出口/AI 走住宅/国内直连/占位节点清洗）。

生成与安装：

1. 凭据写进 `flclash-credentials.json`（`.gitignore` 已排除），格式：
   `{ "name": "🏠 住宅-JP", "server": "...", "port": 7012, "username": "...", "password": "..." }`
2. `node build-flclash.js` → 得到 `flclash-private.js`
3. 全文复制 → FlClash → 工具 → 覆写 → 新建 → 类型「脚本」→ 粘贴
4. 对订阅启用该覆写 → 开 TUN

**smart.js 改动后必须重新生成**（`node build-flclash.js`）并重新粘贴到手机，否则手机跑的还是旧逻辑。
生成器头部注释有提醒；`flclash.js`（占位符版）也会一并重新生成提交，方便对照。

> **FlClash 模式只改路由，不动系统级配置**（`FLCLASH_MODE`）。
> 手机上内核跑在 App 的 VPN 服务里，DNS / 监听端口 / IPv6 策略都由 App 统一管，
> 脚本再覆盖就会打架。以下四项在手机端自动跳过：
>
> | 项 | 桌面端 | 手机端 | 原因 |
> |---|---|---|---|
> | `dns`（含 `listen: 0.0.0.0:1053`） | 覆盖 | **跳过** | 会和 FlClash 自己的 DNS/TUN 抢端口 |
> | `listeners`（7865 专用口） | 开启 | **跳过** | 手机上没有 Proxifier/Claude Code，白多一个失败点 |
> | `ipv6: false` / `domain-strategy` | 设置 | **跳过** | 交给 App，避免 IPv6-only 网络下出问题 |
> | `IP-ASN` 规则 | 保留 | **跳过** | 需要 ASN 数据库，手机上没有会让内核启动卡 75 秒（见坑 13） |

> **手机端 ChatGPT App 报「网络配置问题 / 非预期的 SSL 证书」**——先看「住宅出口」当前选中什么。
> 如果显示 `REJECT`，说明默认选中项没生效（旧版脚本，或桌面端那种没有 `store-selected` 的客户端）。
> 内核层面这个错误是「TLS 握手中被 10ms 掐断」，不是证书被中间人：
> ```bash
> # 桌面端复现/验证：now=REJECT 时必然 000
> curl -s -m 20 -x http://127.0.0.1:7890 -o /dev/null -w "%{http_code}\n" https://chatgpt.com/
> ```
> 现版本 `flclash-private.js` 已把 `住宅出口` 的默认选中项设成注入的住宅节点，重新粘贴即可。

> 为什么改成全量而非订阅自带规则：订阅的规则把 `github.com`/`x.com` 路由到它自己的
> 「落云」组，该组的「自动选择」依赖订阅给的成员列表——订阅侧一坏（比如 url-test 选中
> 占位节点）手机就跟着全挂。全量重建后这些域名走 `forGlobal/github → AUTO`（真节点，
> 占位节点已剔），和电脑端行为一致。

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
   旧 JP 过滤器 `JP|日|東|东|…` 里的单字被新订阅的节点名击穿：
   `[东帝汶]₁`（含「东」）、`[尼日利亚]₂`（含「日」）、`🇦🇶 [到期: 2027年02月02日]`（含「日」）
   全进了「前置-日本」；AI 组（fallback）的第一个存活成员一度是到期信息节点。
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
    实测 18 个机场住宅节点混进了「住宅出口」。改成 `🏠|WS-`，自己加的节点名固定带 🏠 前缀。

11. **`select` 组的默认值 = 第一个成员，而 `store-selected` 不一定开着**
    桌面端 Clash Party 的配置里有 `profile.store-selected: true`，手动选过就记住；
    手机 FlClash 上这份记忆可能不存在 → **每次启动都回到第一个成员**。
    如果第一位是 `REJECT`，表现就是「AI 站点全挂」：`chatgpt.com` 在 TLS 握手中
    被 10ms 掐断，ChatGPT App 把它翻译成**「网络配置问题 / 非预期的 SSL 证书」**
    （不是被中间人，也不是节点被封）。
    解决：把「默认选中项」显式写进第一位（`RESIDENTIAL.nodeName`，FlClash 构建时自动填）。

12. **`url-test` 的健康检查会依赖 `dialer-proxy` 指向的组，冷启动有竞态**
    用 url-test 组做「住宅节点自动择优」时，它的首次健康检查要经过「前置-日本」，
    而「前置-日本」自己也是 url-test。两者并发启动 → 住宅节点在跳板还没选出节点时
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
