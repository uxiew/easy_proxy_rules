# =============================================================================
# claude-guard.zsh — Claude Code 代理守卫 / 环境体检（zsh 函数库）
#
# 加载方式（~/.zshrc 里只需一行，见 install.sh）：
#   source "$HOME/Projects/easy_proxy_rules/claude-guard/claude-guard.zsh"
#
# 设计约定：
#   · 启动守卫只做 nc + 一次出口 IP 查询 + 纯本地白名单/配置比对。
#     扩展诊断（生效配置合并、DNS、环境指纹）全部放 claude-check，不进启动路径。
#   · 这台机器起一个外部进程约 100ms，所以启动路径里凡是能用的外部命令
#     （tr / grep / awk）都换成 zsh 内置；配置解析也用内置读文件 + 内置正则。
#   · fail-closed：端口不活 / 拿不到出口 IP / 白名单缺失或不匹配 → 拒绝启动。
#
# 全部可调项集中在同目录 guard.conf；改完执行 claude-guard-reload 或新开终端。
# 文档：同目录 README.md；仓库总览：../README.md 的「客户端接入 → Claude Code」。
# =============================================================================

# ---- 自举：定位本目录（.zshrc 可显式给 CLAUDE_GUARD_DIR，否则由 %x 推导）----
typeset -g CLAUDE_GUARD_DIR="${CLAUDE_GUARD_DIR:-${${(%):-%x}:A:h}}"
if [[ ! -r "$CLAUDE_GUARD_DIR/guard.conf" ]]; then
  typeset -g CLAUDE_GUARD_DIR="$HOME/Projects/easy_proxy_rules/claude-guard"
fi

# ---- 默认值（guard.conf 缺失/写错也不会让守卫失效）----
typeset -g _CG_PORT=7865 _CG_HOST=127.0.0.1 _CG_TZ=Asia/Tokyo
typeset -g _CG_IP_SERVICES="https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com"
typeset -g _CG_T_MAIN=6 _CG_T_BACKUP=3 _CG_T_CONNECT=3
typeset -g _CG_NODE="" _CG_CHECK_IPV6=1
typeset -g _CG_MIHOMO="$HOME/Library/Application Support/mihomo-party/work/config.yaml"
typeset -g _CG_ALLOWED_IPS="$CLAUDE_GUARD_DIR/allowed-exit-ips"
typeset -g _CG_CONFIG_CHECK="$CLAUDE_GUARD_DIR/config-check.mjs"

