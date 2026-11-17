# 踩过的坑（改配置前必看）

24 条实测踩坑记录，按编号引用；改规则、换订阅、换客户端之前先扫一遍。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 坑 1 · `.list` 文件绝对不能写行尾注释

`DOMAIN-SUFFIX,a.com  # 注释` 会被整体当成域名，规则静默失效、永不匹配。
注释只能单独占一行。`ai-strict.list` 曾因此丢掉 23 条规则。

## 坑 2 · 规则引用不存在的组 → 整个配置校验失败

`proxy [X] not found`，内核直接起不来。改名前先确认规则同步改。

## 坑 3 · 组名/节点名不能重复

`duplicate group name` / `proxy xxx is the duplicate name` 都会让配置 failed。
内核保留字只有 `DIRECT / REJECT / PASS / GLOBAL`，`AUTO`、`AI`、`CATCH` 都是普通名字，不冲突。

## 坑 4 · 规则集分两类源：第三方走国内镜像，本仓库走 raw

- 第三方上游（Loyalsoldier / ACL4SSR）→ `cdn.jsdmirror.com`。文件大、变动少，缓存延迟无所谓；
  jsDelivr 官方在国内多数网络 TLS 失败（实测 HTTP 000）。
- 本仓库自己的规则集 → `raw.githubusercontent.com`。改得勤，镜像缓存会让人以为「改了没生效」：
  实测推送后 jsdmirror 仍返回旧版（75 条，仓库已是 80 条），加 `?v=<时间戳>` 也绕不过；raw 立即拿到 80 条。
- 「内核启动前没有代理可用」这个担心是多余的：日志显示内核拉规则集走的是隧道
  （`dial AUTO ... --> raw.githubusercontent.com:443`），`github` / `forGlobal` 一直走 raw，加载正常。
- 镜像缓存文件在 `work/ruleset/uxiew/`（属主 root），**用户态删不掉**；要立即刷新用
  `PUT /providers/rules/<名字>`（走 socket API），或改 `path` 换新文件名。

## 坑 5 · `type: http` 配 `dialer-proxy`：**能用**，但只从 v1.19.x 起

> 2026-11-17 复查并推翻原结论。原文写的是「四种组合只有 socks5 能通，住宅节点一律用 socks5」——
> 那是更早的内核版本实测的结果，现在不成立，照抄会让人白白放弃现成的住宅订阅。

现在的实测（mihomo v1.19.32 darwin/arm64，本地起假前置抓连接）：

| 落地类型 | `dialer-proxy` 指向 | 结果 |
| --- | --- | --- |
| `http` | 具体节点（socks5） | ✅ 前置收到 `CONNECT <住宅网关>`，链式代理生效 |
| `http` | 策略组（`url-test`） | ✅ 同上，连组的健康检查都走前置 |
| `http` | 不存在的名字 | ❌ **`level=fatal Parse config error`，整份配置加载失败** |

怎么自己复核（起内核 + 假前置，看前置有没有收到连接）：见
[验证分流是否生效](verification.md) 的「`dialer-proxy` 到底走没走」。

还剩一条没变的：**`dialer-proxy` 写错名字是致命的**。不是「这条链不生效」，
而是 `Parse config error` —— 内核直接起不来，客户端只表现成「全部节点超时」。
所以本脚本在最后一步统一扫一遍悬空引用（见坑 28）。

要不要给 http 节点挂跳板，判据不是类型，是**这一跳有没有用**：
本机与住宅同国就直连（`upstream.inject: 'strip'`），跨洲才挂前置。

## 坑 6 · 策略组变空 ≠ 阻断，而是直连泄漏

组没有任何可用成员时，内核塞 `COMPATIBLE` 占位符，等价直连——经它出去的 IP 和本机一致。
用 `filter` 动态收编节点的组，必须加 `REJECT` 兜底：节点全灭时阻断，而不是静默走真实 IP。
**`REJECT` 必须在成员列表里**，否则组会变空；但**第一位是「默认选中项」**，
所以第一位放 `primary`（FlClash 自动填）/ 留空回落 `REJECT`（桌面端手动选一次），
语义见 [住宅出口组：只锁一台，挂了就 `REJECT`](configuration.md)。

## 坑 7 · 写死节点名 ≠ fail-closed，而是 fail-loud

