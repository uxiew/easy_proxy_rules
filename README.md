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
ruleset/
├── ai-strict.list        AI 服务商精确域名 → 住宅出口（含 Turnstile/auth0/Persona/遥测）
├── ai.yaml               AI 相关但走机场的部分（宽泛匹配、Google 全量、中转站）
├── residential.list      非 AI 的账号/支付/电商 → 住宅出口
├── direct-extra.list     补充直连域名
├── auto-extra.list       Google 通用资产 → AUTO
├── custom.list           自定义规则
└── nsfw.list             NSFW 规则
residential.example.yaml  住宅节点覆写模板（只放凭据，不提交）
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
| `TRAFFIC.domesticDirect` | `true` | 追加 `GEOSITE,cn → DIRECT`（`GEOIP,CN` 对 fake-ip 域名无效） |
| `TRAFFIC.appleDirect` | `true` | Apple 全家桶直连（iCloud 同步/App Store 原来走机场，最费流量） |

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

4. **CDN 必须国内可达**
   规则集在内核启动前拉取（那一刻没有代理可用）。jsDelivr 国内多数网络 TLS 失败（HTTP 000），
   所以默认用 `cdn.jsdmirror.com`。

5. **mihomo 的 `http` 类型配 `dialer-proxy` 连不通**
   实测四种组合，只有 `type: socks5` + `dialer-proxy` 能通（`http` 无论跳板填组名还是具体节点都超时）。
   住宅节点一律用 `socks5`。

---

## 验证分流是否生效

```bash
# 看某个域名实际走了哪个出口（Claude 域名会走住宅）
curl -x http://127.0.0.1:7890 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='

# 验证住宅专用端口（7865）—— 访问任何域名都应返回住宅 IP
curl -x socks5h://127.0.0.1:7865 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='
```

> 别用 `api.ip.sb` 验证住宅出口——它走 `forGlobal → AUTO`，显示机场 IP 是正常的。

---

## 其他

- **PAC**：系统代理 → 代理模式 PAC（`PAC.js`）
- **module**：iOS Shadowrocket 模块（`rules.module`）
