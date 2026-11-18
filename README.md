# 代理分流规则配置

给 **Clash Party / FlClash / mihomo** 使用的覆写脚本（[`smart.js`](smart.js)）：将流量自动分为**国内直连**、**AI 严格锁定单台住宅出口（失败即阻断）**、**其余按国家自动择优**三层；桌面端 Clash Party 与手机端 FlClash 共用同一套配置契约。

> 📚 详细原理、参数说明与排错指南见 [docs/](docs/README.md)。

---

## 为什么用它

| 核心能力 | 用户侧结果 |
| --- | --- |
| **AI 出口锁定单台家宽** | Claude / ChatGPT / Gemini 及 Anthropic IP 段统一走「住宅出口」，组内只留一台指定住宅节点，不自动切换、不混用机场 |
| **断链即阻断，不回落机场** | 锁定的住宅节点不可用或名称未命中时直接 `REJECT`，宁可打不开也不悄悄切换至机场共享 IP 或其他国家节点 |
| **换订阅只改节点名** | 不依赖特定机场或住宅商的命名规则，换订阅只需更新目标节点名；订阅自带策略组默认保留，不破坏 `dialer-proxy` 链路 |
| **模式误切自动拉回** | 内核被误切到「全局 / 直连」时自动切回「规则」模式并记日志，防止分流规则整套失效 |
| **桌面手机同一套** | 桌面端直接远程订阅 `smart.js`；手机端支持构建单文件产物并在构建期完成自检 |
| **DNS 与防泄漏** | 内置 IP 型 DoH（不依赖明文 53 引导）、fake-ip、可选 STUN 拦截，以及仓库级敏感信息扫描 hook |

---

## 3 分钟上手（桌面 Clash Party）

1. 打开 **Clash Party → 覆写 → 新建 → 类型选「远程」**，填入脚本地址：
   ```text
   https://raw.githubusercontent.com/uxiew/easy_proxy_rules/main/smart.js
   ```
2. 将其设为**全局覆写**，出站模式保持「**规则**」。
3. 若需接入住宅节点：再建一个本地 YAML 覆写（模板见 [`residential.example.yaml`](residential.example.yaml)），覆写顺序**必须为「住宅 YAML → smart.js → 其他 YAML」**。
   > 脚本会整体替换 `proxy-groups` / `rules` / `rule-providers`（`proxies` 不受影响）。首次启用若「住宅出口」停在 `REJECT`，在面板手动选中目标住宅节点一次即可（手机端构建时已自动锁定）。

**一分钟验证**（确认 `7865` 端口出口为目标家宽）：

```bash
curl -x http://127.0.0.1:7865 -s https://ipinfo.io/json
# 或带浏览器 UA 访问 api.ip.sb（裸 curl 会返回 Cloudflare HTML）：
curl -x http://127.0.0.1:7865 -s -A Mozilla/5.0 https://api.ip.sb/geoip
```

确认返回的 `org` / `isp` 与 `country` 为你的住宅宽带运营商及目标国家即表示生效。

---

## 常用端口

| 端口 | 是否走分流规则 | 典型用途 |
| --- | --- | --- |
| **7890** | ✅ 按规则分流 | 系统代理、浏览器、日常默认流量 |
| **7865** | ❌ 跳过规则，全部走「住宅出口」 | Claude Code、Proxifier、不读系统代理的进程 |

另有 `7891`（SOCKS5）、`7892`（HTTP）及 `7866+` 应用专用端口，完整说明见 [端口、分组与文件结构](docs/architecture.md)。

---

## 自定义配置

所有功能开关与住宅凭据**无需修改 `smart.js`**，桌面端与手机端共用完全一致的键名与配置结构：

- **桌面端（Clash Party）**：写在排在 `smart.js` **之前**的本地覆写 YAML 的 `x-smart:` 下（注意键名不带 `+`），参考模板 [`x-smart.example.yaml`](x-smart.example.yaml)。
- **手机端（FlClash）**：写在本地 `flclash-credentials.json` 的 `config` 字段下，构建时自动注入为顶层 `USER_CONFIG`。

三种最常见场景：

**1. 自有住宅节点（注入凭据并锁定）**

```yaml
x-smart:
  residential:
    primary: '🏠IP-JP'    # 精确节点名或唯一稳定片段（需恰好命中 1 台）
    nodes:
      - { name: '🏠IP-JP', type: http, server: 203.0.113.7, port: 7012, username: u, password: p }
    # upstream 默认 fill（经前置亚洲跳板）；人在国内直连海外网关会被墙，勿改 strip
```