组里 `proxies: ['某节点']` 是强引用，订阅改名后 `'X' not found`，**整份配置校验失败、应用起不来**。
所以动态组用 `filter` + `REJECT` 兜底，而不是写死名字。

## 坑 8 · 过滤器里的单字关键词会误收（换订阅必踩）

旧 JP 过滤器 `JP|日|東|东|…` 里的单字被新订阅的节点名击穿：
`[东帝汶]₁`（含「东」）、`[尼日利亚]₂`（含「日」）、`🇦🇶 [到期: 2027年02月02日]`（含「日」）
全进了「前置-亚洲」；AI 组（fallback）的第一个存活成员一度是到期信息节点。

**只写多字关键词**：`日本|JP|Japan|🇯🇵|東京|东京|大阪|埼玉`。换订阅后先看一眼组里有没有怪东西。

## 坑 9 · 机场占位/信息节点必须从自动组里剔掉

「到期时间、剩余流量、官网、续费地址」这类占位节点很多是**能通的真代理**（探测 204 成功），
url-test/fallback 会把它们当真节点选中——换订阅实测：AI 组被「🇦🇶 [到期…]」抢占；
FlClash 上订阅自带的「自动选择」选中占位节点后**所有境外流量全挂**（表现为「无法访问 google」）。

- `smart.js`：`INFO_NODE_PATTERN` 正则统一并进所有带 filter 组的排除逻辑（JS 侧）+ 前置组的
  `exclude-filter`（内核侧，两处都要，见 smart.js 注释）；
- FlClash 走同一份 smart.js（`flclash.js` = 构建脚本拼接的全量版），同一套清洗自动生效。

## 坑 10 · 「住宅」二字能匹配，但**只有在锁死一台时**才安全

2026-11 之前这条坑的结论是「别用『住宅』做匹配词」：很多机场自带「家宽住宅」「住宅IP」节点，
换订阅后实测 18 个机场住宅节点混进了「住宅出口」，组从 `select` 变成一堆共享 IP 的候选。
所以当时把 `nodePattern` 收窄成 `🏠|IP-`。

收窄的代价在「订阅自带家宽节点」这个场景里暴露了：节点叫 `静态｜ISP｜家宽 01`，
一个都不命中 → 住宅链建了但组里只有 `REJECT` → AI 类站点全打不开，而且日志只有一行
「已启用」，看起来一切正常。

现在的结论是**分层**，而不是二选一：

- `nodePattern` 放**宽**（家宽/住宅/静态/ISP/RESI 都收）；
- 真正的护栏是 `pinOnly: true` + `primary` 锁一台：命中的多台进不了「住宅出口」，
  只会被排除出地区组/`AUTO`/`前置-亚洲`（这正是我们要的，住宅节点不该当跳板）；
- **一旦你把 `pinOnly` 改成 `false`，必须把 pattern 收窄回 `🏠|IP-`** —— 那时每个命中项都能被
  选中，坑 10 的原始事故就回来了。

判据很简单：看「住宅出口」的 `all`。锁定成功 = `[唯一节点, REJECT]`；出现第二台 = 哪儿没锁住。

## 坑 11 · `select` 组的默认值 = 第一个成员，而 `store-selected` 不一定开着

桌面端 Clash Party 的配置里有 `profile.store-selected: true`，手动选过就记住；
手机 FlClash 上这份记忆可能不存在 → **每次启动都回到第一个成员**。
如果第一位是 `REJECT`，表现就是「AI 站点全挂」：`chatgpt.com` 在 TLS 握手中
被 10ms 掐断，ChatGPT App 把它翻译成**「网络配置问题 / 非预期的 SSL 证书」**
（不是被中间人，也不是节点被封）。
解决：把「默认选中项」显式写进第一位（`residential.primary`，FlClash 构建时自动填）。

## 坑 12 · `url-test` 的健康检查会依赖 `dialer-proxy` 指向的组，冷启动有竞态

用 url-test 组做「住宅节点自动择优」时，它的首次健康检查要经过「前置-亚洲」，
而「前置-亚洲」自己也是 url-test。两者并发启动 → 住宅节点在跳板还没选出节点时
就被判 0ms 失败 → 要等 `interval`（300s）才重测。实测开机后 5 分钟内 AI 全挂。
结论：**依赖链式跳板的组不要用健康检查做默认选择**，用确定性的 `select` 默认值。

