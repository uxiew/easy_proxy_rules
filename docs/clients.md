# 桌面客户端接入

Claude Code、启动守卫、常驻会话、pf 硬阻断与 Proxifier 的接法。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## Claude Code

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

**这个配置本身是 fail-closed 的**：`HTTPS_PROXY` 是「显式指定代理」，不是系统代理。  
Clash Party 退出后端口消失，客户端拿到的是 `ECONNREFUSED`，**不会**像系统代理那样静默回落直连。  
（实测：`curl -x http://127.0.0.1:59999 https://api.anthropic.com/` → `Failed to connect`，没有直连重试路径。）

真正会漏的是两种情况，都不在 Claude Code 里：

1. **不读 `settings.json` 的进程** —— 脚本里的 `curl`、Python 的 anthropic SDK、Cursor、IDE 插件只认  
   shell 环境变量，Clash Party 挂掉时它们会静默直连。兜法是终端启动前加一道闸门（`claude()` 包装函数）。
2. **代理活着但出口被切走** —— 「住宅出口」被点成 `AI`，端口是通的但用的是机场 IP，  
   比断网更危险（同账号 IP 跳变）。所以闸门不能只 `nc` 一下端口，还得校验出口 IP 确实是住宅 IP。

> ⚠️ `NO_PROXY` 只写 `localhost,127.0.0.1`，**不要**把 `anthropic.com` 加进去 —— 加一条就让所有代理努力归零。

## 启动守卫与环境体检（`claude-guard`）

上面两道闸门 + 只读体检已收进本仓库 [`claude-guard/`](../claude-guard/README.md) 统一管理。  
`~/.zshrc` 里不再内联两百多行 shell，只剩一段带标记的加载器（由 `claude-guard/install.sh` 幂等维护）。
下面是**简化示意**，完整片段见 [`claude-guard/zshrc.snippet`](../claude-guard/zshrc.snippet)，
里面还包含「规则库缺失时拒绝启动」的 fail-closed 兜底：

```zsh
# >>> easy_proxy_rules / claude-guard >>>
_cg_repo="${EASY_PROXY_RULES_HOME:-$HOME/Projects/easy_proxy_rules}"
source "$_cg_repo/claude-guard/claude-guard.zsh"
# <<< easy_proxy_rules / claude-guard <<<
```

| 命令 | 作用 |
| --- | --- |
| `claude` | 启动前 fail-closed：端口 → 并行（出口 IP 查询 + Anthropic API 403 封锁探测）→ 白名单精确比对 → 配置一致性告警，确认后注入 `HTTP(S)_PROXY=127.0.0.1:7865`、`TZ` 与 `ipv4first` 并记入 `.exit-ip.log` |
| `claude-check` | 只读 8 维环境画像体检与 0–100 综合评分（含关键项一票否决）：代理链路、API 可达与出口地区、7890/7865 分流一致性与系统 PAC、ISP（住宅/IDC 识别）与 CF Edge Colo、生效配置「仅代理」判定、DNS 与时区自洽、IPv6 旁路与 24h 出口稳定性统计、评分汇总 |
| `claude-guard-allow` | 住宅 IP 轮换后安全加白：核验当前出口不在受限区且非常见机房 IDC 后追加至 `allowed-exit-ips`（`600` 权限），并自动触发 `sync-sensitive.mjs` |
| `claude-guard-info` | 打印当前生效的规则目录与 `guard.conf` 取值 |
| `claude-guard-reload` | 改完 `guard.conf` 后热重载，不必新开终端 |

> **CLI 终端守卫与内核 `PROCESS-PATH-REGEX` 规则的互补边界**：
> - **`claude-guard`（终端前置守卫）**：仅覆盖在交互式 zsh 中通过 `claude()` 包装函数启动的会话，负责启动前 fail-closed 拦截（白名单精确匹配 + API 403 地区/风控探测）与环境变量/时区指纹注入。
> - **内核 `PROCESS-PATH-REGEX,^/opt/homebrew/(bin/claude$|Caskroom/claude-code),住宅出口`（流量侧兜底）**：位于 `smart.js` 的 `appProxy.processes`（需开启窄 TUN 且流量进内核）。Homebrew Cask 安装的 `/opt/homebrew/bin/claude` 是软链接，macOS 内核 `proc_pidpath` 拿到的是解开后的真实路径 `/opt/homebrew/Caskroom/claude-code@latest/<版本>/claude`，只写精确路径会永远失配，因此必须用路径正则；当通过 `command claude` 或 IDE 内置终端绕过 shell 包装函数时，仍能把流量按到「住宅出口」。

## Claude 各客户端防漏注意事项

不同形态的 Claude 客户端对代理的遵循程度不同，日常按以下优先级与规矩操作：

1. **优先用终端 `claude`，少用桌面端 `Claude.app`**
   - **怎么做**：主力开发和长对话跑终端 `claude`；尽量少挂桌面端 `/Applications/Claude.app`。
   - **为什么**：终端 `claude` 有 `settings.json` 硬绑 `127.0.0.1:7865` + `claude-guard` 两道死锁（断链报 `ECONNREFUSED` 拒绝连接，绝不回落直连）；桌面端 `Claude.app` 是 Electron 应用，依赖系统代理，旁路更多。

