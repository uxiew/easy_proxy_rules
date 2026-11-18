# 流量怎么进内核（应用级分流 / TUN / 系统代理）

规则写对了却一直转圈，问题几乎都在这里：`PROCESS-*` 只给「已经进入内核」的连接贴标签。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 应用级分流（指定应用走指定组）

把「某个程序」直接按到「某个组 / 节点」，不依赖域名规则。**配置只有一处**：
`DEFAULT_CONFIG.appProxy`（[默认值](../smart.js)），平时用 `x-smart` 覆盖：

```yaml
x-smart:
  appProxy:
    # 方式一：专用端口（仅桌面端）
    ports:
      - { name: residential-in, port: 7865, proxy: 住宅出口 }   # 默认启用
      - { name: ai-in, port: 7866, proxy: AI }
    # 方式二：进程名 / 路径 / 路径正则 / 包名 / UID（桌面 + Android 通用）
    processes:
      - { value: Telegram, proxy: US }
      - { value: '/Applications/Cursor.app/Contents/MacOS/Cursor', type: path, proxy: AI }
      - { value: '^/Applications/Claude\.app/', type: path-regex, proxy: 住宅出口 }  # Electron 整个 App
      - { value: org.telegram.messenger, proxy: US }   # Android 包名
```

> 数组是**整体替换**：写了 `ports` 就等于换掉默认那条 7865，想保留就一起写上。

### 方式一：专用端口（桌面端）

| 字段      | 说明                             |
| ------- | ------------------------------ |
| `name`  | 监听名，**不能重复**（重复 = 配置加载失败）      |
| `port`  | 本机端口，监听在 `127.0.0.1`，**不能重复**  |
| `proxy` | 目标组名或节点名。写**组名**更稳——订阅更新后节点名会变 |

应用里把代理设为 `127.0.0.1:<port>` 即可，流量**完全跳过规则匹配**，整体从该组出去。  
端口类型是 `mixed`，HTTP 和 SOCKS5 都支持（Telegram 这类只认 SOCKS5 的客户端也能用）。

⚠️ **只在桌面端生效**。FlClash（Android）会跳过 `listeners`：手机应用基本没有「自填代理端口」  
这个入口（都走 VpnService），而且 Android 上多绑端口一旦被占用，内核会直接起不来。

### 方式二：进程 / 包名规则

生成的规则插在 `rules` **最前面**（`PROCESS-NAME` / `PROCESS-PATH` / `UID`），先于任何域名规则。  
顺序不能挪——放在 `DOMAIN-*` 之后会被直接截胡，等于没写。

**桌面端**：写进程名，或可执行文件绝对路径（`type: 'path'`）。

```bash
ps -Ao comm= | sed 's|.*/||' | sort -u    # 列出所有进程名
```

Electron 应用（Cursor / Slack / Notion）会派生多个 `xxx Helper` 子进程，`PROCESS-NAME` 只命中主二进制，  
Helper 的流量仍走默认规则——这种场景用专用端口（方式一）更彻底。

**Android**：进程名就是**包名**。

```bash
adb shell pm list packages | grep -i telegram    # → package:org.telegram.messenger
```

```js
{ value: 'org.telegram.messenger', proxy: 'US' },
{ value: 'com.android.chrome',     proxy: 'AUTO' },
{ value: 'com.tencent.mm',         proxy: 'DIRECT' },   // 微信直连，避免出口 IP 变化触发风控
```

Android 上是**三层**机制，别混：

| 层               | 在哪配                       | 决定什么                                  |
| --------------- | ------------------------- | ------------------------------------- |
| ① 哪些 App 进 VPN  | FlClash → 应用 页            | 没选中的 App 直接走物理网络，连内核都不进               |
| ② 进内核后走哪个组      | `appProxy.processes`（包名） | 同一个 VPN 内，Telegram 走 US、Chrome 走 AUTO |
| ③ 同一 App 内按域名细分 | `rules`                   | 例如 Chrome 里 claude.ai 走住宅、其余走 AUTO    |

