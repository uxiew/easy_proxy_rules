#!/usr/bin/env zsh
# claude-guard 自检：把改造过程中手工验证过的分支固化成一条命令。
# 用法：zsh claude-guard/selftest.zsh
# 特性：全部用临时夹具；不修改真实 ~/.zshrc / ~/.claude/ / .exit-ip.log；
#       curl 走 file://（测试桩屏蔽任何非 file:// 请求）、nc/ifconfig/scutil/dig 用假实现，
#       不产生任何外部网络请求，也不依赖 Clash Party 当前是否开着或真实白名单是否存在。
# 退出码：0 = 全通过，1 = 有失败项。

HERE="${${(%):-%x}:A:h}"
[[ -f "$HERE/claude-guard.zsh" ]] || HERE="$HOME/xdw/easy_proxy_rules/claude-guard"
LIB="$HERE/claude-guard.zsh"
MJS="$HERE/config-check.mjs"
NODE="/opt/homebrew/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node 2>/dev/null)"
if [[ ! -x "$NODE" ]]; then
  print -u2 -r -- "selftest: 找不到 node，config-check 相关用例无法运行"
  exit 1
fi

zmodload -F zsh/datetime b:strftime p:EPOCHSECONDS 2>/dev/null || true

FX="$(mktemp -d "${TMPDIR:-/tmp}/claude-guard-selftest.XXXXXX")" || exit 1
trap 'cd "$HOME"; rm -rf "$FX"' EXIT INT TERM
mkdir -p "$FX/bin" "$FX/check-bin" "$FX/work" "$FX/cfg"

PASS=0
FAIL=0
ok()      { print -r -- "  [PASS] $*"; PASS=$((PASS + 1)) }
bad()     { print -r -- "  [FAIL] $*"; FAIL=$((FAIL + 1)) }
section() { print -r -- ""; print -r -- "== $* =="; }

# 假 nc / ifconfig：让守卫端口检查恒通过、本机无 IPv6 干扰，与宿主机网络状态解耦
printf '#!/bin/sh\nexit 0\n' > "$FX/bin/nc"
printf '#!/bin/sh\nexit 0\n' > "$FX/bin/ifconfig"
chmod +x "$FX/bin/nc" "$FX/bin/ifconfig"

# claude-check 专用离线桩：额外屏蔽 scutil / dig / nslookup 与任何非 file:// 的 curl
cp "$FX/bin/nc" "$FX/bin/ifconfig" "$FX/check-bin/"
printf '#!/bin/sh\nprintf "ProxyAutoConfigEnable : 0\\n"\n' > "$FX/check-bin/scutil"
printf '#!/bin/sh\nprintf "198.18.0.1\\n"\n' > "$FX/check-bin/dig"
printf '#!/bin/sh\nexit 0\n' > "$FX/check-bin/nslookup"
cat > "$FX/check-bin/curl" <<'EOF'
#!/bin/sh
has_http_code=0
has_file=0
prev=""
for a in "$@"; do
  [ "$a" = "%{http_code}" ] && has_http_code=1
  case "$a" in
    file://*) has_file=1 ;;
    http://*|https://*)
      [ "$prev" != "-x" ] && exit 28
      ;;
  esac
  prev="$a"
done
if [ "$has_http_code" -eq 1 ] && [ "$has_file" -eq 1 ]; then
  printf '%s' "${MOCK_WEB_CODE:-200}"
  exit 0
fi
exec /usr/bin/curl "$@"
EOF
chmod +x "$FX/check-bin/"*

# 出口 IP / Trace / Geo 夹具（全部 file:// 本地文件）
printf '203.0.113.7' > "$FX/ip-ok.txt"
printf 'not-an-ip'   > "$FX/ip-bad.txt"
printf '1.2.3.4'     > "$FX/ip-other.txt"
printf '1.2.3.4'     > "$FX/allow-other.txt"
printf '203.0.113.7' > "$FX/allow-ok.txt"
printf '# 注释行\n\n203.0.113.7 # 行内说明\n' > "$FX/allow-comments.txt"
printf 'User-agent: *\nDisallow:\n' > "$FX/robots.txt"

