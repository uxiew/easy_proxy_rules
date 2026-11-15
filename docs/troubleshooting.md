# 踩过的坑（改配置前必看）

23 条实测踩坑记录，按编号引用；改规则、换订阅、换客户端之前先扫一遍。

> ← [文档索引](README.md) · [仓库首页](../README.md)

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
   顺序语义见 [住宅出口组的成员顺序](configuration.md)。

7. **写死节点名 ≠ fail-closed，而是 fail-loud**
   组里 `proxies: ['某节点']` 是强引用，订阅改名后 `'X' not found`，**整份配置校验失败、应用起不来**。
   所以动态组用 `filter` + `REJECT` 兜底，而不是写死名字。

8. **过滤器里的单字关键词会误收（换订阅必踩）**

   旧 JP 过滤器 `JP|日|東|东|…` 里的单字被新订阅的节点名击穿：
   `[东帝汶]₁`（含「东」）、`[尼日利亚]₂`（含「日」）、`🇦🇶 [到期: 2027年02月02日]`（含「日」）
   全进了「前置-亚洲」；AI 组（fallback）的第一个存活成员一度是到期信息节点。

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
    实测 18 个机场住宅节点混进了「住宅出口」。现在固定成 `🏠|IP-`，
    自己加的节点名带 🏠 前缀（`🏠 住宅-JP`）或 IP- 前缀（`IP-JP`）都能被收编。

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

20. **`directExtra` 的 `co.jp` 会把 Google 日本站一起直连**

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

21. **`'auto'` 仍有效，但判的是「运行时可见性」不是「有没有家宽」→ 有家宽也判成没有**

    `'auto'` 模式一直都在，从没被删掉；2026-11-13 只是把「判成无家宽之后做什么」
    统一成和 `false` 一样（两组都不生成、住宅节点移除、规则改投 `AI`、7865 改绑 `AI`）。
    它的判据是「脚本运行时 `config.proxies` 里有没有名字匹配 `🏠|IP-` 的节点」
    （或 FlClash 私有版注入的 `RESIDENTIAL.nodeName`），**不是**「你有没有配家宽」；
    而 Clash Party 是按覆写列表顺序执行的：`residential.yaml` 排在 `smart.js` **之后**时，
    脚本跑到这一步还没见过住宅节点 → 判成无家宽 → 住宅链整条不建，
    AI 流量静默退回机场（出口 IP 从住宅变成机场共享 IP，**不报任何错**）。

    所以默认改成 `enabled: true`：组靠内核级 `include-all-proxies + filter` 收编，
    后置覆写注入的 `🏠 住宅-JP` 照样进组，**排前排后都一样**。
    只有「订阅里自带住宅节点、脚本运行时就能看到」的场景才用 `'auto'`；
    确实没有家宽就用 `false`，别指望 `auto` 替你判断。
    两个额外边界：占位符版 `FLCLASH_NO_RESIDENTIAL` 会无条件覆盖 `'auto'`；
    不跑 `main()` 的纯数据提取路径下 `'auto'` 等同 `true`（完全不探测），
    详见 [auto 还有效吗](configuration.md)。

22. **别为了兜外部手写规则，把住宅组改成「成员转发 AI」**

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

23. **Android 上 `detectradar` 报 WebRTC/DNS 暴露，不是配置写错，是平台边界**

    同一份 `smart.js`，桌面 Clash Party 下 `detectradar` 全绿，手机 FlClash 下报 WebRTC 与
    DNS 暴露。原因不在 YAML，也不在构建产物：

    - 手机内核跑在 App 的 `VpnService` 里，只有被 VPN 接管的流量才受规则约束，
      **没进内核的 UDP 拦不住**（规则再严也无解）；
    - 系统「私人 DNS」走 DoT/853、浏览器自带 DoH 时，解析根本不经过配置里的
      `nameserver`，`dns-hijack: any:53` 也管不到 853/443 上的加密 DNS；
    - `tun.enable` 开着 ≠ 泄漏已修好，`dns-hijack` 生效 ≠ 浏览器不用自己的 DoH。

    要治只能在 App/系统层收口（关掉系统私人 DNS、关浏览器安全 DNS、确认 UDP 进内核），
    规则层能做的只有「把已知 STUN 端口拒掉」，见 [WebRTC 探测要不要拦](configuration.md)。
