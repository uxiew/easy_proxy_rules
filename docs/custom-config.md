# 自定义配置（`x-smart` / `USER_CONFIG`）

`smart.js` 第 0 部分的每个开关都能从外面覆盖，**不用改脚本本身**。一套键名，两个入口。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 第 0 部分长什么样

只有两个对象，默认值和你的覆盖彻底分开：

```js
const DEFAULT_CONFIG = { ... };   // 全部默认值，键名与 x-smart 完全一致（一般不用改）
const USER_CONFIG = {};           // 你的覆盖项，只写要改的键
```

`DEFAULT_CONFIG` 是**唯一**的默认值来源。打包成 `flclash.js` 时，`USER_CONFIG` 会被写到
**文件最顶部**（打开就能改），`DEFAULT_CONFIG` 的快照以注释形式跟在后面。

## 两个入口

| 入口 | 用在哪 | 优先级 | 模板 |
| --- | --- | --- | --- |
| 覆写 YAML 的 `x-smart:` | 桌面端（Clash Party），推荐 | 最高 | [`x-smart.example.yaml`](../x-smart.example.yaml) |
| `USER_CONFIG` | 手机（构建时注入）/ 单文件脚本 | 最低 | 见下文 |

后面覆盖前面，**对象逐字段合并、数组整体替换**。两个入口都是可选的，不写就用 `DEFAULT_CONFIG`。

> 桌面端为什么推荐 `x-smart`：`smart.js` 通常是**远程覆写**，改本地文件下次更新就被覆盖；
> 而 `x-smart` 写在你自己那个本地 YAML 里，跟着订阅走、不跟着脚本走。
>
> 手机端没有覆写链，`flclash-credentials.json` 的 `config` 段会在构建时**变成文件顶部的
> `USER_CONFIG`** —— 名字只有这一个，两端读的是同一个对象，不用记两套。

## 桌面端：写在覆写 YAML 里

放在**任意一个排在 `smart.js` 之前**的覆写 YAML（比如「静态住宅节点」那个）：

```yaml
x-smart:                 # ← 不要写 +x-smart
  residential:
    primary: '🏠IP-JP'    # 锁这一台（完整名，或名字里唯一的片段）
    # 住宅凭据也可以写在这里（等价于 +proxies，但 dialer-proxy 由脚本补），
    # 和手机端是同一条配置：
    # nodes:
    #   - { name: '🏠IP-JP', type: http, server: 203.0.113.10, port: 7012, username: u, password: p }
    # upstream 不写 = fill（挂前置-亚洲）：人在国内直连海外网关会被墙，别写 strip
    prefer: 'JP'
  narrowTun:
    enabled: false
  keepSubGroups: true
```

两个必须知道的点：

- **不能带 `+`**：Clash Party 的 `deepMerge` 只对**数组**认 `+` 前缀（`+proxies` / `+rules`），
  写 `+x-smart` 会得到一个叫「+x-smart」的键，脚本读不到。
- **顺序**：YAML 排在 `smart.js` 后面时脚本已经跑完，读不到这份配置 ——
  在面板里把它拖到 `smart.js` 之上。

## 手机端：写在 `flclash-credentials.json` 里

住宅凭据和各项目配置用**同一个 `config` 对象**，构建时整段变成文件顶部的 `USER_CONFIG`：

```json
{
  "config": {
    "mode": "flclash",
    "residential": {
      "primary": "🏠IP-JP",
      "nodes": [
        { "name": "🏠IP-JP", "type": "http", "server": "203.0.113.10",
          "port": 7012, "username": "u", "password": "p" }
      ]
    }
  }
}
```

- `mode` 不用写，构建时默认就是 `"flclash"`；写了别的值（`"clash"`）会照办。
- `nodes` 里的 `type` 按服务商给的协议填（HTTP 代理写 `http`，SOCKS5 才写 `socks5`），
  不写默认 `http`。多写几台只作备用：**只有 `primary` 那台进组**，主力挂了是 `REJECT`。
- `upstream` 不用写：默认 `fill`（住宅流量经机场跳板）——人在国内必须这样，
  直连海外网关会被墙（见 [troubleshooting 坑 32](troubleshooting.md)）。
- 桌面端也可以把节点写在 `x-smart.residential.nodes`（同一个键，见上面的桌面示例）。
- 旧的顶层写法（`{ "primary": ..., "nodes": [...] }`）仍然能用，构建时会自动折进
  `config.residential` 并提示一次。

**不带 `build-flclash.js`、直接 paste 单文件脚本**：改文件顶部的 `USER_CONFIG` 即可，
键名一模一样。手机端每次重新构建会覆盖它 —— 长期使用请写进 `flclash-credentials.json`。

## 键表

键名和第 0 部分一致（驼峰）。**只有这些键**，写别的会报警。