这也是「指定住宅 IP 挂了就该自动 `REJECT`」不用 `fallback[pin, REJECT]` 实现的原因：
`fallback` 会在首次检查失败时立刻退到 `REJECT`，而那次失败只是跳板还没就绪，不是住宅真的挂了 ——
结果就是为了「秒级容错」换来开机几分钟全断。现在的做法是 `select` 锁一台：
失败表现为连接失败（流量一样没出去、出口也没变），代价只是要等超时。

## 坑 13 · `IP-ASN` 规则需要 ASN 数据库，手机上会让内核启动卡死

`IP-ASN,399358,住宅出口` 这条规则依赖 `ASN.mmdb`。桌面端 Clash Party 自带这个文件，
手机 FlClash 不一定有——缺了它内核会在启动时尝试下载，实测：
同一份配置，**含 IP-ASN 启动耗时 74.8 秒，去掉后 0.2 秒**。
这 75 秒里 App 里所有节点都显示「失效」，用户看到的就是「全部不能用了」。
现在 FlClash 模式会跳过 `IP-ASN`，只保留不依赖数据库的 `IP-CIDR` / `IP-CIDR6`。

## 坑 14 · 手机上别用桌面那套 `dns`（尤其 `listen: 0.0.0.0:1053`）

FlClash 的 TUN 自己管 DNS，脚本再覆盖会抢端口/绕成环。手机端 DNS 交给 App 与订阅；
真出问题时在 FlClash 设置里开「DNS 覆盖」，而不是改脚本。

## 坑 15 · 网络阻断外部 UDP 53 时，域名型 DoH 会死在引导阶段（表现为「直连也超时」）

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

## 坑 16 · `GLOBAL` 组的默认值不是「住宅出口」，而是 `DIRECT`（直连泄漏）

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

## 坑 17 · `forGlobal` 和 `GLOBAL` 没有任何关系，只是名字撞了

- `forGlobal` 是**规则集**：`ruleset/global.yaml`（blackmatrix7 的 `Global.list`，33,214 行
  国外域名大全），命中后走 `RULE-SET,forGlobal, AUTO` → **`AUTO` 组**
- `GLOBAL` 是**内核内置策略组**，配置里根本没有这个组，只在全局模式下生效

看日志 / 查分流时别把两者搞混——`forGlobal` 命中的流量和住宅出口毫无关系。

## 坑 18 · FlClash 的覆写「只追加规则、不替换规则」→ 换带规则的订阅必炸（`not found rule-set`）

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

## 坑 19 · FlClash v0.9.1+ 会丢弃覆写生成的节点和分组

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

## 坑 20 · `directExtra` 的 `co.jp` 会把 Google 日本站一起直连

`ruleset/direct-extra.list` 最后一行是 `DOMAIN-SUFFIX,co.jp`，本意是「日本站点直连」。
它同时命中 Google 的日本域名，而 Google 在国内网络下直连必挂，实测：

```text
--> accounts.google.co.jp:443  match RuleSet(directExtra) using DIRECT
    error: dial tcp 47.88.58.234:443: connect: connection refused
--> www.google.co.jp:443       match RuleSet(directExtra) using DIRECT
    error: dial tcp 31.13.80.54:443: i/o timeout
```

47.88.58.234 是阿里云段、31.13.80.54 是 Facebook 段，都是污染解析的产物。
同 TLD 的 `www.yahoo.co.jp` 也命中 `directExtra`、但返回 200（不在封锁名单里），
所以症状很具迷惑性：**`.co.jp` 都能开，只有 Google 的 `.co.jp` 打不开**。

修复是在 `RULE-SET,directExtra` **之前**插一条 `DOMAIN-SUFFIX,google.co.jp, AI`，
组与 `RULE-SET,google, AI` 保持一致，账号登录在 `.com` / `.co.jp` 之间跳转时不换出口 IP。
方向别搞反：`direct-extra.list` 是「整份 → DIRECT」的规则集，**没法在文件内部写例外**，
只改 list 是无效的，例外必须落在规则链上、且优先级高于 `RULE-SET,directExtra`。

## 坑 21 · `'auto'` 仍有效，但判的是「运行时可见性」不是「有没有家宽」→ 有家宽也判成没有

