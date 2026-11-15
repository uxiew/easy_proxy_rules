# 文档索引

[仓库首页](../README.md) 只保留定位和快速开始；所有配置细节、实测记录与排错手册按主题放在 `docs/`。
这里按「我要做什么」给入口，不用在一条长文档里从头翻到尾。

## 按需求找文档

| 我想… | 打开 |
| --- | --- |
| 第一次接入、验证链路通不通 | [快速开始](getting-started.md) |
| 改 `smart.js` 的配置项、搞清楚住宅三态开关 | [配置项详解](configuration.md) |
| 搞清楚 7890 / 7865 的区别、有哪些组 | [端口、分组与文件结构](architecture.md) |
| 解决「规则写对了但 App 一直转圈」 | [流量怎么进内核](traffic-entry.md) |
| 配 Claude Code / Proxifier / pf 硬阻断 | [桌面客户端接入](clients.md) |
| 生成手机覆写、理解构建期自检 | [FlClash 与构建产物](flclash.md) |
| 确认某条规则到底命中了什么 | [验证分流是否生效](verification.md) |
| 排查报错、换订阅后的怪现象 | [踩过的坑](troubleshooting.md) |
| 换了出口 IP / 凭据，维护防泄漏名单 | [防泄漏](security.md) |

## 全部文档

| 文件 | 主题 |
| --- | --- |
| [getting-started.md](getting-started.md) | 三步启用、一分钟验证、覆写顺序、高频误区速查 |
| [architecture.md](architecture.md) | 端口分工、策略组、`select`/`url-test`/`fallback`、国家优先、规则文件结构 |
| [traffic-entry.md](traffic-entry.md) | 应用级分流、TUN vs 系统代理、路线 A/B/C、窄 TUN、App 自建 DNS |
| [configuration.md](configuration.md) | 七个配置对象、DNS 用 IP 型 DoH、WebRTC guard、`dialer-proxy`、住宅成员顺序、无家宽三态、`auto` 边界、多出口预案（未实现） |
| [clients.md](clients.md) | Claude Code、`claude-guard`、常驻会话、pf 硬阻断、Proxifier |
| [flclash.md](flclash.md) | Android 客户端对比、`flclash-private.js` 生成与安装、构建期自检、手机端专有陷阱 |
| [security.md](security.md) | 三层防泄漏（hook / CI / 精确名单）、`sync-sensitive.mjs`、Secret 维护 |
| [troubleshooting.md](troubleshooting.md) | 23 条实测踩坑，按编号引用 |
| [verification.md](verification.md) | 出口验证、内核日志证据、fake-ip 下 `GEOIP,CN` 的三答案验收 |

## 建议阅读顺序

1. 新用户：[快速开始](getting-started.md) → [端口、分组与文件结构](architecture.md)
2. 要接住宅出口：[配置项详解](configuration.md) 的「没有家宽怎么办」与「住宅出口组的成员顺序」
3. 遇到连不上：[流量怎么进内核](traffic-entry.md) → [踩过的坑](troubleshooting.md)
4. 改过规则后：[验证分流是否生效](verification.md)

## 维护约定

- 新增长篇说明放 `docs/`，`README.md` 只放入口、速查表和指向这里的链接。
- 文档里的相对路径从 `docs/` 出发，指向仓库根要写 `../`（例如 `../smart.js`）。
- 「坑 N」统一引用 [troubleshooting.md](troubleshooting.md) 的编号；代码注释里也用这个文件名，别再写「见 README 坑 N」。
- 提交前跑 `node scripts/scan-sensitive.mjs --staged`；CI 会对全仓和全部提交信息再扫一遍。
