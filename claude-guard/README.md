# claude-guard — Claude Code 启动守卫与环境体检

Claude Code 终端代理守卫与多维环境体检工具，默认采用 **fail-closed** 策略：端口异常、拿不到出口 IP、出口不在白名单或被 Anthropic API 403 封锁时**直接阻止启动**，不在「连不上」与「回落直连暴露真实 IP」之间赌运气。

> 主仓库端口分工、规则集与住宅节点覆写见 [`../README.md`](../README.md)。  
> **与主仓库进程规则的双保险**：IDE / GUI 直接调用 `claude` 二进制时不经过 `~/.zshrc` 守卫，此时依赖 `~/.claude/settings.json` 中的显式代理（fail-closed）与 [`smart.js`](../smart.js) 内置的 `PROCESS-PATH-REGEX`（匹配 `/opt/homebrew/bin/claude` 与 Cask 解引用路径 `Caskroom/claude-code`）共同兜底。桌面端 `Claude.app`、WebRTC、外出热点等防漏注意事项见 [`../docs/clients.md`](../docs/clients.md)。

---

## 文件结构

| 文件 | 作用 | 修改后如何生效 |
| --- | --- | --- |
| [`claude-guard.zsh`](claude-guard.zsh) | 函数库：`claude` / `claude-check` / `claude-guard-allow` / `claude-guard-info` / `claude-guard-reload` | 新开终端或 `source ~/.zshrc` |
| [`guard.conf`](guard.conf) | 集中配置：端口、规则端口、时区、超时、IP 服务、探测开关、日志与脚本路径 | `claude-guard-reload` 或新开终端 |
| `allowed-exit-ips` | 出口 IP 白名单，一行一个 IPv4（不进 git，首次从 [`allowed-exit-ips.example`](allowed-exit-ips.example) 复制） | 立即生效（每次检查实时读取） |
| `.exit-ip.log` | 放行出口日志（`600` 权限，超 200 行自动裁剪保留最近 100 条，已入 `.gitignore`） | 自动记录，供 24h 稳定性统计 |
| [`config-check.mjs`](config-check.mjs) | 合并全部生效配置层，判定是否「仅设置了代理」 | 立即生效 |
| [`zshrc.snippet`](zshrc.snippet) | `~/.zshrc` 加载器片段（带起止标记） | 重新执行 `install.sh` |
| [`install.sh`](install.sh) / [`uninstall.sh`](uninstall.sh) | 幂等安装 / 卸载 `~/.zshrc` 加载块 | — |
| [`selftest.zsh`](selftest.zsh) | 离线全分支自检（临时夹具，零网络请求） | — |
| [`claude-settings.example.json`](claude-settings.example.json) | `~/.claude/settings.json` 的 `env` 参考模板（需手工核对，不会自动覆盖） | — |

---

## 安装与常用命令

```bash
# 1. 幂等安装加载器到 ~/.zshrc（安装/卸载前均会自动备份 ~/.zshrc）
zsh ~/Projects/easy_proxy_rules/claude-guard/install.sh

# 2. 准备白名单（填入你的住宅出口 IPv4）
cp ~/Projects/easy_proxy_rules/claude-guard/allowed-exit-ips.example \
   ~/Projects/easy_proxy_rules/claude-guard/allowed-exit-ips

# 3. 生效并查看状态
source ~/.zshrc
claude-guard-info       # 查看当前生效配置与路径（不联网）
claude-check            # 只读多维环境体检（不启动 claude）
```

如需自定义仓库路径，在 `~/.zshrc` 加载段**之前**设置：

```zsh
export EASY_PROXY_RULES_HOME=/abs/path/to/easy_proxy_rules
```

卸载：`zsh claude-guard/uninstall.sh`（只移除标记块，不改动 `~/.zshrc` 其余内容）。
> **注意**：库文件不可读时加载器仍会定义一个拦截型 `claude()` 防止裸奔，需彻底停用请跑 `uninstall.sh`。

---

## 启动守卫（`claude`）判定流程

执行 `claude` 时依次通过以下闸门，**任一关键项失败立即退出（`return 1`）**：