2. **先关 `Claude.app` / 网页标签，再退出或重启 Clash Party**
   - **怎么做**：需要退出或重启 Clash Party 前，先彻底退出 `Claude.app`（`⌘Q`）并关掉浏览器的 `claude.ai` 标签页。
   - **为什么**：Clash Party 退出时会自动把 macOS 系统代理关掉（`HTTPEnable=0`）。后台还活着的 `Claude.app` 或网页检测到长连接断开，下一秒自动重连就会直接从物理网卡裸出国内宽带，没有终端 `7865` 那样的断链保护。

3. **开启语音模式或防 WebRTC 打洞（STUN）泄露**
   - **怎么做**：平时不用微信/会议语音时，在本地覆写 `x-smart` 打开 `webrtcGuard: { enabled: true }`；若常用 Chrome 网页版，给 Chrome 配置受管策略 `WebRtcIPHandling=disable_non_proxied_udp`（修改后需 `⌘Q` 重启 Chrome，在 `chrome://policy` 确认状态为 `Set`）。
   - **为什么**：WebRTC（网页实时通信，语音对话 LiveKit 等会用到）走 UDP 打洞（STUN 协议），**根本不经过 `7890` 系统 HTTP/SOCKS 代理**；且 `fake-ip-filter` 默认放行 `+.stun.*` 返回真实服务器 IP，在窄 TUN 下会顺着默认路由直连国内宽带，把真实公网 IP 暴露给对端（注意：`Claude.app` 是独立 Electron 应用，不读 Chrome 的受管策略文件）。

4. **桌面端 `Claude.app` 的本地 MCP 与内置虚拟机（Cowork）**
   - **怎么做**：在 `~/Library/Application Support/Claude/claude_desktop_config.json` 配置需要联网访问海外接口的 `mcpServers` 时，在对应服务的 `"env"` 里显式加上 `"HTTPS_PROXY": "http://127.0.0.1:7865"`（不涉及 AI 风控的普通工具填 `7890`）。
   - **为什么**：Electron 界面自身读系统代理，但它用子进程拉起的 Node / Python / 二进制 MCP 服务以及内置 Linux 虚拟机默认**不读 macOS 系统代理**。目前 `narrowTun.aiRouteAddress` 已接管 `223.5.5.5`、`198.18.0.0/16` 与 Anthropic 官方段 `160.79.104.0/21` 兜底，但显式写入 `HTTPS_PROXY` 才能保证子进程断链不裸奔。

5. **外出连手机热点 / 酒店 Wi-Fi / 插新网卡时**
   - **怎么做**：在外连热点或陌生 Wi-Fi 时，只用终端 `claude`；若必须用桌面端 `Claude.app`，先跑 `dig +short claude.ai` 确认返回 `198.18.x.x`（若返回非 `198.18` 的真实 IP，把系统 DNS 改成 `223.5.5.5` 或在面板临时开全量 TUN）。
   - **为什么**：手机热点（常为 `172.20.10.1`）和酒店路由器（`192.168.x.1`）下发的本地 DNS 不在窄 TUN 的静态劫持列表内，会导致不读系统代理的子进程逃出 TUN；同时 USB 共享网络等新接口默认会重新拿到运营商公网 IPv6（终端敲 `claude` 时守卫会自动检测并黄字告警）。

判定口径集中在 [`claude-guard/guard.conf`](../claude-guard/guard.conf)，出口 IP 白名单在
[`claude-guard/allowed-exit-ips`](../claude-guard/allowed-exit-ips)，`settings.json` 的 `env` 参考模板在
[`claude-guard/claude-settings.example.json`](../claude-guard/claude-settings.example.json)。
自检：在本仓库执行 `zsh claude-guard/selftest.zsh`（全程用临时夹具，不碰真实配置、不联网）。

> ⚠️ **这里原先贴过一份内联守卫代码，已废弃**：它用 `awk '/name: .*住宅-JP/'` 从 mihomo 配置取期望节点 IP，  
> 但面板里节点实际叫 `🏠 住宅-JP`，匹配恒为空 → `expect` 为空时 IP 一致性校验被静默跳过，  
> 等于「看着 OK、实则不设防」。现行版本改成显式白名单，**白名单缺失或为空直接拒绝启动**。

细节（fail-closed 判定顺序、速度约定、`claude-check` 输出解读、故障排查）见
[`claude-guard/README.md`](../claude-guard/README.md)。

## Claude Code 常驻会话（`~/.claude/remote` 的 ccd-cli）

远程 / 常驻会话由守护进程 `~/.claude/remote/srv/<hash>/server` 拉起若干 `ccd-cli` 子进程，  
每个子进程各自读 `settings.json` 的 `env`，**不需要单独配代理**。它们对 `api.anthropic.com`  
用的是 HTTP/2 长连接，空闲时只有心跳，所以面板里会长期挂着 `0 B/s` 的几行，属正常现象。

一条命令确认「全都走住宅、没有直连」：

