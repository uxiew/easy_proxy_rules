# 代理分流规则配置

给 **Clash Party / FlClash / mihomo** 用的覆写（Override）脚本：一份 `smart.js` 自动生成
分组与规则，把流量分成三层——**国内直连**、**AI 与账号类只走家宽**、**其余按国家自动择优**。
桌面和手机共用同一份逻辑，配置里不出现任何特定机场/住宅商的写法。

> 📚 这份 README 只讲上手和速查。细节、实测与排错在 [docs/](docs/README.md)。

---

## 为什么用它

| 优点 | 具体表现 |
| --- | --- |
| **AI 出口严格** | Claude / ChatGPT / Gemini / Anthropic IP 段等规则统一指向「住宅出口」；该组只允许**一台家居宽带** + `REJECT`，没有自动切换、没有备用机场 |
| **失败即阻断** | 锁定的那台不可用、或 `primary` 对不上 → 直接 `REJECT`。宁可 AI 打不开，也不让出口悄悄换到机场共享 IP 或另一国住宅 |
| **不特例化** | 脚本不认识 BrightData、Webshare 或任何机场的命名规则；只按 `nodePattern` 认节点、按 `primary` 认名字 |
| **订阅无关** | 换订阅只需改 `primary` 一个字符串；订阅自带的策略组会被保留，不会因重建分组而让 `dialer-proxy` 悬空 |
| **桌面手机同一套** | `smart.js` 桌面直用；`build-flclash.js` 生成手机单文件并在构建期真跑一遍自检 |
| **DNS / 泄漏防护** | IP 型 DoH（不需要明文 53 引导）、fake-ip、可选 STUN 拦截、敏感信息扫描 hook |
| **模式守卫** | 内核被误切到「全局 / 直连」时自动改回「规则」并记一条日志——那两种模式会绕过全部规则，`住宅出口` 一次都不会命中，AI 就悄悄换了出口 |

---

## 快速开始

1. Clash Party → 覆写 → 新建 → 类型 **远程**，填：
   ```
   https://raw.githubusercontent.com/uxiew/easy_proxy_rules/main/smart.js
   ```
2. 设为**全局覆写**。模式用「**规则**」：脚本会把「全局 / 直连」自动改回来（`modeGuard`），
   因为那两种模式会绕过整份规则。
3. 有家宽要接：再建一个本地 YAML 覆写，参考 [`residential.example.yaml`](residential.example.yaml)；
   **顺序必须是「住宅 YAML → smart.js → 其他 YAML」**。

一分钟验证（出口是不是家宽）：

```bash
curl -x http://127.0.0.1:7865 -s https://api.ip.sb/geoip | jq '{ip,country,asn,isp}'
```

> ⚠️ 脚本会整体替换 `proxy-groups` / `rules` / `rule-providers`，所以其他 YAML 覆写要排在
> `smart.js` **之后**（`proxies` 不受影响）。
> 首次使用若「住宅出口」停在 `REJECT`，去面板手动选一次住宅节点即可（手机端构建时已锁定）。

---

## 配置写在哪：一份 `x-smart` 就够

第 0 部分的所有开关（住宅出口、应用分流、省流量、窄 TUN、地区优先、WebRTC、两个顶层开关）
都能在**你自己的覆写 YAML** 里覆盖，不用改脚本、remote 引用也不会被更新冲掉：

```yaml
x-smart:                 # ← 不带 +
  residential:
    primary: '🏠IP-JP'    # 锁这一台
    # 住宅凭据也在这里（和手机端同一个键）：
    # nodes: [{ name: '🏠IP-JP', type: http, server: 1.2.3.4, port: 7012, username: u, password: p }]
    # upstream 默认 fill（走前置）——人在国内直连海外网关会被墙，别写 strip
  narrowTun: { enabled: false }
  keepSubGroups: true
```

放在**排在 `smart.js` 之前**的本地覆写里即可。手机端没有覆写链：
`flclash-credentials.json` 的 `config` 段会在构建时变成文件顶部的 `USER_CONFIG`，
**键名与 `x-smart` 完全一样**，一条配置两端通用。完整键表、优先级、写错了会怎样：
[自定义配置](docs/custom-config.md)｜模板 [`x-smart.example.yaml`](x-smart.example.yaml)。

---

## AI 只走家宽：三个开关就是全部

| 开关 | 默认 | 作用 |
| --- | --- | --- |
| `residential.aiStrict` | `true` | AI 服务商 + Anthropic IP 段 + Claude/ChatGPT 进程 → `住宅出口` |
| `residential.pinOnly` | `true` | 组里只放 `primary` 那一台；其余住宅 IP 只注入、不进组 |
| `residential.escapeToAI` | `false` | 住宅挂了是否允许手动切机场。关着 = 只能住宅或断网 |

`primary` 只写**节点名**：先完整匹配，再按 includes 匹配（必须恰好命中 1 台）。
命中 0 台或多台 → 按 `pinMiss: 'reject'`（默认）只留 `REJECT`，日志有提示。

```js
primary: '🏠 住宅-JP',   // 完整名
primary: '住宅-JP',      // 或者名字里稳定的一段
```

---

## 两个最常用端口

| 端口 | 走不走规则 | 用途 |
| --- | --- | --- |
| **7890** | ✅ 按域名分流 | 系统代理、浏览器、日常默认 |
| **7865** | ❌ 跳过规则，全部走住宅出口 | Proxifier、Claude Code、不读系统代理的程序 |