> **仓库默认已启用 9 条**（见 `smart.js` 的 `DEFAULT_CONFIG.appProxy.processes`）：
>
> | 规则 | 目标 | 生效端 |
> | --- | --- | --- |
> | `com.whatsapp` / `com.talkatone.android` / `com.openai.chatgpt` / `com.anthropic.claude` | `住宅出口` | Android（包名） |
> | `PROCESS-PATH-REGEX,^/Applications/Claude\.app/` | `住宅出口` | macOS（Claude 桌面端） |
> | `PROCESS-PATH-REGEX,^/opt/homebrew/(bin/claude$\|Caskroom/claude-code)` | `住宅出口` | macOS（Claude Code CLI，含 Cask 软链接真实路径） |
> | `PROCESS-PATH-REGEX,^/Applications/ChatGPT\.app/` | `住宅出口` | macOS（ChatGPT 桌面端） |
> | `PROCESS-PATH-REGEX,^/Applications/Antigravity\.app/` | `AI` | macOS（Antigravity 桌面端） |
> | `PROCESS-PATH,/opt/homebrew/bin/agy` | `AI` | macOS（Antigravity CLI） |
>
> - **桌面端用路径正则而不是进程名**：Claude / ChatGPT / Antigravity 都是 Electron，真正建连的常是 `Xxx Helper`（network service）子进程，进程名还会被 macOS 截到 16 字符，精确匹配必漏。
> - **`claude` CLI 用路径正则而非精确路径**：Homebrew Cask 安装的 `/opt/homebrew/bin/claude` 是软链接，macOS 内核 `proc_pidpath` 拿到的是 `/opt/homebrew/Caskroom/claude-code@latest/<版本>/claude`，精确写 `/opt/homebrew/bin/claude` 会永远失配。用正则同时兜住软链接目标与直接安装路径，配合窄 TUN 为绕过 shell 守卫的调用兜底。
> - 桌面端命中指向 `住宅出口` 的规则 = 该 App 的**全部 TCP** 走住宅（含图片/静态资源）；**语音视频是 UDP**，会被导向 `udp: false` 的住宅节点而直接失败 —— 这是预料之中的取舍，见 [踩过的坑](troubleshooting.md)。

**验证包名规则是否真的命中**：看 FlClash 日志里连接后面的括号

```
[TCP] 192.168.1.5:51234(org.telegram.messenger) --> ...
```

有括号 = 内核拿到了包名，规则生效；**没有括号** = 内核拿不到进程信息，退回 UID：

```js
{ value: '10234', type: 'uid', proxy: 'US' },   // 生成 UID,10234,US
```

```bash
adb shell dumpsys package org.telegram.messenger | grep userId
```

⚠️ 包名 / 进程名写错**不会报错**，规则只是永不命中，表现是「配了但没效果」——所以务必先核对再重载。  
包名写的是**已安装应用**，改名/卸载后规则就失效了。

### 前提：流量得先进内核 —— TUN 与「系统代理」二选一

这是踩过的最贵的一课。规则写对了、组名也对，但 App 打开就是**一直转圈**，连接详情里根本看不到它的流量。

`PROCESS-*` 不负责拦截，它只是给**已经进入内核**的连接贴标签。桌面端流量只有两条入口：

| 路线 | 能覆盖什么 | 代价 |
| -- | -- | -- |
| **A. TUN（虚拟网卡）** | 全部进程。包括完全不读系统代理的：Antigravity 的 `language_server`（Go）、`agy`（Go）、ChatGPT 的 `codex`（Rust / Network.framework） | 需网络扩展；**与 Proxifier 扩展冲突**，二选一 |
| **B. 系统代理（HTTP/HTTPS）** | 主动读系统代理的程序：浏览器、ChatGPT / Claude 桌面端（Chromium / Electron）、多数 npm / pip / brew 类工具 | 不装扩展、随时可关；**管不住自建网络栈的进程** |

#### 路线 B（不开 TUN）—— 两个硬要求

**① HTTP 和 HTTPS 必须都开，只开 SOCKS 等于没开。**