```bash
lsof -nP -iTCP:7865 -sTCP:ESTABLISHED                    # 每个 ccd-cli 应有一条
lsof -nP -a -p <PID> -iTCP -sTCP:ESTABLISHED             # 只应出现 127.0.0.1:7865，无 x.x.x.x:443
```

- 出现 `x.x.x.x:443` 直连 → 该会话没拿到 env（多半是旧版本残留进程），关掉重开。
- 旧版本（如 `2.1.309`）遗留的会话会一直占着长连接，`kill <PID>` 即可，守护进程和其他会话不受影响。
- 守护进程本身不联网（只有 unix socket），所以「让它走住宅」实际就是「让每个子进程拿到 `env`」。

## 硬阻断（可选，需要 sudo）

想把「万一没走代理」彻底堵死，在 pf 层封掉 Anthropic 网段的直连（本机代理不受影响）。

> ⚠️ **只跑 `sudo pfctl -a <名字> -f -` 是没有效果的。** `-a` 只是把规则塞进一个命名
> anchor，而 macOS 默认的 `/etc/pf.conf` 里只挂了 `anchor "com.apple/*"`，没有任何一处
> 引用自定义 anchor。规则确实进了内核（`pfctl -a com.easyproxy -sr` 能看到两行），但
> 主规则集永远不会跳到它 —— 表现为 `nc -z 160.79.104.10 443` 照样通。

**永久生效**（写规则文件 + 在主规则集里挂 anchor）：

```bash
# 1) 规则文件
sudo tee /etc/pf.anchors/com.easyproxy >/dev/null <<'EOF'
# 只拦直连 Anthropic，经 127.0.0.1:7865 的流量不受影响
block drop out quick proto tcp to 160.79.104.0/21
block drop out quick inet6 proto tcp to 2607:6bc0::/32
EOF

# 2) 挂到主规则集末尾（缺这步等于没配）
printf '\nanchor "com.easyproxy"\nload anchor "com.easyproxy" from "/etc/pf.anchors/com.easyproxy"\n' | sudo tee -a /etc/pf.conf

# 3) 重载（会清空并重读主规则集，系统服务的 anchor 会在用到时重新挂回）
sudo pfctl -f /etc/pf.conf

# 4) 验证
sudo pfctl -a com.easyproxy -sr     # 应打印两行 block
nc -z -G 3 -w 3 160.79.104.10 443   # 现在应当失败/超时
```

**只想临时试、不想改 `/etc/pf.conf`**：塞进 `com.apple` 的子 anchor 即可。主规则集里
`anchor "com.apple/*"` 是通配点，新建的子 anchor 会被自动求值。

```bash
sudo pfctl -a com.apple/easyproxy -f /etc/pf.anchors/com.easyproxy
nc -z -G 3 -w 3 160.79.104.10 443   # 应立即失败
```

重启或重载主规则集后失效，适合先验证再落盘。

撤销：

```bash
sudo pfctl -a com.easyproxy -F rules          # 清掉规则
sudo pfctl -a com.apple/easyproxy -F rules    # 临时版则清这个
```

要永久关掉，再删掉 `/etc/pf.conf` 末尾两行（`anchor "com.easyproxy"` 与 `load anchor …`）。

> 经 `127.0.0.1:7865` 的流量不会被拦：Clash 连的是你在 `residential.yaml` 里填的住宅 IP（示例 `61.***193`），不在 Anthropic 网段。  
> `pfctl -e` 打印 `pf already enabled` 属正常提示，不是错误。

## Proxifier（不开 TUN 时 Antigravity 的唯一解）

> ⚠️ Proxifier 与 Clash 的 **TUN 模式会冲突**（流量被两边重复拦截，容易成环）。两者**二选一**，不要同时开。

取舍：

| 场景 | 选谁 |
| -- | -- |
| 要管住所有进程（含 Antigravity 的 `language_server`、`agy`） | **TUN**，把 Proxifier 扩展停掉 |
| 不想装 / 不想开 TUN | **Proxifier**，只代理个别进程，其余全部放行 |

不开 TUN 时，ChatGPT / Claude 桌面端靠系统 HTTP/HTTPS 代理已经够用（见 [路线 B](traffic-entry.md)），
Proxifier 只需要管住「不读代理」的那一类进程：

1. `Profile → Proxy Servers → Add`：`127.0.0.1:7865`，协议 **SOCKS5**（7865 固定走住宅出口）
2. `Profile → Proxification Rules → Add`：Applications 填
   `/Applications/Antigravity.app/Contents/Resources/bin/language_server`，Action 选刚建的代理
3. Default 规则设 `Direct`，别再套 7890，否则会跟系统代理打架
4. 检查「系统设置 → 通用 → 登录项与扩展 → 网络扩展」，Proxifier 扩展必须是启用状态

判断是否真生效：

```bash
lsof -nP -a -p $(pgrep -f "Resources/bin/language_server" | head -1) -iTCP | grep -v LISTEN
# 对了：目标 127.0.0.1:7865 且 ESTABLISHED
# 没对：目标仍是 172.217.x.x:443，状态 SYN_SENT
```