`'auto'` 模式一直都在，从没被删掉；2026-11-13 只是把「判成无家宽之后做什么」
统一成和 `false` 一样（两组都不生成、住宅节点移除、规则改投 `AI`、7865 改绑 `AI`）。
它的判据是「脚本运行时 `config.proxies` 里有没有名字匹配 `nodePattern` 的节点」
（或 FlClash 私有版注入的 `residential.primary`），**不是**「你有没有配家宽」；
而 Clash Party 是按覆写列表顺序执行的：`residential.yaml` 排在 `smart.js` **之后**时，
脚本跑到这一步还没见过住宅节点 → 判成无家宽 → 住宅链整条不建，
AI 流量静默退回机场（出口 IP 从住宅变成机场共享 IP，**不报任何错**）。

所以默认改成 `enabled: true`：`primary` 留空时组靠内核级 `include-all-proxies + filter` 收编，
后置覆写注入的 `🏠 住宅-JP` 照样进组，**排前排后都一样**；`primary` 有值（FlClash 构建 /
桌面手写）时组是锁定的，成员只有那一台 + `REJECT`，见 [多台住宅 IP](configuration.md)。
只有「订阅里自带住宅节点、脚本运行时就能看到」的场景才用 `'auto'`；
确实没有家宽就用 `false`，别指望 `auto` 替你判断。
两个额外边界：占位符版 `FLCLASH_NO_RESIDENTIAL` 会无条件覆盖 `'auto'`；
不跑 `main()` 的纯数据提取路径下 `'auto'` 等同 `true`（完全不探测），
详见 [auto 还有效吗](configuration.md)。

## 坑 22 · 别为了兜外部手写规则，把住宅组改成「成员转发 AI」

2026-11-13 走过一次弯路：为了修复用户覆写里手写的
`DOMAIN, challenges.cloudflare.com, 住宅出口`（组被删掉后报 `rules[0] ... not found`），
做成「组名常驻 + 成员塞 `AI` 纯转发」，并把 `前置-亚洲` 降级成惰性 `select`：

```text
住宅出口 = [AI, REJECT]                 ← 变成能切到机场共享 IP 的普通组
前置-亚洲 = select [首个亚洲节点, DIRECT] ← 亚洲节点全丢，还混进 DIRECT
```

两处都破坏了原设计：住宅出口只允许「住宅 / 阻断」，前置组出现 DIRECT 等于拆掉机场跳板。
正确修法是**改外部覆写**：`ruleset/ai-strict.list` 里已有
`DOMAIN-SUFFIX,challenges.cloudflare.com` 和 `DOMAIN-SUFFIX,withpersona.com`，
把手写的 `DOMAIN,` 行删掉即可。节点上的 `dialer-proxy: 前置-亚洲` 也不需要靠
「把前置组偷偷建回来」兜底：`enabled: false` 时脚本会把这类住宅链节点直接移除，
两个组名彻底不存在，符合「没有家宽就不需要住宅和前置组」。

## 坑 23 · Android 上 `detectradar` 报 WebRTC/DNS 暴露，不是配置写错，是平台边界

同一份 `smart.js`，桌面 Clash Party 下 `detectradar` 全绿，手机 FlClash 下报 WebRTC 与
DNS 暴露。原因不在 YAML，也不在构建产物：

- 手机内核跑在 App 的 `VpnService` 里，只有被 VPN 接管的流量才受规则约束，
  **没进内核的 UDP 拦不住**（规则再严也无解）；
- 系统「私人 DNS」走 DoT/853、浏览器自带 DoH 时，解析根本不经过配置里的
  `nameserver`，`dns-hijack: any:53` 也管不到 853/443 上的加密 DNS；
- `tun.enable` 开着 ≠ 泄漏已修好，`dns-hijack` 生效 ≠ 浏览器不用自己的 DoH。

要治只能在 App/系统层收口（关掉系统私人 DNS、关浏览器安全 DNS、确认 UDP 进内核），
规则层能做的只有「把已知 STUN 端口拒掉」，见 [WebRTC 探测要不要拦](configuration.md)。

## 坑 24 · 多台住宅 IP ≠ 自动容错：`select` 回落第一个成员，会悄悄换出口