### `residential`（住宅出口）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `true` / `false` / `'auto'` | `true` | 三态开关，见 [没有家宽怎么办](configuration.md#没有家宽怎么办residentialenabled-三态开关) |
| `nodes` | 数组 | `[]` | 住宅节点凭据 `{ name, type?, server, port, username, password, … }`，两端同一处；`dialer-proxy` 自动补 |
| `primary` | 字符串 | `''` | 锁哪一台：先完整匹配、再 includes（须恰好 1 台）。**写成对象 = 锁定失败 → 只剩 REJECT**。留空且写了 `nodes` = 锁第一台 |
| `pinOnly` | 布尔 | `true` | 只放 `primary` 那一台，其余不进组 |
| `pinMiss` | `'reject'` / `'collect'` | `'reject'` | 锁不上时：只剩阻断 / 退回收编 |
| `prefer` | 字符串 | `''` | 没配 `primary` 时按国家把节点排到组首（`'JP'`） |
| `aiStrict` | 布尔 | `true` | AI 服务商 + Anthropic IP 段 + Claude/ChatGPT 进程 → 住宅 |
| `allAI` | 布尔 | `false` | 整个 `forAI` 走住宅，**会烧流量**，见 [坑](configuration.md) |
| `escapeToAI` | 布尔 | `false` | 是否把 `AI` 放进住宅出口当手动逃生口 |
| `group` | 字符串 | `'住宅出口'` | 组名（改它要同步改规则落点，一般别动） |
| `nodePattern` | 字符串 | `🏠\|IP-\|家宽\|住宅\|静态\|…` | 认哪些节点是住宅 |
| `upstream.enabled` | 布尔 | `true` | 是否建 `前置-亚洲` |
| `upstream.group` | 字符串 | `'前置-亚洲'` | 跳板组名 |
| `upstream.inject` | `true` / `'fill'` / `'strip'` / `'override'` / `false` | `true`（= `'fill'`） | `dialer-proxy` 怎么处理：默认 `fill` 走前置（人在国内必须走）；`'strip'` 仅人在海外直连可达时；`false` = 一个字都不碰 |
| `upstream.filter` | 字符串 | 亚洲关键词 | 跳板池收哪些节点 |

### `appProxy`（应用级分流）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ports` | 数组 | `[{ residential-in, 7865, 住宅出口 }]` | 专用端口：进这个端口跳过规则；仅桌面端 |
| `processes` | 数组 | 内置 **9 条**（4 条 Android 包名 + macOS `Claude.app` / `/opt/homebrew/bin/claude` / `ChatGPT.app` / `Antigravity.app` / `/opt/homebrew/bin/agy`） | `{ value, type?, proxy }`，`type` 可为 `path` / `path-regex` / `name-regex` / `uid` |

数组是**整体替换**：写了 `ports` 或 `processes` 会完整覆盖默认条目（例如写 `ports` 会换掉默认的 `7865`，写 `processes` 会换掉默认的 9 条内置规则），想保留请把默认条目一并写上。

### `traffic` / `narrowTun` / `regionPriority` / `webrtcGuard` / `aiStaticToAI`

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `traffic.domesticDirect` | 布尔 | `true` | `GEOSITE,cn → DIRECT` |
| `traffic.appleDirect` | 布尔 | `true` | Apple 全家桶直连，最省流量的一刀 |
| `narrowTun.enabled` | 布尔 | `true` | 只把 Google 段塞进 TUN |
| `narrowTun.includeAI` | 布尔 | `true` | 额外接管系统 DNS + fake-ip（AI 长连接要用） |
| `narrowTun.stack` | `'Mixed'` / `'gvisor'` / `'system'` | `'Mixed'` | TUN 栈 |
| `regionPriority.enabled` | 布尔 | `true` | `AUTO` / `AI` 按国家顺序回落 |
| `regionPriority.targets` | 对象 | `{AUTO:[…], AI:[…]}` | 组 → 地区顺序 |
| `regionPriority.othersGroup` | 字符串 | `'OT'` | 「其它地区」兜底组，`''` = 不留 |
| `regionPriority.interval` | 数字 | `120` | fallback 组检查间隔（秒） |
| `webrtcGuard.enabled` | 布尔 | `false` | 拦 STUN 探测，**会打断语音** |
| `aiStaticToAI` | 字符串数组 | 4 条 | AI 静态资源 / 安装包走机场（不烧住宅） |

### 顶层开关

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `mode` | `'clash'` / `'flclash'` | `'clash'` | 跑在哪：桌面 / 手机。手机端由构建注入，平时不用写 |
| `keepSubGroups` | 布尔 | `true` | 保留订阅自带策略组，见 [坑 28](troubleshooting.md) |
| `modeGuard` | 布尔 | `true` | 把内核钉在「规则」模式，见 [坑 31](troubleshooting.md) |

## 写错了会怎样

不猜、不静默放过，日志里给一条 `[配置覆写]`：

| 情况 | 结果 |
| --- | --- |
| 键名拼错（`primery`） | 忽略该项 + 列出该对象可用的键 |
| 类型不符（`pinOnly: 'true'`） | 忽略该项、保留默认 —— 字符串 `'false'` 在 JS 里也是真值，这类错必须拦 |
| `primary` 写成对象（`{ ip: … }`） | **不保留默认**：按锁定失败处理，`住宅出口` 只剩 `REJECT` —— 默认值是「不锁 → 全部住宅节点可选」，退回它等于把出口交给运气 |
| 枚举不符（`inject: 'STRIP'` / `mode: 'FlClash'`） | 忽略该项 + 列出允许值 |
| 顶层键不认识（`nope: 1`） | 忽略 + 列出全部可用键 |

不知道有没有生效，看一眼日志就够了：

```bash
grep '\[配置覆写\]' <Clash Party 覆写日志>   # 或开发面板的脚本日志
# [配置覆写] 覆写 YAML 的 x-smart：已应用 residential.primary / residential.upstream.inject
```