1. **端口存活**：`nc -z 127.0.0.1:7865` 检查住宅入口监听，未监听直接拒绝。
2. **本地配置告警**：纯本地零网络检查 shell 与各层 `settings*.json`，发现第三方端点、缺失代理、错误端口或 `NO_PROXY` 放行 `anthropic` 时打黄字告警（不拦截）。
3. **并行探测**：同时发起两项请求，不增加串行等待：
   - **出口 IP 查询**：按 `IP_SERVICES` 顺序短路，主服务成功即返回，全部失败则拒绝启动。
   - **Anthropic API 探测**（`CHECK_API=1`）：请求 `api.anthropic.com/v1/models`，返回 `403`（地区/风控封锁）直接拒绝；超时或非 `401/400/405/403` 仅告警放行。
4. **白名单精确比对**：`allowed-exit-ips` 缺失、为空或出口 IP 不在其中时拒绝启动（故意不自动学习新 IP）。
5. **IPv6 旁路告警**（`CHECK_IPV6=1`）：检测本机网卡公网 IPv6 地址并告警。
6. **记录与注入启动**：将本次 IP 写入 `.exit-ip.log`（`600` 权限，自动保留最近 100 条），固定 `TZ`、`LANG=en_US.UTF-8`、`LC_ALL=en_US.UTF-8`、`NODE_OPTIONS`（追加 `--dns-result-order=ipv4first`）及代理环境变量后调用 `command claude`。

| 拦截/告警场景 | 常见原因 | 处理方式 |
| --- | --- | --- |
| 端口未监听 | Clash Party 未开、`listeners` 变更 | 打开 Clash Party，执行 `nc -z 127.0.0.1 7865` |
| 拿不到出口 IP | 住宅节点 TLS 握手失败（`rc=35`）、订阅到期、跳板不通 | 在面板检查「住宅出口」及前置跳板 |
| API 返回 `403` | 出口 IP 所在地区受限或被 Cloudflare/Anthropic 风控 | 更换支持地区的干净住宅节点 |
| IP 不在白名单 | 住宅 IP 更换或策略组误切 | 执行 `claude-guard-allow`（自动核验支持地区与非机房 ISP 后追加，并同步 `.sensitive-patterns`） |

**应急绕过**：

```bash
CLAUDE_SKIP_IP_CHECK=1 claude ...   # 仅跳过白名单比对（端口、出口 IP 与 API 探测仍生效）
command claude ...                  # 跳过 zsh 守卫直接启动（仍受 settings.json 显式代理保护）
```

---

## 环境体检（`claude-check`）

只读体检命令，不启动 `claude`，零外部 `jq` / `python3` 依赖，覆盖 **8 个维度** 并输出 **0–100 量化评分 + 关键项一票否决 + 扣分修复建议**：

1. **代理链路与白名单**：核验 `7865` 端口存活、获取当前出口 IP、比对白名单。
2. **Anthropic 可达性与出口地区**：探测 `api.anthropic.com/v1/models`（`401` 正常、`403` 触发一票否决）、`claude.ai/robots.txt`、`claude.ai/cdn-cgi/trace`，识别受限国家/地区（如 `CN/HK/MO/RU/BY/IR/KP/CU/SY/VE`）及出口链路是否单一（IP 查询与 Cloudflare 观测 IP 是否一致）。
3. **分流一致性与代理形态**：比对住宅端口（`7865`）与规则端口（`7890→claude.ai`）出口 IP 是否一致（`RULE_PORT=0` 可跳过），并检查 macOS 是否误开外部 PAC 自动分流。
4. **IP 质量与 Edge Colo**：查询 `api.ip.sb/geoip`（带 `-A Mozilla/5.0`，失败自动回落 `ipinfo.io/json`），交叉核验 Cloudflare 与 IP 归属库国家码、识别常见机房 IDC 特征，并校验 Cloudflare 边缘机房（Colo）是否落在受限区或跨国绕行。
5. **Claude 生效配置「仅代理」**：调用 [`config-check.mjs`](config-check.mjs) 按 `shell < 用户级 settings.json < settings.local.json < 项目级 .claude/（向上 12 层）< 企业策略` 合并 `env`（密钥值永不输出），核验四项条件：
   - 无第三方 `ANTHROPIC_BASE_URL` / `API_URL` / `API_KEY` / `AUTH_TOKEN`；
   - `HTTP_PROXY` 与 `HTTPS_PROXY` 均指向 `guard.conf` 定义的住宅代理地址；
   - `NO_PROXY` 不含 `anthropic` 且不为 `*`；
   - 至少存在一个可解析的配置层。