给「住宅出口」配了多台静态住宅 IP 后，很容易以为「一台挂了会自动切下一台」。`select`
确实不做健康检查，不会按延迟切；但**选中的那台从配置里消失时，内核回落到组的第一个成员**。
用旧的 `include-all-proxies + filter` 收编时，第一个成员可能就是另一台住宅节点 ——
出口 IP 从日本悄悄变成美国，内核日志只有一句「已切换」，账号侧看到的是异地登录。

2026-11-16 起默认 `residential.pinOnly: true`：`primary` 有值时组成员封闭成
`[primary, REJECT]`，其它住宅节点根本不进组，指定 IP 挂了/消失只能落 `REJECT`。
多台 IP 的正确用法是「一台主力 + 若干备用」，换机就是把 `primary` 改成另一台的名字
（桌面改 `smart.js` 配置区，手机改凭据文件里的 `primary`）后重载，见 [多台住宅 IP](configuration.md)。

> 想让节点「被判死后」立刻 `REJECT` 而不是等超时，只有 `fallback[pin, REJECT]`，
> 但那会把上面的坑 12（冷启动竞态）重新引回来，所以没做。

## 坑 25 · 前置/上游按「大洲」拆：多出来的不是容错，是空组和绕路

「住宅在别的洲，是不是该按七大洲各建一个前置组」——试错的两种走法都踩过：

1. **空组变泄漏源**：订阅里通常只有亚洲/北美/欧洲有节点，南极洲、非洲、南美是 0 台。
   `url-test` 组没有成员时内核塞 `COMPATIBLE`（= 直连，坑 6）。
   要安全就得每组再塞 `REJECT` 兜底 —— 7 个组 7 个兜底，面板噪音换来 0 收益。
2. **跨洋前置是两次长途**：住宅在日本却把前置换成北美，链路变成
   `本机 →(跨太平洋)→ 北美 →(再跨太平洋)→ 日本住宅`，`L1+L2` 直接翻倍。
   反过来住宅在美国、前置用亚洲，也是同一条跨洋路段，只是换了个方向。

结论：**前置跟着住宅走，不跟着「哪里快」走**。按「住宅所在国」建一个组就够，
第二台住宅在别的洲再加第二个。详见 [上游要不要按大洲拆](configuration.md)。

> 附带的坑：判断「哪台跳板快」不能看面板上前置组显示的 ms ——
> 那是 `本机 → 前置` 的延迟，不含 `前置 → 住宅`。住宅在东京时，
> 一台 40ms 的曼谷跳板可能比 60ms 的大阪跳板**更慢**。要测就测住宅节点本身（走完整链）。

## 坑 26 · 锁住宅节点只能用「名字」，序号和端点都不行

想锁一台住宅，直觉上会想「写第 1 台」或「写 server/port」，两种都不成立：

- **序号**：mihomo 的 `proxies` 没有 id，节点身份只有 `name`。写「第 N 个命中」等于把出口
  交给**订阅下发的顺序**：换订阅、机场按延迟重排、前面插一条「到期提醒」占位节点，
  第 1 台就变成另一国 IP，而且**锁错了不报错**。
- **端点**（`server:port`）：有的订阅把几百个 IP 挂在同一个网关上，端点一次命中几百台，
  等于还是没锁。

所以 `primary` 只接受节点名：先完整匹配，再按 includes 匹配，且必须**恰好命中 1 台**，
否则按 `pinMiss` 处理（默认 `REJECT`）。见 [锁哪一台](configuration.md)。

## 坑 27 · 订阅自带的家宽节点没有 `dialer-proxy`，等于「本机直连海外住宅 IP」

自己写在 `+proxies` 里的住宅节点，`type` / `dialer-proxy` / `udp` 都是手写的；
**订阅给的家宽节点不是**——订阅只保证「这个节点能连」，它不知道你要不要跳板。
于是很容易出现「配了住宅链，实际却是裸直连海外住宅」：能通，但慢、抖，还以为是住宅商的问题。

2026-11-17 起 `residential.upstream.inject`（默认 `true`）会给命中的节点补上 `dialer-proxy`，
server/port/密码一个字不动；`type: http` 的跳过（坑 5）。
本机已经在住宅同城/同国时，这一跳是纯绕路 → 把 `inject` 设 `false`，日志里就不会再出现
`已给 N 个订阅自带住宅节点补上 dialer-proxy`。

## 坑 28 · 脚本重建 `proxy-groups` 会把订阅自己的组丢掉，而节点的 `dialer-proxy` 还指着它

