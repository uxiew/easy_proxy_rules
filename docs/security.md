# 防泄漏：真实出口 IP 与凭据不进仓库

public 仓库 + raw 分发决定了「推上去就收不回来」，这里是三层防线的安装与维护方式。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

这个仓库是 public，而 mihomo 直接从 `raw.githubusercontent.com` 拉 `ruleset/`，
所以**历史一旦推上去就收不回来**——GitHub 的悬空提交按 SHA 仍可访问，强推重写也清不干净。
2026-11-15 就出过一次：真实住宅出口 IP 同时出现在 `README.md`、`smart.js`、`flclash.js`
和一条**提交信息正文**里；`filter-repo` 重写只能从当前分支抹掉，已经暴露的悬空提交
最终靠**删库 + 同名重建**才彻底失效。

现在的防线是三层，少一层都不算数：

| 层 | 位置 | 拦什么 |
| --- | --- | --- |
| 本地 hook | `.githooks/pre-commit` / `commit-msg` | 暂存区文件内容、提交信息正文 |
| 服务端 CI | `.github/workflows/guard.yml` | 全仓文件 + 全部历史提交信息（`--no-verify` 也绕不过） |
| 精确名单 | `.sensitive-patterns`（**不入库**） | 你自己的出口 IP / 主机名 / 账号 / 密码 |

**为什么不做「见到公网 IP 就拦」**：本仓库主题就是 IP 分流，README 里合法出现
Google 段、Anthropic 段、公共 DoH 解析器；通用规则误报一多，最后一定被 `--no-verify` 绕过。
所以改成**精确匹配你自己的值**：扫描器本身不含任何真实地址，可以直接公开。

一次性安装（每个克隆都要做一次，`core.hooksPath` 是本地配置，不随仓库分发）：

```bash
git config core.hooksPath .githooks
node scripts/sync-sensitive.mjs      # 从本地凭据生成 .sensitive-patterns
```

`sync-sensitive.mjs` 读 `flclash-credentials.json` 的 `config.residential.nodes`
（旧写法的顶层 `nodes` / 单节点也认）里每台的 `server`/`username`/`password`，
和 `claude-guard/allowed-exit-ips` 的每一行，写进 `.sensitive-patterns`（已被 `.gitignore` 排除）。

**换了出口 IP 或密码之后必须重跑** `node scripts/sync-sensitive.mjs`，否则新值不在名单里。

手动体检：

```bash
node scripts/scan-sensitive.mjs --all       # 全仓 + 全部提交信息
node scripts/scan-sensitive.mjs --staged    # 只看暂存区
```

命中时只报「`文件:行: 命中敏感值 #N`」，不回显内容——避免在日志、CI 输出里二次扩散。
负向验证过三种形态：文件内容含真实 IP、提交信息含真实 IP、`git add -f` 强加凭据文件，全部被拦。

CI 侧另需一个仓库 Secret `SENSITIVE_PATTERNS`（换行或逗号分隔，值同上面那批字面量）；
不配也能跑，只是退化成「路径 + token 形态」检查，并在日志里给出提示。
