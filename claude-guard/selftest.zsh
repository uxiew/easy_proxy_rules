#!/usr/bin/env zsh
# claude-guard 自检：把改造过程中手工验证过的分支固化成一条命令。
# 用法：zsh claude-guard/selftest.zsh
# 特性：全部用临时夹具；不修改真实 ~/.zshrc / ~/.claude/；curl 走 file://、nc 用假实现，
#       不产生任何外部网络请求，也不依赖 Clash Party 当前是否开着。
# 退出码：0 = 全通过，1 = 有失败项。

HERE="${${(%):-%x}:A:h}"
[[ -f "$HERE/claude-guard.zsh" ]] || HERE="$HOME/Projects/easy_proxy_rules/claude-guard"
LIB="$HERE/claude-guard.zsh"
MJS="$HERE/config-check.mjs"
NODE="/opt/homebrew/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node 2>/dev/null)"
if [[ ! -x "$NODE" ]]; then
  print -u2 -r -- "selftest: 找不到 node，config-check 相关用例无法运行"
  exit 1
fi

FX="$(mktemp -d "${TMPDIR:-/tmp}/claude-guard-selftest.XXXXXX")" || exit 1
trap 'cd "$HOME"; rm -rf "$FX"' EXIT INT TERM
mkdir -p "$FX/bin" "$FX/work" "$FX/cfg"

PASS=0
FAIL=0
ok()      { print -r -- "  [PASS] $*"; PASS=$((PASS + 1)) }
bad()     { print -r -- "  [FAIL] $*"; FAIL=$((FAIL + 1)) }
section() { print -r -- ""; print -r -- "== $* =="; }

# 假 nc：让守卫的端口检查恒通过，测试与本机代理状态解耦
printf '#!/bin/sh\nexit 0\n' > "$FX/bin/nc"
chmod +x "$FX/bin/nc"

# 出口 IP 查询夹具：curl 对 file:// 不联网
printf '203.0.113.7' > "$FX/ip-ok.txt"
printf 'not-an-ip'     > "$FX/ip-bad.txt"
printf '1.2.3.4'       > "$FX/ip-other.txt"
printf '1.2.3.4'       > "$FX/allow-other.txt"
printf '203.0.113.7'   > "$FX/allow-ok.txt"

# 配置夹具：故意用紧凑单行 JSON，顺带回归「逐键正则」那个曾修过的 bug
mkcfg() { mkdir -p "$FX/cfg/$1"; printf '%s\n' "$2" > "$FX/cfg/$1/settings.json"; }
mkcfg only-proxy '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","NO_PROXY":"localhost,127.0.0.1"}}'
mkcfg thirdparty '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","ANTHROPIC_BASE_URL":"https://thirdparty.example.com","ANTHROPIC_AUTH_TOKEN":"FAKE-DO-NOT-PRINT"}}'
mkcfg no-proxy   '{"env":{"ANTHROPIC_MODEL":"opus"}}'
mkcfg wrong-port '{"env":{"HTTP_PROXY":"http://127.0.0.1:7890","HTTPS_PROXY":"http://127.0.0.1:7890"}}'
mkcfg noproxy    '{"env":{"HTTP_PROXY":"http://127.0.0.1:7865","HTTPS_PROXY":"http://127.0.0.1:7865","NO_PROXY":"localhost,api.anthropic.com"}}'

cd "$FX/work" || exit 1

section "1. 语法与加载"
if /bin/zsh -n "$LIB" 2>/dev/null; then ok "zsh -n claude-guard.zsh"; else bad "zsh -n claude-guard.zsh"; fi
if LIB="$LIB" /bin/zsh -f -c 'source "$LIB" 2>/dev/null; for f in claude claude-check _claude_guard_check _claude_exit_ip _claude_allowed_ips _claude_config_warn claude-guard-info claude-guard-reload; do (( $+functions[$f] )) || exit 1; done' >/dev/null 2>&1; then
  ok "8 个函数全部加载"
else
  bad "8 个函数全部加载"
fi

section "2. guard.conf 解析"
if LIB="$LIB" /bin/zsh -f -c 'source "$LIB" 2>/dev/null; [[ "$_CG_PROXY" == "http://${_CG_HOST}:${_CG_PORT}" ]] && [[ -r "$_CG_ALLOWED_IPS" ]] && [[ -r "$_CG_CONFIG_CHECK" ]] && [[ "$_CG_T_CONNECT" -ge 3 ]]' >/dev/null 2>&1; then
  ok "配置解析 / 派生代理 / 路径可读 / connect-timeout>=3"
else
  bad "配置解析 / 派生代理 / 路径可读 / connect-timeout>=3"
fi