Clash Party 的 `sysProxy.mode: manual` 正常会同时写 HTTP / HTTPS / SOCKS 三个。系统里只剩 SOCKS 时，Chromium 系会走 SOCKS5 并退化成**本地解析 DNS**，于是被污染 → 转圈。这是「不开 TUN 就转圈」最常见的真因，与住宅带宽无关。

```bash
# 检查：三个都应是 7890，HTTPEnable / HTTPSEnable 必须为 1
scutil --proxy | grep -E "HTTPEnable|HTTPPort|HTTPSEnable|HTTPSPort|SOCKSEnable|SOCKSPort"

# 修复（等价于在 Clash Party 里关一次再开「系统代理」）
networksetup -setwebproxy Wi-Fi 127.0.0.1 7890
networksetup -setsecurewebproxy Wi-Fi 127.0.0.1 7890
networksetup -setwebproxystate Wi-Fi on
networksetup -setsecurewebproxystate Wi-Fi on
```

走 HTTP 代理时**域名是交给 mihomo 远端解析的**，本地 DNS 污染不到它 —— 所以路线 B 不需要改系统 DNS，也不需要 fake-ip。

**② 规则里的 `PROCESS-*` 照样生效，一行都不用改。**

实测（TUN 关闭、仅系统 HTTP 代理）：ChatGPT 的 `Codex (Service)` 在关闭 TUN 之后**新建**的连接，全部命中 `ProcessPathRegex → 🏠 住宅-JP<住宅出口>`。内核能从本地端口反查到发起进程，所以进程规则不是 TUN 专属。

```bash
# 验证出口：不带 -x 也一样，浏览器/Electron 走的就是这条链
curl -s -x http://127.0.0.1:7890 https://chatgpt.com/cdn-cgi/trace | grep -E "^ip=|^loc="
#   ip=61.***193       loc=JP     ← 住宅出口（示例，出口 IP 已打码）
```

#### 路线 B 管不住的：Antigravity / `language_server`

`language_server` 是独立 Go 二进制，**三样都不认**（本机实测，全部无效）：

| 尝试 | 结果 |
| -- | -- |
| 系统代理（HTTP / HTTPS 全开） | 忽略，直接连物理网卡 |
| VS Code 的 `http.proxy` / `http.proxySupport` 设置 | 只对 Electron 主进程和扩展生效 |
| `open -a Antigravity --args --proxy-server=http://127.0.0.1:7890` | 只影响 Chromium 主进程，不影响它 fork 出来的子进程 |
| `HTTPS_PROXY=... /Applications/Antigravity.app/Contents/MacOS/Antigravity` | **无效**。它与后端走 gRPC，而 grpc-go 不做 env proxy 解析（`net/http.ProxyFromEnvironment` 只是被静态链接进来的死代码） |

> 别被 `strings language_server | grep HTTPS_PROXY` 骗到：二进制里确实有这些键名，那是 Go 静态链接把整个 `net/http` 拖进来的结果，不代表 gRPC 链路会用它。

卡住时的现场（`lsof -nP -a -p <lsp-pid> -iTCP`）：

```
TCP <本机内网IP>:56057->172.217.116.4:443            (SYN_SENT)   ← Google
TCP [2409:...]:56056->[2001:4860:4845:400::]:443       (SYN_SENT)   ← Google IPv6
```

一直 `SYN_SENT` 不 `ESTABLISHED` = 连不上，界面就是「加载中」。

**结论：`language_server` 只认 IP 层拦截。** 三条路选一条：

| 方案 | 影响面 | 适用 |
| -- | -- | -- |
| 全量 TUN | 整机流量进内核 | 已经在用 TUN，无所谓 |
| **窄 TUN**（推荐） | **只接管 Google 网段**，默认路由不变 | 不想全量 TUN，又不想装 Proxifier |
| Proxifier | 只代理指定进程 | 不想动 TUN |

#### 路线 C：窄 TUN（只把 Google 段塞进内核）

思路很简单：TUN 不接管 `0.0.0.0/1`，只接管 `language_server` 实际会连的那几个 Google 段。
局域网、Tailscale、内网服务、国内站点**完全不经过内核**，默认路由仍是路由器。

