# FlClash（Android）与构建产物

手机端单文件覆写的生成、安装、构建期自检，以及手机独有的差异与陷阱。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## Android：FlClash / v2rayNG

两者内核完全不同，决定了一个能用、一个用不了：

|                     | FlClash                      | v2rayNG                                |
| ------------------- | ---------------------------- | -------------------------------------- |
| 内核                  | **mihomo**（和 Clash Party 同款） | Xray / v2fly                           |
| Clash YAML          | ✅ 订阅、内置编辑器、覆写脚本              | ❌ 完全不认                                 |
| 策略组 / rule-provider | ✅                            | ❌ 没有这个概念                               |
| `dialer-proxy` 链式   | ✅                            | 只能手写 Xray JSON 的 `sockopt.dialerProxy` |

**FlClash（推荐）** 用 [`flclash.js`](../flclash.js) —— **与桌面端同一份 smart.js 全量逻辑**：  
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

> `flclash.js` 占位符版头部带 `FLCLASH_NO_RESIDENTIAL = true`（没有凭据可注入），
> 会**强制**判成「没有家宽」→ 不建住宅链、AI 规则改投 `AI` 组，粘上去就能用。
> 这个标记优先级高于 `RESIDENTIAL.enabled`：公共版里把 `enabled` 改成 `true` 或 `'auto'`
> 也不会建住宅链（判定顺序见 [没有家宽怎么办](configuration.md)）。
> `flclash-private.js` 有真实凭据，走完整住宅链。

