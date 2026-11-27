# Clash Party 能不能换成 FlClash（桌面端实测）

> ← [文档索引](README.md) · 相关：[FlClash 与构建产物](flclash.md)、[崩溃时的断网兜底](fail-closed.md)

结论先给：**配置层面能跑，但直接替换会断掉三样东西**——7865 住宅口、路径正则进程规则、窄 TUN。
其中第一条是硬阻塞：`claude-code` 的 `settings.json` 钉死在 `127.0.0.1:7865`，FlClash 没有这个监听就全废。

---

## 1. 被测试的到底是什么

| 项 | 值 |
| --- | --- |
| FlClash | `0.9.3`（`com.follow.clash`，构建于 2026-11-04） |
| 内核 | `Contents/MacOS/FlClashCore`，**Go 版 mihomo**（panic 栈里是 `core/server.go`，无 `concord` 符号） |
| 覆写引擎 | `Frameworks/rust_api.framework` 内含 **QuickJS-ng**（`quickjs.c`），所以脚本覆写可用，但**没有 Node API** |
| 校验内核 | Clash Party 自带 `sidecar/mihomo` 复制到 `/tmp` 后去 setuid，`v1.19.32 darwin arm64` |

FlClash 新版本已改用 Rust 内核 **Concord**（读 mihomo 配置但不全支持，某些键会让整份配置被拒）。
本机这版仍是 Go mihomo，所以下面的结论只对 mihomo 内核成立；升到 Concord 版要重测。

## 2. 两个实测（都有输出为证）

**基线：现有 Clash Party 配置能否被同版本内核接受**

```bash
cp "/Applications/Clash Party.app/Contents/Resources/sidecar/mihomo" /tmp/mihomo-test
chmod u-s /tmp/mihomo-test
/tmp/mihomo-test -t -d /tmp/mihomo-home -f "$HOME/Library/Application Support/mihomo-party/work/config.yaml"
# → configuration file ... test is successful
```

`-d` 必须指向一个已经有 `GeoIP.dat` / `GEOSITE.dat` / `ASN.mmdb` 的目录（这里直接借 FlClash 的
`Application Support/com.follow.clash` 下的数据文件）。否则会看到
`can't download ASN.mmdb: ... operation timed out` → `test failed`，
**那是网络问题，不是配置错**，很容易误判。

**被测：同一份订阅节点 + `flclash-private.js`**

```bash
# 用 mihomo-party 的 35 个节点当基座，跑手机端产物，再喂给内核
bun -e '...' # 见下方结果
/tmp/mihomo-test -t -d /tmp/mihomo-home -f /tmp/flclash-test/flclash-config.yaml
# → configuration file ... test is successful
```

产物结构：**60 条规则 / 18 个组 / 5 条进程规则 / 11 条 STUN 拦截**，`US` 组存在，`住宅出口` 组存在。
`GeoSite rule anthropic => 住宅出口, records: 4` 说明 AI 规则也正确落到住宅组。

## 3. 逐项差异

| 能力 | Clash Party（现状） | FlClash | 判定 |
| --- | --- | --- | --- |
| 订阅节点、策略组、规则集 | ✅ | ✅ 60 规则 18 组实测通过 | 可迁移 |
| `x-smart` 覆写 / 脚本改写配置 | 覆写 YAML | 脚本覆写（QuickJS） | 表达力够，写法要改 |
| 7865 住宅专用口（`listeners`） | ✅ `listeners: [{port: 7865, proxy: 住宅出口}]` | ❌ 运行配置里 `listeners: null`，flclash 模式也不生成 | **硬阻塞** |
| 路径正则进程规则（`Claude.app`/`Cue`/`Antigravity`） | ✅ | ❌ flclash 模式主动过滤，只剩包名规则 | 桌面端进程分流失效 |
| 窄 TUN（`routeAddress` 只接管 Google 段 + fake-ip） | ✅ | ❌ TUN 由 App 管，只有开关 / 栈 / 严格路由 | 语义丢失 |
| WebRTC / STUN 拦截 | ✅ 11 条 | ✅ 同样 11 条 | 可迁移 |
| DoH / fake-ip / DNS 分流 | ✅ | 脚本不接管（App 管 DNS），也能跑 | 需重新调 |
| 端口 7890 系统代理 | ✅ | ✅ `mixed-port` 可设 7890 | 可迁移 |