另有 7891（SOCKS5）、7892（HTTP）、7866+（`appProxy.ports` 自建）。完整表见
[端口、分组与文件结构](docs/architecture.md)。

---

## 订阅自带家宽节点？

不用手写 `+proxies`，命名命中就行（`家宽 / 住宅 / 静态 / ISP / RESI / 🏠 / IP-`）。
这三行写在**排在 `smart.js` 之前**的覆写 YAML 里，不必改脚本：

```yaml
x-smart:                      # 键名不要带 +
  residential:
    primary: '住宅-JP'         # 锁哪一台（名字或其中稳定片段）
    # upstream 不写 = fill（挂前置-亚洲跳板）
```

| 配置 | 什么时候改 |
| --- | --- |
| `primary` | 换主力住宅时。**不要**写序号，也别按 `server`/`port` 锁 |
| `upstream.inject` | 人在**海外**且直连网关可达 → `'strip'`；其余（含人在国内）→ 默认 `'fill'`（挂 `前置-亚洲`，直连海外网关会被墙） |
| `prefer` | 没配 `primary` 时，组首默认选哪一国（如 `'JP'`） |

细节见 [配置项详解](docs/configuration.md)。

---

## 没有家宽静态 IP？

改 `residential.enabled` 一个值，**其余规则、顺序都不变**：

| 值 | 用在 | 结果 |
| --- | --- | --- |
| `true`（默认） | 有家宽 | 建完整住宅链，AI 走住宅 |
| `false` | **没有家宽**（推荐） | 不生成住宅两组，相关规则改投 `AI` |
| `'auto'` | 订阅自带住宅节点 | 判「运行时可不可见」，有覆写顺序陷阱，不推荐 |

---

## 配置区看哪里

`smart.js` 第 0 部分只有两个对象：`DEFAULT_CONFIG`（全部默认值）与 `USER_CONFIG`（你的覆盖），
十个顶层键与 `x-smart` 完全一致：

| 键 | 管什么 |
| --- | --- |
| `mode` | 跑在哪：`'clash'` 桌面 / `'flclash'` 手机（手机由构建注入） |
| `residential` | 住宅出口：锁定哪台、节点凭据、锁不上怎么办、跳板组 |
| `appProxy` | 应用级分流：专用端口 / 进程名 / 路径正则 / Android 包名 |
| `traffic` | 国内直连、Apple 直连 |
| `aiStaticToAI` | AI 静态资源 / 安装包走机场（省住宅流量） |
| `narrowTun` | 窄 TUN（只把 Google 段塞进内核） |
| `regionPriority` | `AUTO` / `AI` 的国家优先顺序 |
| `webrtcGuard` | 可选 STUN 拦截（默认关，会打断语音通话） |
| `keepSubGroups` | 保留订阅自带策略组 |
| `modeGuard` | 内核被切成全局/直连时改回规则模式 |

改配置**不用动脚本**：桌面端写覆写 YAML 的 `x-smart`，手机端写
`flclash-credentials.json` 的 `config` 段 —— 键名完全一样，见 [自定义配置](docs/custom-config.md)。

---

## 文档导航

| 我想… | 打开 |
| --- | --- |
| 第一次接入 / 验证链路 | [快速开始](docs/getting-started.md) |
| 改配置（含住宅、DNS、WebRTC） | [配置项详解](docs/configuration.md) |
| 理解端口、分组、规则文件 | [端口、分组与文件结构](docs/architecture.md) |
| 解决「规则写对了但一直转圈」 | [流量怎么进内核](docs/traffic-entry.md) |
| 接 Claude Code / Proxifier | [桌面客户端接入](docs/clients.md) |
| 生成手机 FlClash 覆写 | [FlClash 与构建产物](docs/flclash.md) |
| 排查怪现象 | [踩过的坑（29 条）](docs/troubleshooting.md) |
| 确认某条规则命中什么 | [验证分流是否生效](docs/verification.md) |
| 出口 IP / 凭据防泄漏 | [防泄漏](docs/security.md) |

---

## 常用命令

```bash
node build-flclash.js                  # 重新生成手机产物（含构建期自检）
git config core.hooksPath .githooks    # 首次：安装敏感信息扫描 hook
node scripts/sync-sensitive.mjs        # 换 IP/密码后同步脱敏名单
node scripts/scan-sensitive.mjs --all  # 手动体检
```

手机端要重新粘贴 `flclash-private.js`；桌面端点 ↻ 重载即可。

---

## 三条必须知道的事

1. **这是 public 仓库**，内核直接从 raw 拉 `ruleset/`。真实住宅 IP、账号、密码**绝不能进仓库**
   （提交信息也算），三层防护见 [防泄漏](docs/security.md)。
2. **规则集推送后才生效**；没变化先按 [坑 4](docs/troubleshooting.md) 排查。
3. **规则层管不到没进内核的流量**：Android `VpnService`、系统私人 DNS、浏览器 DoH 都会绕过
   `nameserver`，[坑 23](docs/troubleshooting.md)。

## 文件结构（简）

```
smart.js                  主脚本：建组 + 生成规则
flclash.js               手机单文件覆写（占位符版，构建生成）
build-flclash.js          生成器 + 构建期自检
ruleset/                  域名规则集（ai-strict / ai.yaml / residential / …）
docs/                     分项文档
claude-guard/             Claude Code 启动守卫 + 环境体检
scripts/ .githooks/        敏感信息扫描与 hook
residential.example.yaml  住宅节点覆写模板
```

其他：PAC（`PAC.js`）、iOS Shadowrocket 模块（`rules.module`）。
