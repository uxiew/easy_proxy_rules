# =============================================================================
# claude-guard.zsh — Claude Code 代理守卫 / 环境体检（zsh 函数库）
#
# 加载方式（~/.zshrc 里只需一行，见 install.sh）：
#   source "$HOME/Projects/easy_proxy_rules/claude-guard/claude-guard.zsh"
#
# 设计约定：
#   · 启动守卫只做 nc + 并行（出口 IP 查询 + Anthropic API 403 探测）+ 纯本地白名单/配置比对。
#     扩展诊断（分流一致性、IP 质量、Edge Colo、配置层合并、DNS、稳定性评分）全部放 claude-check。
#   · 启动路径能用 zsh 内置的（字符串裁剪 / 正则匹配 / 时间戳格式化）一律不派外部进程。
#   · fail-closed：端口不活 / 拿不到出口 IP / 白名单缺失或不匹配 / API 403 地区封锁 → 拒绝启动。
#
# 全部可调项集中在同目录 guard.conf；改完执行 claude-guard-reload 或新开终端。
# =============================================================================

zmodload -F zsh/datetime b:strftime p:EPOCHSECONDS 2>/dev/null || true

# ---- 自举：定位本目录（.zshrc 可显式给 CLAUDE_GUARD_DIR，否则由 %x 推导）----
typeset -g CLAUDE_GUARD_DIR="${CLAUDE_GUARD_DIR:-${${(%):-%x}:A:h}}"
if [[ ! -r "$CLAUDE_GUARD_DIR/guard.conf" ]]; then
  typeset -g CLAUDE_GUARD_DIR="$HOME/Projects/easy_proxy_rules/claude-guard"
fi

# ---- 默认值（guard.conf 缺失/写错也不会让守卫失效）----
typeset -g _CG_PORT=7865 _CG_RULE_PORT=7890 _CG_HOST=127.0.0.1 _CG_TZ=Asia/Tokyo
typeset -g _CG_IP_SERVICES="https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com"
typeset -g _CG_T_MAIN=6 _CG_T_BACKUP=3 _CG_T_CONNECT=3
typeset -g _CG_NODE="" _CG_CHECK_API=1 _CG_CHECK_IPV6=1
typeset -g _CG_MIHOMO="$HOME/Library/Application Support/mihomo-party/work/config.yaml"
typeset -g _CG_ALLOWED_IPS="$CLAUDE_GUARD_DIR/allowed-exit-ips"
typeset -g _CG_CONFIG_CHECK="$CLAUDE_GUARD_DIR/config-check.mjs"
typeset -g _CG_EXIT_LOG="$CLAUDE_GUARD_DIR/.exit-ip.log"