**2. 订阅自带住宅节点（免写 `nodes`，直接按名锁定）**

节点名包含 `家宽 / 住宅 / 静态 / ISP / RESI / 🏠 / IP-` 时会被自动识别，只需指定 `primary`：

```yaml
x-smart:
  residential:
    primary: '住宅-JP'
    # upstream: { inject: 'strip' }  # 仅当人在海外且直连住宅网关可达时取消注释
```

**3. 没有家宽静态 IP（AI 走机场 `AI` 组）**

```yaml
x-smart:
  residential:
    enabled: false        # 不生成住宅两组，AI 相关规则自动改投 AI 策略组
```

> 完整的 10 个顶层配置键、字段优先级与错误示例见 [自定义配置](docs/custom-config.md) 与 [配置项详解](docs/configuration.md)。

---

## 文档导航

| 我想… | 查看文档 |
| --- | --- |
| 第一次接入 / 验证链路 | [快速开始](docs/getting-started.md) |
| 修改配置项（住宅 / DNS / WebRTC / 分流） | [配置项详解](docs/configuration.md) |
| 查阅 `x-smart` / `USER_CONFIG` 完整键表 | [自定义配置](docs/custom-config.md) |
| 理解端口、策略组与规则文件 | [端口、分组与文件结构](docs/architecture.md) |
| 排查「规则写对了但一直转圈」 | [流量怎么进内核](docs/traffic-entry.md) |
| 接入 Claude Code / 桌面与移动端防封清单 | [客户端接入与防封注意事项](docs/clients.md) |
| 使用 Claude Code 终端守卫与环境体检 | [claude-guard](claude-guard/README.md) |
| 构建手机端 FlClash 单文件覆写 | [FlClash 与构建产物](docs/flclash.md) |
| 排查异常与常见问题 | [常见问题与踩坑排查](docs/troubleshooting.md) |
| 确认某条规则命中了什么 | [验证分流是否生效](docs/verification.md) |
| 出口 IP 与凭据防泄漏 | [防泄漏](docs/security.md) |

---

## 手机端构建与仓库维护

仅使用远程 `smart.js` 覆写的桌面端用户**无需 clone 本仓库或安装 Node.js**。需要生成手机端 `FlClash` 单文件覆写，或本地维护规则仓库时使用以下命令：

```bash
node build-flclash.js                  # 生成手机端单文件产物并执行构建期自检
git config core.hooksPath .githooks    # 首次 clone：启用提交前敏感信息扫描 hook
node scripts/sync-sensitive.mjs        # 更换 IP/凭据后同步本地脱敏检测名单
node scripts/scan-sensitive.mjs --all  # 手动全量扫描防泄漏
```

修改后手机端需重新导入生成的 `flclash-private.js`；桌面端在面板重载覆写即可。

**使用与维护须知**：

1. **公开仓库禁止明文凭据**：内核直接从 raw 拉取 `ruleset/`，真实住宅 IP、账号与密码**严禁**提交到仓库或 commit message，三层防泄漏机制见 [防泄漏](docs/security.md)。
2. **规则集远端生效**：`ruleset/` 改动需推送到远端并重新拉取规则集才生效。
3. **内核旁路边界**：Android `VpnService` 绕过应用、系统私人 DNS、浏览器 DoH 会跳过内核分流，排查见 [常见问题与踩坑排查](docs/troubleshooting.md)；与 Tailscale 共存需额外配置系统代理绕过及分域解析，见 [流量怎么进内核](docs/traffic-entry.md#路线-atun还要处理-dns)。

---

## 文件结构

```text
smart.js                  主覆写脚本：策略组与分流规则生成
flclash.js                手机端单文件覆写（占位符版，构建生成）
build-flclash.js          手机端构建脚本与自检
ruleset/                  域名与 IP 规则集（ai-strict / ai.yaml / residential / …）
docs/                     分项详细文档
claude-guard/             Claude Code 终端启动守卫与环境体检
scripts/ .githooks/       敏感信息扫描脚本与 Git hook
residential.example.yaml  住宅节点本地覆写模板
x-smart.example.yaml      自定义配置模板
```

其他辅助文件：PAC 脚本（[`PAC.js`](PAC.js)）、iOS Shadowrocket 模块（[`rules.module`](rules.module)，通用补充规则，不含住宅链；iOS 用 Claude 见 [客户端接入与防封注意事项](docs/clients.md)）。