> **手机上「指定某个 App 走某个组」**：`listeners` 在 FlClash 模式会被跳过（手机没有自填代理端口这条路），  
> 用 `APP_PROXY.processes` 写**包名**，例如 `{ value: 'org.telegram.messenger', proxy: 'US' }`。  
> 详见 [应用级分流](traffic-entry.md#应用级分流指定应用走指定组)。最外层「哪些 App 进 VPN」由 FlClash 的「应用」页控制。

生成的文件**顶部自带构建元信息**，拿到任何一份 flclash 配置，看头部就知道它对应哪一版逻辑（以下是某次构建的输出，数值以实际文件头部为准）：

```
 * 构建时间    : 2026-11-15 15:03:52
 * 源文件      : smart.js  sha256:bed8be38241c  2096 行 / 114469 字节
 * 源码提交    : d1c45f3
 * 构建命令    : node build-flclash.js
 * 住宅节点    : 🏠 住宅-JP  ->  YOUR_HOST:0   (占位符，使用前请填真实凭据)
```

（上面是仓库里 `flclash.js` 的实际头部；`flclash-private.js` 同一行会显示真实
`server:port`，那是整个文件里唯一含凭据的地方。）

`sha256` 是**源指纹**：同一份 `smart.js` 生成的两份产物指纹必须一致；手机上贴的版本与仓库里
`flclash.js` 的指纹对不上，就说明该重新生成并粘贴了。

同一份头部还会列出「手机端跳过了哪些桌面专属项」和「全局模式的坑」，  
所以不需要再回头翻文档就能判断这份脚本是不是最新的。


---

## 构建期自检：不合格就不落盘

`node build-flclash.js` 先在内存里生成产物，再**用 `vm` 真的跑一遍**这个脚本，检查最终形态；
任何一条不过就 `exit 1`，**一个文件都不写出**——避免坏产物覆盖上一版可用的文件。

| 检查 | 防的事故 |
| --- | --- |
| 每条规则的落点都在组名 / 内置策略里 | 悬空组名 → 内核拒载整份配置（`proxy not found`） |
| `RULE-SET` 引用的 provider 都存在 | `not found rule-set` |
| 最后一条是 `MATCH` 兜底、规则数 ≥ 40 | 规则集丢失 / 只拉到半截 |
| `MUST_NOT_DIRECT` 里的域名首条命中不得是 `DIRECT` | 改个直连名单把 Claude 弄断网（`claude.ai`、`challenges.cloudflare.com`、`chatgpt.com`、`gemini.google.com`、`raw.githubusercontent.com`） |
| 国内直连（`GEOSITE,cn` / `GEOIP,CN`）排在 `forAI` 之前 | 国内站被 AI 组接走、烧流量 |
| 住宅组不含 `AI`、前置组不含 `DIRECT` | 住宅出口退化成「能切机场 IP 的普通组」、跳板被拆 |
| 占位符版不得生成「住宅出口」 | 公共版粘到手机上 AI 全被 `REJECT` |
| 规则集条目数不低于下限（约当前 70%） | 清单被清空 / 截断 |
| `ai-strict.list` 必须覆盖四个关键域名 | 漏一条就整类流量走机场 |

断言做的是**首条命中模拟**（展开本地 `.list` 按顺序匹配），所以改规则顺序也能测出来。
负向验证过：把 `ai-strict.list` 里的 `claude.ai` 注释掉，或把某条规则落点改成不存在的组名，
构建都会直接失败并列出具体原因。

---

## FlClash 模式：只改路由与 DNS 上游

**FlClash 模式只改路由 + DNS 上游，不动系统级配置**（`FLCLASH_MODE`）。  
手机上内核跑在 App 的 VPN 服务里，监听端口 / IPv6 策略都由 App 统一管，脚本再覆盖就会打架。


### 桌面 / 手机配置差异

| 项                                 | 桌面端      | 手机端             | 原因                                          |
| --------------------------------- | -------- | --------------- | ------------------------------------------- |
| `dns.listen`（`0.0.0.0:1053`）      | 覆盖       | **跳过**          | 会和 FlClash 自己的 DNS/TUN 抢端口                  |
| `dns` 上游                          | IP 型 DoH | **也换 IP 型 DoH** | 订阅自带的是明文 UDP 53，在阻断 UDP 53 的网络里会整体失效（见 [坑 15](troubleshooting.md)） |
| `listeners`（7865 专用口）             | 开启       | **跳过**          | 手机上没有 Proxifier/Claude Code，白多一个失败点         |
| `ipv6: false` / `domain-strategy` | 设置       | **跳过**          | 交给 App，避免 IPv6-only 网络下出问题                  |
| `IP-ASN` 规则                       | 保留       | **跳过**          | 需要 ASN 数据库，手机上没有会让内核启动卡 75 秒（见 [坑 13](troubleshooting.md)）         |

手机端 DNS 只做三件事：`enhanced-mode` 保持 fake-ip、上游换成 IP 型 DoH、  
补上 `fake-ip-filter`（含 `geosite:cn`）。**绝不写 `listen`**。  
实测：节点域名 `hk02.poke-mon.xyz` / `ptxlv6-01.78778m.cn` 全部走  
`https://1.12.12.12:443/dns-query` 解析，日志里零 `UDP 53`、零 `i/o timeout`。


## 全局模式是陷阱

它走内核自建的 `GLOBAL` 组，第一个成员固定是 `DIRECT`。  
实测新配置启动后 `GLOBAL.now = DIRECT`，也就是说**切全局 = 全部直连，真实 IP 直接暴露**。  
要用全局模式，先在代理页把 `GLOBAL` 手动选成「住宅出口」；更推荐直接用规则模式  
（末尾 `MATCH, CATCH` 已经兜住所有流量，`CATCH` 默认成员是 `AUTO`）。详见 [坑 16](troubleshooting.md)。


## ChatGPT App 报「网络配置问题 / 非预期的 SSL 证书」

先看「住宅出口」当前选中什么。  
如果显示 `REJECT`，说明默认选中项没生效（旧版脚本，或桌面端那种没有 `store-selected` 的客户端）。  
内核层面这个错误是「TLS 握手中被 10ms 掐断」，不是证书被中间人：

```bash
# 桌面端复现/验证：now=REJECT 时必然 000
curl -s -m 20 -x http://127.0.0.1:7890 -o /dev/null -w "%{http_code}\n" https://chatgpt.com/
```

现版本 `flclash-private.js` 已把 `住宅出口` 的默认选中项设成注入的住宅节点，重新粘贴即可。


## 为什么改成全量规则而非订阅自带规则

订阅的规则把 `github.com`/`x.com` 路由到它自己的  
「落云」组，该组的「自动选择」依赖订阅给的成员列表——订阅侧一坏（比如 url-test 选中  
占位节点）手机就跟着全挂。全量重建后这些域名走 `forGlobal/github → AUTO`（真节点，  
占位节点已剔），和电脑端行为一致。


## 代理页看不到 GLOBAL / 全局组

**手机上代理页看不到「GLOBAL / 全局」组，是正常的。** `GLOBAL` 是内核自建的策略组，  
不是配置里的组；FlClash 把「全局」做成一个模式开关，规则模式下不渲染它。  
手机上看到的 `住宅出口 / 前置-亚洲 / AUTO / AI / …` 就是全部，不缺东西。  
另注意 `forGlobal` 是**规则集名**（走 `AUTO`），和 `GLOBAL` 组无关，见 [坑 17](troubleshooting.md)。


## 附：为什么不用 v2rayNG

**v2rayNG** 只能做「订阅 + 域名/IP 分流 + 分应用」，做不到 AI 走住宅——  
Xray 没有策略组和 `dialer-proxy` 的 UI，硬做要手写完整 JSON 且没有自动切换，不值得。

7865 专用端口（listeners）在手机上没有用途（没有 Proxifier/Claude Code），  
但保留无害；`RESIDENTIAL.dedicatedPort` 设 0 可关。
