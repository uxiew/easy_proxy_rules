# 端口、分组与文件结构

这套配置由哪些入口、哪些策略组、哪些规则文件组成，以及它们为什么这么划分。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 端口分工

mihomo 会同时开几个入口，**用途完全不同**，配错会绕过规则或断流：

| 端口       | 类型                   | 是否走规则      | 流量去向                                    | 用在哪                             |
| -------- | -------------------- | ---------- | --------------------------------------- | ------------------------------- |
| **7890** | mixed（HTTP + SOCKS5） | ✅ 按规则匹配    | 国内 `DIRECT` / AI 服务商 `住宅出口` / 其余 `AUTO` | 系统代理、浏览器、日常默认                   |
| 7891     | SOCKS5               | ✅ 按规则匹配    | 同上                                      | 只支持 SOCKS5 的程序                  |
| 7892     | HTTP                 | ✅ 按规则匹配    | 同上                                      | 只支持 HTTP 代理的程序                  |
| **7865** | mixed（HTTP + SOCKS5） | ❌ **不走规则** | **强制「住宅出口」组**（静态住宅 IP）                  | Proxifier、Claude Code、不走系统代理的程序 |
| 7866+    | mixed                | ❌ 不走规则     | 由 `APP_PROXY.ports` 指定                  | 自建，见 [应用级分流](traffic-entry.md)                     |
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

## 代理分组

`smart.js` 只生成下面这些组，名字固定、不要在其他覆写里重复定义（重名会让内核直接启动失败）。

| 组                                  | 类型       | 成员                                   | 干嘛的                                                                                                     |
| ---------------------------------- | -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `🚀 全部节点`                          | select   | `DIRECT` + 全部节点                      | 手动挑单个节点，绕开所有自动逻辑                                                                                        |
| `住宅出口`                             | select   | **只有一台** `🏠 住宅-JP` + `REJECT`（`pinOnly: true`；`escapeToAI` 时才多一个 `AI`） | **AI 风控面专用出口**。`primary` 有值时组是**封闭**的：其它住宅 IP 只注入、不进组，指定 IP 挂了就落 `REJECT`，不存在「自动换到另一台住宅 IP」的路径；`primary` 留空才用 `include-all-proxies` + `filter: 🏠\|IP-` 动态收编（桌面首选手选，`store-selected` 记住） |
| `前置-亚洲`                            | url-test | 亚洲机场节点（日/港/台/韩/新/越/马/泰/菲）            | 住宅节点的 `dialer-proxy`，只负责「本机 → 机场亚洲 → 住宅」这一跳；`tolerance: 200` 防抖 |
| `AUTO`                             | fallback | **全部地区组**按顺序：`JP` → `SG` → `KR` → `HK` → `TW` → `US` → `UK` → `DE` → `FR` → `CA` → `EU` → `OT` | 默认出口。**按国家顺序**取第一个活的（日本优先），国家内部由地区组按延迟挑最快；所有地区组都挂才落到 `OT` |
| `AI`                               | fallback | 与 `AUTO` 同一批地区组                  | 机场 AI 组（Gemini、Google、中转站），**不含住宅节点**；顺序规则与 `AUTO` 相同 |
| `OT`                               | url-test | 只收**没有单列国家**的节点（土耳其/印度/巴西…）      | 「其它地区」兜底：`filter: '.*'` 再排除全部地区组，保证一个节点只属于一个组；**永远排在最后一位**，订阅里没有这类节点时整组被自动剔除 |
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
- **`住宅出口` 默认就是 `REJECT`，这是刻意的契约，不是 bug。** `primary` 留空时 `select` 的默认值  
  落在第一位 = `REJECT`（fail-closed：宁可断网，也不静默换出口）。新装、换配置、清掉 `cache.db`  
  之后，AI 站点会全部不通，**去面板里选一次住宅节点即可**，`profile.store-selected` 会记住；  
  之后内核重启、切换订阅都保持你的选择。想恢复「默认阻断」就再选回 `REJECT`。
- **`primary` 有值时组是「锁死一台」**（`pinOnly: true`）：成员只有 `[primary, REJECT]`，
  不再用 `include-all-proxies`，所以面板里看不到第二台住宅节点、也没有「换到另一台 IP」的路径。
  多台住宅 IP 的用法与切换方式见 [多台住宅 IP](configuration.md)。

### 三种组类型到底怎么切（`select` / `url-test` / `fallback`）

选错类型是「莫名其妙断线」的最主要来源，尤其对 ChatGPT / Claude 这种**常驻 WebSocket** 的连接。

