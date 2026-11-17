# 验证分流是否生效

从「页面能不能开」升级到「首条命中 → 最终出站」的证据链，含 fake-ip 下 GEOIP,CN 的三答案验收。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

最快的两条命令：`ip=` 是住宅 IP，说明「规则 → 组 → 节点」这条链通了。

```bash
# 看某个域名实际走了哪个出口（Claude 域名会走住宅）
curl -x http://127.0.0.1:7890 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='

# 验证住宅专用端口（7865）—— 访问任何域名都应返回住宅 IP
curl -x socks5h://127.0.0.1:7865 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='
```

> 别用 `api.ip.sb` 验证住宅出口——它走 `forGlobal → AUTO`，显示机场 IP 是正常的。

最直接的证据是内核日志，它会打出命中的规则和最终出口：

```bash
SOCK=$(ls -t /tmp/mihomo-party-*.sock | head -1)
curl -s --noproxy '*' --unix-socket "$SOCK" "http://localhost/logs?level=info" > /tmp/live.log &
sleep 1 && curl -x http://127.0.0.1:7890 -o /dev/null https://claude.ai/
# 输出形如：
#   [TCP] ... --> claude.ai:443 match RuleSet(aiStrict) using 住宅出口[🏠 住宅-JP]
```

组内实际成员 / 当前选择也可以直接查：

```bash
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['proxies'];print(p['住宅出口']['all'], p['住宅出口']['now'])"
```

锁定模式（`RESIDENTIAL.pinOnly: true` + 有 `primary`）下，`all` 应该**只有两项**：
`['🏠 住宅-JP', 'REJECT']`，`now` 就是那台住宅。三种异常各自对应一句话：

| `all` 实际内容                          | 含义                                                     | 去看哪                                                                    |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `['REJECT']`（一项）                    | `primary` 写错/订阅改名 → 锁不上，按 `pinMiss: 'reject'` 只留阻断        | 内核日志 `[住宅出口] 锁定目标 …`；把 `primary` 改成名字里稳定的一段 |
| `[节点A, 节点B, …, 'REJECT']`（多台）      | 锁没生效：`pinOnly: false`，或写了 `pinMiss: 'collect'`           | [坑 24](troubleshooting.md)                                            |
| `['COMPATIBLE']` / 组不存在              | 组空（内核塞占位直连）或没建组                                          | 坑 6、`enabled` 判定日志                                                     |

住宅节点有没有接上跳板，看这两个地方：

```bash
# 1) 配置里该节点有没有 dialer-proxy（日志更直接）
#    [住宅出口] 已给 N 个订阅自带住宅节点补上 dialer-proxy: 前置-亚洲（…）
# 2) 前置组当前选中的是谁（它一换，经住宅的长连接会断一次）
curl -s --noproxy '*' --unix-socket "$SOCK" http://localhost/proxies \
  | python3 -c "import sys,json;p=json.load(sys.stdin)['proxies'];print(p['前置-亚洲'].get('now'), len(p['前置-亚洲']['all']))"
```

## 国内直连兜底的三答案验收

只看一个页面通不通，判断不了 `GEOIP,CN` 兜底有没有误伤。同一个域名在不同网络下会拿到
**三类答案**，每类都要单独走一遍「首条命中 → 最终出站」：

| 解析答案 | 典型来源 | 期望首条命中 | 期望出站 |
| --- | --- | --- | --- |
| **纯中国 IP** | 国内递归（223.5.5.5）解析国内站 | 域名类走 `GEOSITE,cn` → `DIRECT`；直连 IP 走 `GEOIP,CN` → `DIRECT` | 直连 |
| **纯境外 IP** | 境外递归解析同一域名 | 业务规则（`forAI` / `forGlobal`）→ `AI` / `AUTO` | 机场节点 |
| **混合答案** | ECS 就近解析、CDN 同时返回国内外 IP | 以**第一条命中**为准，且每次稳定 | 不能一次直连一次走机场 |

```bash
# ① 真实解析答案：直接问上游，绕开内核
#    fake-ip 模式下内核只会回 198.18.x.x，看不到真实答案属于哪一类
dig +short @223.5.5.5 example.com     # 国内递归
dig +short @1.1.1.1   example.com     # 境外递归

# ② 内核视角：只有回 198.18.x.x 才说明这个域名进了内核（fake-ip 生效）
dig +short @127.0.0.1 -p 1053 example.com

# ③ 两条入口各走一遍：域名访问 / 直连 IP 访问
curl -x http://127.0.0.1:7890 https://example.com/cdn-cgi/trace | grep -E '^ip=|^loc='
curl -x http://127.0.0.1:7890 "https://$(dig +short @1.1.1.1 example.com | head -1)/" 2>/dev/null
```