**为什么 `listeners` 这条是硬阻塞**：`claude-code` 的 `settings.json` 把
`HTTPS_PROXY` 钉在 `http://127.0.0.1:7865`（见 [fail-closed.md](fail-closed.md)），
7865 是「本机 → 机场亚洲节点 → 住宅 IP」专用入口。FlClash 界面只有 mixed-port / socks-port，
不提供自定义 listener；如果它也不透传 profile 里的 `listeners`，这条链路直接消失。
好消息是：内核本身支持（基线配置里就有 `listeners` 且被 `-t` 接受），问题只在 App 层。

## 4. 三分钟 GUI 验证（决定能不能换）

这一步只能你点，我这边没有 GUI 会话；做完就知道 `listeners` 到底能不能过：

1. 复制现有配置另存为 `/tmp/test-7865.yaml`，在末尾加：

   ```yaml
   listeners:
     - name: residential-in
       type: mixed
       port: 7865
       listen: 127.0.0.1
       proxy: 住宅出口
   ```

2. FlClash → 配置 → 导入该文件 → 选中它 → 停止再启动内核。
3. 终端里查一眼：

   ```bash
   grep -n -A3 '^listeners' "$HOME/Library/Application Support/com.follow.clash/config.yaml"
   lsof -nP -iTCP:7865 -sTCP:LISTEN
   ```

   出现 `7865` 且 `lsof` 有监听 → 能换；仍是 `listeners: null` 或空 → **不能换**，除非你愿意
   把 `claude-code` 改成走 7890（那就等于放弃住宅出口，和本仓库的前提冲突）。

## 5. 建议

- **现在别换**。三条缺口里有两条直接影响「AI 流量必须从住宅 IP 出去」这个前提，
  换过去等于把 `smart.js` 的一半价值丢掉。
- 真要降崩溃率，按这个顺序尝试，代价由小到大：
  1. 留着 Clash Party，加 [崩溃看护](fail-closed.md)（已落地，15 秒自愈）；
  2. 换 FlClash，接受丢掉 7865 / 路径正则 / 窄 TUN，并把 `claude-code` 的代理改成 7890；
  3. 裸 mihomo 核 + LaunchDaemon，把 `smart.js` 产物烤成静态 YAML 定时更新，稳定性最高、维护最重。
- 升到 Concord 内核的 FlClash 需要重测：`path-in-bundle`、`tun.auto-redirect` 这类键会**整份拒绝**，
  不是警告。届时先跑一次 `-t` 再看。

## 6. 复现脚本

```bash
mkdir -p /tmp/flclash-test && cd /tmp/flclash-test
ruby -ryaml -rjson -e '
  d = YAML.load_file(ENV["HOME"] + "/Library/Application Support/mihomo-party/work/config.yaml")
  File.write("base.json", JSON.generate({"proxies"=>d["proxies"],"proxy-groups"=>[],"rules"=>[],
    "dns"=>{"enable"=>true},"rule-providers"=>{}}))'
node -e '
  const fs=require("fs"),vm=require("vm");
  const src=fs.readFileSync("/path/to/easy_proxy_rules/flclash-private.js","utf8");
  const sb={module:{exports:{}},exports:{},console:{log(){},warn(){},error(){}}};
  vm.createContext(sb); vm.runInContext(src,sb,{filename:"flclash-private.js"});
  const cfg=JSON.parse(fs.readFileSync("base.json","utf8"));
  sb.module.exports(cfg);
  fs.writeFileSync("out.json",JSON.stringify(cfg,null,1));'
ruby -rjson -ryaml -e 'File.write("cfg.yaml", YAML.dump(JSON.parse(File.read("out.json"))))'
/tmp/mihomo-test -t -d /tmp/mihomo-home -f cfg.yaml
```
