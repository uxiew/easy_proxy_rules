# 已知问题与边界

> ← [文档索引](README.md) · [仓库首页](../README.md)

记录**仍然存在**的坑、刻意的取舍、以及还没实测过的部分。修好的问题不在这里——那些进
[踩过的坑](troubleshooting.md)；这里只列「现在还会咬人」的。

最后核对：2026-11-27。

---

## 1. 订阅为空 → 整份配置生成失败

**现象**：客户端报「添加配置失败」，覆写日志里是
`配置文件中未找到任何代理节点（订阅为空或拉取失败：查 profile.yaml 的 url 与客户端日志）`。

**为什么是抛错而不是放行**：没有节点时生成的组全是空壳，内核对空组成员会判无效，
报错点会飘到「translate config failed」这种更难懂的地方，不如在源头说清楚。

**排查顺序**：`profile.yaml` 里的订阅 URL 还能解析吗 → 客户端日志里拉取返回的 HTTP 状态 →
是不是选中了空的模板 profile（`profiles/default.yaml`）。

## 2. 数组追加对「顺序敏感」的配置无效

`regionPriority.targets.AUTO` 这类数组**追加不改变顺序**：写 `AUTO: ['US']` 时 `US` 本来就在
默认列表里，合并结果等于没改（日志会显示 `无变化`）。要调整优先级只有一条路：

```yaml
x-smart:
  regionPriority:
    targets:
      AUTO: { mode: 'replace', items: ['US', 'JP', 'SG'] }   # 顺序完全按你写的
```

判断依据：**追加适合「加一条」，顺序类配置要用整份替换。**

## 3. `remove` 只认精确身份

`{ value: 'com.whatsapp', remove: true }` 的匹配键是 `type + value`，不是模糊匹配：
写了 `type: 'name-regex'` 就删不掉默认那条 `PROCESS-NAME`；`value` 大小写差一个字符也删不掉。
删不掉时日志会打「删除 0」，看到它就去核对默认条目的原始写法（`smart.js` 顶部 `DEFAULT_CONFIG`）。

## 4. PF 断网兜底的三个边界

| 边界 | 说明 |
| --- | --- |
| 只处理 IPv4 | IPv6 节点会打警告；当前订阅全是 IPv4，换到有 IPv6 节点的订阅要重新评估 |
| 规则绑在物理网卡上 | 换网卡（Wi‑Fi ↔ 有线、插拔 iPhone USB）后要重新 `apply` 一次 |
| 订阅域名默认不放行 | 从 URL 更新订阅前要 `suspend --for N`，否则订阅拉不下来且客户端不报错 |

另外：`apply` / `confirm` / `off` 需要 sudo，**本仓库的作者环境里从没真正加载过规则**
（沙箱拒绝 sudo），验证只做到 `pfctl -n -f` 语法通过 + table 合并逻辑的单元验证。
第一次真机 apply 请按 [断网兜底](fail-closed.md) 的保险丝流程走。

## 5. FlClash 桌面端仍然接不了这套配置

7865 `listeners`、路径正则进程规则、窄 TUN 三样 FlClash 桌面端都不支持，详见
[Clash Party vs FlClash](clash-party-vs-flclash.md)。手机端不受影响（走包名 + 全量规则）。

## 6. 端口冲突只保留「先到的」那条

`appProxy.ports` 现在支持追加，很容易加出一条跟 7865 撞端口的新条目。冲突时保留
`DEFAULT_CONFIG` 里的那条，后加的跳过，并在日志里打
`[专用端口] ai-in:7865 与已有的 residential-in:7865 冲突（name / port 必须唯一），已跳过`。
内核不会因此起不来，但**你以为生效的那条其实没生效**——看到这行就去改名或改端口。

## 7. 文档与代码的漂移（本次已修，留个记号）

| 位置 | 原来写的 | 实际 |
| --- | --- | --- |
| `configuration.md` / `traffic-entry.md` | 默认 9 条进程规则 | **10 条**（漏了 `devin-cli`） |
| `traffic-entry.md` | `PROCESS-PATH,/opt/homebrew/bin/agy` | `PROCESS-PATH-REGEX,^/opt/homebrew/bin/agy` |
| `getting-started.md` | 「所有 YAML 覆写都必须排在 `smart.js` 之后」 | 规则类在后，**配置类（`x-smart`）必须在前** |

这类漂移没有自动检查，只能靠改代码时顺手核对。§8 是下次自查的检查单。

## 8. 自查检查单（改完 `smart.js` 跑一遍）

```bash
node build-flclash.js                                  # 构建自检（组环 / 关键域名 / 规则集条目）
bun scripts/check-groups.ts --config "$HOME/Library/Application Support/mihomo-party/work/config.yaml" --quiet
node scripts/scan-sensitive.mjs --all                  # 敏感值
grep -rn "9 条\|前置-日本\|PROCESS-PATH," docs/          # 陈旧数字与旧写法
```

前三条能自动化，最后一条只能人工判断——**数字类描述尽量别写死在文档里**，或者写成
「默认若干条（以 `DEFAULT_CONFIG` 为准）」。