订阅自带住宅节点的写法常常是这样的：

```yaml
proxies:
  - name: US-静态01🇺🇸「梅薩」 168.158.211.179
    type: http
    server: gateway.example.com
    port: 44445
    dialer-proxy: 前置-机场      # ← 订阅自己建的组
proxy-groups:
  - name: 前置-机场              # ← 订阅自己建的组
    type: select
```

本脚本要重建分组（AUTO / AI / 地区组 / 住宅出口），而重建是**整体覆盖**。
订阅那个 `前置-机场` 一旦被覆盖掉，204 个住宅节点的 `dialer-proxy` 就全部悬空——
按坑 5 的实测，这不是「跳过这个字段」，是内核 `Parse config error` 直接起不来。

2026-11-17 起：名字不冲突的订阅组**一律保留**（成员清洗成「本配置里真实存在的名字」，
动态收编组为空时塞 `REJECT` 而不是让它变 `COMPATIBLE`），开关是文件顶部的
`keepSubGroups`。最后还会再扫一遍所有 `dialer-proxy`：指向不存在的组就改指
`前置-亚洲`，连 `前置-亚洲` 都没建就删掉该字段——**宁可退回本机直连，也不留一条
让内核起不来的引用**。

> 判断有没有踩到：看内核日志里有没有 `dialer-proxy [...] not found`。
> 有的话不是「住宅商的问题」，是配置里有悬空引用。

## 坑 29 · 几百个住宅 IP 共用一个网关：锁台时只能靠名字

有些住宅订阅是这样的：一两百个节点，`server` / `port` 全是同一个网关，只有节点名和
`username` 里的 IP 不同。上一版曾建议「按端点锁定」，在这类订阅上必然翻车 ——
端点一次命中几百台，按「恰好 1 台」判失败，`pinMiss: 'reject'` 直接把住宅出口清成 `REJECT`，
表现和「脚本坏了」一模一样。

现在只支持按名字锁，把名字里那段稳定的部分写进 `primary` 就够：

```js
primary: '203.0.113.10',   // 名字里带这个 IP 的那一台（恰好 1 台才生效）
primary: '住宅-JP',         // 或者名字里的稳定片段
```

> 这类订阅的节点名常带动态速度标记（`🇮🇹 025 | ⬇️ 379KB/s`），每次更新订阅都在变。
> 抄短片段比抄全名耐用；片段太长反而容易因为速度标记变化而失配。

## 坑 30 · 住宅端口「连得上但一握手就被 reset」：是住宅商拒了，不是配置错

自备住宅节点（`+proxies` 里手写的那台）最常见的失效方式：TCP 能连上（`nc -z` 显示 OPEN），
但 SOCKS5 第一步就断。三个地方同时出现就是同一个原因：

```bash
# 1) 面板延迟测试：不再是 timeout，而是一句 error
curl -s --noproxy '*' --unix-socket "$SOCK" \
  "http://localhost/proxies/<节点名 URL 编码>/delay?url=http%3A%2F%2Fwww.gstatic.com%2Fgenerate_204&timeout=6000"
# {"message":"An error occurred in the delay test"}

# 2) 住宅专用端口直接 502（内核对上游握手失败）
curl -s -m 10 -x http://127.0.0.1:7865 http://www.gstatic.com/generate_204 -o /dev/null -w '%{http_code}\n'

# 3) 内核日志：本机 → 住宅端口，读的第一下就被 reset
grep 'dial 住宅出口.*error' <内核日志>
# ... error: read tcp 192.168.31.24:56094->203.0.113.10:7012: read: connection reset by peer
```

**能连上 ≠ 能用**。握手阶段被 reset 只有四种原因，全在住宅商那侧：

| 原因 | 复核方式 |
| --- | --- |
| 地址 / 端口 / 账号密码轮换了（换了出口 IP、换了子账号） | 回面板抄一份新的端点 |
| 来源 IP 不在白名单（家里是动态 IP，换过一次就断） | 白名单里补上当前公网 IP，或改用账号密码认证 |
| 套餐到期 / 子账号被删 | 面板里看余额和账号状态 |
| 那条其实不是 SOCKS5 代理（`type` 写错） | 服务商给的是 HTTPS 代理就写 `type: http` |

