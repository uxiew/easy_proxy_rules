# 快速开始

装到 Clash Party / mihomo 上跑起来的最短路径，以及「改了没生效」时最先该看的两件事。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 三步启用

1. Clash Party → 覆写 → 新建 → 类型选 **远程**，填：
   ```
   https://raw.githubusercontent.com/uxiew/easy_proxy_rules/main/smart.js
   ```
   默认直连。实测本机直连 `raw.githubusercontent.com` 不通、`github.com` 正常，若更新总失败，
   再在前面加镜像前缀（如 `https://hk.gh-proxy.org/`）—— 但别长期挂着，镜像会延迟同步。
2. 设为**全局覆写**，模式切到「规则」（`global` 模式下所有规则失效）。
3. 想用静态住宅出口，再建一个本地 YAML 覆写，内容参考 [`residential.example.yaml`](../residential.example.yaml)。

> ⚠️ 本脚本会**整体替换** `proxy-groups` / `rules` / `rule-providers` 三个字段。  
> 所以所有 YAML 覆写都必须排在 `smart.js` **之后**，否则它们的规则会被整段丢掉（`proxies` 不受影响）。

## 一分钟验证

```bash
# AI 域名应走住宅 IP（7890 规则端口）
curl -x http://127.0.0.1:7890 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='

# 7865 住宅专用端口：访问任何域名都应返回住宅 IP 与家宽 ISP
curl -x socks5h://127.0.0.1:7865 https://claude.ai/cdn-cgi/trace | grep -E '^ip=|^loc='
curl -x http://127.0.0.1:7865 -s -A "Mozilla/5.0" https://api.ip.sb/geoip | jq '{ip,country,city,asn,isp}'
# 或改用 ipinfo.io（避免裸 curl 访问 api.ip.sb 被 Cloudflare 返回 HTML）：
# curl -x http://127.0.0.1:7865 -s https://ipinfo.io/json
```

> - **注意端口差异**：走 **7890（规则端口）** 访问 `api.ip.sb` 会落入 `forGlobal → AUTO`，显示机场 IP 是正常的；只有走 **7865（住宅专用端口）** 时查到的才是住宅出口（`api.ip.sb/geoip` 需带 `-A "Mozilla/5.0"`，或改用 `https://ipinfo.io/json`）。
> - **Claude Code 用户快捷入口**：加载 [`claude-guard`](clients.md#启动守卫与环境体检claude-guard) 后可直接运行 `claude-check`，一键完成双端口出口一致性、API 401/403、ISP 类型与 Edge Colo 自动核验，并输出 0–100 综合评分。

`ip=` 是住宅 IP 就说明链路通了。首次使用若「住宅出口」落在 `REJECT`（AI 站点打不开），
去面板里手动选一次住宅节点，`store-selected` 会记住；手机端由构建脚本锁定主节点，不用这步。
更完整的证据链见 [验证分流是否生效](verification.md)。

## 高频误区速查

| 现象 | 先看哪里 |
| --- | --- |
| 覆写 YAML 里的规则「凭空消失」 | 本页「三步启用」的覆写顺序警告 |
| 规则写对了、组名也对，但 App 一直转圈 | [流量怎么进内核](traffic-entry.md) |
| AI 站点打不开 / ChatGPT 报「非预期的 SSL 证书」 | [坑 11](troubleshooting.md)、[FlClash 手机端](flclash.md) |
| 手机 `detectradar` 报 WebRTC / DNS 暴露 | [坑 23](troubleshooting.md)（平台边界，不是配置错） |
| 没有家宽静态 IP，不想建住宅组 | [没有家宽怎么办](configuration.md)（设 `enabled: false`） |
| 改了规则集没生效 | [坑 4](troubleshooting.md)（本仓库规则走 raw，别挂镜像） |
| Tailscale 内网（`*.ts.net` / `100.64.0.0/10`）打不开或 502 | 需在系统代理绕过列表放行 `100.64.0.0/10` 与 `*.ts.net`，macOS 窄 TUN 另需配分域解析见 [流量怎么进内核](traffic-entry.md#路线-atun还要处理-dns) |

## 下一步读什么

- 想改配置 → [配置项详解](configuration.md)
- 想理解端口、分组、规则文件 → [端口、分组与文件结构](architecture.md)
- 手机 FlClash → [FlClash 与构建产物](flclash.md)
- 桌面客户端接入（Claude Code / Proxifier / pf）→ [桌面客户端接入](clients.md)
- 出问题时 → [踩过的坑](troubleshooting.md)
- 换了出口 IP 或凭据 → [防泄漏](security.md)