**关键点：`GEOIP,CN` 只对「IP 入口」有效。** fake-ip 下域名请求根本不会带真实 IP 去匹配 IP 规则，
所以同一个站会分两条路：

- 域名入口 → 命中的是域名规则（`GEOSITE,cn`、`RULE-SET,forAI`…）；
- 直连 IP 入口 → 才轮到 `GEOIP,CN` 兜底，也才可能因为「境外解析出中国 IP」被误判直连。

三个判据（缺一条都算「未验证」，不能算通过）：

1. **解析答案**属于哪一类（纯中国 / 纯境外 / 混合）；
2. 内核日志里这条连接**首条命中**是哪条规则（`GEOSITE,cn`、`GEOIP,CN` 还是 `RULE-SET,forAI`）；
3. 最终 `using` 的组 / 节点，以及 trace 里的 `loc`。

> 典型漏法：域名解析出**混合 IP**，程序又喜欢直连 IP（SDK、桌面客户端），首条命中落到
> `GEOIP,CN → DIRECT` → 本该走机场的流量裸连出去。只测「浏览器能不能打开」永远发现不了这个，
> 因为浏览器那一侧走的是域名规则。

---

## `dialer-proxy` 到底走没走

链式代理最容易出的错是「以为在走跳板，其实直连了」（`dialer-proxy` 写错名字时内核直接
`Parse config error`；写在 http 节点上时，旧版本会静默忽略）。别靠面板上的延迟猜，起个假前置看它收不收连接：

```bash
# 1) 假前置：只记录被 CONNECT 到哪里，不真转发
node -e '
const net=require("net");
net.createServer(c=>{c.once("data",()=>{c.write(Buffer.from([5,0]));c.once("data",r=>{
  const n=r[4],host=r.subarray(5,5+n).toString();
  console.log("前置收到 CONNECT", host+":"+r.readUInt16BE(r.length-2));c.destroy();});});})
 .listen(11080,"127.0.0.1",()=>console.log("假前置 11080"));'

# 2) 一份最小配置：http 落地 + dialer-proxy 指向假前置
cat > /tmp/dp.yaml <<'YAML'
mixed-port: 17891
proxies:
  - { name: FRONT, type: socks5, server: 127.0.0.1, port: 11080, udp: false }
  - { name: RESI,  type: http,    server: 1.1.1.1,   port: 80, dialer-proxy: FRONT }
proxy-groups:
  - { name: G, type: select, proxies: [RESI] }
rules: [ 'MATCH,G' ]
YAML

# 3) 起内核 + 发一个请求，看第 1 步的终端有没有打出「前置收到 CONNECT」
mihomo -d /tmp -f /tmp/dp.yaml &
curl -x http://127.0.0.1:17891 http://example.com/ -o /dev/null
```

- **打出了** → `dialer-proxy` 生效（`type: http` 也一样，实测 v1.19.32）；
- **没打出** → 这条链是直的：先查日志里的 `dialer-proxy [...] not found`（[坑 28](troubleshooting.md)）；
- **内核起不来 + `Parse config error`** → 名字写错了，不是「不生效」而是致命。

`dialer-proxy` 指向**策略组**时，前置那组的健康检查也会走它（假前置会先收到一条
`www.gstatic.com:443`）—— 这条日志正好可以确认「组真的被用上了」。

## 订阅自带住宅的三件事

接这类订阅（一两百个 `type: http`、共用网关、名字带 IP）后按顺序查三件：

```bash
# ① 组还在不在（被脚本重建丢掉 = 内核起不来）
grep -c "name: 前置-" work/config.yaml

# ② 住宅出口锁的是不是你要的那一台
curl -s http://127.0.0.1:9090/proxies | jq '.proxies["住宅出口"] | {now, all: (.all|length), all0: .all[0]}'
#   期望：now = 那台东京住宅，all 长度 2（[那台, REJECT]）

# ③ 出口到底是不是家宽 —— 看 ASN，不看城市
curl -x http://127.0.0.1:7865 -s https://api.ip.sb/geoip | jq '{ip,country,city,asn,isp}'
#   住宅 IP 的 asn/isp 会显示运营商名（如 NTT / KDDI），机场节点显示机房名（Vultr / Hetzner）
```

第 ③ 步是这套配置唯一真正的验收标准：**ASN 是家宽运营商才算走了住宅**，
城市对得上但 ASN 是机房，说明你走的是机场节点，不是家宽。
