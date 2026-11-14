# claude-guard — Claude Code 启动守卫与环境体检

本目录收拢了原来散在 `~/.zshrc`（237 行内联 shell）和 `~/.config/claude-guard/`（两个文件）
的全部「Claude 走住宅出口」相关规则。**唯一配置源在本目录**，`~/.zshrc` 只保留一段加载器。

父项目（端口分工、规则集、住宅节点覆写）见 [`../README.md`](../README.md)。

---

## 解决什么问题

`~/.claude/settings.json` 里的 `HTTPS_PROXY` 是「显式指定代理」，本身已经 fail-closed：
端口消失时拿到 `ECONNREFUSED`，**不会**像系统代理那样静默回落直连。真正会漏的是：

| 漏法 | 后果 | 本目录对应闸门 |
| --- | --- | --- |
| 端口还活着，但「住宅出口」被切到机场节点 | 同账号 IP 跳变，比断网更危险 | 出口 IP 白名单比对 |
| IDE / GUI 启动，或有人改了 `settings.json` 把代理删了 | 不读加载器、直接直连暴露真实 IP | `_claude_config_warn` 配置一致性告警 |
| 项目级 `.claude/settings.local.json` 塞了第三方 `ANTHROPIC_BASE_URL` | 提示词与密钥发给第三方中转 | `claude-check` 合并所有配置层判定「仅代理」 |
| 不读 `settings.json` 的脚本 / SDK | Clash Party 挂掉时静默直连 | `claude()` 包装函数统一注入代理环境变量 |

> 设计基调是 **fail-closed**：宁可拒绝启动，也不在「连不上」和「直连暴露 IP」之间赌运气。

---

## 目录结构

| 文件 | 作用 | 改它之后 |
| --- | --- | --- |
| `claude-guard.zsh` | 函数库：`claude()` / `claude-check()` / 辅助函数 | 新开终端或 `source ~/.zshrc` |
| `guard.conf` | **集中配置**：端口、超时、IP 服务、路径、node、IPv6 开关 | `claude-guard-reload` 或新开终端 |
| `allowed-exit-ips` | 出口 IP 白名单，一行一个 IPv4（**不进 git**，首次用 `cp allowed-exit-ips.example allowed-exit-ips`） | 立即生效（每次守卫重新读） |
| `config-check.mjs` | 合并所有生效配置层，判定「是否只设置了代理」 | 立即生效 |
| `zshrc.snippet` | `~/.zshrc` 加载器片段（带 `>>>` / `<<<` 标记） | 跑 `install.sh` 重新写入 |
| `install.sh` / `uninstall.sh` | 幂等安装 / 卸载加载器 | — |
| `selftest.zsh` | 全分支自检（临时夹具，零网络、不碰真实配置） | — |
| `claude-settings.example.json` | `~/.claude/settings.json` 的 `env` 参考模板 | 手工比对，**不会自动覆盖** |

`~/.config/claude-guard/` 里的 `allowed-exit-ips` / `config-check.mjs` 现在是**指向本目录的软链接**
（见该目录的 `MOVED.md`），只为兼容旧引用，不要改软链那侧。

---

## 安装与生效

```bash
# 幂等：重复执行不会产生多段加载器
zsh ~/Projects/easy_proxy_rules/claude-guard/install.sh

# 当前终端生效（或新开一个窗口）
source ~/.zshrc
claude-guard-info       # 确认规则目录 / 配置值
claude-check            # 只读体检，不启动 claude
```

加载器支持改仓库位置，在 `~/.zshrc` 的加载段**之前**写：

```zsh
export EASY_PROXY_RULES_HOME=/abs/path/to/easy_proxy_rules
```

卸载：`zsh claude-guard/uninstall.sh`（只删标记块，不动其它 `.zshrc` 内容）。
`install.sh` / `uninstall.sh` 每次都会先备份 `~/.zshrc`。

> **库文件缺失时不是「没有守卫」而是「拒绝启动」**：加载器会定义一个拦截型 `claude()`，
> 明确提示 `command claude ...` 才是应急绕过。别把这段删了当卸载。

---

## 判定逻辑

### 启动路径（`claude`，按顺序，任一失败即 `return 1`）

```
1. nc -z 127.0.0.1:7865        端口不活 ─────────────► 拒绝
2. [告警] shell 的非官方端点 / 配置一致性（纯本地，零网络，只警告不拦截）
3. 出口 IP 查询                 主服务成功立刻返回；全失败 ─► 拒绝
4. 读白名单                     缺失 / 无有效 IP ──────► 拒绝
5. 出口 IP ∈ 白名单             不匹配 ──────────────► 拒绝
6. [告警] IPv6 全局地址（可用 CHECK_IPV6=0 关掉）
7. 放行：打印 代理 OK → ...，注入 TZ/LANG/NODE_OPTIONS/代理变量后 command claude
```

