#!/usr/bin/env zsh
# 幂等安装 ~/.zshrc 的 claude-guard 加载器。
# 用法：zsh claude-guard/install.sh   （重复执行不会插入多段）
# 改仓库位置：不在这里改，而是在 ~/.zshrc 的加载段之前 export EASY_PROXY_RULES_HOME。
set -e

HERE="${${(%):-%x}:A:h}"
[[ -f "$HERE/claude-guard.zsh" ]] || HERE="$HOME/Projects/easy_proxy_rules/claude-guard"
LIB="$HERE/claude-guard.zsh"
SNIP="$HERE/zshrc.snippet"
ZRC="$HOME/.zshrc"

if [[ ! -r "$LIB" || ! -r "$SNIP" ]]; then
  print -u2 -r -- "install: 找不到 $LIB 或 $SNIP"
  exit 1
fi
if ! /bin/zsh -n "$LIB" 2>/dev/null; then
  print -u2 -r -- "install: claude-guard.zsh 语法检查未通过，已中止"
  exit 1
fi

[[ -f "$ZRC" ]] || { print -u2 -r -- "install: $ZRC 不存在"; exit 1 }
BAK="$ZRC.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$ZRC" "$BAK"

# 纯 zsh 内置按行重组：已有标记块就整段替换，没有就追加到末尾。
typeset -a lines out=()
typeset snippet i start=0 end=0
lines=("${(@f)$(command cat "$ZRC")}")
snippet="$(command cat "$SNIP")"
snippet="${snippet%$'\n'}"
for (( i = 1; i <= ${#lines}; i++ )); do
  [[ "${lines[$i]}" == '# >>> easy_proxy_rules / claude-guard >>>'* ]] && start=$i
  [[ "${lines[$i]}" == '# <<< easy_proxy_rules / claude-guard <<<'* ]] && end=$i
done

if (( start > 0 && end > start )); then
  (( start > 1 ))            && out+=("${(@)lines[1,start-1]}")
  out+=("$snippet")
  (( end < ${#lines} ))      && out+=("${(@)lines[end+1,-1]}")
  MODE="替换已有加载段（原第 ${start}-${end} 行）"
else
  out=("${(@)lines}" "$snippet")
  MODE="追加加载段到文件末尾"
fi

TMP="$ZRC.cg-install-$$"
print -rl -- "${(@)out}" > "$TMP"
if ! /bin/zsh -n "$TMP" 2>/dev/null; then
  print -u2 -r -- "install: 生成结果语法检查未通过，原文件未改动"
  rm -f "$TMP"
  exit 1
fi
cp "$TMP" "$ZRC"
rm -f "$TMP"

print -r -- "install: $MODE"
print -r -- "install: 已备份 $BAK"
print -r -- "install: 规则库 $LIB"
print -r -- "install: 执行 source ~/.zshrc 或新开终端，然后跑 claude-guard-info / claude-check"
