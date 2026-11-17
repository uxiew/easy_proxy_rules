# 自定义配置（`x-smart` / `USER_CONFIG`）

`smart.js` 第 0 部分的每个开关都能从外面覆盖，**不用改脚本本身**。一套键名，三个入口。

> ← [文档索引](README.md) · [仓库首页](../README.md)

---

## 第 0 部分长什么样

只有两个对象，默认值和你的覆盖彻底分开：

```js
const DEFAULT_CONFIG = { ... };   // 全部默认值，键名与 x-smart 完全一致（一般不用改）
const USER_CONFIG = {};           // 你的覆盖项，只写要改的键
```

`DEFAULT_CONFIG` 是**唯一**的默认值来源；打包成 `flclash.js` 时，它的快照会渲染到文件顶部
（注释形式），手机上打开就能看到全部键和当前值。

## 三个入口

| 入口 | 用在哪 | 优先级 | 模板 |
| --- | --- | --- | --- |
| 覆写 YAML 的 `x-smart:` | 桌面端（Clash Party），推荐 | 最高 | [`x-smart.example.yaml`](../x-smart.example.yaml) |
| `flclash-credentials.json` 的 `config` 段 | 手机（FlClash），构建时注入 | 中 | 见下文 |
| `smart.js` 顶部的 `USER_CONFIG` | 自己 fork 的脚本 / 单文件脚本 | 最低 | 见下文 |

后面覆盖前面，**对象逐字段合并、数组整体替换**。三个入口都是可选的，不写就用 `DEFAULT_CONFIG`。

> 桌面端为什么推荐 `x-smart`：`smart.js` 通常是**远程覆写**，改本地文件下次更新就被覆盖；
> 而 `x-smart` 写在你自己那个本地 YAML 里，跟着订阅走、不跟着脚本走。

## 桌面端：写在覆写 YAML 里

放在**任意一个排在 `smart.js` 之前**的覆写 YAML（比如「静态住宅节点」那个）：

```yaml
x-smart:                 # ← 不要写 +x-smart
  residential:
    primary: '🏠IP-JP'    # 锁这一台（完整名，或名字里唯一的片段）
    upstream:
      inject: strip      # 本机与住宅同国 → 直连住宅网关
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

## 手机端：两个写法

**① 用 `build-flclash.js` 构建**（推荐，重建不会丢）——在 `flclash-credentials.json` 里加一段：

```json
{
  "primary": "🏠IP-JP",
  "nodes": [ { "name": "🏠IP-JP", "server": "203.0.113.10", "port": 7012, "username": "u", "password": "p" } ],
  "config": {
    "residential": { "upstream": { "inject": "strip" }, "prefer": "JP" },
    "appProxy": { "processes": [ { "value": "com.openai.chatgpt", "proxy": "住宅出口" } ] }
  }
}
```

构建脚本会把它变成产物头部的 `FLCLASH_USER_CONFIG`，键名和 `x-smart` 完全一样。

**② 直接 paste 单文件脚本** ——改 `smart.js` 顶部（第 0 部分第一段）的 `USER_CONFIG`：

```js
const USER_CONFIG = {
  residential: { primary: '🏠IP-JP', upstream: { inject: 'strip' } },
  narrowTun: { enabled: false },
};
```

> 注意：改 `USER_CONFIG` 只在「你自己 fork 的脚本」里活得久。远程引用（桌面端）下次更新会被覆盖，
> 手机端每次重新构建也会被覆盖 —— 那两种情况用上面两个入口。

## 键表

键名和第 0 部分一致（驼峰）。**只有这些键**，写别的会报警。

### `residential`（住宅出口）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | 布尔 / `'auto'` | `true` | 三态开关，见 [没有家宽怎么办](configuration.md#没有家宽怎么办residentialenabled-三态开关) |
| `primary` | 字符串 | `''` | 锁哪一台：先完整匹配、再 includes（须恰好 1 台）。**写成对象 = 锁定失败 → 只剩 REJECT** |
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
| `upstream.inject` | `true` / `'fill'` / `'strip'` / `'override'` / `false` | `true`（= `'fill'`） | 订阅自带住宅的 `dialer-proxy` 怎么处理 |
| `upstream.filter` | 字符串 | 亚洲关键词 | 跳板池收哪些节点 |

### `appProxy`（应用级分流）

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `ports` | 数组 | `[{ residential-in, 7865, 住宅出口 }]` | 专用端口：进这个端口跳过规则；仅桌面端 |
| `processes` | 数组 | `[]` | `{ value, type?, proxy }`，`type` 可为 `path` / `path-regex` / `name-regex` |

数组是**整体替换**：写 `ports` 就等于把默认的 7865 那条也换掉，想保留就一起写上。

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
| `keepSubGroups` | 布尔 | `true` | 保留订阅自带策略组，见 [坑 28](troubleshooting.md) |
| `modeGuard` | 布尔 | `true` | 把内核钉在「规则」模式，见 [坑 31](troubleshooting.md) |

## 写错了会怎样

不猜、不静默放过，日志里给一条 `[配置覆写]`：

| 情况 | 结果 |
| --- | --- |
| 键名拼错（`primery`） | 忽略该项 + 列出该对象可用的键 |
| 类型不符（`pinOnly: 'true'`） | 忽略该项、保留默认 —— 字符串 `'false'` 在 JS 里也是真值，这类错必须拦 |
| `primary` 写成对象（`{ ip: … }`） | **不保留默认**：按锁定失败处理，`住宅出口` 只剩 `REJECT` —— 默认值是「不锁 → 全部住宅节点可选」，退回它等于把出口交给运气 |
| 枚举不符（`inject: 'STRIP'`） | 忽略该项 + 列出允许值 |
| 顶层键不认识（`nope: 1`） | 忽略 + 列出全部可用键 |

不知道有没有生效，看一眼日志就够了：

```bash
grep '\[配置覆写\]' <Clash Party 覆写日志>   # 或开发面板的脚本日志
# [配置覆写] 覆写 YAML 的 x-smart：已应用 residential.primary / residential.upstream.inject
```