脚本这边不用改：组里依旧是 `[住宅节点, REJECT]`，节点名不变时 `primary` 也不用动，
把 `+proxies` 里的 `server` / `port` / `username` / `password` 换成新的、重载配置即可。

**一分钟分清是哪一类**：绕过内核，直接问那个端口（`ip` / `port` / 账号换成你的）：

```bash
python3 - <<'EOF'
import socket, base64
ip, port, user, pw = "203.0.113.10", 7012, "USER", "PASS"
s = socket.create_connection((ip, port), timeout=8)
s.sendall(b"\x05\x01\x00"); print("SOCKS5:", s.recv(2).hex()); s.close()
auth = base64.b64encode(f"{user}:{pw}".encode()).decode()
s = socket.create_connection((ip, port), timeout=8)
s.sendall((f"CONNECT ipinfo.io:443 HTTP/1.1\r\nHost: ipinfo.io:443\r\n"
           f"Proxy-Authorization: Basic {auth}\r\n\r\n").encode())
print("HTTP  :", s.recv(200).split(b"\r\n")[0].decode(errors="replace")); s.close()
EOF
```

| 回应 | 含义 |
| --- | --- |
| SOCKS5 回 `0500` / HTTP 回 `200 Connection established` | 端口正常，问题在本地：`type` 写反了，或 `dialer-proxy` 指错 |
| SOCKS5 回 `05ff`、HTTP 回 `407` | **这是 HTTP 代理**，`type` 要写 `http`，不是 `socks5` |
| HTTP 回 `529 Proxy Limit Reached`（带 `X-Request-Error: PROXY_LIMIT_REACHED`） | 账号并发 / 额度到顶。**凭据是对的**，去面板看套餐，或等旧连接释放 |
| 直接 reset、一个字都不回 | 白名单 / 套餐 / 端点失效（上面四种原因） |

> ⚠️ 用 `curl -x` 测的时候**不要**同时加 `--noproxy '*'` —— 那个参数会连 `-x` 一起屏蔽，
> 于是「测试成功」其实走的是直连，出口 IP 和本机一模一样，白高兴一场（实测踩过）。

> 这也是 `pinOnly` 的价值：住宅挂了组里没有第二个成员能接手，`Claude` 那几个域名是
> **直接阻断**而不是悄悄从机场出去 —— 症状是「AI 全连不上」，而不是「出口 IP 悄悄变了」。

## 坑 31 · 全局模式下规则整份失效：`住宅出口` 一次都不会被用到

Clash Party 的「全局 / Global」模式会让内核绕过 `rules`，所有连接都投给 `GLOBAL` 组。
于是 `住宅出口`、`AI`、`前置-亚洲` 全部空转，日志里看不到任何 `using 住宅出口`：

```bash
# 当前模式 + GLOBAL 选中的是谁
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/configs \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['mode'])"        # global ← 就是它
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies/GLOBAL \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['now'])"

# 证据：今天所有连接都走 GLOBAL，住宅出口 0 条
grep -c 'using GLOBAL' <内核日志>       # 7096
grep -c 'using 住宅出口' <内核日志>      # 0
```

`GLOBAL` 落到 `DIRECT` 时表现最迷惑：整机直连、`claude.ai` / `api.openai.com` 全超时，
看起来像「住宅节点坏了」，其实是分流压根没跑。

**这条路把 fail-closed 契约整个关掉了**：全局模式里没有「住宅或阻断」，只有
「GLOBAL 里选了谁」。切回「规则」模式，再用上面两条命令确认 `mode=rule`、住宅组有命中。

> 现在脚本自带守卫（`modeGuard`，默认开）：检测到 `global` / `direct` 会改回 `rule`，
> 日志里有一条 `[模式守卫] 内核原来是「global」模式 → 已改回 rule`。看到这条说明
> 有人（或某个客户端）把模式切走过；不想让脚本管，就把 `modeGuard` 改成 `false`。
>
> `GLOBAL` 里带 `DIRECT`、并且默认选 `DIRECT`，是内核内建行为（`GLOBAL` = `DIRECT` +
> `REJECT` + 全部节点，默认项就是第一个成员），不是配置写坏。规则模式下它不参与分流，
> 所以不用手改；真要临时用全局模式，把 `GLOBAL` 选到 `AUTO` 比留在 `DIRECT` 温和——
> 至少不会静默裸连，代价是所有流量（包括 AI）走机场。
