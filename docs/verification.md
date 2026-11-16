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
`['🏠 住宅-JP', 'REJECT']`，`now` 就是那台住宅。若 `all` 里冒出第二台住宅节点，
说明锁定没生效——多半是 `primary` 和节点名没完全对上（emoji、空格都算），
脚本退回了「全部可选」，内核日志里会有 `[住宅出口] 锁定节点「…」不在本次节点列表` 这句。

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