# 读 guard.conf：纯 zsh 内置，零外部进程。值支持 `~/` 与行内 `# 注释`；
# 相对路径（白名单、检查脚本）一律相对本目录。非法数字直接忽略，回落默认值。
_claude_guard_reload() {
  local f="$CLAUDE_GUARD_DIR/guard.conf" blob l k v
  [[ -r "$f" ]] || return 0
  blob="$(< "$f")"
  # 相对路径先归到本目录，避免 conf 里写相对路径时随 cwd 漂移
  typeset -g _CG_ALLOWED_IPS="$CLAUDE_GUARD_DIR/allowed-exit-ips"
  typeset -g _CG_CONFIG_CHECK="$CLAUDE_GUARD_DIR/config-check.mjs"
  for l in ${(f)blob}; do
    [[ "$l" =~ '^[[:space:]]*([A-Z_]+)[[:space:]]*=[[:space:]]*(.*)$' ]] || continue
    k="$match[1]"; v="$match[2]"
    v="${v%%#*}"
    v="${v#"${v%%[![:space:]]*}"}"
    v="${v%"${v##*[![:space:]]}"}"
    case "$k" in
      PORT)            [[ "$v" =~ '^[0-9]+$' ]]      && typeset -g _CG_PORT="$v" ;;
      HOST)            [[ -n "$v" ]]                 && typeset -g _CG_HOST="$v" ;;
      TZ)              [[ -n "$v" ]]                 && typeset -g _CG_TZ="$v" ;;
      IP_SERVICES)     [[ -n "$v" ]]                 && typeset -g _CG_IP_SERVICES="$v" ;;
      TIMEOUT_MAIN)    [[ "$v" =~ '^[0-9]+$' ]]      && typeset -g _CG_T_MAIN="$v" ;;
      TIMEOUT_BACKUP)  [[ "$v" =~ '^[0-9]+$' ]]      && typeset -g _CG_T_BACKUP="$v" ;;
      CONNECT_TIMEOUT) [[ "$v" =~ '^[0-9]+$' ]]      && typeset -g _CG_T_CONNECT="$v" ;;
      NODE_BIN)        typeset -g _CG_NODE="${v/#\~/$HOME}" ;;
      CHECK_IPV6)      typeset -g _CG_CHECK_IPV6="$v" ;;
      MIHOMO_CONFIG)   [[ -n "$v" ]]                 && typeset -g _CG_MIHOMO="${v/#\~/$HOME}" ;;
      ALLOWED_IPS_FILE) [[ -n "$v" ]] && {
        v="${v/#\~/$HOME}"
        [[ "$v" == /* ]] || v="$CLAUDE_GUARD_DIR/$v"
        typeset -g _CG_ALLOWED_IPS="$v"
      } ;;
      CONFIG_CHECK) [[ -n "$v" ]] && {
        v="${v/#\~/$HOME}"
        [[ "$v" == /* ]] || v="$CLAUDE_GUARD_DIR/$v"
        typeset -g _CG_CONFIG_CHECK="$v"
      } ;;
    esac
  done
  typeset -g _CG_PROXY="http://${_CG_HOST}:${_CG_PORT}"
}
_claude_guard_reload

# 出口 IP 查询：主服务成功立刻返回，绝不查询后面的备用（不浪费时间/住宅流量）
# CLAUDE_EXIT_IP_SERVICES 可覆盖服务列表（空格分隔），用于演练 fallback。
# connect-timeout 至少 3s：curl 把代理 CONNECT 隧道建立算进连接阶段，
#   实测 1s 会 rc=28 误判超时；主查询 6s、备用 3s，避免住宅链路抖动误拦。
_claude_exit_ip() {
  local proxy="http://${_CG_HOST}:${1:-$_CG_PORT}" svc_list ip host t="$_CG_T_MAIN"
  svc_list="${CLAUDE_EXIT_IP_SERVICES:-$_CG_IP_SERVICES}"
  for host in ${=svc_list}; do
    ip=$(curl -s --connect-timeout "$_CG_T_CONNECT" --max-time "$t" -x "$proxy" "$host" 2>/dev/null)
    ip="${ip//[[:space:]]/}"
    if [[ "$ip" =~ '^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}$' ]]; then
      printf '%s\n' "$ip"
      return 0
    fi
    t="$_CG_T_BACKUP"
  done
  return 1
}

# 读取白名单：只认以 IPv4 开头的行，注释/空行自动忽略（纯内置，无 grep）
_claude_allowed_ips() {
  local f="${CLAUDE_ALLOWED_IPS_FILE:-$_CG_ALLOWED_IPS}" l out=""
  [[ -r "$f" ]] || return 1
  for l in ${(f)"$(< "$f")"}; do
    [[ "$l" =~ '^[0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}' ]] && out+="$l"$'\n'
  done
  [[ -n "$out" ]] && printf '%s' "$out"
}

# 生效配置检查：确认 Claude 配置仍然「只设置了代理」。
# 零网络、零外部进程；紧凑(单行) JSON 也能逐键正确匹配（用 zsh 内置正则逐键提取）。
# 为什么启动路径也要查：claude() 显式 export 的代理可能被 settings.json 的 env 覆盖，
#   而 IDE / GUI 启动完全依赖配置文件 —— 配置里代理丢了就会直连暴露真实 IP。
# 只警告不拦截：历史上有多套中转配置，拦截会误伤；明细跑 claude-check。
_claude_config_warn() {
  local cfgdir="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" f files=()
  local ep=0 proxy_n=0 proxy_bad=0 nop_bad=0 blob="" rest
  for f in "$cfgdir/settings.json" "$cfgdir/settings.local.json" \
           "$PWD/.claude/settings.json" "$PWD/.claude/settings.local.json" \
           '/Library/Application Support/ClaudeCode/managed-settings.json'; do
    [[ -r "$f" ]] && files+=("$f")
  done
  if (( ${#files} == 0 )); then
    printf '\033[33m[claude 守卫] 找不到 Claude 配置 %s —— IDE/GUI 启动会直连\033[0m\n' \
      "$cfgdir/settings.json" >&2
    return 0
  fi
  for f in "${files[@]}"; do blob+="$(< "$f")"$'\n'; done
  [[ "$blob" =~ '"ANTHROPIC_(BASE_URL|API_URL|API_KEY|AUTH_TOKEN)"' ]] && ep=1
  rest="$blob"
  while [[ "$rest" =~ '"(HTTP|HTTPS|ALL)_PROXY"[[:space:]]*:[[:space:]]*"([^"]*)"' ]]; do
    proxy_n=1
    [[ "$match[2]" == *"${_CG_HOST}:${_CG_PORT}"* ]] || proxy_bad=1
    rest="${rest#*"$MATCH"}"
  done
  if [[ "$blob" =~ '"NO_PROXY"[[:space:]]*:[[:space:]]*"([^"]*)"' ]]; then
    [[ "$match[1]" == *anthropic* || "$match[1]" == "*" ]] && nop_bad=1
  fi
  if (( ep )); then
    printf '\033[33m[claude 守卫] 配置已不是「仅代理」：含 ANTHROPIC_* 端点/密钥项（值不显示），跑 claude-check 定位\033[0m\n' >&2
  fi
  if (( proxy_n == 0 )); then
    printf '\033[33m[claude 守卫] 配置里没有 HTTP(S)_PROXY —— IDE/GUI 启动会直连暴露真实 IP\033[0m\n' >&2
  elif (( proxy_bad )); then
    printf '\033[33m[claude 守卫] 配置代理值不是 %s —— 请核对 settings.json\033[0m\n' "$_CG_PROXY" >&2
  fi
  if (( nop_bad )); then
    printf '\033[33m[claude 守卫] 配置 NO_PROXY 含 anthropic/通配 —— API 请求会绕过代理\033[0m\n' >&2
  fi
  return 0
}

_claude_guard_check() {
  local port="$_CG_PORT" f="${CLAUDE_ALLOWED_IPS_FILE:-$_CG_ALLOWED_IPS}"

  if ! nc -z -G 1 -w 1 "$_CG_HOST" "$port" >/dev/null 2>&1; then
    printf '\033[31m[claude 守卫] %s:%s 没有监听 —— 已阻止启动。\033[0m\n' "$_CG_HOST" "$port" >&2
    printf '  原因：Clash Party 没开 / 覆写里 listeners 被改 / 进程崩了。\n' >&2
    printf '  恢复：打开 Clash Party；自检：nc -z %s %s\n' "$_CG_HOST" "$port" >&2
    return 1
  fi

  # 非官方端点（shell 环境）：只警告不拦截（历史上有多套中转配置，避免误伤）
  local base="${ANTHROPIC_BASE_URL:-${ANTHROPIC_API_URL:-}}"
  if [[ -n "$base" && "$base" != https://api.anthropic.com* ]]; then
    printf '\033[33m[claude 守卫] 非官方端点 %s —— 提示词/密钥会发给第三方\033[0m\n' "$base" >&2
  fi
  _claude_config_warn

  local ip
  if ! ip=$(_claude_exit_ip "$port"); then
    printf '\033[31m[claude 守卫] 拿不到出口 IP（主+备用均失败）—— 已阻止启动。\033[0m\n' >&2
    printf '  常见原因：住宅节点 TLS 握手失败(curl rc=35)、订阅到期、策略组被切走。\n' >&2
    printf '  自检：curl -s --max-time 8 -x %s https://api.anthropic.com\n' "$_CG_PROXY" >&2
    return 1
  fi

  local allowed
  allowed=$(_claude_allowed_ips)
  if [[ -z "$allowed" ]]; then
    printf '\033[31m[claude 守卫] 白名单缺失/为空 —— 已阻止启动。\033[0m\n' >&2
    printf '  恢复：echo %s >> %s\n' "$ip" "$f" >&2
    return 1
  fi

  if [[ "$CLAUDE_SKIP_IP_CHECK" != "1" ]]; then
    local hit=0 line
    for line in ${(f)allowed}; do
      [[ "$ip" == "$line" ]] && { hit=1; break; }
    done
    if (( hit == 0 )); then
      printf '\033[31m[claude 守卫] 出口 IP=%s 不在白名单 —— 已阻止启动。\033[0m\n' "$ip" >&2
      printf '  允许：%s\n' "${allowed//$'\n'/, }" >&2
      printf '  换 IP 了？ echo %s >> %s\n' "$ip" "$f" >&2
      printf '  临时放行：CLAUDE_SKIP_IP_CHECK=1 claude ...\n' >&2
      return 1
    fi
  fi

  # IPv6 全局地址 = 旁路风险：走代理的流量不受影响，但绕过代理的进程会 IPv6 直出。
  # 这一项需要一次 ifconfig（约 100ms）；不需要就到 guard.conf 设 CHECK_IPV6=0。
  if [[ "$_CG_CHECK_IPV6" == "1" ]]; then
    local v6="" iface="" l ifout
    ifout=$(ifconfig 2>/dev/null)
    for l in ${(f)ifout}; do
      [[ "$l" =~ '^([a-z0-9]+):' ]] && iface="$match[1]"
      [[ "$l" =~ 'inet6[[:space:]]+(2[0-9a-fA-F][0-9a-fA-F:]*)' ]] && v6+="$iface=$match[1] "
    done
    if [[ -n "$v6" ]]; then
      printf '\033[33m[claude 守卫] 检测到 IPv6 全局地址：%s（绕过代理的进程可能 IPv6 直出）\033[0m\n' "$v6" >&2
    fi
  fi

  printf '\033[2m[claude 守卫] 代理 OK → %s:%s（出口 %s）\033[0m\n' "$_CG_HOST" "$port" "$ip" >&2
  return 0
}

claude() {
  _claude_guard_check || return 1
  # 环境指纹固定：时区/语言与住宅出口（东京）一致；ipv4first 防 Node 走 AAAA 绕过代理。
  TZ="${CLAUDE_TZ:-$_CG_TZ}" \
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 LC_CTYPE=en_US.UTF-8 \
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first" \
  HTTP_PROXY="$_CG_PROXY" HTTPS_PROXY="$_CG_PROXY" \
    ALL_PROXY="$_CG_PROXY" NO_PROXY="localhost,127.0.0.1" \
    command claude "$@"
}

# ------- Claude 环境体检（只读，不启动 claude）-------
# 扩展诊断都在这里；不进启动路径，所以不影响每次 claude 的启动速度。
# Chrome 受管策略检查已移除：CLI 不经过 Chromium 网络栈，该项只产生噪音。
claude-check() {
  local port="$_CG_PORT"
  local cfg="$_CG_MIHOMO"
  ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
  bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; }
  warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
  info() { printf '  · %s\n' "$*"; }

  echo "── 代理链路 ─────────────────────────────"
  if nc -z -G 1 -w 1 "$_CG_HOST" "$port" >/dev/null 2>&1; then ok "$port 监听中"; else bad "$port 未监听"; fi

  local ip allowed
  if ip=$(_claude_exit_ip "$port"); then ok "出口 IP: $ip（首个成功即返回，未查备用）"; else bad "出口 IP: 主+备用均失败"; ip=""; fi
  allowed=$(_claude_allowed_ips)
  if [[ -n "$allowed" ]]; then
    info "白名单: ${allowed//$'\n'/, }"
    local hit=0 line
    for line in ${(f)allowed}; do [[ "$line" == "$ip" ]] && { hit=1; break; }; done
    (( hit )) && ok "出口 IP 在白名单内" || warn "出口 IP 不在白名单内（守卫会拦）"
  else
    bad "白名单缺失/为空（守卫会拒绝启动）"
  fi

  echo "── Claude 生效配置（仅代理判定）────────"
  # 完整判定交给独立脚本：合并 shell + 用户级 / local / 项目级 / 企业策略配置层。
  # 纯本地读取，零网络；密钥值一律不输出。脚本只在体检里跑，不进启动路径。
  local ccscript="$_CG_CONFIG_CHECK" lv msg n=0
  local nodebin="${CLAUDE_GUARD_NODE:-${_CG_NODE:-$(command -v node 2>/dev/null)}}"
  if [[ -r "$ccscript" && -n "$nodebin" ]]; then
    while IFS=$'\t' read -r lv msg; do
      [[ -z "$lv" ]] && continue
      n=$((n + 1))
      case "$lv" in
        OK)   ok "$msg" ;;
        BAD)  bad "$msg" ;;
        WARN) warn "$msg" ;;
        *)    info "$msg" ;;
      esac
    done < <(command "$nodebin" "$ccscript" 2>/dev/null)
    (( n )) || warn "配置检查脚本无输出，请手动运行: node $ccscript"
  else
    warn "配置检查不可用（脚本缺失或找不到 node）: $ccscript"
  fi

  echo "── DNS（本机解析器，仅供参考）──────────"
  # dig 查的是本机解析器；Claude 走 7865 的 CONNECT 隧道时域名由 mihomo 远端解析。
  # fake-ip 模式下 198.18.x.x 是正常产物，不当作异常网络。短路：dig 成功就不跑 nslookup。
  local d
  d=$(dig +short +time=1 +tries=1 api.anthropic.com 2>/dev/null | command grep -E '^[0-9]+[.]' | head -1)
  if [[ -n "$d" ]]; then
    info "dig: $d（成功，未调用 nslookup）"
  else
    d=$(nslookup -timeout=1 -retry=0 api.anthropic.com 2>/dev/null | awk '/^Address: /{print $2; exit}')
    [[ -n "$d" ]] && info "nslookup 兜底: $d" || warn "本机 DNS 未解析出 A 记录"
  fi
  case "$d" in
    198.18.*) ok "198.18.x.x = mihomo fake-ip，正常现象，非异常网络" ;;
    10.*|192.168.*|127.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) warn "解析到私有地址，检查本机 DNS 是否被劫持" ;;
  esac
  local mode
  mode=$(command grep -m1 'enhanced-mode:' "$cfg" 2>/dev/null | awk '{print $2}')
  info "mihomo DNS: enhanced-mode=${mode:-未知}（走 $port 时域名由代理侧解析）"

  echo "── 环境指纹 ─────────────────────────────"
  echo "  系统 TZ : $(readlink /etc/localtime | sed 's|.*zoneinfo/||')"
  echo "  claude 启动时将置 : TZ=${CLAUDE_TZ:-$_CG_TZ} LANG=en_US.UTF-8"

  echo "── 旁路风险 ─────────────────────────────"
  local v6="" iface="" l ifout
  ifout=$(ifconfig 2>/dev/null)
  for l in ${(f)ifout}; do
    [[ "$l" =~ '^([a-z0-9]+):' ]] && iface="$match[1]"
    [[ "$l" =~ 'inet6[[:space:]]+(2[0-9a-fA-F][0-9a-fA-F:]*)' ]] && v6+="$iface=$match[1] "
  done
  [[ -n "$v6" ]] && warn "IPv6 全局地址 $v6" || ok "无 IPv6 全局地址"
  info "Chrome 受管策略不再检查：CLI 不经过 Chromium；桌面版 Claude.app 的 QUIC/WebRTC 需单独管控"

  echo "── 规则仓库 ─────────────────────────────"
  info "函数库: $CLAUDE_GUARD_DIR/claude-guard.zsh"
  info "配置  : $CLAUDE_GUARD_DIR/guard.conf（改完 claude-guard-reload）"
  info "文档  : $CLAUDE_GUARD_DIR/README.md"
}

# 便捷：查看当前生效的规则目录与关键配置（纯本地，不联网）
claude-guard-info() {
  printf '规则目录  %s\n' "$CLAUDE_GUARD_DIR"
  printf '代理      %s\n' "$_CG_PROXY"
  printf '时区      %s\n' "$_CG_TZ"
  printf 'IP 服务   %s\n' "$_CG_IP_SERVICES"
  printf '超时      主 %ss / 备用 %ss / connect %ss\n' "$_CG_T_MAIN" "$_CG_T_BACKUP" "$_CG_T_CONNECT"
  printf '白名单    %s\n' "${CLAUDE_ALLOWED_IPS_FILE:-$_CG_ALLOWED_IPS}"
  printf '配置判定  %s\n' "$_CG_CONFIG_CHECK"
  printf 'mihomo    %s\n' "$_CG_MIHOMO"
  printf 'IPv6 检查 %s\n' "$_CG_CHECK_IPV6"
  printf '文档      %s/README.md\n' "$CLAUDE_GUARD_DIR"
}

# 公开命令：改完 guard.conf 后热重载，不必新开终端
claude-guard-reload() {
  _claude_guard_reload
  printf '[claude 守卫] 已重载 %s（代理 %s）\n' "$CLAUDE_GUARD_DIR/guard.conf" "$_CG_PROXY"
}