section "3. 白名单与出口 IP 查询"
allowed=$(LIB="$LIB" /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_allowed_ips' 2>/dev/null)
[[ -n "$allowed" ]] && ok "白名单读取 -> ${allowed//$'\n'/, }" || bad "白名单读取（空）"

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

section "4. 配置一致性告警（5 种夹具）"
warn_for() {
  LIB="$LIB" CLAUDE_CONFIG_DIR="$FX/cfg/$1" \
    /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_config_warn' 2>&1
}
w=$(warn_for only-proxy); [[ -z "$w" ]] && ok "仅代理：零告警" || bad "仅代理：意外告警 [$w]"
w=$(warn_for thirdparty); [[ "$w" == *"ANTHROPIC_"* ]] && ok "第三方端点：告警" || bad "第三方端点：未告警"
w=$(warn_for no-proxy);   [[ "$w" == *"没有 HTTP(S)_PROXY"* ]] && ok "无代理：告警" || bad "无代理：未告警"
w=$(warn_for wrong-port); [[ "$w" == *"配置代理值不是"* ]] && ok "错端口：告警" || bad "错端口：未告警"
w=$(warn_for noproxy);    [[ "$w" == *"NO_PROXY 含 anthropic"* ]] && ok "NO_PROXY 放行：告警" || bad "NO_PROXY 放行：未告警"

section "5. config-check.mjs「仅代理」判定"
cfg_for() {
  ( unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy \
          ANTHROPIC_BASE_URL ANTHROPIC_API_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY
    CLAUDE_CONFIG_DIR="$FX/cfg/$1" "$NODE" "$MJS" 2>/dev/null )
}
o=$(cfg_for only-proxy)
[[ "$o" == *"仅代理"* && "$o" != *"配置已偏离"* ]] && ok "仅代理夹具 -> OK" || bad "仅代理夹具未判 OK"
o=$(cfg_for thirdparty)
[[ "$o" == *"配置已偏离"* ]] && ok "第三方端点夹具 -> BAD" || bad "第三方端点夹具未判 BAD"
[[ "$o" != *"FAKE-DO-NOT-PRINT"* ]] && ok "密钥值未出现在输出中" || bad "密钥值泄漏"
o=$(cfg_for no-proxy)
[[ "$o" == *"配置已偏离"* ]] && ok "无代理夹具 -> BAD" || bad "无代理夹具未判 BAD"
o=$(cfg_for noproxy)
[[ "$o" == *"NO_PROXY"* && "$o" == *"绕过代理"* ]] && ok "NO_PROXY 夹具 -> BAD" || bad "NO_PROXY 夹具未判 BAD"

section "6. 守卫放行与拦截（假 nc + file:// IP）"
run_guard() {
  PATH="$FX/bin:$PATH" LIB="$LIB" \
    CLAUDE_EXIT_IP_SERVICES="file://$FX/ip-ok.txt" CLAUDE_ALLOWED_IPS_FILE="$1" \
    /bin/zsh -f -c 'source "$LIB" 2>/dev/null; typeset -g _CG_CHECK_IPV6=0; _claude_guard_check' >/dev/null 2>&1
}
run_guard "$FX/allow-ok.txt"; [[ $? -eq 0 ]] && ok "放行：出口 IP 在白名单内（夹具，不依赖真实白名单）" || bad "放行分支失败"
run_guard "$FX/no-such-whitelist"; [[ $? -ne 0 ]] && ok "拦截：白名单缺失" || bad "白名单缺失未拦截"
run_guard "$FX/allow-other.txt";   [[ $? -ne 0 ]] && ok "拦截：出口 IP 不在白名单" || bad "IP 不匹配未拦截"

section "7. 项目级覆盖"
mkdir -p "$FX/work/.claude"
printf '{"env":{"ANTHROPIC_BASE_URL":"https://project-override.example.com"}}\n' > "$FX/work/.claude/settings.json"
w=$(LIB="$LIB" CLAUDE_CONFIG_DIR="$FX/cfg/only-proxy" \
  /bin/zsh -f -c 'source "$LIB" 2>/dev/null; _claude_config_warn' 2>&1)
[[ "$w" == *"ANTHROPIC_"* ]] && ok "用户级干净但项目级塞端点 -> 告警" || bad "项目级覆盖未检出"
o=$(cfg_for only-proxy)
[[ "$o" == *"项目级"* ]] && ok "config-check 识别项目级生效层" || bad "config-check 未识别项目级"
rm -rf "$FX/work/.claude"

section "8. 速度与健壮性"
d=$(LIB="$LIB" /bin/zsh -f -c 'source "$LIB" 2>/dev/null; zmodload zsh/datetime; t=$EPOCHREALTIME; repeat 100 do _claude_config_warn; done; printf "%.3f" "$((EPOCHREALTIME-t))"' 2>/dev/null)
print -r -- "       _claude_config_warn x100 = ${d}s"
if [[ -n "$d" ]] && (( d < 1.0 )); then ok "配置检查 100 次 < 1s（纯内置，无外部进程）"; else bad "配置检查偏慢（$d）"; fi
e=$( { "$NODE" "$MJS" | head -2; } 2>&1 )
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