6. **DNS 与时区三方自洽**：检查本地 DNS 解析（自动识别 mihomo `198.18.x.x` fake-ip 为正常，不误报劫持）、读取 mihomo `enhanced-mode`，并核对「系统 TZ / 守卫注入 TZ / 出口 IP 所在地 TZ」是否一致。
7. **旁路风险与 24h 出口稳定性**：检查本机网卡是否存在公网 IPv6 地址，并基于 `.exit-ip.log` 统计近 24 小时放行次数与出口 IP 跳变次数。
8. **综合评分**：满分 100 分；**🟢 ≥ 90 分且关键项无一票否决**判定为「优秀 · 环境适合运行 Claude」，其余按风险等级汇总扣分原因与修复建议。

---

## 配置参考（`guard.conf`）

所有可调参数均在 [`guard.conf`](guard.conf)（格式 `KEY=VALUE`，支持 `#` 注释与 `~/` 展开，每项在 `claude-guard.zsh` 中均有默认值兜底）：

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `7865` / `127.0.0.1` | 住宅入口监听地址；修改需同步更新 `settings.json` 与 mihomo 覆写 |
| `RULE_PORT` | `7890` | 规则分流端口，仅 `claude-check` 用于跨端口出口比对；设 `0` 跳过 |
| `TZ` | `Asia/Tokyo` | 注入给 `claude` 的时区，应与住宅出口所在地一致 |
| `IP_SERVICES` | `ipify / ifconfig.me / icanhazip` | 空格分隔，串行短路查询 |
| `TIMEOUT_MAIN` / `TIMEOUT_BACKUP` | `6` / `3` | 主/备用 IP 查询总超时（秒） |
| `CONNECT_TIMEOUT` | `3` | 连接阶段超时（秒），**勿低于 3**（`curl` 将代理 CONNECT 隧道计入连接阶段） |
| `ALLOWED_IPS_FILE` | `allowed-exit-ips` | 白名单文件路径（相对本目录或绝对路径） |
| `CONFIG_CHECK` | `config-check.mjs` | 配置层合并检查脚本路径 |
| `EXIT_LOG_FILE` | `.exit-ip.log` | 放行出口日志路径（用于 24h 稳定性统计） |
| `NODE_BIN` | `/opt/homebrew/bin/node` | 运行 `config-check.mjs` 的 Node 路径；留空则从 `PATH` 查找 |
| `MIHOMO_CONFIG` | `~/Library/Application Support/mihomo-party/work/config.yaml` | 仅 `claude-check` 读取 DNS `enhanced-mode` 用 |
| `CHECK_API` | `1` | 设为 `1` 时启动路径并行探测 `/v1/models`（403 拦截） |
| `CHECK_IPV6` | `1` | 设为 `1` 时启动路径检查公网 IPv6；设 `0` 仅在 `claude-check` 中检查 |

**Claude 侧代理配置**：参考 [`claude-settings.example.json`](claude-settings.example.json)，在 `~/.claude/settings.json` 的 `env` 中固定 `HTTP_PROXY` / `HTTPS_PROXY` 为 `http://127.0.0.1:7865`，`NO_PROXY` 为 `localhost,127.0.0.1`（切勿加入 `anthropic.com` 或 `*`）。

---

## 设计特性与已知边界

- **纯 zsh 内置热路径**：配置解析、JSON 提取、正则与时间戳格式化均使用 zsh 内置能力，零外部 `jq`/`python3` 依赖，尽量减少启动路径子进程开销。
- **并发与短路**：`claude` 启动时并行探测出口 IP 与 `/v1/models`，IP 查询主服务命中即短路，复杂多维体检（DNS、IP 质量、配置合并、24h 评分）全部下沉至 `claude-check`。
- **已知边界**：
  - 终端守卫仅通过 `~/.zshrc` 触发；IDE / GUI 直接启动二进制时依赖 `~/.claude/settings.json` 的显式代理与 `smart.js` 进程规则。
  - `ANTHROPIC_BASE_URL` 非官方端点默认只黄字告警不拦截，方便区分临时中转场景。
  - 若 `~/.claude/` 下存有含明文密钥的备用配置（如 `settings.*.json`），建议执行 `chmod 600 ~/.claude/settings.*.json` 限制同机读取权限。
  - 白名单按 IP 精确匹配且不自动学习新 IP，住宅出口变更后需先经 `claude-check` 核验归属再手工追加。

---

## 自检

```bash
zsh claude-guard/selftest.zsh
```

使用临时夹具与本地 `file://` mock 覆盖语法、函数加载、配置解析、白名单与 IP 短路、配置合并及守卫放行/拦截分支，**不产生网络请求，也不修改真实的 `~/.zshrc` 或 `~/.claude/`**。