# 读 guard.conf：纯 zsh 内置，零外部进程。值支持 `~/` 与行内 `# 注释`；
# 相对路径一律相对本目录。非法数字直接忽略，回落默认值。
_claude_guard_reload() {
  local f="$CLAUDE_GUARD_DIR/guard.conf" blob l k v
  typeset -g _CG_ALLOWED_IPS="$CLAUDE_GUARD_DIR/allowed-exit-ips"
  typeset -g _CG_CONFIG_CHECK="$CLAUDE_GUARD_DIR/config-check.mjs"
  typeset -g _CG_EXIT_LOG="$CLAUDE_GUARD_DIR/.exit-ip.log"
  if [[ -r "$f" ]]; then
    blob="$(< "$f")"
    for l in ${(f)blob}; do
      [[ "$l" =~ '^[[:space:]]*([A-Z0-9_]+)[[:space:]]*=[[:space:]]*(.*)$' ]] || continue
      k="$match[1]"; v="$match[2]"
      v="${v%%#*}"
      v="${v#"${v%%[![:space:]]*}"}"
      v="${v%"${v##*[![:space:]]}"}"
      case "$k" in
        PORT)            [[ "$v" =~ '^[0-9]+$' ]] && typeset -g _CG_PORT="$v" ;;
        RULE_PORT)       [[ "$v" =~ '^[0-9]+$' ]] && typeset -g _CG_RULE_PORT="$v" ;;
        HOST)            [[ -n "$v" ]]            && typeset -g _CG_HOST="$v" ;;
        TZ)              [[ -n "$v" ]]            && typeset -g _CG_TZ="$v" ;;
        IP_SERVICES)     [[ -n "$v" ]]            && typeset -g _CG_IP_SERVICES="$v" ;;
        TIMEOUT_MAIN)    [[ "$v" =~ '^[0-9]+$' ]] && typeset -g _CG_T_MAIN="$v" ;;
        TIMEOUT_BACKUP)  [[ "$v" =~ '^[0-9]+$' ]] && typeset -g _CG_T_BACKUP="$v" ;;
        CONNECT_TIMEOUT) [[ "$v" =~ '^[0-9]+$' ]] && typeset -g _CG_T_CONNECT="$v" ;;
        NODE_BIN)        typeset -g _CG_NODE="${v/#\~/$HOME}" ;;
        CHECK_API)       typeset -g _CG_CHECK_API="$v" ;;
        CHECK_IPV6)      typeset -g _CG_CHECK_IPV6="$v" ;;
        MIHOMO_CONFIG)   [[ -n "$v" ]]            && typeset -g _CG_MIHOMO="${v/#\~/$HOME}" ;;
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
        EXIT_LOG_FILE) [[ -n "$v" ]] && {
          v="${v/#\~/$HOME}"
          [[ "$v" == /* ]] || v="$CLAUDE_GUARD_DIR/$v"
          typeset -g _CG_EXIT_LOG="$v"
        } ;;
      esac
    done
  fi
  typeset -g _CG_PROXY="http://${_CG_HOST}:${_CG_PORT}"
  typeset -g _CG_RULE_PROXY="http://${_CG_HOST}:${_CG_RULE_PORT}"
}
_claude_guard_reload

# 出口 IP 查询：主服务成功立刻返回，绝不查备用（不浪费时间/住宅流量）
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
    [[ "$l" =~ '^([0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3}[.][0-9]{1,3})' ]] && out+="$match[1]"$'\n'
  done
  [[ -n "$out" ]] && printf '%s' "$out"
}

# Anthropic API 可达性探测：GET /v1/models 未带密钥时正常返回 401；
# 返回 403 表示出口落在不服务地区或 IP 被 Cloudflare/Anthropic 封锁。
# 退出码：0=可达(401/400/405)，1=明确封锁(403)，2=超时或其他状态。
# 支持 CLAUDE_API_MOCK_CODE 供离线 selftest 覆盖全分支。
_claude_api_reachable() {
  local proxy="http://${_CG_HOST}:${1:-$_CG_PORT}" code
  local url="${CLAUDE_API_PROBE_URL:-https://api.anthropic.com/v1/models}"
  if [[ -n "${CLAUDE_API_MOCK_CODE:-}" ]]; then
    code="$CLAUDE_API_MOCK_CODE"
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' \
      --connect-timeout "$_CG_T_CONNECT" --max-time "${2:-$_CG_T_BACKUP}" \
      -x "$proxy" "$url" 2>/dev/null)
  fi
  case "$code" in
    401|400|405) return 0 ;;
    403)         return 1 ;;
    *)           return 2 ;;
  esac
}

# 追加出口稳定性日志：600 权限防同机泄漏，超过 200 行自动保留最近 100 行。
# 支持 CLAUDE_EXIT_LOG_FILE 覆盖（设为空或 /dev/null 可跳过，selftest 用临时文件隔离）。
_claude_record_exit_ip() {
  local ip="$1" f="${CLAUDE_EXIT_LOG_FILE:-$_CG_EXIT_LOG}" ts=""
  [[ -z "$ip" || -z "$f" || "$f" == "/dev/null" ]] && return 0
  if (( $+builtins[strftime] )); then
    strftime -s ts '%Y-%m-%dT%H:%M:%S' "$EPOCHSECONDS" 2>/dev/null
  fi
  [[ -z "$ts" ]] && ts="$(date +%Y-%m-%dT%H:%M:%S 2>/dev/null)"
  (
    umask 077
    printf '%s\t%s\n' "$ts" "$ip" >> "$f" 2>/dev/null || exit 0
    local -a lines
    lines=("${(@f)$(< "$f")}")
    if (( ${#lines} > 200 )); then
      printf '%s\n' "${(@)lines[-100,-1]}" >| "$f" 2>/dev/null
    fi
  )
}

# Anthropic 不提供服务的国家/地区（ISO 3166-1 alpha-2）
_claude_is_blocked_cc() {
  case "${(U)1}" in
    CN|HK|MO|RU|BY|IR|KP|CU|SY|VE) return 0 ;;
    *) return 1 ;;
  esac
}

# Cloudflare 常见边缘机房（IATA 三字码）-> 国家/地区码映射（未知机房返回空，不误判）
_claude_colo_country() {
  case "${(U)1}" in
    NRT|HND|KIX|ITM|FUK|NGO|OKA|CTS) printf 'JP' ;;
    SIN)                             printf 'SG' ;;
    ICN|GMP)                         printf 'KR' ;;
    TPE|KHH)                         printf 'TW' ;;
    HKG)                             printf 'HK' ;;
    MFM)                             printf 'MO' ;;
    SHA|PVG|PEK|PKX|CAN|SZX|CTU|TFU|HGH|NKG|WUH|XIY|TSN|CKG|TAO|XMN|FOC|CSX|CGO|KMG) printf 'CN' ;;
    LAX|SJC|SFO|SEA|PDX|DEN|PHX|SLC|LAS|DFW|IAH|AUS|ORD|MSP|DTW|STL|MCI|ATL|MIA|TPA|MCO|CLT|BNA|IAD|EWR|JFK|BOS|PHL|PIT|CMH|RDU|BUF) printf 'US' ;;
    YVR|YYZ|YUL|YYC|YOW)             printf 'CA' ;;
    LHR|LGW|MAN|EDI)                 printf 'GB' ;;
    FRA|MUC|DUS|BER|HAM)             printf 'DE' ;;
    AMS)                             printf 'NL' ;;
    CDG|MRS)                         printf 'FR' ;;
    ZRH)                             printf 'CH' ;;
    VIE)                             printf 'AT' ;;
    MAD|BCN)                         printf 'ES' ;;
    MXP|FCO)                         printf 'IT' ;;
    DUB)                             printf 'IE' ;;
    ARN)                             printf 'SE' ;;
    HEL)                             printf 'FI' ;;
    CPH)                             printf 'DK' ;;
    OSL)                             printf 'NO' ;;
    WAW)                             printf 'PL' ;;
    PRG)                             printf 'CZ' ;;
    BRU)                             printf 'BE' ;;
    SYD|MEL|BNE|PER)                 printf 'AU' ;;
    AKL)                             printf 'NZ' ;;
    BOM|DEL|BLR|MAA|HYD)             printf 'IN' ;;
    BKK)                             printf 'TH' ;;
    KUL)                             printf 'MY' ;;
    MNL)                             printf 'PH' ;;
    CGK)                             printf 'ID' ;;
    SGN|HAN)                         printf 'VN' ;;
  esac
}

# 纯内置提取平面 JSON 的字符串或数字字段（免除 jq / python3 依赖，自动反转义 \/）
_claude_json_field() {
  local blob="$1" key="$2" esc='\/'
  if [[ "$blob" =~ "\"${key}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\"" ]]; then
    printf '%s' "${match[1]//"$esc"//}"
  elif [[ "$blob" =~ "\"${key}\"[[:space:]]*:[[:space:]]*([0-9]+)" ]]; then
    printf '%s' "$match[1]"
  fi
}

# 生效配置快速告警（启动路径用，纯内置零进程，只警告不拦截）
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
  setopt local_options no_monitor no_notify
  local port="$_CG_PORT" f="${CLAUDE_ALLOWED_IPS_FILE:-$_CG_ALLOWED_IPS}"

  if ! nc -z -G 1 -w 1 "$_CG_HOST" "$port" >/dev/null 2>&1; then
    printf '\033[31m[claude 守卫] %s:%s 没有监听 —— 已阻止启动。\033[0m\n' "$_CG_HOST" "$port" >&2
    printf '  原因：Clash Party 没开 / 覆写里 listeners 被改 / 进程崩了。\n' >&2
    printf '  恢复：打开 Clash Party；自检：nc -z %s %s\n' "$_CG_HOST" "$port" >&2
    return 1
  fi

  local base="${ANTHROPIC_BASE_URL:-${ANTHROPIC_API_URL:-}}"
  if [[ -n "$base" && "$base" != https://api.anthropic.com* ]]; then
    printf '\033[33m[claude 守卫] 非官方端点 %s —— 提示词/密钥会发给第三方\033[0m\n' "$base" >&2
  fi
  _claude_config_warn

  # 并行发起 API 可达性探测（与出口 IP 查询重叠网络耗时，不增加串行等待）
  local _api_pid=""
  if [[ "$_CG_CHECK_API" == "1" ]]; then
    _claude_api_reachable "$port" &
    _api_pid=$!
  fi

  local ip
  if ! ip=$(_claude_exit_ip "$port"); then
    [[ -n "$_api_pid" ]] && { kill "$_api_pid" 2>/dev/null; wait "$_api_pid" 2>/dev/null; }
    printf '\033[31m[claude 守卫] 拿不到出口 IP（主+备用均失败）—— 已阻止启动。\033[0m\n' >&2
    printf '  常见原因：住宅节点 TLS 握手失败(curl rc=35)、订阅到期、策略组被切走。\n' >&2
    printf '  自检：curl -s --max-time 8 -x %s https://api.anthropic.com/v1/models\n' "$_CG_PROXY" >&2
    return 1
  fi

  local allowed
  allowed=$(_claude_allowed_ips)
  if [[ -z "$allowed" ]]; then
    [[ -n "$_api_pid" ]] && { kill "$_api_pid" 2>/dev/null; wait "$_api_pid" 2>/dev/null; }
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
      [[ -n "$_api_pid" ]] && { kill "$_api_pid" 2>/dev/null; wait "$_api_pid" 2>/dev/null; }
      printf '\033[31m[claude 守卫] 出口 IP=%s 不在白名单 —— 已阻止启动。\033[0m\n' "$ip" >&2
      printf '  允许：%s\n' "${allowed//$'\n'/, }" >&2
      printf '  若确认是住宅新 IP（先跑 claude-check 看 ISP）：echo %s >> %s\n' "$ip" "$f" >&2
      printf '  临时放行：CLAUDE_SKIP_IP_CHECK=1 claude ...\n' >&2
      return 1
    fi
  fi

  if [[ -n "$_api_pid" ]]; then
    wait "$_api_pid"
    local _api_rc=$?
    if (( _api_rc == 1 )); then
      printf '\033[31m[claude 守卫] Anthropic API 返回 403（出口被地区/风控拦截）—— 已阻止启动。\033[0m\n' >&2
      printf '  白名单 IP 虽匹配，但当前出口被 Anthropic 拒绝服务。\n' >&2
      printf '  自检：curl -s -o /dev/null -w "%%{http_code}\\n" -x %s https://api.anthropic.com/v1/models\n' "$_CG_PROXY" >&2
      return 1
    elif (( _api_rc == 2 )); then
      printf '\033[33m[claude 守卫] Anthropic API 探测超时或状态异常（非 401/403），继续放行\033[0m\n' >&2
    fi
  fi

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

  _claude_record_exit_ip "$ip"
  printf '\033[2m[claude 守卫] 代理 OK → %s:%s（出口 %s）\033[0m\n' "$_CG_HOST" "$port" "$ip" >&2
  return 0
}

claude() {
  _claude_guard_check || return 1
  # 环境指纹固定：时区/语言与住宅出口一致；ipv4first 防 Node 走 AAAA 绕过代理。
  TZ="${CLAUDE_TZ:-$_CG_TZ}" \
  LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 LC_CTYPE=en_US.UTF-8 \
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first" \
  HTTP_PROXY="$_CG_PROXY" HTTPS_PROXY="$_CG_PROXY" \
    ALL_PROXY="$_CG_PROXY" NO_PROXY="localhost,127.0.0.1" \
    command claude "$@"
}

# ------- Claude 环境体检（只读，不启动 claude）-------
# 融合 CheckClaude 的多维环境画像加权评分思路（0-100 分 + 关键项一票否决）：
#   代理链路 / API 可达与出口地区 / 分流一致性与 PAC / IP 质量与 Edge Colo /
#   生效配置「仅代理」/ DNS 与时区自洽 / 旁路风险与 24h 出口稳定性。
claude-check() {
  local port="$_CG_PORT" rule_port="$_CG_RULE_PORT" cfg="$_CG_MIHOMO"
  local _s=100 _crit=0
  local -a _issues=()
  ok()     { printf '  \033[32m✓\033[0m %s\n' "$*"; }
  bad()    { printf '  \033[31m✗\033[0m %s\n' "$*"; }
  warn()   { printf '  \033[33m!\033[0m %s\n' "$*"; }
  info()   { printf '  · %s\n' "$*"; }
  deduct() { _s=$((_s - $1)); _issues+=("-$1  $2 → $3"); }

  echo "── 1. 代理链路 ──────────────────────────"
  if nc -z -G 1 -w 1 "$_CG_HOST" "$port" >/dev/null 2>&1; then
    ok "住宅端口 $port 监听中"
  else
    bad "住宅端口 $port 未监听"
    deduct 20 "住宅端口 $port 未监听" "打开 Clash Party 并确认 listeners 生效"
    _crit=$((_crit + 1))
  fi

  local ip allowed
  if ip=$(_claude_exit_ip "$port"); then
    ok "出口 IP: $ip"
  else
    bad "出口 IP: 主+备用均失败"
    ip=""
    deduct 20 "无法经 $port 获取出口 IP" "面板检查「住宅出口」节点与前置跳板"
    _crit=$((_crit + 1))
  fi

  allowed=$(_claude_allowed_ips)
  if [[ -n "$allowed" ]]; then
    info "白名单: ${allowed//$'\n'/, }"
    if [[ -n "$ip" ]]; then
      local hit=0 line
      for line in ${(f)allowed}; do [[ "$line" == "$ip" ]] && { hit=1; break; }; done
      if (( hit )); then
        ok "出口 IP 在白名单内"
      else
        warn "出口 IP 不在白名单内（守卫启动时会拦）"
        deduct 8 "出口 IP 未加入白名单" "确认是住宅 IP 后执行 echo $ip >> ${_CG_ALLOWED_IPS}"
      fi
    fi
  else
    bad "白名单缺失/为空（守卫启动时会拒绝）"
    deduct 8 "白名单缺失或为空" "cp claude-guard/allowed-exit-ips.example claude-guard/allowed-exit-ips 并填入住宅 IP"
  fi

  echo "── 2. Anthropic 可达性与出口地区 ────────"
  local trace_resi="" cf_ip="" cf_colo="" cf_loc=""
  if [[ -n "$ip" ]]; then
    local api_code web_code
    if [[ -n "${CLAUDE_API_MOCK_CODE:-}" ]]; then
      api_code="$CLAUDE_API_MOCK_CODE"
    else
      api_code=$(curl -s -o /dev/null -w '%{http_code}' \
        --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_MAIN" \
        -x "$_CG_PROXY" "${CLAUDE_API_PROBE_URL:-https://api.anthropic.com/v1/models}" 2>/dev/null)
    fi
    case "$api_code" in
      401|400|405) ok "Anthropic API 可达: HTTP $api_code（未被地区/WAF 封锁）" ;;
      403)
        bad "Anthropic API 返回 403（出口被地区或风控拦截）"
        deduct 15 "api.anthropic.com 返回 403" "更换支持地区的干净住宅节点"
        _crit=$((_crit + 1)) ;;
      000|"")
        bad "Anthropic API 连接失败（超时或 TLS 中断）"
        deduct 12 "api.anthropic.com 连接失败" "检查住宅节点与前置跳板连通性"
        _crit=$((_crit + 1)) ;;
      *)
        warn "Anthropic API 返回 HTTP $api_code（预期 401）"
        deduct 5 "api.anthropic.com 状态异常 ($api_code)" "稍后重试或检查上游网关" ;;
    esac

    web_code=$(curl -s -o /dev/null -w '%{http_code}' \
      --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_MAIN" \
      -x "$_CG_PROXY" "${CLAUDE_WEB_PROBE_URL:-https://claude.ai/robots.txt}" 2>/dev/null)
    case "$web_code" in
      200|301|302) ok "claude.ai 可达: HTTP $web_code" ;;
      403)         warn "claude.ai/robots.txt 返回 403（Cloudflare 挑战或封锁）"; deduct 3 "claude.ai 返回 403" "浏览器验证或更换更干净住宅 IP" ;;
      000|"")      warn "claude.ai 连接超时"; deduct 3 "claude.ai 连接失败" "检查住宅链路稳定性" ;;
      *)           info "claude.ai 返回 HTTP $web_code" ;;
    esac

    trace_resi=$(curl -s --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_MAIN" \
      -x "$_CG_PROXY" "${CLAUDE_TRACE_URL:-https://claude.ai/cdn-cgi/trace}" 2>/dev/null)
    if [[ -n "$trace_resi" ]]; then
      local _tl
      for _tl in ${(f)trace_resi}; do
        [[ "$_tl" =~ '^ip=(.+)' ]]   && cf_ip="${match[1]//[[:space:]]/}"
        [[ "$_tl" =~ '^colo=(.+)' ]] && cf_colo="${(U)match[1]//[[:space:]]/}"
        [[ "$_tl" =~ '^loc=(.+)' ]]  && cf_loc="${(U)match[1]//[[:space:]]/}"
      done
    fi
    if [[ -n "$cf_loc" ]]; then
      if _claude_is_blocked_cc "$cf_loc"; then
        bad "出口地区受限: $cf_loc（不在 Anthropic 服务区）"
        deduct 15 "出口落在受限地区 ($cf_loc)" "切换至 JP / US / SG 等支持地区的住宅节点"
        _crit=$((_crit + 1))
      else
        ok "Cloudflare 识别出口国家: $cf_loc"
      fi
    fi
    if [[ -n "$cf_ip" && "$cf_ip" != "$ip" ]]; then
      warn "出口链路不单一: IP查询=$ip, Cloudflare看到=$cf_ip（存在嵌套或轮换代理）"
      deduct 4 "同一端口两次观测出口不一致 ($ip vs $cf_ip)" "固定单一静态住宅出口，关闭出口池轮换"
    elif [[ -n "$cf_ip" ]]; then
      ok "出口链路单一: Cloudflare 观测 IP 与查询一致"
    fi
  else
    warn "跳过可达性与地区检测（无出口 IP）"
  fi

  echo "── 3. 分流一致性与代理形态 ──────────────"
  if [[ -n "$ip" && "$rule_port" != "0" ]] && nc -z -G 1 -w 1 "$_CG_HOST" "$rule_port" >/dev/null 2>&1; then
    local trace_rule="" ip_rule="" _tl=""
    trace_rule=$(curl -s --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_MAIN" \
      -x "$_CG_RULE_PROXY" "${CLAUDE_TRACE_URL:-https://claude.ai/cdn-cgi/trace}" 2>/dev/null)
    for _tl in ${(f)trace_rule}; do
      [[ "$_tl" =~ '^ip=(.+)' ]] && ip_rule="${match[1]//[[:space:]]/}"
    done
    if [[ -n "$ip_rule" ]]; then
      if [[ "$ip" == "$ip_rule" ]]; then
        ok "分流一致: 规则端口 ($rule_port→claude.ai) 与住宅端口 ($port) 同为 $ip"
      else
        bad "出口分裂: 住宅端口=$ip, 规则端口($rule_port→claude.ai)=$ip_rule"
        deduct 10 "浏览器/规则端口与 CLI 住宅端口出口不一致" "检查 Clash 模式是否为「规则」且 aiStrict 指向住宅出口"
        _crit=$((_crit + 1))
      fi
    else
      warn "规则端口 ($rule_port) 未能完成 claude.ai trace"
      deduct 3 "规则端口 $rule_port 访问 claude.ai 失败" "检查 Clash 规则模式与住宅策略组"
    fi
  elif [[ "$rule_port" != "0" ]]; then
    info "规则端口 $rule_port 未监听，跳过跨端口比对"
  fi

  if (( $+commands[scutil] )); then
    local sc_out
    sc_out=$(scutil --proxy 2>/dev/null)
    if [[ "$sc_out" =~ 'ProxyAutoConfigEnable[[:space:]]*:[[:space:]]*1' ]]; then
      warn "系统代理开启了 PAC 自动分流（网页端易在多地区间跳变画像）"
      deduct 4 "macOS 启用了系统 PAC 分流" "关闭系统 PAC，统一交由 Clash 规则模式接管"
    else
      ok "系统未启用外部 PAC 自动分流"
    fi
  fi

  echo "── 4. IP 质量与 Edge Colo ───────────────"
  local geo_cc="" geo_city="" geo_asn="" geo_isp="" geo_tz=""
  if [[ -n "$ip" ]]; then
    local geo_json
    geo_json=$(curl -s -A "Mozilla/5.0" --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_MAIN" \
      -x "$_CG_PROXY" "${CLAUDE_GEO_URL:-https://api.ip.sb/geoip}" 2>/dev/null)
    geo_cc="${(U)$(_claude_json_field "$geo_json" country_code)}"
    geo_city="$(_claude_json_field "$geo_json" city)"
    geo_asn="$(_claude_json_field "$geo_json" asn)"
    geo_isp="$(_claude_json_field "$geo_json" isp)"
    [[ -z "$geo_isp" ]] && geo_isp="$(_claude_json_field "$geo_json" organization)"
    geo_tz="$(_claude_json_field "$geo_json" timezone)"

    # 兜底：api.ip.sb 被限流或返回非 JSON 时回退 ipinfo.io/json
    if [[ -z "$geo_cc" && -z "$geo_isp" && -z "${CLAUDE_GEO_URL:-}" ]]; then
      geo_json=$(curl -s --connect-timeout "$_CG_T_CONNECT" --max-time "$_CG_T_BACKUP" \
        -x "$_CG_PROXY" "https://ipinfo.io/json" 2>/dev/null)
      geo_cc="${(U)$(_claude_json_field "$geo_json" country)}"
      geo_city="$(_claude_json_field "$geo_json" city)"
      geo_isp="$(_claude_json_field "$geo_json" org)"
      geo_tz="$(_claude_json_field "$geo_json" timezone)"
    fi

    if [[ -n "$geo_cc" || -n "$geo_isp" ]]; then
      info "归属: ${geo_cc:-?} ${geo_city:-}${geo_asn:+ (AS${geo_asn#AS})} · ISP: ${geo_isp:-未知}"
      if [[ -n "$cf_loc" && -n "$geo_cc" ]]; then
        if [[ "$cf_loc" == "$geo_cc" ]]; then
          ok "多源地区一致: Cloudflare($cf_loc) = IP库($geo_cc)"
        else
          warn "多源地区分歧: Cloudflare=$cf_loc, IP库=$geo_cc（广播/宣告段存疑）"
          deduct 4 "IP 归属库国家码不一致 ($cf_loc vs $geo_cc)" "优先使用原生归属清晰的住宅 IP"
        fi
      fi
      if [[ -n "$geo_isp" ]]; then
        if [[ "$geo_isp" =~ '(Vultr|Hetzner|DigitalOcean|OVH|Linode|Akamai Connected|Amazon|AWS|Microsoft|Azure|Google Cloud|Alibaba|Aliyun|Tencent|Oracle|Choopa|Constant Company|ColoCrossing|QuadraNet|Psychz|Leaseweb|Contabo|Hostwinds|Rackspace|Cogent|Datacamp|CDN77|M247|GigsGigs|Bandwagon|DMIT|Cloudie|Misaka|xTom)' ]]; then
          bad "ISP 疑似机房 IDC: $geo_isp（非家宽/商宽，风控权重偏高）"
          deduct 6 "出口被识别为机房 IDC ($geo_isp)" "检查「住宅出口」策略组是否误选了机场节点"
        else
          ok "ISP 类型正常（未命中常见机房 IDC 特征）"
        fi
      fi
    else
      warn "IP 情报接口均未返回有效 JSON（跳过 ISP 类型核验）"
      deduct 2 "IP 情报接口不可达" "稍后重试 claude-check"
    fi

    if [[ -n "$cf_colo" ]]; then
      local colo_cc expect_cc="${cf_loc:-$geo_cc}"
      colo_cc="$(_claude_colo_country "$cf_colo")"
      if [[ -n "$colo_cc" ]] && _claude_is_blocked_cc "$colo_cc"; then
        bad "Edge Colo 落在受限区边缘机房: $cf_colo ($colo_cc)"
        deduct 6 "Cloudflare 落地在受限区机房 ($cf_colo)" "排查住宅上游路由是否绕经港澳/内地"
      elif [[ -n "$colo_cc" && -n "$expect_cc" && "$colo_cc" != "$expect_cc" ]]; then
        warn "Edge Colo 跨国路由: 机房 $cf_colo ($colo_cc) ≠ 出口国 $expect_cc"
        deduct 3 "CF 边缘机房 ($cf_colo) 与出口国 ($expect_cc) 不一致" "检查节点是否为跨境广播 IP"
      else
        ok "Edge Colo: $cf_colo${colo_cc:+ ($colo_cc)}"
      fi
    fi
  else
    warn "跳过 IP 质量与 Edge Colo 检测（无出口 IP）"
  fi

  echo "── 5. Claude 生效配置（仅代理判定）────"
  local ccscript="$_CG_CONFIG_CHECK" lv msg n=0 _cfg_bad=0 _cfg_crit=0
  local nodebin="${CLAUDE_GUARD_NODE:-${_CG_NODE:-$(command -v node 2>/dev/null)}}"
  if [[ -r "$ccscript" && -n "$nodebin" ]]; then
    while IFS=$'\t' read -r lv msg; do
      [[ -z "$lv" ]] && continue
      n=$((n + 1))
      case "$lv" in
        OK)   ok "$msg" ;;
        BAD)
          bad "$msg"
          _cfg_bad=1
          [[ "$msg" == *"代理异常"* || "$msg" == *"绕过代理"* || "$msg" == *"找不到任何 Claude 配置"* ]] && _cfg_crit=1
          ;;
        WARN) warn "$msg" ;;
        *)    info "$msg" ;;
      esac
    done < <(command "$nodebin" "$ccscript" 2>/dev/null)
    (( n )) || warn "配置检查脚本无输出，请手动运行: node $ccscript"
    if (( _cfg_bad )); then
      deduct 10 "Claude 生效配置偏离「仅代理」" "按上方明细修正 ~/.claude/settings.json"
      (( _cfg_crit )) && _crit=$((_crit + 1))
    fi
  else
    warn "配置检查不可用（脚本缺失或找不到 node）: $ccscript"
  fi

  echo "── 6. DNS 与环境指纹 ────────────────────"
  local d
  d=$(dig +short +time=1 +tries=1 api.anthropic.com 2>/dev/null | command grep -E '^[0-9]+[.]' | head -1)
  if [[ -n "$d" ]]; then
    info "本机解析 api.anthropic.com: $d"
  else
    d=$(nslookup -timeout=1 -retry=0 api.anthropic.com 2>/dev/null | awk '/^Address: /{print $2; exit}')
    [[ -n "$d" ]] && info "nslookup 兜底: $d" || warn "本机 DNS 未解析出 A 记录（走 CONNECT 隧道时由 mihomo 远端解析）"
  fi
  case "$d" in
    198.18.*|198.19.*) ok "fake-ip ($d) 已接管，属 mihomo 正常行为" ;;
    10.*|192.168.*|127.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*)
      warn "本机解析落到私有地址 ($d)，疑被污染"
      deduct 4 "本机 DNS 解析异常 ($d)" "检查系统 DNS 或开启 mihomo fake-ip" ;;
  esac
  local mode
  mode=$(command grep -m1 'enhanced-mode:' "$cfg" 2>/dev/null | awk '{print $2}')
  [[ -n "$mode" ]] && info "mihomo DNS: enhanced-mode=$mode"

  local sys_tz expect_tz="${CLAUDE_TZ:-$_CG_TZ}"
  sys_tz=$(readlink /etc/localtime 2>/dev/null | sed 's|.*zoneinfo/||')
  info "系统 TZ=${sys_tz:-未知} · 守卫注入 TZ=$expect_tz${geo_tz:+ · 出口所在地 TZ=$geo_tz}"
  if [[ -n "$geo_tz" && "$expect_tz" != "$geo_tz" ]]; then
    warn "守卫注入时区 ($expect_tz) ≠ 出口所在地时区 ($geo_tz)"
    deduct 5 "guard.conf 的 TZ ($expect_tz) 与出口 IP 时区 ($geo_tz) 矛盾" "将 guard.conf 的 TZ 改为 $geo_tz 后执行 claude-guard-reload"
  elif [[ -n "$geo_tz" ]]; then
    ok "守卫注入时区与出口 IP 所在地 ($geo_tz) 一致"
  fi
  if [[ -n "$sys_tz" && "$sys_tz" != "$expect_tz" ]]; then
    info "系统时区 ($sys_tz) 与出口不同：CLI 由守卫覆盖不受影响；若同时用网页版建议留意浏览器时区"
  fi

  echo "── 7. 旁路风险与出口稳定性（24h）────────"
  local v6="" iface="" l ifout
  ifout=$(ifconfig 2>/dev/null)
  for l in ${(f)ifout}; do
    [[ "$l" =~ '^([a-z0-9]+):' ]] && iface="$match[1]"
    [[ "$l" =~ 'inet6[[:space:]]+(2[0-9a-fA-F][0-9a-fA-F:]*)' ]] && v6+="$iface=$match[1] "
  done
  if [[ -n "$v6" ]]; then
    warn "本机含 IPv6 全局地址: ${v6% }（CLI 已锁代理+ipv4first；留意未走代理的子进程）"
    deduct 3 "本机网卡存在公网 IPv6 地址" "无需动 CLI；若需彻底收敛可在路由器或网络设置关闭 IPv6"
  else
    ok "无 IPv6 全局地址"
  fi

  local _cg_log="${CLAUDE_EXIT_LOG_FILE:-$_CG_EXIT_LOG}"
  if [[ -r "$_cg_log" ]]; then
    local cutoff="" changes=0 unique_ips="" prev="" lines=0 rip ts
    if (( $+builtins[strftime] )); then
      strftime -s cutoff '%Y-%m-%dT%H:%M:%S' $((EPOCHSECONDS - 86400)) 2>/dev/null
    fi
    [[ -z "$cutoff" ]] && cutoff=$(date -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null)
    while IFS=$'\t' read -r ts rip; do
      [[ -z "$ts" || -z "$rip" ]] && continue
      [[ -n "$cutoff" && "$ts" < "$cutoff" ]] && continue
      lines=$((lines + 1))
      [[ -n "$prev" && "$rip" != "$prev" ]] && changes=$((changes + 1))
      [[ " $unique_ips " != *" $rip "* ]] && unique_ips+="${unique_ips:+ }$rip"
      prev="$rip"
    done < "$_cg_log"
    info "24h 内放行 $lines 次，出口跳变 $changes 次${unique_ips:+（IP: $unique_ips）}"
    if (( changes == 0 )); then
      ok "出口稳定：24h 内零跳变"
    elif (( changes == 1 )); then
      warn "24h 内出口变化 1 次"
      deduct 2 "24h 内出口 IP 变动 1 次" "保持锁定单一住宅节点，24h 后自动恢复满分"
    else
      bad "24h 内出口跳变 $changes 次（画像频繁变化）"
      deduct 6 "24h 内出口 IP 跳变 $changes 次" "确认 residential.pinOnly=true 且未切换节点"
    fi
  else
    info "尚无 24h 启动记录（首次通过 claude 启动后自动记录）"
  fi

  echo "── 8. 综合评分 ──────────────────────────"
  (( _s < 0 )) && _s=0
  local grade color
  if (( _s >= 90 && _crit == 0 )); then
    grade="🟢 优秀 · 环境适合运行 Claude"; color="\033[32m"
  elif (( _crit > 0 )); then
    grade="🟠 风险 · 关键项未通过 (${_crit} 项一票否决)"; color="\033[33m"
  elif (( _s >= 70 )); then
    grade="🟠 有风险 · 建议按下方提示收敛"; color="\033[33m"
  elif (( _s >= 50 )); then
    grade="🔴 高风险 · 不建议直接运行"; color="\033[31m"
  else
    grade="🔴 危险 · 请先修复代理链路"; color="\033[31m"
  fi
  printf "  ${color}%s / 100 · %s\033[0m\n" "$_s" "$grade"
  if (( ${#_issues} > 0 )); then
    local item
    for item in "${_issues[@]}"; do
      printf '  · %s\n' "$item"
    done
  fi
}

# 便捷：查看当前生效的规则目录与关键配置（纯本地，不联网）
claude-guard-info() {
  printf '规则目录  %s\n' "$CLAUDE_GUARD_DIR"
  printf '住宅代理  %s（规则比对端口 %s）\n' "$_CG_PROXY" "$_CG_RULE_PORT"
  printf '时区      %s\n' "$_CG_TZ"
  printf 'IP 服务   %s\n' "$_CG_IP_SERVICES"
  printf '超时      主 %ss / 备用 %ss / connect %ss\n' "$_CG_T_MAIN" "$_CG_T_BACKUP" "$_CG_T_CONNECT"
  printf '白名单    %s\n' "${CLAUDE_ALLOWED_IPS_FILE:-$_CG_ALLOWED_IPS}"
  printf '稳定日志  %s\n' "${CLAUDE_EXIT_LOG_FILE:-$_CG_EXIT_LOG}"
  printf '配置判定  %s\n' "$_CG_CONFIG_CHECK"
  printf '启动检查  CHECK_API=%s CHECK_IPV6=%s\n' "$_CG_CHECK_API" "$_CG_CHECK_IPV6"
  printf '文档      %s/README.md\n' "$CLAUDE_GUARD_DIR"
}

# 公开命令：改完 guard.conf 后热重载，不必新开终端
claude-guard-reload() {
  _claude_guard_reload
  printf '[claude 守卫] 已重载 %s（代理 %s）\n' "$CLAUDE_GUARD_DIR/guard.conf" "$_CG_PROXY"
}
