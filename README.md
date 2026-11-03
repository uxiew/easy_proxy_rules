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

### 住宅链路的上游怎么选（`dialer-proxy`）

出口 IP 由住宅节点决定（恒定），但**中转路径**由上游决定，三种选法：

| 方案 | 写法 | 特点 |
|---|---|---|
| **任意日本节点（推荐，默认）** | `dialer-proxy: 前置-日本` | `url-test` 只收名字含「日本」的节点自动择优；全灭时落 `REJECT` 阻断，不会跳到美/新/韩 |
| 全机场自动 | `dialer-proxy: AUTO` | 最快，但中转会跳地区——出口 IP 没变，中转 ASN/延迟特征每次都变，对风控不友好 |
| 固定单节点 | `dialer-proxy: 直连-日本3` | 最稳，但节点一挂全断；且订阅改名后配置直接校验失败（组引用了不存在的节点） |

> 实测关键点：`REJECT` 放进 `url-test` **不会被抢占**——有活节点时选活节点，
> 只有全部失效才落到 REJECT。所以「自动择优」和「fail-closed」可以同时拿到。

### 住宅出口组的成员顺序：REJECT 第一，AI 第二

`住宅出口` 是 `select` 组，成员 = `REJECT` + `AI` + 住宅节点（`filter: 住宅|WS-` 动态收编）。
**顺序即优先级**，`smart.js` 里写的是 `proxies: ['REJECT', 'AI']`。

关键机制：`select` 组不会自动切换，但**选中的节点消失时内核回落到第一个成员**。

| 情形 | `['AI', ...]`（AI 在前） | `['REJECT', 'AI']`（当前） |
|---|---|---|
| 选中住宅节点、节点正常 | 走住宅 ✅ | 走住宅 ✅ |
| 选中住宅节点、节点挂了 | 连接失败（select 不切） | 连接失败（一致） |
| 住宅节点从配置里消失（改名/删掉） | **静默回落 AI → 走机场，出口 IP 变了都不知道** ❌ | 回落 REJECT → 阻断 ✅ |
| filter 一个都没匹配到（组空） | 空组 → `COMPATIBLE` → **直连泄漏真实 IP** ❌ | 有兜底项，不会空 ✅ |
| 住宅线路彻底挂了，想临时用机场 | 自动就切过去了 | 手动在面板选 `AI` 应急 ✅ |

所以 `REJECT` 不是「一个节点」，而是**回落哨兵**：保证这个组任何时候都不会空、
也不会悄悄退化成直连或机场。`AI` 排在第二位，只作**手动**逃生口，不会被自动选中。

**实测（mihomo v1.19.32，同一份配置只改兜底项，且不提供住宅节点）**：

| 兜底写法 | 组内实际成员 | 当前选择 `now` | 后果 |
|---|---|---|---|
| 不写（空组） | `["COMPATIBLE"]` | `COMPATIBLE` | 直连，真实 IP 泄漏 |
| `['AI']` | `["AI"]` | `AI` | 静默走机场 |
| `['REJECT']` | `["REJECT"]` | `REJECT` | 阻断 |
| `['REJECT', 'AI']`（当前） | `["REJECT", "AI"]` | `REJECT` | 阻断，但可手动切 AI |

再验证「已选中住宅节点、随后节点消失」：先 `PUT /proxies/住宅出口` 选中 `🏠 住宅-JP`
（`now` 变为该节点，`cache.db` 落盘），再换用无住宅节点的配置重启 ——
`members` 变为 `["REJECT","AI"]`，`now` 回落到 `REJECT`，**不是 `AI`**，也不是 `COMPATIBLE`；
此时再 `PUT` 切到 `AI` 返回 204、`now` 变 `AI`，说明逃生口确实可用。

**代价**：首次使用（还没有记忆的选择）默认就是 `REJECT`，AI 类站点会打不开——
在面板里把「住宅出口」切到住宅节点一次即可，`store-selected: true` 会记住。

**想要「住宅挂了就自动走机场」**：把 `smart.js` 里改成 `proxies: ['AI', 'REJECT']`
（AI 挪到第一位），代价是上面表格第三行那种情况会静默走机场。不推荐。

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
   **`REJECT` 还必须写在第一位**——`select` 组在选中项消失时回落到**第一个**成员，
   放第二位等于没放（第一个成员会先被选中）。

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