cat > "$FX/trace-ok.txt" <<'EOF'
ip=203.0.113.7
colo=NRT
loc=JP
EOF
cat > "$FX/trace-bad.txt" <<'EOF'
ip=203.0.113.7
colo=HKG
loc=HK
EOF
printf '{"country_code":"JP","city":"Tokyo","asn":2914,"isp":"NTT Communications","timezone":"Asia\\/Tokyo"}\n' > "$FX/geo-ok.json"
printf '{"country_code":"HK","city":"Hong Kong","asn":20473,"isp":"Vultr Holdings","timezone":"Asia\\/Hong_Kong"}\n' > "$FX/geo-bad.json"

# 配置夹具：故意用紧凑单行 JSON，顺带回归「逐键正则」那个曾修过的 bug
mkcfg() { mkdir -p "$FX/cfg/$1"; printf '%s\n' "$2" > "$FX/cfg/$1/settings.json"; }
mkcfg only-proxy '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","NO_PROXY":"localhost,127.0.0.1"}}'
mkcfg thirdparty '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","ANTHROPIC_BASE_URL":"https://thirdparty.example.com","ANTHROPIC_AUTH_TOKEN":"FAKE-DO-NOT-PRINT"}}'
mkcfg no-proxy   '{"env":{"ANTHROPIC_MODEL":"opus"}}'
mkcfg wrong-port '{"env":{"HTTP_PROXY":"http://127.0.0.1:7890","HTTPS_PROXY":"http://127.0.0.1:7890"}}'
mkcfg noproxy    '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","NO_PROXY":"localhost,api.anthropic.com"}}'

# 在干净代理/端点环境变量的子 shell 中运行片段，避免宿主机 env 干扰测试结果
run_clean() {
  env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
      -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
      -u ANTHROPIC_BASE_URL -u ANTHROPIC_API_URL -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_API_KEY \
      "$@"
}

cd "$FX/work" || exit 1

section "1. 语法与函数加载"
if /bin/zsh -n "$LIB" 2>/dev/null; then ok "zsh -n claude-guard.zsh"; else bad "zsh -n claude-guard.zsh"; fi
if LIB="$LIB" /bin/zsh -f -c '
  source "$LIB" 2>/dev/null
  for f in claude claude-check _claude_guard_check _claude_exit_ip _claude_allowed_ips \
           _claude_config_warn claude-guard-info claude-guard-reload claude-guard-allow \
           _claude_api_reachable _claude_record_exit_ip _claude_is_blocked_cc \
           _claude_is_idc_isp _claude_colo_country _claude_json_field; do
    (( $+functions[$f] )) || exit 1
  done
' >/dev/null 2>&1; then
  ok "15 个关键函数全部加载"
else
  bad "关键函数加载缺失"
fi