| 闸门 | 拦截条件 | 典型恢复 |
| --- | --- | --- |
| 端口 | Clash Party 没开 / 覆写里 `listeners` 被改 / 进程崩了 | 打开 Clash Party，`nc -z 127.0.0.1 7865` |
| 出口 IP | 住宅节点 TLS 握手失败（`curl rc=35`）、订阅到期、策略组被切走 | 面板确认「住宅出口」选中的节点；`curl -s --max-time 8 -x http://127.0.0.1:7865 https://api.anthropic.com` |
| 白名单 | 住宅 IP 换了一批 / 文件被清空 | `echo 新IP >> claude-guard/allowed-exit-ips`（旧 IP 可留着回滚） |
| 配置告警 | `settings.json` 被塞第三方端点 / 代理被删或改端口 / `NO_PROXY` 放行 anthropic | 跑 `claude-check` 定位来源 |

**应急绕过**

```bash
CLAUDE_SKIP_IP_CHECK=1 claude ...   # 只跳过白名单比对；端口检查 + 出口 IP 查询仍然生效
command claude ...                  # 完全绕过守卫；settings.json 仍把代理固定在 7865，不会直连
/opt/homebrew/bin/claude ...        # 同上，绝对路径
```

### 手动体检（`claude-check`）

只读、不启动 `claude`，可放心重复跑：代理链路与白名单 → **生效配置「仅代理」判定** →
DNS → 环境指纹 → 旁路风险 → 规则仓库路径。

「仅代理」由 `config-check.mjs` 按 `shell < 用户级 settings.json < settings.local.json <
项目级 .claude/（沿 cwd 向上 12 层）< 企业策略` 合并 `env` 后判定，四条全满足才算 `OK`：

1. 无任何 `ANTHROPIC_BASE_URL` / `API_URL` / `API_KEY` / `AUTH_TOKEN`；
2. `HTTP_PROXY` 与 `HTTPS_PROXY` 都等于 `guard.conf` 拼出的期望值（默认 `http://127.0.0.1:7865`）；
3. `NO_PROXY` 不含 `anthropic` 也不是 `*`；
4. 至少存在一个可解析的配置层。

**密钥值一律不输出**，端点 URL 会显示（便于确认来源）。配置层的 `env` 优先级高于 shell，
也高于 `claude()` 里显式 export 的代理；`shell` 来源的代理会被判为「配置层未设置」（IDE/GUI 启动时无代理）。

> DNS 那节**仅供参考**：`dig` 查的是本机解析器，Claude 走 7865 的 CONNECT 隧道时域名由 mihomo
> 远端解析。开了 `enhanced-mode: fake-ip` 时返回 `198.18.x.x` 是正常产物，脚本会明确标注，不当异常报。
> Chrome 受管策略检查已移除 —— CLI 不经过 Chromium 网络栈，那行只会产生噪音。

---

## 配置

所有可调项只在 [`guard.conf`](guard.conf)，格式 `KEY=VALUE`，支持整行 / 行内 `# 注释`、
值里的 `~/` 展开；相对路径相对本目录。每项在 `claude-guard.zsh` 里都有内置默认值，
`guard.conf` 写错或缺失不会让守卫失效。

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` / `HOST` | `7865` / `127.0.0.1` | mihomo `residential-in` listener；改端口要同步改 `settings.json` 与 mihomo 覆写 |
| `TZ` | `Asia/Tokyo` | 与住宅出口所在地一致，避免 TZ 与 IP 自相矛盾 |
| `IP_SERVICES` | ipify / ifconfig.me / icanhazip | 空格分隔，**串行短路**：第一个成功立即返回，绝不查备用 |
| `TIMEOUT_MAIN` / `TIMEOUT_BACKUP` | `6` / `3` | 主查询给足时间，备用短些避免异常时拖慢启动 |
| `CONNECT_TIMEOUT` | `3` | **不要低于 3**，见下方踩坑 |
| `ALLOWED_IPS_FILE` / `CONFIG_CHECK` | 本目录内两个文件 | 可改成绝对路径或 `~/...` |
| `NODE_BIN` | `/opt/homebrew/bin/node` | 留空则用 PATH 里的 node；绝对路径保证非登录 shell 也能体检 |
| `MIHOMO_CONFIG` | `~/Library/Application Support/mihomo-party/work/config.yaml` | 仅 `claude-check` 读 DNS 模式用 |
| `CHECK_IPV6` | `1` | 设 `0` 可省启动路径里一次 `ifconfig`（本机约 100ms） |

改完执行 `claude-guard-reload` 立即生效，或用 `claude-guard-info` 核对当前取值。

### Claude 侧配置

[`claude-settings.example.json`](claude-settings.example.json) 是 `~/.claude/settings.json` 里 `env`
的参考模板。**这份文件不会被自动套用**，改动请手工比对。当前生效值：

```json
{ "env": { "HTTP_PROXY": "http://127.0.0.1:7865",
           "HTTPS_PROXY": "http://127.0.0.1:7865",
           "NO_PROXY": "localhost,127.0.0.1" } }