| 类型 | 什么时候换节点 | 会不会自己换回来 | 对长连接的影响 |
| --- | --- | --- | --- |
| `select` | **永不自动换**，只认你手点的那个 | — | 最稳。节点挂了就断，必须人工救 |
| `url-test` | 每 `interval` 秒测全部成员，取延迟最低；切换条件是「当前节点失败」或「新节点比当前快 `tolerance` 以上」 | 会（只要它又变快） | 最抖。每次换节点，新建连接走新节点，老的常驻连接随旧节点一起废掉 |
| `fallback` | 按**书写顺序**永远用第一个活着的；当前节点失败才往下一个走 | **不会**。除非当前失败，否则永远不回到更靠前的节点 | 稳。顺序即优先级，代价是「好节点排在后面也用不上」 |

补充两条容易误解的：

- `tolerance` 是**防抖阈值**（新节点要比当前快这么多才切），不是「容差允许失败多少毫秒」。  
  `url-test` + `tolerance: 50` 在亚洲节点之间几乎等于「每轮都可能换」，对长连接是灾难；  
  因此 `前置-亚洲` 2026-11-07 已调到 `tolerance: 200`。
- `max-failed-times: N` 是「连续失败 N 次就提前触发一次健康检查」，让故障发现不用干等 `interval`。  
  它只加速发现，不改变切换阈值，正常延迟波动不会累计失败次数。

> 所以本项目的取向是：**跳板（`前置-亚洲`）用 `url-test` 但把 `tolerance` 调大**；  
> **AI 出口（`住宅出口`）用 `select` 由人决定**；`fallback` 用在「顺序有意义」的地方 ——  
> `NSFW`（顺序有意义、抖动无所谓）和 `AUTO`/`AI`（**国家顺序有意义**，见下节）。  
> 不要把 `住宅出口` 改成 `url-test`——它会为了几十毫秒的延迟差反复换出口 IP，直接触发账号风控。

### 国家优先（`REGION_PRIORITY`）

`AUTO` / `AI` 不是「谁快用谁」，而是**先按国家顺序，国家内部再挑最快**，而且要把**全部地区组**都串进来：

```
AUTO = fallback[ JP , SG , KR , HK , TW , US , UK , DE , FR , CA , EU , OT ]
                  ↑ 每个地区组自己仍是 url-test：国家内部挑最快
                  ↑ fallback 按书写顺序取第一个「活的」：国家之间按顺序优先
```

效果：只要日本还有一台活的就待在日本；日本全挂 → 新加坡 → 韩国 → 港台 → 美英德法加 → 欧洲其它
→ 最后才是 `OT`（土耳其/印度这类没有单列的国家）。

**只串 `JP/SG/KR`、把其余国家一起丢进 `OT` 混着选是不行的**：`OT` 是 `url-test`，
它会按延迟在港/台/美/英之间跳，出口国家随之漂移 —— 对 AI 账号来说就是「换国家登录」。
所以现在的分工是「每个国家一个档位，`OT` 只收没单列的国家」。

改顺序 / 换国家只动配置区（`smart.js` 第 0 部分 ⑥）：

```js
const REGION_PRIORITY = {
  enabled: true,
  targets: {
    // 越靠前越优先。全部地区组都要写进来，漏一个自检会直接报错
    AUTO: ['JP', 'SG', 'KR', 'HK', 'TW', 'US', 'UK', 'DE', 'FR', 'CA', 'EU'],
    AI:   ['JP', 'SG', 'KR', 'HK', 'TW', 'US', 'UK', 'DE', 'FR', 'CA', 'EU'],  // 可以和 AUTO 不同，比如只要 ['JP','US']
  },
  othersGroup: 'OT',            // 未单列国家的兜底；'' = 不生成（这些节点只能在「全部节点」里手选）
  interval: 120,
};
```

为什么不再用全量 `url-test`：实测日本 42ms、新加坡 28ms 时，全量 url-test **永远**挂在新加坡，
出口国家在 JP/SG 之间漂移；AI 站点会把「同一账号在不同国家登录」当成异常活动，反复要求验证码。
`fallback` 只判断活/死、不看延迟，日本慢 20ms 也仍然留在日本 —— 这是拿延迟换地域稳定，刻意的。

三点要知道：

- **`OT` 只是最后的兜底，不是第二梯队。** 它的成员是「没有单列国家的节点」，永远排在地区顺序之后；
  加新地区就把它加进 `targets`，`OT` 会自动把该地区排除掉，不用改 `OT`。
  订阅里全是常见国家时 `OT` 会变成空组并被自动剔除，**面板上根本看不到它**，这是正常的。
- **`lazy: false` 是必须的。** `groupBaseOption` 默认 `lazy: true`（第一次用到才测速），
  `fallback` 在没有任何健康数据时只能按内部顺序盲猜，冷启动第一波请求会落到错的地区 ——
  和 `前置-亚洲` 当初踩的是同一个坑。
- **订阅里没有某个地区时不会报错。** `keepRefs` 组在组装阶段会剔除「因为零节点被删掉的组」
  （如订阅只剩日本 → `AUTO` 自动变成 `fallback[JP]`），否则内核报 `proxy group AUTO: proxy KR not found`，
  整份配置加载失败。

