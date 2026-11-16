# 代理分流规则配置

给 **Clash Party / FlClash / mihomo** 用的覆写（Override）脚本：自动生成代理分组与规则，
把流量分成三层——**国内直连**、**AI 与账号类走静态住宅 IP**、**其余按国家自动择优**。
内置 DNS fake-ip 与 IP 型 DoH，桌面和手机共用同一份 `smart.js` 逻辑。

> 📚 这份 README 只保留上手与速查。**配置细节、实测记录和排错手册都在 [docs/](docs/README.md)**。

---

## 快速开始

1. Clash Party → 覆写 → 新建 → 类型 **远程**，填：
   ```
   https://raw.githubusercontent.com/uxiew/easy_proxy_rules/main/smart.js
   ```
2. 设为**全局覆写**，模式切到「**规则**」（全局模式下所有规则失效）。
3. 要用住宅出口，再建一个本地 YAML 覆写，参考 [`residential.example.yaml`](residential.example.yaml)。

一分钟验证：

```bash
curl -x http://127.0.0.1:7890 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='
```

> ⚠️ **本脚本会整体替换** `proxy-groups` / `rules` / `rule-providers`。
> 所有 YAML 覆写必须排在 `smart.js` **之后**，否则规则会被整段丢掉；`proxies` 不受影响。
> 首次使用若「住宅出口」停在 `REJECT`，去面板里手动选一次住宅节点即可（手机端构建时已锁定，不用这步）。

更完整的步骤与验证见 [快速开始](docs/getting-started.md) 和 [验证分流是否生效](docs/verification.md)。

---

## 两个最常用端口

| 端口 | 走不走规则 | 用途 |
| --- | --- | --- |
| **7890** | ✅ 按域名分流 | 系统代理、浏览器、日常默认 |
| **7865** | ❌ 跳过规则，全部走住宅/对应组 | Proxifier、Claude Code、不读系统代理的程序 |

另有 7891（SOCKS5）、7892（HTTP）、7866+（`APP_PROXY.ports` 自建）。
完整端口表与「7865 和 7890 的区别」见 [端口、分组与文件结构](docs/architecture.md)。

---

## 没有家宽静态 IP？

改 `smart.js` 第 0 部分的一个值即可，**其余规则、顺序、分流都不变**：

| `RESIDENTIAL.enabled` | 用在什么情况 | 结果 |
| --- | --- | --- |
| `true`（默认） | 有家宽 | 建完整住宅链，AI 与账号类走住宅 |
| `false` | **没有家宽**（推荐） | 不生成「住宅出口」「前置-亚洲」，相关规则改投 `AI` 组 |
| `'auto'` | 订阅自带住宅节点时才用 | 判的是「运行时看不看得到节点」，**不是**「有没有家宽」，有误判陷阱，不推荐 |

三态的判定优先级、覆写顺序陷阱、日志与验证命令见 [配置项详解 · 没有家宽怎么办](docs/configuration.md)。

---

## 改配置看哪里

`smart.js` 开头「第 0 部分：用户配置区」是**唯一需要日常改动的地方**，七个对象：

| 对象 | 管什么 |
| --- | --- |
| ① `APP_PROXY` | 应用级分流：专用端口 / 进程名 / 路径正则 / Android 包名 |
| ② `RESIDENTIAL` | 住宅出口：总开关、组名、跳板、专用端口 |
| ③ `TRAFFIC` | 国内直连、Apple 直连 |
| ④ `AI_STATIC_TO_AI` | AI 静态资源 / 安装包走机场 |
| ⑤ `NARROW_TUN` | 窄 TUN（只把 Google 段塞进内核） |
| ⑥ `REGION_PRIORITY` | `AUTO`/`AI` 的国家优先顺序（全部地区组按序，`OT` 只兜底） |
| ⑦ `WEBRTC_GUARD` | 可选 STUN 拦截（**默认关**，会打断语音通话） |

逐项默认值与取舍见 [配置项详解](docs/configuration.md)。

---

## 文档导航

| 我想… | 打开 |
| --- | --- |
| 第一次接入 / 验证链路 | [快速开始](docs/getting-started.md) |
| 理解端口、分组、规则文件 | [端口、分组与文件结构](docs/architecture.md) |
| 解决「规则写对了但一直转圈」 | [流量怎么进内核](docs/traffic-entry.md) |
| 逐项改配置 | [配置项详解](docs/configuration.md) |
| 接 Claude Code / Proxifier / pf | [桌面客户端接入](docs/clients.md) |
| 生成手机 FlClash 覆写 | [FlClash 与构建产物](docs/flclash.md) |
| 排查报错、换订阅后的怪现象 | [踩过的坑（24 条）](docs/troubleshooting.md) |
| 确认某条规则命中了什么 | [验证分流是否生效](docs/verification.md) |
| 维护出口 IP / 凭据防泄漏 | [防泄漏](docs/security.md) |

全文索引与建议阅读顺序见 [docs/README.md](docs/README.md)。

---

## 常用命令

```bash
# 手机端：改过 smart.js 后重新生成 flclash.js / flclash-private.js（含构建期自检）
node build-flclash.js

# 公共仓库防泄漏：首次安装 hook、换 IP / 密码后同步名单、手动体检
git config core.hooksPath .githooks
node scripts/sync-sensitive.mjs
node scripts/scan-sensitive.mjs --all
```

手机端要把 `flclash-private.js` 重新粘贴一次；桌面端只需在面板点 ↻ 重载。
构建期自检会在内存里真跑一遍生成的脚本，任一项不过就拒绝写出产物，详见 [FlClash 与构建产物](docs/flclash.md)。

---

## 三条必须知道的事

1. **这是 public 仓库**，mihomo 直接从 `raw.githubusercontent.com` 拉 `ruleset/`。
   真实住宅出口 IP、账号、密码**绝不能进仓库**（包括提交信息）；三层防护见 [防泄漏](docs/security.md)。
2. **规则集推送后才生效**。本仓库自己的 `.list` 走 raw，第三方上游走国内镜像；
   推送后没变化先按 [坑 4](docs/troubleshooting.md) 排查，别长期挂镜像。
3. **规则层管不到「没进内核的流量」**。Android `VpnService`、系统私人 DNS、浏览器 DoH
   都会绕过配置里的 `nameserver`，`detectradar` 报 WebRTC/DNS 暴露属于平台边界，不是 YAML 写错，
   见 [坑 23](docs/troubleshooting.md)。

---

## 文件结构（简）

```
smart.js                  主脚本：建组 + 生成规则
flclash.js               手机单文件覆写（占位符版，由构建脚本生成）
build-flclash.js          生成器 + 构建期自检
ruleset/                  域名规则集（ai-strict / ai.yaml / residential / …）
docs/                     分项文档（见上方导航）
claude-guard/             Claude Code 启动守卫 + 环境体检
scripts/ .githooks/        敏感信息扫描与本地 hook
residential.example.yaml  住宅节点覆写模板
```

完整结构见 [端口、分组与文件结构](docs/architecture.md)。

## 其他

- **PAC**：系统代理 → 代理模式 PAC（`PAC.js`）
- **module**：iOS Shadowrocket 模块（`rules.module`）