脚本里已经内置，改 `narrowTun` 即可（`x-smart` 覆盖）：

```yaml
x-smart:
  narrowTun:
    enabled: true              # false = 恢复「面板说了算」
    routeAddress:
      - 142.250.0.0/15
      - 172.217.0.0/16
      - 172.253.0.0/16
      - 216.58.0.0/16
      - 74.125.0.0/16
      - 108.177.0.0/17
      - 64.233.160.0/19
      - 72.14.192.0/18
      - 173.194.0.0/16
      - 209.85.128.0/17
      - '2001:4860::/32'
      - '2404:6800::/32'
      - '2607:f8b0::/32'
    stack: Mixed
```

生效后 `netstat` 里只会多出这些路由，默认路由纹丝不动：

```
$ netstat -rn -f inet | grep utun1500
142.250/15      198.18.0.1   UGSc   utun1500
172.217         198.18.0.1   UGSc   utun1500
...
$ netstat -rn -f inet | grep ^default
default         <路由器网关IP> UGScg  en0        ← 没被夺走
```

判定 `language_server` 真的活了：源地址变成 `198.18.0.1` 且 `ESTABLISHED`

```bash
lsof -nP -a -p $(pgrep -f "Resources/bin/language_server" | head -1) -iTCP | grep -v LISTEN
# TCP 198.18.0.1:65183->172.253.120.126:443 (ESTABLISHED)   ← 对了
# TCP <本机内网IP>:65100->172.253.120.126:443 (SYN_SENT)    ← 还在直连，段漏了
```

进内核后仍然按进程规则分流，连接页里能看到 `🏠 住宅出口`：

```
172.253.120.126 | 🏠 住宅-JP<住宅出口 | ProcessPathRegex
172.217.118.4   | 🏠 住宅-JP<住宅出口 | ProcessPathRegex
```

> ⚠️ 段要维护。这是「实测见过的 Google 段」的并集，不是官方完整列表：
> `172.253.0.0/16` 就是补出来的 —— 少了它会看到 `172.253.120.x` 一直 `SYN_SENT`。
> 某天 Antigravity 换后端、又卡住，用上面的 `lsof` 看它连哪个段再补。

##### AI 客户端长连接（`includeAI`）

`narrowTun.includeAI` 解决另一类直连：ChatGPT 桌面端的 Remote Control / Codex enrollment
由后台进程建常驻 WebSocket，它**不读 macOS 系统代理**，自己用系统 DNS 解析 → 拿到被污染的
假 IP → 直连超时，桌面端报 `Pairing code unavailable: Remote control failed to connect`，配对码/二维码都生成不出来。

打开后 `route-address` 额外追加五段，`dns-hijack` 置为 `any:53`：

```text
223.5.5.5/32      系统 DNS —— 不进 TUN 就劫持不到（需确保系统 DNS 指向它）
119.29.29.29/32   dns.default-nameserver 里的备用项 + 换网络后备用的公网 DNS
198.18.0.0/16     fake-ip-range —— 域名流量进内核的入口
160.79.104.0/21   Anthropic 官方 IPv4 段 —— 兜住绕过代理与 fake-ip 直连 IP 的子进程
2607:6bc0::/32    Anthropic 官方 IPv6 段
```

链路：DNS 查询进内核被劫持 → Clash 返回 fake-ip → 应用连 `198.18.x.x` 进内核 →
命中 `PROCESS-PATH-REGEX,^/Applications/ChatGPT\.app/` 或 `RULE-SET,aiStrict` → 住宅出口。

###### 边界：这不是全量 TUN，也**不要**改成全量 TUN

契约是「默认路由永远不动」，入口侧各维度的实际行为如下：

| 维度 | 状态 |
| --- | --- |
| 默认路由 | 仍指向路由器网关，`netstat -rn \| grep utun1500` 里**没有** `0.0.0.0/1` |
| 局域网 / Tailscale / 内网 | 不进 TUN（仅白名单段进 TUN） |
| 纯 IP 直连（不查 DNS） | 仍是窄的，仅接管 Google 网段与 Anthropic 官方段（`160.79.104.0/21`） |
| **域名流量** | **全部进内核**——任何域名被解析成 fake-ip 后，连接都会落到 TUN；国内域名经 `geosite:cn` 过滤后仍返回真实 IP 直连 |
| 出站分流 | 不变，仍按规则链走 |