「`AUTO` 必须覆盖全部地区组」已经写成构建期断言（`build-flclash.js` 的 `REGION_KEYS`）：
漏掉某个地区组、或者顺序被改乱，`node build-flclash.js` 会直接失败并指出缺了谁。

改完记得在 Clash Party 里点一次 ↻ 重新生成配置；验证：

```bash
SOCK=$(ls -t /tmp/mihomo-party-*.sock | head -1)
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies | \
python3 -c "import sys,json;d=json.load(sys.stdin)['proxies'];[print(g,d[g]['type'],d[g]['now']) for g in ('AUTO','AI','OT')]"
# AUTO Fallback JP
# AI Fallback JP
# OT URLTest <某个亚洲节点>
```

再跑一次真实请求确认出口国家（`https://api.ip.sb/geoip` 会回 `Osaka` 之类）。


---

## 文件结构

```
README.md                 仓库首页：快速开始 + 文档导航（详细内容都在 docs/）
docs/                     分项文档：配置 / 流量入口 / 客户端 / 坑 / 验证 / 安全
scripts/                  敏感信息扫描 + 名单同步（scan-sensitive / sync-sensitive）
.githooks/                pre-commit / commit-msg 本地拦截
.github/workflows/guard.yml  CI 全历史兜底扫描
smart.js                  主脚本：建组 + 生成规则（只有逻辑，没有域名清单）
flclash.js                FlClash 单文件覆写（占位符版，由 build-flclash.js 生成，勿手改）
build-flclash.js          生成器：凭据头 + smart.js 全文 → flclash.js / flclash-private.js（含构建期自检）
flclash-credentials.json  私有凭据（.gitignore 排除，生成私有版用）
flclash-private.js        生成的私有版（.gitignore 排除，粘贴到手机）
ruleset/
├── ai-strict.list        AI 服务商精确域名 → 住宅出口（含 Turnstile/auth0/Persona/遥测）
├── ai.yaml               AI 相关但走机场的部分（forAI：宽泛匹配、Google 全量、中转站）
├── residential.list      非 AI 的账号/支付/电商 → 住宅出口
├── direct-extra.list     补充直连域名
├── auto-extra.list       Google 通用资产 → AUTO
├── github.yaml           GitHub 域名 → AUTO
├── global.yaml           国外域名大全（forGlobal，33k 行，走 AUTO）
├── telegram.yaml         Telegram 网段/域名 → 代理
├── webrtc-guard.list     WebRTC/STUN 探测拦截（可选，默认不启用，见 `WEBRTC_GUARD`）
├── custom.list           自定义规则
├── nsfw.list             NSFW 规则
└── empty.list            FlClash 占位空集（订阅规则引用未知规则集时指向它，避免拒载）
residential.example.yaml  住宅节点覆写模板（Clash Party 用，只放凭据，不提交）
PAC.js                    系统代理「代理模式 PAC」用的脚本（浏览器按域名自动选代理）
rules.module              iOS Shadowrocket 模块
surge/                    Surge 配置模板（历史产物，与本项目 mihomo 主链路无关）
hermes.js                 Hermes 相关域名固定走同一条代理的规则片段（独立脚本，未接进 smart.js）
assets/                   图标资源
claude-guard/             Claude Code 启动守卫 + 环境体检（详见 [claude-guard/README.md](../claude-guard/README.md)）
├── claude-guard.zsh      函数库：~/.zshrc 只 source 这一个文件
├── guard.conf            集中配置：端口 / 超时 / 白名单 / node 路径
├── allowed-exit-ips      出口 IP 白名单（缺失或为空 → 拒绝启动）
├── config-check.mjs      生效配置「仅代理」判定（Node，零网络）
├── zshrc.snippet         ~/.zshrc 加载器片段（install / uninstall 用）
├── install.sh / uninstall.sh / selftest.zsh
└── claude-settings.example.json   settings.json 的 env 参考模板
```

### 两个 AI 清单为什么不能合并

一条 `RULE-SET` 只能指向一个策略组。住宅和机场是两个不同出口，**物理上必须是两个 rule-provider**。  
两者按「是否怕风控」划边界，不重复：

| 文件               | 目标组      | 装什么                                | 举例                                                        |
| ---------------- | -------- | ---------------------------------- | --------------------------------------------------------- |
| `ai-strict.list` | 住宅出口     | 有账号体系、会风控的服务商**精确域名**              | `claude.ai`、`challenges.cloudflare.com`、`withpersona.com` |
| `ai.yaml`        | AI 组（机场） | 宽泛 `KEYWORD`/`REGEX`、Google 全量、中转站 | `DOMAIN-REGEX,google.*`、`mcp.so`、`z.ai`                   |
