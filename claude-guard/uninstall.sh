#!/usr/bin/env zsh
# 卸载 ~/.zshrc 里的 claude-guard 加载段（只删标记块，其它内容一行不动）。
# 注意：卸载后 claude 将不再经过守卫；settings.json 里的代理仍然 fail-closed，
#       但「出口 IP 白名单 / 配置一致性」这两道检查会消失。
set -e

ZRC="$HOME/.zshrc"
[[ -f "$ZRC" ]] || { print -u2 -r -- "uninstall: $ZRC 不存在"; exit 1 }
BAK="$ZRC.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$ZRC" "$BAK"

typeset -a lines out=()
typeset i start=0 end=0
lines=("${(@f)$(command cat "$ZRC")}")
for (( i = 1; i <= ${#lines}; i++ )); do
  [[ "${lines[$i]}" == '# >>> easy_proxy_rules / claude-guard >>>'* ]] && start=$i
  [[ "${lines[$i]}" == '# <<< easy_proxy_rules / claude-guard <<<'* ]] && end=$i
done

if (( start == 0 || end <= start )); then
  print -r -- "uninstall: 未发现加载段，无需改动（备份仍在 $BAK）"
  rm -f "$BAK"
  exit 0
fi

(( start > 1 ))       && out+=("${(@)lines[1,start-1]}")
(( end < ${#lines} )) && out+=("${(@)lines[end+1,-1]}")
TMP="$ZRC.cg-uninstall-$$"
print -rl -- "${(@)out}" > "$TMP"
if ! /bin/zsh -n "$TMP" 2>/dev/null; then
  print -u2 -r -- "uninstall: 生成结果语法检查未通过，原文件未改动"
  rm -f "$TMP"
  exit 1
fi
cp "$TMP" "$ZRC"
rm -f "$TMP"

print -r -- "uninstall: 已移除第 ${start}-${end} 行加载段"
print -r -- "uninstall: 已备份 $BAK"
print -r -- "uninstall: 规则文件本身未删除；重新启用跑 install.sh"