也就是说：窄 TUN 从「按 IP 窄」变成了「按域名归内核 + 按规则出口」，整机 DNS 对内核的依赖变重了
（内核挂了 DNS 就断），但不要用「反正都接管了」当理由把 `route-address` 改成 `0.0.0.0/0`。
将 `includeAI` 设为 `false` 即可恢复「只接管 Google 段」的旧行为。

###### 换网络自查与验证

劫持成立的前提是「系统 DNS 的地址恰好被路由进 TUN」。如果换了 Wi-Fi 后路由器把 DNS 改成路由器自身地址（如 `192.168.1.1`）或其它未进 TUN 的 ISP DNS，查询就不会被劫持，导致长连接重新失败。换网或修改后可用以下命令验证：

```bash
scutil --dns | grep "nameserver\[0\]"   # 不是 223.5.5.5 / 119.29.29.29 时需切系统 DNS 或补进 aiRouteAddress
dig +short chatgpt.com                  # 应返回 198.18.x.x，返回真实 IP = 劫持已失效
curl -4 --noproxy '*' -o /dev/null -w '%{http_code}\n' https://chatgpt.com/  # 应返回 200
netstat -rn -f inet | grep utun1500     # 应含 198.18/16、223.5.5.5，且没有 0.0.0.0/1
```

> ⚠️ Clash Party 面板的 TUN 开关会写回 `mihomo.yaml` 的 `tun.enable`，与脚本输出不一致。
> 若通过本地覆写副本加载 `smart.js`，需保证 `smart.js`（或 `x-smart`）里的 `narrowTun` 与
> 面板 `mihomo.yaml` 的 `tun.enable` 一致，否则只改脚本可能被面板的 `tun.enable: false` 覆盖。

###### 同一站点的「页面」和「登录态」必须同出口

`includeAI` 只解决「连不上」，不解决「登录态割裂」。例如 `muse.ai` 的页面若走机场 `AUTO`，
而它的登录态域名 `auth.meta.com` / `accounts.meta.com` 走 `住宅出口`，OAuth 在两个出口 IP
之间跳会导致会话绑不上，表现为白屏、`401 Authentication required` 或反复弹登录。

规则：**一个 AI 产品的所有域名必须落在同一梯队**。新增站点时先确认它的认证域走哪条规则，
再决定主域放哪。`meta.com` / `muse.ai` 这类现在统一收在 `ai-strict.list` 的 Meta 段里。

##### 报错先分「链路」还是「服务端」

界面上看到的报错一律不可信，去翻语言服务器自己的日志，它会写清是 `dial tcp ... i/o timeout`
（链路问题，段漏了）还是 `code 503: No capacity available for model ...`（Google 侧容量问题，跟代理无关）：

```bash
tail -40 ~/Library/Logs/Antigravity/language_server.log
```

典型两类：

```
E1106 22:23:19  .../ListTriggers (unknown): dial tcp 172.253.120.126:443: i/o timeout
  → 这个段没进 TUN，补 routeAddress
I1106 22:49:06  run.go:307] Run: attempt 2 failed (UNAVAILABLE (code 503):
                 No capacity available for model gemini-4-argon-high on the server)
  → 链路已通，是模型没容量：换模型或等一会儿，别去改代理
```

另一种常见现象是 UI 显示 `Model unavailable, retrying in 6s (attempt 2/9)` —— 那就是上面这条 503 的前端措辞。
判断依据始终是日志里的 `dial tcp` / `code 503` 两个关键词。

#### 路线 A（TUN）还要处理 DNS

**根因：DNS 被污染。** 就算 TUN 接管了流量，App 仍然自己做 DNS。系统 DNS 若指向路由器网关或 Tailscale MagicDNS（`100.100.100.100`），这些地址走 LAN / Tailscale 路由，**不进 TUN**，`dns-hijack: any:53` 劫持不到，解析结果就是被污染的假 IP（如 `chatgpt.com` 解析到失效 IP），导致后台长连接反复超时。