```

`NO_PROXY` 千万别加 `anthropic.com` 或 `*`。另外 `~/.claude/settings.json` 里还有
`defaultMode: bypassPermissions` / `skipDangerousModePermissionPrompt`，那是本地权限口子，
和代理链路无关，但比代理更值得留意。

---

## 速度约定

这台机器**起一个外部进程约 100ms**（`grep` / `awk` / `ifconfig` 实测），所以：

- 启动路径里凡能换的都换成 zsh 内置：`tr` → `${x//[[:space:]]/}`、`grep` → `[[ =~ ]]`、
  `awk` → 逐行内置正则；配置解析用 `$(< file)` + 内置正则，实测 **100 次 0.046s（单次 0.46ms）**，
  比初版的 grep 方案快约 230 倍。
- 启动路径只保留 3 个必要外部进程：`nc`（端口）、`curl`（出口 IP）、可选的 `ifconfig`（IPv6）。
- 出口 IP 查询**主服务一成功就返回**，不查备用；`env` 展开、DNS、mihomo 配置读取、
  Node 配置合并全部只在 `claude-check` 里跑。
- 正常放行路径和改造前一样是「一次网络查询」，没有多一次请求。

---

## 踩过的坑（改之前先看）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 守卫误报「拿不到出口 IP」，但独立 `curl` 是通的 | `--connect-timeout 1`：curl 把代理 CONNECT 隧道建立也计入连接阶段，1s 不够（rc=28） | 现在 `CONNECT_TIMEOUT=3`，主查询 `--max-time 6` |
| 偶尔拦一下、过会儿又好了 | 住宅链路 TLS 握手抖动（`curl rc=35`），主+备用都失败 | 这是**正确拦截**，不是 bug；去面板看「住宅出口」选中的节点 |
| 紧凑单行 JSON 被误报「没有 HTTP(S)_PROXY」 | 旧版按整行 grep 判键，一行 JSON 被当成一个键 | 现在逐键正则提取，兼容压缩格式 |
| `dig` 返回 `198.18.0.x` 被当成 DNS 劫持 | mihomo `fake-ip` 正常产物 | 体检里自动识别并标注为正常 |
| `~/.claude/statusline.sh` 状态栏不显示 | 文件权限 644、缺 `+x`，`settings.json` 里又直接写脚本路径 | `chmod +x`；或把 command 改成 `bash ~/.claude/statusline.sh` 彻底不依赖权限 |
| 误以为「移进废纸篓」可恢复 | 本机 `com.tencent.Lemon.trash.plist` 监控 `~/.Trash`，大文件会被自动清掉 | 需要保留的东西请**另做副本**，不要依赖废纸篓 |

> 关于误拦的取向：超时给紧了会造成「突然失效」，给松了会拖慢启动。现在的取值是实测折中，
> 且短路保证异常路径不会串行拖成十几秒。真遇到频繁误拦，先看 `claude-check`，别直接
> `CLAUDE_SKIP_IP_CHECK=1` 长期挂着。

---

## 已知边界与风险

- **只管终端启动**：加载器在 `~/.zshrc`。IDE 扩展 / GUI 启动的 Claude Code 完全依赖
  `settings.json`，行为一致（也是 fail-closed），但**不会经过守卫**，所以「配置一致性告警」
  只在你打开终端跑 `claude` 或 `claude-check` 时才看得见。
- **第三方端点只警告不拦截**：`ANTHROPIC_BASE_URL` 非官方时守卫只打红字。
  你有多套中转配置，直接拦会误伤；要升级成 fail-closed 改 `_claude_guard_check` 即可。
- **备用配置有明文密钥且权限过宽**：`~/.claude/` 下当前有 17 份 `settings.*.json`，
  全部含第三方端点/密钥，权限 644（同机其他用户可读）。任一份被复制成 `settings.json`
  就会把链路切到第三方中转 —— 这正是配置判定要防的场景。建议 `chmod 600 ~/.claude/settings.*.json`。
- 白名单是**按 IP 精确匹配**，住宅 IP 更换会被拦，需要手工追加新 IP。这是刻意取舍：
  不自动学习新 IP，否则「出口被切走」就检测不出来了。

---

## 自检

```bash
zsh claude-guard/selftest.zsh
```

用临时夹具覆盖：语法、函数加载、`guard.conf` 解析、白名单读取、IP 查询短路与兜底、
5 种配置夹具（仅代理 / 第三方端点 / 无代理 / 错端口 / NO_PROXY 放行）、项目级覆盖、
守卫放行与三种拦截分支、配置检查耗时。**不联网、不修改真实 `~/.zshrc` 或 `~/.claude/`**，
跑完自动清理临时文件。

---

## 变更记录

- **2026-11-14**：迁入本仓库统一管理与文档化；`.zshrc` 内联 237 行 → 22 行加载器；
  新增 `guard.conf` 集中配置、安装/卸载/自检脚本、settings 模板；旧 `~/.config/claude-guard/`
  改为软链接；`config-check.mjs` 改为读同一份 conf 并加 EPIPE 防护。
- **2026-11-13**：修掉 `住宅-JP` 匹配恒空导致的静默放行，改显式白名单（缺失即拒绝）；
  新增「生效配置仅代理」判定；扩展诊断移出启动路径；外部进程改 zsh 内置提速。
- **更早**：`~/.zshrc` 内联 `claude()` 两道闸门（端口 + 出口 IP）。