section "2. guard.conf 解析"
if LIB="$LIB" /bin/zsh -f -c '
  source "$LIB" 2>/dev/null
  [[ "$_CG_PROXY" == "http://${_CG_HOST}:${_CG_PORT}" ]] &&
  [[ "$_CG_RULE_PORT" =~ "^[0-9]+$" ]] &&
  [[ "$_CG_RULE_PROXY" == "http://${_CG_HOST}:${_CG_RULE_PORT}" ]] &&
  [[ "$_CG_CHECK_API" == "0" || "$_CG_CHECK_API" == "1" ]] &&
  [[ -n "$_CG_EXIT_LOG" && "$_CG_EXIT_LOG" == /* ]] &&
  [[ -n "$_CG_ALLOWED_IPS" && "$_CG_ALLOWED_IPS" == /* ]] &&
  [[ -r "$_CG_CONFIG_CHECK" ]] &&
  [[ "$_CG_T_CONNECT" -ge 3 ]]
' >/dev/null 2>&1; then
  ok "配置解析 / 派生代理 / RULE_PORT / CHECK_API / EXIT_LOG / 路径与超时"
else
  bad "guard.conf 解析校验失败"
fi

section "3. 白名单与出口 IP 查询（夹具）"
allowed=$(LIB="$LIB" CLAUDE_ALLOWED_IPS_FILE="$FX/allow-ok.txt" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_allowed_ips' 2>/dev/null)
[[ "$allowed" == "203.0.113.7" ]] && ok "白名单读取（夹具 allow-ok.txt）-> $allowed" || bad "白名单读取（得到 [$allowed]）"

allowed_c=$(LIB="$LIB" CLAUDE_ALLOWED_IPS_FILE="$FX/allow-comments.txt" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_allowed_ips' 2>/dev/null)
[[ "$allowed_c" == "203.0.113.7" ]] && ok "白名单忽略注释与空行" || bad "白名单注释过滤失败（得到 [$allowed_c]）"

short=$(LIB="$LIB" CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt file://$FX/ip-other.txt" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_exit_ip "$_CG_PORT"' 2>/dev/null)
[[ "$short" == "203.0.113.7" ]] && ok "短路：主成功立即返回，未取备用值" || bad "短路（得到 [$short]）"

fb=$(LIB="$LIB" CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-bad.txt file://$FX/ip-ok.txt" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_exit_ip "$_CG_PORT"' 2>/dev/null)
[[ "$fb" == "203.0.113.7" ]] && ok "兜底：主无效才查备用" || bad "兜底（得到 [$fb]）"

if LIB="$LIB" CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-bad.txt" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_exit_ip "$_CG_PORT"' >/dev/null 2>&1; then
  bad "全部无效时应返回非零"
else
  ok "全部无效时返回非零"
fi

section "4. 配置一致性告警 / config-check.mjs / 项目级覆盖"
warn_for() {
  LIB="$LIB" CLAUDE_CONFIG_DIR="$FX/cfg/$1" \
    /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_config_warn' 2>&1
}
w=$(warn_for only-proxy); [[ -z "$w" ]] && ok "仅代理：零告警" || bad "仅代理：意外告警 [$w]"
w=$(warn_for thirdparty); [[ "$w" == *"ANTHROPIC_"* ]] && ok "第三方端点：告警" || bad "第三方端点：未告警"
w=$(warn_for no-proxy);   [[ "$w" == *"没有 HTTP(S)_PROXY"* ]] && ok "无代理：告警" || bad "无代理：未告警"
w=$(warn_for wrong-port); [[ "$w" == *"配置代理值不是"* ]] && ok "错端口：告警" || bad "错端口：未告警"
w=$(warn_for noproxy);    [[ "$w" == *"NO_PROXY 含 anthropic"* ]] && ok "NO_PROXY 放行：告警" || bad "NO_PROXY 放行：未告警"

cfg_for() {
  run_clean CLAUDE_CONFIG_DIR="$FX/cfg/$1" "$NODE" "$MJS" 2>/dev/null
}
o=$(cfg_for only-proxy)
[[ "$o" == *"仅代理"* && "$o" != *"配置已偏离"* ]] && ok "config-check 仅代理夹具 -> OK" || bad "config-check 仅代理夹具未判 OK"
o=$(cfg_for thirdparty)
[[ "$o" == *"配置已偏离"* ]] && ok "config-check 第三方端点夹具 -> BAD" || bad "config-check 第三方端点夹具未判 BAD"
[[ "$o" != *"FAKE-DO-NOT-PRINT"* ]] && ok "config-check 密钥值未出现在输出中" || bad "config-check 密钥值泄漏"
o=$(cfg_for no-proxy)
[[ "$o" == *"配置已偏离"* ]] && ok "config-check 无代理夹具 -> BAD" || bad "config-check 无代理夹具未判 BAD"
o=$(cfg_for noproxy)
[[ "$o" == *"NO_PROXY"* && "$o" == *"绕过代理"* ]] && ok "config-check NO_PROXY 夹具 -> BAD" || bad "config-check NO_PROXY 夹具未判 BAD"

mkdir -p "$FX/work/.claude"
printf '{"env":{"ANTHROPIC_BASE_URL":"https://project-override.example.com"}}\n' > "$FX/work/.claude/settings.json"
w=$(LIB="$LIB" CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_config_warn' 2>&1)
[[ "$w" == *"ANTHROPIC_"* ]] && ok "项目级覆盖：用户级干净但项目级塞端点 -> 告警" || bad "项目级覆盖未检出"
o=$(cfg_for only-proxy)
[[ "$o" == *"项目级"* ]] && ok "项目级覆盖：config-check 识别项目级生效层" || bad "config-check 未识别项目级"
rm -rf "$FX/work/.claude"

section "5. 纯内置辅助函数单测"
jf_res=$(LIB="$LIB" /bin/zsh -f -c '
  source "$LIB" 2>/dev/null
  b="{\"country_code\":\"JP\",\"asn\":2914,\"timezone\":\"Asia\\/Tokyo\"}"
  printf "%s|%s|%s|%s" \
    "$(_claude_json_field "$b" country_code)" \
    "$(_claude_json_field "$b" asn)" \
    "$(_claude_json_field "$b" timezone)" \
    "$(_claude_json_field "$b" missing)"
' 2>/dev/null)
[[ "$jf_res" == "JP|2914|Asia/Tokyo|" ]] && ok "_claude_json_field（字符串/数字/\\/反转义/缺失键）" || bad "_claude_json_field（得到 [$jf_res]）"

colo_res=$(LIB="$LIB" /bin/zsh -f -c '
  source "$LIB" 2>/dev/null
  printf "%s|%s|%s|%s" \
    "$(_claude_colo_country NRT)" \
    "$(_claude_colo_country HKG)" \
    "$(_claude_colo_country LAX)" \
    "$(_claude_colo_country ZZZ)"
' 2>/dev/null)
[[ "$colo_res" == "JP|HK|US|" ]] && ok "_claude_colo_country（NRT->JP / HKG->HK / LAX->US / 未知->空）" || bad "_claude_colo_country（得到 [$colo_res]）"

if LIB="$LIB" /bin/zsh -f -c '
  source "$LIB" 2>/dev/null
  for cc in CN HK RU; do _claude_is_blocked_cc "$cc" || exit 1; done
  for cc in JP US SG; do _claude_is_blocked_cc "$cc" && exit 1; done
  exit 0
' 2>/dev/null; then
  ok "_claude_is_blocked_cc（CN/HK/RU 受限，JP/US/SG 支持）"
else
  bad "_claude_is_blocked_cc 判定异常"
fi

section "6. 出口稳定性日志 _claude_record_exit_ip"
LIB="$LIB" CLAUDE_EXIT_LOG_FILE="$FX/exit-perm.log" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_record_exit_ip "203.0.113.7"' 2>/dev/null
perm=$(stat -f '%Lp' "$FX/exit-perm.log" 2>/dev/null)
if [[ -f "$FX/exit-perm.log" && "$perm" == "600" ]] && grep -q '203\.0\.113\.7' "$FX/exit-perm.log"; then
  ok "新建日志文件权限为 600 且记录 IP"
else
  bad "日志权限/写入异常（perm=$perm）"
fi

: > "$FX/exit-trim.log"
for i in {1..205}; do
  printf '2026-01-01T00:00:%02d\t198.51.100.%d\n' "$((i % 60))" "$i" >> "$FX/exit-trim.log"
done
LIB="$LIB" CLAUDE_EXIT_LOG_FILE="$FX/exit-trim.log" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_record_exit_ip "203.0.113.99"' 2>/dev/null
trim_lines=$(wc -l < "$FX/exit-trim.log" | tr -d ' ')
last_line=$(tail -n 1 "$FX/exit-trim.log")
first_line=$(head -n 1 "$FX/exit-trim.log")
if (( trim_lines == 100 )) && [[ "$last_line" == *$'\t203.0.113.99' ]] && [[ "$first_line" != *$'\t198.51.100.1' ]]; then
  ok "超过 200 行自动裁剪为精确 100 行且保留最新记录"
else
  bad "日志裁剪异常（lines=$trim_lines, first=$first_line, last=$last_line）"
fi

section "7. 启动守卫 _claude_guard_check 放行与拦截全分支"
run_guard() {
  local allow_file="$1" mock_code="$2" log_file="$3"
  run_clean PATH="$FX/bin:$PATH" LIB="$LIB" \
    CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" \
    CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt" \
    CLAUDE_ALLOWED_IPS_FILE="$allow_file" \
    CLAUDE_API_MOCK_CODE="$mock_code" \
    CLAUDE_EXIT_LOG_FILE="$log_file" \
    /bin/zsh -f -c 'source "$LIB" 2>/dev/null; typeset -g _CG_CHECK_API=1 _CG_CHECK_IPV6=0; _claude_guard_check' 2>&1
}

out=$(run_guard "$FX/allow-ok.txt" 401 "$FX/guard-exit.log"); rc=$?
if (( rc == 0 )) && [[ -f "$FX/guard-exit.log" ]] && grep -q '203\.0\.113\.7' "$FX/guard-exit.log"; then
  ok "放行：API 401 + 白名单匹配 -> rc=0 且写入隔离日志"
else
  bad "放行分支失败（rc=$rc, out=$out）"
fi

run_guard "$FX/no-such-whitelist" 401 "$FX/guard-exit-unused.log" >/dev/null; rc=$?
(( rc != 0 )) && ok "拦截：白名单缺失 -> rc=$rc" || bad "白名单缺失未拦截"

run_guard "$FX/allow-other.txt" 401 "$FX/guard-exit-unused.log" >/dev/null; rc=$?
(( rc != 0 )) && ok "拦截：出口 IP 不在白名单 -> rc=$rc" || bad "IP 不匹配未拦截"

out=$(run_guard "$FX/allow-ok.txt" 403 "$FX/guard-exit-403.log"); rc=$?
if (( rc != 0 )) && [[ "$out" == *"403"* ]]; then
  ok "拦截：API 返回 403（即使白名单匹配）-> rc=$rc 且 stderr 含 403"
else
  bad "API 403 未拦截（rc=$rc, out=$out）"
fi

out=$(run_guard "$FX/allow-ok.txt" 000 "$FX/guard-exit-000.log"); rc=$?
if (( rc == 0 )) && [[ "$out" == *"超时"* ]]; then
  ok "容错放行：API 探测超时 000 -> rc=0 且输出超时告警"
else
  bad "API 000 容错放行异常（rc=$rc, out=$out）"
fi

section "8. claude-check 离线端到端评分自检"
ts_now="" ts_prev="" ts_old=""
if (( $+builtins[strftime] )); then
  strftime -s ts_old  '%Y-%m-%dT%H:%M:%S' $((EPOCHSECONDS - 600))
  strftime -s ts_prev '%Y-%m-%dT%H:%M:%S' $((EPOCHSECONDS - 300))
  strftime -s ts_now  '%Y-%m-%dT%H:%M:%S' $((EPOCHSECONDS - 60))
else
  ts_old="$(date -v-10M +%Y-%m-%dT%H:%M:%S)"
  ts_prev="$(date -v-5M +%Y-%m-%dT%H:%M:%S)"
  ts_now="$(date -v-1M +%Y-%m-%dT%H:%M:%S)"
fi
printf '%s\t203.0.113.7\n%s\t203.0.113.7\n' "$ts_prev" "$ts_now" > "$FX/exit-healthy.log"
printf '%s\t203.0.113.7\n%s\t198.51.100.1\n%s\t203.0.113.7\n' "$ts_old" "$ts_prev" "$ts_now" > "$FX/exit-flapping.log"
: > "$FX/mihomo-empty.yaml"

run_check() {
  local api_code="$1" trace_file="$2" geo_file="$3" exit_log="$4"
  run_clean PATH="$FX/check-bin:$PATH" LIB="$LIB" \
    CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" \
    CLAUDE_GUARD_NODE="$NODE" \
    CLAUDE_TZ="Asia/Tokyo" \
    CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt" \
    CLAUDE_ALLOWED_IPS_FILE="$FX/allow-ok.txt" \
    CLAUDE_API_MOCK_CODE="$api_code" \
    CLAUDE_WEB_PROBE_URL="file://$FX/robots.txt" \
    CLAUDE_TRACE_URL="file://$trace_file" \
    CLAUDE_GEO_URL="file://$geo_file" \
    CLAUDE_EXIT_LOG_FILE="$exit_log" \
    /bin/zsh -f -c '
      source "$LIB" 2>/dev/null
      typeset -g _CG_RULE_PORT=0 _CG_MIHOMO="$1"
      claude-check
    ' -- "$FX/mihomo-empty.yaml" 2>&1
}

chk_ok=$(run_check 401 "$FX/trace-ok.txt" "$FX/geo-ok.json" "$FX/exit-healthy.log")
if [[ "$chk_ok" == *"100 / 100"* && "$chk_ok" == *"🟢 优秀"* ]]; then
  ok "健康夹具 -> 100 / 100 · 🟢 优秀"
else
  bad "健康夹具评分异常：$(print -r -- "$chk_ok" | grep -E '100|🟢|🟠|🔴|^-|^  · -' | tr '\n' ' ')"
fi

chk_bad=$(run_check 403 "$FX/trace-bad.txt" "$FX/geo-bad.json" "$FX/exit-flapping.log")
if [[ "$chk_bad" == *"🟠 风险"* || "$chk_bad" == *"🔴"* ]] && \
   [[ "$chk_bad" == *"一票否决"* ]] && \
   [[ "$chk_bad" == *"403"* && "$chk_bad" == *"Vultr"* && "$chk_bad" == *"跳变"* ]]; then
  ok "异常夹具 -> 触发一票否决（🟠 风险 / 🔴）与 403/Vultr/跳变 扣分明细"
else
  bad "异常夹具评分/明细异常：$(print -r -- "$chk_bad" | grep -E '100|🟢|🟠|🔴|一票否决' | tr '\n' ' ')"
fi

section "9. claude-guard-allow 安全加白单测"
allow_tmp="$FX/allow-dyn.txt"
rm -f "$allow_tmp"
out=$(run_clean PATH="$FX/check-bin:$PATH" LIB="$LIB" \
  CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt" \
  CLAUDE_GEO_URL="file://$FX/geo-ok.json" \
  CLAUDE_ALLOWED_IPS_FILE="$allow_tmp" \
  CLAUDE_SKIP_SENSITIVE_SYNC=1 \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; claude-guard-allow' 2>&1); rc=$?
if (( rc == 0 )) && [[ -f "$allow_tmp" && "$(< "$allow_tmp")" == "203.0.113.7" && "$(stat -f '%Lp' "$allow_tmp")" == "600" ]]; then
  ok "住宅 IP 通过归属与 ISP 核验后自动加白（权限 600）"
else
  bad "住宅 IP 加白失败（rc=$rc, out=$out）"
fi

out=$(run_clean PATH="$FX/check-bin:$PATH" LIB="$LIB" \
  CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt" \
  CLAUDE_GEO_URL="file://$FX/geo-ok.json" \
  CLAUDE_ALLOWED_IPS_FILE="$allow_tmp" \
  CLAUDE_SKIP_SENSITIVE_SYNC=1 \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; claude-guard-allow' 2>&1); rc=$?
if (( rc == 0 )) && [[ "$(wc -l < "$allow_tmp" | tr -d ' ')" == "1" ]]; then
  ok "重复执行 claude-guard-allow 幂等不重复追加"
else
  bad "重复加白幂等失败（rc=$rc）"
fi

allow_idc="$FX/allow-idc.txt"
out=$(run_clean PATH="$FX/check-bin:$PATH" LIB="$LIB" \
  CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-other.txt" \
  CLAUDE_GEO_URL="file://$FX/geo-bad.json" \
  CLAUDE_ALLOWED_IPS_FILE="$allow_idc" \
  CLAUDE_SKIP_SENSITIVE_SYNC=1 \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; claude-guard-allow' 2>&1); rc=$?
if (( rc != 0 )) && [[ ! -e "$allow_idc" ]]; then
  ok "受限地区或机房 IDC IP 被 claude-guard-allow 拒绝写入"
else
  bad "机房/受限 IP 未被拦截（rc=$rc, out=$out）"
fi

section "10. 速度与健壮性"
d=$(LIB="$LIB" CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" /bin/zsh -f -c 'source "$LIB" 2>/dev/null; zmodload zsh/datetime; t=$EPOCHREALTIME; repeat 100 do _claude_config_warn; done; printf "%.3f" "$((EPOCHREALTIME-t))"' 2>/dev/null)
print -r -- "       _claude_config_warn x100 = ${d}s"
if [[ -n "$d" ]] && (( d < 1.0 )); then ok "配置检查 100 次 < 1s（纯内置，无外部进程）"; else bad "配置检查偏慢（$d）"; fi
e=$( { CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" "$NODE" "$MJS" | head -2; } 2>&1 )
[[ "$e" != *"EPIPE"* ]] && ok "下游提前关闭管道时无 EPIPE 堆栈" || bad "出现 EPIPE 堆栈"

section "结果"
print -r -- "       通过 $PASS / 失败 $FAIL"
if (( FAIL == 0 )); then
  print -r -- "       ✓ 全部通过"
  exit 0
else
  print -r -- "       ✗ 有失败项，见上面 [FAIL]"
  exit 1
fi