```bash
# 1) 开 TUN：Clash Party 首页「虚拟网卡 / TUN」开关，或 mihomo.yaml 里 tun.enable: true
# 2) 把系统 DNS 指到一个会流经 TUN 的公网解析器（223.5.5.5 本身也通，关掉 TUN 也能用）
networksetup -setdnsservers "Wi-Fi" 223.5.5.5
# 3) 关掉 Tailscale 的 DNS 接管，否则 resolver #1 永远是 100.100.100.100
/Applications/Tailscale.app/Contents/MacOS/Tailscale set --accept-dns=false
```

验证：`dig +short chatgpt.com` 必须返回 **`198.18.x.x`**（fake-ip）。返回真实 IP 就说明 DNS 还没进内核。

```bash
# 看进程规则到底命中了没有（hitCount 不涨 = 流量没进内核）
SOCK=$(ls -t /tmp/mihomo-party-*.sock | head -1)
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/rules | \
python3 -c "import sys,json;[print(r['payload'],'hit=',r['extra']['hitCount']) for r in json.load(sys.stdin)['rules'] if 'Process' in r['type']]"
```

副作用要知道：TUN 与 Proxifier 的系统扩展会互相干扰，二选一；关闭 Tailscale 的 DNS 接管后，`*.ts.net` 这类 MagicDNS 名字不再能解析（Tailscale 本身连接受影响，节点仍在）。

### App 自己解析 DNS / 直连 IP（WhatsApp、Talkatone 这类）

有些 App 不走系统 DNS：内部硬编码 `8.8.8.8:53`，拿到真实 IP 再去连。于是会看到三个连锁现象：

- 连接里只有 IP、没有域名 → 所有 `DOMAIN-*` 规则天然失配，连接详情里「规则」显示 **`Match`**；
- 它那条裸 DNS 是 **UDP:53**，住宅节点 `udp: false` 过不去 → 掉进 `CATCH → AUTO`（机场）；
- 语音/视频的媒体流也是 UDP，同样进不了住宅 → 形成「信令走住宅、**媒体走机场**」的混线，  
  可能出现单通、无声、偶发重连。

Talkatone 实测现场：`进程 com.talkatone.android(10410)` / `规则 Match` / `目标 8.8.8.8:53` / `代理链 CATCH → AUTO → 机场`。

**处理顺序（照这套走，其它 App 一样）**

| 步骤 | 做什么                             | 作用                                                 |
| -- | ------------------------------- | -------------------------------------------------- |
| ①  | `appProxy.processes` 写包名 / 进程名 | 唯一能按住「纯 IP 连接」的手段，域名规则救不了                          |
| ②  | FlClash 开「DNS 劫持 / Fake-IP」     | 裸 53 被内核接管 → 返回 fake-ip → 连接重新带上域名，规则恢复可用          |
| ②′ | 开不了劫持：加 `DST-PORT,53,US`        | 仍走机场，但解析地区与出口对齐，避免拿到亚洲边缘                           |
| ③  | 语音类别指望住宅                        | 住宅 socks5 不支持 UDP，**别**去开 `udp: true`，多数住宅商开了直接连不上 |

```js
// WhatsApp：桌面进程名 / Android 包名（商务版 com.whatsapp.w4b）
{ value: 'WhatsApp', proxy: '住宅出口' },
{ value: 'com.whatsapp', proxy: '住宅出口' },
{ value: 'com.whatsapp.w4b', proxy: '住宅出口' },
```

判断是否生效：看连接详情的「规则」——`PROCESS-NAME` / `PROCESS-PATH` / `PROCESS-PATH-REGEX` / `UID`
说明 processes 生效；`Match` 说明没命中任何规则，正在走 `CATCH`（纯 IP 连接的典型表现）。

> 同类清单（都自带 DNS 或大量 IP 直连）：Talkatone、WhatsApp、Telegram 语音、Discord 语音、  
> 部分手游与银行 App。它们的共同点：**规则看不到域名，UDP 也进不了住宅**。
