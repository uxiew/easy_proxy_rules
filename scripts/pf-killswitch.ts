#!/usr/bin/env bun
/**
 * pf-killswitch —— 代理挂掉时按网卡 fail-closed（macOS / PF）
 *
 * 思路（社区共识，见 docs/fail-closed.md）：
 *   物理网卡只放行「发往节点真实 IP」「DNS」「局域网 / DHCP / mDNS」，其余出站一律 drop。
 *   TUN（utun*）与回环不受影响。核心一停，应用流量落回物理网卡 → 被丢 → 不会直连。
 *
 * 为什么不是按进程：PF 没有进程维度；LuLu 那类按进程的过滤器判断在路由之前，
 * 分不出「走 TUN」还是「直连」，两头都错。
 *
 * ── 节点 IP 不写死在规则里（v2 的关键改动）────────────────────────────
 *   第一版把 32 个节点 IP 直接写进规则文件：换订阅、换节点、节点域名换 IP 之后，
 *   规则里还是旧 IP —— 新节点全被自己的规则掐死，整机断网且看不出原因。
 *   现在规则只引用一个 pf table：
 *
 *     table <hs_nodes> persist { ...初始值... }
 *     pass out quick inet to <hs_nodes> keep state
 *
 *   刷新 table 用 `pfctl -T replace`，不动规则、不重载 anchor、没有空窗：
 *     sync  = 解析当前配置 → 合并「上次已知可用」→ 原子替换 table
 *     watch = 常驻（LaunchDaemon 跑），配置一变就 sync；顺带每 60 秒重解析一次
 *
 *   替换策略是「并集 + 宽限期」：新解析到的立刻生效，旧 IP 只要 10 分钟内出现过就继续放行。
 *   这样订阅刚切换、核心还在重连的那几十秒里不会两头都断；10 分钟后旧 IP 自动清掉。
 *
 * 用法：
 *   bun scripts/pf-killswitch.ts render           # 只打印规则与要放行的 IP（不需要 sudo）
 *   bun scripts/pf-killswitch.ts apply            # 下发规则，默认 180 秒保险丝自动撤销
 *   bun scripts/pf-killswitch.ts confirm          # 演练通过 → 取消保险丝，规则固化
 *   bun scripts/pf-killswitch.ts sync             # 只刷新 table（换订阅后跑这条）
 *   bun scripts/pf-killswitch.ts watch            # 常驻：配置变化 / 每 60 秒自动 sync
 *   bun scripts/pf-killswitch.ts suspend --for 180 # 安全窗口：只放开订阅域名 80/443，其余照旧拦
 *   bun scripts/pf-killswitch.ts suspend --for 60 --open   # 全开窗口（真实 IP 会暴露）
 *   bun scripts/pf-killswitch.ts status           # anchor 规则 + table 内容
 *   bun scripts/pf-killswitch.ts off              # 立刻撤销
 *   bun scripts/pf-killswitch.ts install          # 生成 LaunchDaemon plist 与安装命令
 *
 * 选项：
 *   --client <name>   clash-party（默认）；别的客户端用 --config 指路径
 *   --config <path>   覆盖配置文件路径（默认 Clash Party 的 work/config.yaml）
 *   --anchor <name>   默认 com.apple.hpsrv.killswitch
 *   --table <name>    默认 hs_nodes
 *   --fuse <sec>      默认 180，0 = 不要保险丝
 *   --out <path>      默认 /tmp/pf-killswitch.conf
 *   --allow <cidr>    额外放行，可重复（例如公司内网 VPN 段）
 *   --iface <name>    额外挂规则的网卡，可重复（默认自动收集 en*）
 *   --grace <sec>     旧 IP 宽限期，默认 600
 *   --interval <sec>  watch 全量重解析间隔，默认 60
 *   --strict          解析失败 > 0 就拒绝执行（默认只警告）
 *   --host <domain>   suspend 时额外放行这个域名（新订阅域名还没写进 profile.yaml 时用）
 *   --open            suspend 时清空规则（默认不清，只放开订阅域名）
 *   --subscribe-hosts     长期放行订阅域名 IP（默认不放行；开了订阅自动更新才能直连成功，
 *                         代价是这些 IP 的 80/443 会被放开，CDN 共用 IP 时等于开了个口子）
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import { execSync, spawnSync } from "node:child_process";

const HOME = os.homedir();

/** 客户端 → 运行时配置（别的 Mihomo GUI 目录结构相同，用 --config 指过去即可） */
const CLIENTS: Record<string, string> = {
  "clash-party": path.join(HOME, "Library/Application Support/mihomo-party/work/config.yaml"),
};

const DEFAULT_CONFIG = CLIENTS["clash-party"];
const NODES_TXT = "/tmp/pf-killswitch-nodes.txt";
const SUBS_TXT = "/tmp/pf-killswitch-subs.txt";
const STATE_PATH = "/tmp/pf-killswitch-state.json";

type Opts = {
  cmd: string;
  client: string;
  config: string;
  anchor: string;
  table: string;
  fuse: number;
  forSec: number;
  out: string;
  allow: string[];
  grace: number;
  interval: number;
  strict: boolean;
  subHosts: boolean;
  ifaces: string[];
  hosts: string[];
  open: boolean;
};

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    cmd: argv[0] ?? "render",
    client: "clash-party",
    config: DEFAULT_CONFIG,
    anchor: "com.apple.hpsrv.killswitch",
    table: "hs_nodes",
    fuse: 180,
    forSec: 0,
    out: "/tmp/pf-killswitch.conf",
    allow: [],
    grace: 600,
    interval: 60,
    strict: false,
    subHosts: false,
    ifaces: [],
    hosts: [],
    open: false,
  };
  let configSet = false;
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--config" && v) { o.config = v; configSet = true; i++; }
    else if (k === "--client" && v) { o.client = v; i++; }
    else if (k === "--anchor" && v) { o.anchor = v; i++; }
    else if (k === "--table" && v) { o.table = v; i++; }
    else if (k === "--fuse" && v) { o.fuse = Number(v) || 0; i++; }
    else if (k === "--out" && v) { o.out = v; i++; }
    else if (k === "--allow" && v) { o.allow.push(v); i++; }
    else if (k === "--grace" && v) { o.grace = Number(v) || 0; i++; }
    else if (k === "--interval" && v) { o.interval = Number(v) || 60; i++; }
    else if (k === "--strict") { o.strict = true; }
    else if (k === "--iface" && v) { o.ifaces.push(v); i++; }
    else if (k === "--subscribe-hosts") { o.subHosts = true; }
    else if (k === "--no-subscribe-hosts") { o.subHosts = false; }
    else if (k === "--host" && v) { o.hosts.push(v); i++; }
    else if (k === "--open") { o.open = true; }
    else if (k === "--for" && v) { o.forSec = Number(v) || 0; i++; }
    else throw new Error(`unknown option: ${k}`);
  }
  if (!configSet && CLIENTS[o.client]) o.config = CLIENTS[o.client];
  return o;
}

const isIPv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
const isIPv6 = (s: string) => s.includes(":") && /^[0-9a-fA-F:]+$/.test(s);
const nowISO = () => new Date().toISOString();
const hhmmss = () => new Date().toTimeString().slice(0, 8);

/** 默认路由的物理接口（en0 / en1 …） */
function defaultInterface(): string {
  try {
    const out = execSync("route -n get default", { encoding: "utf8" });
    const m = out.match(/interface:\s*(\S+)/);
    return m ? m[1] : "en0";
  } catch {
    return "en0";
  }
}

/**
 * 要挂规则的物理网卡：默认路由那张 + 全部 en*（Wi‑Fi / 有线 / iPhone USB 都是 enN）。
 *
 * ⚠️ 规则必须挂在具体网卡上，不能写成不限网卡的 `block out all`：
 *   TUN 的流量是从 utunN 出去的，那条兜底 block 会把 TUN 自己的包也丢掉，
 *   表现为「一 apply 整机没网」。只有把 pass/block 都限定在 en*，utun 才真的「不受影响」。
 */
function physicalInterfaces(defIface: string): string[] {
  let all: string[] = [];
  try {
    all = execSync("ifconfig -l", { encoding: "utf8" }).trim().split(/\s+/);
  } catch {
    all = [];
  }
  const withInet = (n: string) => {
    try {
      return /inet (\d+\.\d+\.\d+\.\d+)/.test(execSync(`ifconfig ${n}`, { encoding: "utf8" }));
    } catch {
      return false;
    }
  };
  // 只留真的配了 IPv4 的 en*，否则会把一堆 inactive 的 en1..en7 写进规则
  const en = all.filter((n) => /^en\d+$/.test(n) && withInet(n)).sort();
  return [...new Set([defIface, ...en])].filter((n) => n && !n.startsWith("utun"));
}

/** 物理网卡所在网段，用于放行局域网（打印机、NAS、路由器管理页） */
function localSubnet(iface: string): string | null {
  try {
    const out = execSync(`ifconfig ${iface}`, { encoding: "utf8" });
    const ip = out.match(/inet (\d+\.\d+\.\d+\.\d+)/)?.[1];
    const mask = out.match(/netmask (0x[0-9a-f]+)/)?.[1];
    if (!ip || !mask) return null;
    const m = parseInt(mask, 16) >>> 0;
    const ipNum = ip.split(".").reduce((a, b) => ((a << 8) + Number(b)) >>> 0, 0);
    const net = (ipNum & m) >>> 0;
    const toStr = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
    const prefix = m.toString(2).split("1").length - 1;
    return `${toStr(net)}/${prefix}`;
  } catch {
    return null;
  }
}

type Node = { name: string; server: string };

function readNodes(configPath: string): { nodes: Node[]; providerWarn: boolean } {
  const text = fs.readFileSync(configPath, "utf8");
  const doc = (Bun as any).YAML.parse(text) as any;
  const proxies: any[] = Array.isArray(doc?.proxies) ? doc.proxies : [];
  const nodes = proxies
    .map((p) => ({ name: String(p?.name ?? "?"), server: String(p?.server ?? "") }))
    .filter((n) => n.server);
  const providerWarn = !!doc?.["proxy-providers"] && Object.keys(doc["proxy-providers"]).length > 0;
  return { nodes, providerWarn };
}

async function resolveAll(nodes: Node[]): Promise<{ v4: Map<string, string[]>; v6: string[]; failed: string[] }> {
  const v4 = new Map<string, string[]>();
  const v6: string[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();

  for (const n of nodes) {
    const host = n.server.replace(/^\[|\]$/g, "");
    if (seen.has(host)) continue;
    seen.add(host);

    if (isIPv4(host)) { v4.set(host, [n.name]); continue; }
    if (isIPv6(host)) { v6.push(host); continue; }

    try {
      const addrs = await dns.lookup(host, { all: true });
      const ips = addrs.filter((a) => a.family === 4).map((a) => a.address);
      if (ips.length === 0) { failed.push(host); continue; }
      for (const ip of ips) {
        const names = v4.get(ip) ?? [];
        names.push(`${n.name}(${host})`);
        v4.set(ip, names);
      }
    } catch {
      failed.push(host);
    }
  }
  return { v4, v6, failed };
}

/**
 * 订阅本身的域名也要放行 —— 否则 PF 生效后「更新订阅」这条直连会被自己的规则丢掉，
 * 表现是订阅永远停在旧节点列表，客户端还不报错。
 * profile.yaml 里的 items[].url 就是订阅地址（useProxy: false 的条目是直连拉取）。
 */
function readSubscriptionHosts(configPath: string): string[] {
  const profileYaml = path.join(path.dirname(path.dirname(configPath)), "profile.yaml");
  if (!fs.existsSync(profileYaml)) return [];
  try {
    const doc = (Bun as any).YAML.parse(fs.readFileSync(profileYaml, "utf8")) as any;
    const items: any[] = Array.isArray(doc?.items) ? doc.items : [];
    const hosts = new Set<string>();
    for (const it of items) {
      if (it?.type !== "remote" || !it?.url || it?.useProxy) continue;
      try {
        hosts.add(new URL(String(it.url)).hostname);
      } catch {
        /* 坏链接跳过 */
      }
    }
    return [...hosts];
  } catch {
    return [];
  }
}

async function resolveHosts(hosts: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const h of hosts) {
    if (isIPv4(h)) { out.push(h); continue; }
    try {
      const addrs = await dns.lookup(h, { all: true });
      out.push(...addrs.filter((a) => a.family === 4).map((a) => a.address));
    } catch {
      /* 订阅域名解析不出来就不放行，不影响节点 */
    }
  }
  return [...new Set(out)];
}

// ---------- 状态：上一次解析到的 IP + 最后一次见到的时间 ----------

type State = { updatedAt: string; entries: Record<string, string> };

function readState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (s && typeof s.entries === "object") return s as State;
  } catch {
    /* 没有状态文件就是第一次跑 */
  }
  return { updatedAt: nowISO(), entries: {} };
}

function writeState(s: State) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), { mode: 0o600 });
}

/**
 * 并集 + 宽限期：
 *   - 本次解析到的 IP → 时间戳刷新为现在
 *   - 上次见过、但这次没解析出来的 → 只要没过 grace 就保留（订阅刚切换时靠它兜底）
 *   - 过期的一律清掉，避免 table 无限膨胀
 */
function mergeWithGrace(resolved: string[], prev: State, graceSec: number) {
  const now = Date.now();
  const entries: Record<string, string> = {};
  const fresh = new Set<string>();

  for (const ip of resolved) {
    entries[ip] = nowISO();
    fresh.add(ip);
  }

  const kept: string[] = [];
  const pruned: string[] = [];
  for (const [ip, ts] of Object.entries(prev.entries)) {
    if (entries[ip]) continue;
    const age = (now - Date.parse(ts)) / 1000;
    if (Number.isFinite(age) && age <= graceSec) {
      entries[ip] = ts;
      kept.push(ip);
    } else {
      pruned.push(ip);
    }
  }
  return { entries, fresh, kept, pruned, ips: Object.keys(entries).sort() };
}

// ---------- 规则模板：节点 IP 走 table，不再写死 ----------

function buildRules(
  o: Opts,
  ifaces: string[],
  subnet: string | null,
  ips: string[],
  subIps: string[] = [],
): string {
  const on = ifaces.length === 1 ? ifaces[0] : `{ ${ifaces.join(", ")} }`;
  const lines: string[] = [];
  lines.push(`# 由 scripts/pf-killswitch.ts 生成，别手改`);
  lines.push(`# 生成时间: ${nowISO()}`);
  lines.push(`# 源配置: ${o.config}`);
  lines.push(`# 物理网卡: ${ifaces.join(", ")}${subnet ? `  局域网: ${subnet}` : ""}（只在这些网卡上拦，utun 不动）`);
  lines.push(`# 节点 IP 在 table <${o.table}>：换订阅后跑 sync 刷新，不要重载本文件`);
  lines.push("");
  lines.push("# 节点 IP（初始值；运行时由 sync 用 -T replace 覆盖）");
  lines.push(`table <${o.table}> persist { ${ips.join(", ")} }`);
  lines.push("");
  lines.push("# 订阅域名 IP（可选：--subscribe-hosts 才有内容；只放行 80/443，别的一律不放）");
  lines.push(
    subIps.length ? `table <${o.table}_subs> persist { ${subIps.join(", ")} }` : `table <${o.table}_subs> persist`,
  );
  lines.push("");
  lines.push("# 回环与 TUN 不受影响");
  lines.push("pass quick on lo0 all");
  lines.push("");
  lines.push("# 局域网：打印机 / NAS / 路由器 / AirPlay");
  if (subnet) lines.push(`pass out quick on ${on} inet to ${subnet} keep state`);
  lines.push(`pass out quick on ${on} inet proto udp to 224.0.0.0/4 keep state`);
  lines.push("");
  lines.push("# DHCP 续租（否则断线后拿不到 IP）");
  lines.push(`pass out quick on ${on} inet proto udp from any port 68 to any port 67 keep state`);
  lines.push("");
  lines.push("# 节点服务器：只放行 table 里的 IP，端口不限（节点端口经常变）");
  lines.push(`pass out quick on ${on} inet to <${o.table}> keep state`);
  lines.push("");
  lines.push("# 订阅拉取（只有开了 --subscribe-hosts 才有内容；端口限定，避免把 CDN 整段放开）");
  lines.push(`pass out quick on ${on} inet proto tcp to <${o.table}_subs> port { 80, 443 } keep state`);
  lines.push("");
  lines.push("# 系统 DNS 兜底：核心启动时要用它解析节点域名");
  lines.push(`pass out quick on ${on} inet proto { tcp, udp } to { 223.5.5.5, 119.29.29.29 } port 53 keep state`);
  lines.push("");
  for (const a of o.allow) lines.push(`pass out quick on ${on} inet to ${a} keep state`);
  if (o.allow.length) lines.push("");
  lines.push("# 其余一律丢弃 —— 这就是 fail-closed 本身");
  lines.push(`block out quick on ${on} inet all`);
  lines.push("");
  return lines.join("\n");
}

// ---------- pfctl 包装：root 直接调，普通用户走 sudo ----------

function pfctl(args: string[], check = false) {
  const isRoot = process.getuid?.() === 0;
  const r = isRoot
    ? spawnSync("pfctl", args, { encoding: "utf8" })
    : spawnSync("sudo", ["pfctl", ...args], { encoding: "utf8" });
  if (check && r.status !== 0) {
    throw new Error(`pfctl ${args.join(" ")} 失败（exit ${r.status}）: ${(r.stderr || "").trim()}`);
  }
  return r;
}

/** anchor 里当前有没有规则（没有就别 sync，否则会凭空造出一个空表） */
function anchorLoaded(o: Opts): boolean {
  const r = pfctl(["-a", o.anchor, "-sr"]);
  return r.status === 0 && (r.stdout || "").trim().length > 0;
}

// ---------- 核心动作 ----------

type SyncResult = {
  ips: string[];
  fresh: string[];
  kept: string[];
  pruned: string[];
  failed: string[];
  v6: number;
  total: number;
  subHosts: number;
  subIps: string[];
};

async function collect(o: Opts, persist = true): Promise<SyncResult> {
  if (!fs.existsSync(o.config)) {
    throw new Error(`配置文件不存在: ${o.config}（用 --client 或 --config 指定）`);
  }
  const { nodes, providerWarn } = readNodes(o.config);
  if (providerWarn && nodes.length === 0) {
    throw new Error(
      "配置里只有 proxy-providers，没有内联 proxies；节点 IP 在 provider 文件里，" +
        "本脚本还没实现 provider 解析（当前订阅是内联的，先按需扩展）",
    );
  }
  const { v4, v6, failed } = await resolveAll(nodes);
  const nodeIps = [...v4.keys()];
  if (nodeIps.length === 0) {
    throw new Error("没有解析出任何节点 IP，拒绝改写 table（否则整机断网）");
  }
  if (failed.length && o.strict) {
    throw new Error(`有节点域名解析失败（--strict）：${failed.join(", ")}`);
  }

  // 订阅域名单独算：它们不是节点，不进宽限表，也不该占节点表的额度
  const subHostList = o.subHosts ? readSubscriptionHosts(o.config) : [];
  const subIps = subHostList.length ? await resolveHosts(subHostList) : [];

  const prev = readState();
  const merged = mergeWithGrace(nodeIps, prev, o.grace);
  if (persist) {
    writeState({ updatedAt: nowISO(), entries: merged.entries });
    fs.writeFileSync(NODES_TXT, merged.ips.join("\n") + "\n", { mode: 0o600 });
    if (subIps.length) fs.writeFileSync(SUBS_TXT, subIps.join("\n") + "\n", { mode: 0o600 });
  }
  return {
    ips: merged.ips,
    fresh: [...merged.fresh],
    kept: merged.kept,
    pruned: merged.pruned,
    failed,
    v6: v6.length,
    total: nodes.length,
    subHosts: subHostList.length,
    subIps,
  };
}

function report(o: Opts, r: SyncResult) {
  console.log(`源配置     : ${o.config}`);
  console.log(`节点         : ${r.total} 个，解析出 ${r.fresh.length} 个节点 IPv4`);
  if (r.subHosts) {
    console.log(`订阅域名     : ${r.subHosts} 个 → ${r.subIps.length} 个 IPv4（只放行 80/443）`);
  } else {
    console.log(`订阅域名     : 未放行（订阅自动更新会被 PF 拦；要开加 --subscribe-hosts）`);
  }
  console.log(`table        : ${r.ips.length} 条（新增 ${r.fresh.length} / 宽限保留 ${r.kept.length} / 清理 ${r.pruned.length}）`);
  if (r.kept.length) console.log(`  宽限保留   : ${r.kept.join(", ")}（${o.grace}s 内出现过）`);
  if (r.pruned.length) console.log(`  已清理     : ${r.pruned.join(", ")}`);
  if (r.v6) console.log(`⚠️ IPv6 节点  : ${r.v6} 个（本规则只拦 IPv4，IPv6 需另建 inet6 规则）`);
  if (r.failed.length) {
    console.log(`⚠️ 解析失败   : ${r.failed.join(", ")}（这些节点会被规则掐掉；域名若长期失败，用 --allow 放行其 IP 段）`);
  }
}

async function doSync(o: Opts, quiet = false): Promise<boolean> {
  const r = await collect(o);
  if (!quiet) report(o, r);
  if (!anchorLoaded(o)) {
    console.log(`sync: anchor ${o.anchor} 未加载（还没 apply？），只更新了本地状态`);
    return false;
  }
  pfctl(["-a", o.anchor, "-t", o.table, "-T", "replace", "-f", NODES_TXT], true);
  if (r.subIps.length) {
    pfctl(["-a", o.anchor, "-t", `${o.table}_subs`, "-T", "replace", "-f", SUBS_TXT], true);
  } else {
    // 关掉 --subscribe-hosts 之后，别把上一轮的订阅 IP 留在表里
    pfctl(["-a", o.anchor, "-t", `${o.table}_subs`, "-T", "flush"]);
  }
  if (!quiet) {
    console.log(
      `sync: table <${o.table}> → ${r.ips.length} 条` +
        (r.subIps.length ? `，<${o.table}_subs> → ${r.subIps.length} 条` : "") +
        "（规则未重载）",
    );
  }
  return true;
}

function sh(cmd: string, check = true) {
  const r = spawnSync("/bin/sh", ["-c", cmd], { stdio: "inherit" });
  if (check && r.status !== 0) throw new Error(`命令失败（exit ${r.status}）: ${cmd}`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const iface = defaultInterface();
  const subnet = localSubnet(iface);
  const ifaces = [...new Set([...physicalInterfaces(iface), ...o.ifaces])];

  if (o.cmd === "status") {
    console.log(`anchor : ${o.anchor}   table: ${o.table}`);
    const rules = pfctl(["-a", o.anchor, "-sr"]);
    process.stdout.write(rules.stdout || rules.stderr || "");
    const t = pfctl(["-a", o.anchor, "-t", o.table, "-T", "show"]);
    const list = (t.stdout || "").trim().split("\n").filter(Boolean);
    console.log(`\ntable <${o.table}>: ${list.length} 条`);
    if (list.length) console.log(list.join(" "));
    const info = spawnSync("/bin/sh", ["-c", "pfctl -s info 2>/dev/null | grep -E 'Status|State Table' | head -3"], {
      encoding: "utf8",
    });
    process.stdout.write(info.stdout || "");
    return;
  }

  if (o.cmd === "off") {
    pfctl(["-a", o.anchor, "-F", "all"], true);
    const pidFile = "/tmp/pf-killswitch-fuse.pid";
    if (fs.existsSync(pidFile)) {
      sh(`sudo kill ${fs.readFileSync(pidFile, "utf8").trim()} 2>/dev/null || true`, false);
      fs.unlinkSync(pidFile);
    }
    console.log(`off: 已清空 anchor ${o.anchor}（含 table）；watch 会停在等待状态，不会把规则加回来`);
    return;
  }

  if (o.cmd === "confirm") {
    const pidFile = "/tmp/pf-killswitch-fuse.pid";
    if (!fs.existsSync(pidFile)) {
      console.log("confirm: 没有待取消的保险丝（可能已过期或被撤销）");
      return;
    }
    const pid = fs.readFileSync(pidFile, "utf8").trim();
    sh(`sudo kill ${pid} 2>/dev/null || true`);
    fs.unlinkSync(pidFile);
    console.log("confirm: 保险丝已取消，规则固化。撤销用 `off`。");
    return;
  }

  if (o.cmd === "sync") {
    const ok = await doSync(o);
    if (!ok) process.exitCode = 0;
    return;
  }

  if (o.cmd === "suspend") {
    const sec = o.forSec || 120;
    if (!anchorLoaded(o)) {
      console.log(`suspend: anchor ${o.anchor} 未加载，本来就没有拦截，什么都不用做`);
      return;
    }

    const pre = process.getuid?.() === 0 ? "" : "sudo ";
    // 到点恢复：先回到原规则文件，再把两张表的真实内容补回去（文件缺失的表要显式清空，
    // 否则窗口期塞进去的 IP 会一直留着放行）
    const resume =
      `pfctl -a ${o.anchor} -f ${o.out}; ` +
      `pfctl -a ${o.anchor} -t ${o.table} -T replace -f ${NODES_TXT}; ` +
      (fs.existsSync(SUBS_TXT)
        ? `pfctl -a ${o.anchor} -t ${o.table}_subs -T replace -f ${SUBS_TXT}; `
        : `pfctl -a ${o.anchor} -t ${o.table}_subs -T flush; `);

    if (o.open) {
      // 明确要求全开：清空 anchor，窗口内没有任何拦截
      pfctl(["-a", o.anchor, "-F", "rules"], true);
      sh(
        `${pre}sh -c '( sleep ${sec}; ${resume} echo "suspend --open ended at $(date +%T)" >> /tmp/pf-killswitch.log ) >/dev/null 2>&1 &'`,
      );
      console.log(`suspend --open: 规则已撤，${sec} 秒内没有任何拦截（真实 IP 会暴露），到点自动恢复`);
      return;
    }

    // 默认：安全窗口。只把订阅域名的 80/443 放开，其余流量继续 fail-closed。
    const hostList = [...new Set([...readSubscriptionHosts(o.config), ...o.hosts])];
    if (!hostList.length) {
      throw new Error(
        "suspend: 安全窗口要知道订阅域名，但 profile.yaml 里没有远程订阅项。\n" +
          "  用 --host <订阅域名> 指定；确实需要全开再用 --open",
      );
    }
    const subIps = await resolveHosts(hostList);
    if (!subIps.length) {
      throw new Error(
        `suspend: 订阅域名解析不出 IPv4（${hostList.join(", ")}），DNS 可能也被自己拦着。\n` +
          "  先确认 --allow 里有可用的 DNS，或者改用 --open",
      );
    }

    const r = await collect(o);
    const conf = buildRules(o, ifaces, subnet, r.ips, subIps);
    const tmp = "/tmp/pf-killswitch.conf.suspend";
    fs.writeFileSync(tmp, conf, { mode: 0o600 });
    pfctl(["-a", o.anchor, "-f", tmp], true);
    sh(
      `${pre}sh -c '( sleep ${sec}; ${resume} echo "suspend ended at $(date +%T)" >> /tmp/pf-killswitch.log ) >/dev/null 2>&1 &'`,
    );
    console.log(
      `suspend: ${sec} 秒内放行 ${hostList.join(", ")}（${subIps.length} 个 IP）的 80/443，其余仍然拦截`,
    );
    console.log(`  顺带刷了节点表（${r.ips.length} 条）；窗口结束自动回到原规则，不用手动 confirm`);
    return;
  }

  if (o.cmd === "watch") {
    console.log(`watch: 启动（config=${o.config} interval=${o.interval}s grace=${o.grace}s）`);
    let lastSig = "";
    let lastFull = 0;
    let armed = true;
    for (;;) {
      try {
        const st = fs.statSync(o.config);
        const sig = `${st.mtimeMs}:${st.size}`;
        const changed = sig !== lastSig;
        const due = Date.now() - lastFull > o.interval * 1000;
        if (changed || due) {
          const ok = await doSync(o, !changed);
          lastSig = sig;
          lastFull = Date.now();
          if (!ok) {
            // 规则没加载（还没 apply，或刚被 off 掉）：不自己加规则，等下一次
            if (armed) console.log(`[${hhmmss()}] anchor ${o.anchor} 未加载，等待规则重新加载（每 ${o.interval}s 重试）`);
            armed = false;
          } else {
            if (!armed) console.log(`[${hhmmss()}] 规则已恢复，继续跟随`);
            armed = true;
            if (changed) console.log(`[${hhmmss()}] 配置变化 → table 已刷新`);
          }
        }
      } catch (e: any) {
        // 配置正在被客户端重写时可能读到半截 YAML，下一轮再来，别把守护进程搞死
        console.log(`[${hhmmss()}] sync 失败：${e.message}`);
      }
      await Bun.sleep(3000);
    }
  }

  if (o.cmd === "install") {
    const bunPath = execSync("command -v bun", { encoding: "utf8" }).trim();
    const self = path.resolve(process.argv[1]);
    // 把当前这次的选项原样带进守护进程，否则 daemon 跑的是另一套参数
    const args = [
      bunPath,
      self,
      "watch",
      "--client", o.client,
      "--anchor", o.anchor,
      "--table", o.table,
      "--grace", String(o.grace),
      "--interval", String(o.interval),
    ];
    if (o.subHosts) args.push("--subscribe-hosts");
    for (const a of o.allow) args.push("--allow", a);
    for (const i of o.ifaces) args.push("--iface", i);

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>local.hpsrv.pf-killswitch</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${a}</string>`).join("\n")}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/var/log/hpsrv-pf-killswitch.log</string>
  <key>StandardErrorPath</key><string>/var/log/hpsrv-pf-killswitch.log</string>
</dict>
</plist>
`;
    const plistPath = "/tmp/local.hpsrv.pf-killswitch.plist";
    fs.writeFileSync(plistPath, plist);
    console.log(`已生成 ${plistPath}\n`);
    console.log("安装（root 守护，watch 才有权限改 table）：");
    console.log(`  sudo cp ${plistPath} /Library/LaunchDaemons/`);
    console.log("  sudo launchctl bootstrap system /Library/LaunchDaemons/local.hpsrv.pf-killswitch.plist");
    console.log("  tail -f /var/log/hpsrv-pf-killswitch.log");
    console.log("\n卸载：");
    console.log("  sudo launchctl bootout system/local.hpsrv.pf-killswitch");
    console.log("\n注意：watch 只刷 table、不会自己把规则加回来 —— 先 apply 并 confirm，再装守护。");
    return;
  }

  if (o.cmd !== "render" && o.cmd !== "apply") {
    console.error(
      "usage: pf-killswitch.ts <render|apply|confirm|sync|watch|suspend|status|off|install> [--config PATH] [--client clash-party] [--for SEC] [--open] [--host DOMAIN]",
    );
    process.exit(2);
  }

  const r = await collect(o, o.cmd === "apply");
  report(o, r);

  const conf = buildRules(o, ifaces, subnet, r.ips, r.subIps);
  fs.writeFileSync(o.out, conf, { mode: 0o600 });
  console.log(`物理网卡     : ${ifaces.join(", ")}${subnet ? `  局域网 ${subnet}` : ""}`);
  console.log(`anchor       : ${o.anchor}   table: ${o.table}`);

  if (o.cmd === "render") {
    for (const ip of r.fresh) console.log(`  ${ip}  ← 本次解析`);
    for (const ip of r.kept) console.log(`  ${ip}  ← 宽限保留`);
    console.log(`\n规则文件: ${o.out}（${conf.split("\n").length} 行）\n`);
    console.log(conf);
    console.log("要生效：sudo bun scripts/pf-killswitch.ts apply");
    return;
  }

  pfctl(["-a", o.anchor, "-f", o.out], true);
  // 表内容以本次解析为准：显式 replace。`pfctl -f` 里的 table { … } 是「往里加」而不是「替换」，
  // 上一轮残留的 IP（比如刚换掉的旧订阅）会继续被放行。
  pfctl(["-a", o.anchor, "-t", o.table, "-T", "replace", "-f", NODES_TXT], true);
  if (r.subIps.length) {
    pfctl(["-a", o.anchor, "-t", `${o.table}_subs`, "-T", "replace", "-f", SUBS_TXT], true);
  } else {
    pfctl(["-a", o.anchor, "-t", `${o.table}_subs`, "-T", "flush"]);
  }
  pfctl(["-e"]); // 已经开着会返回非零，忽略
  console.log(`apply: 已加载规则 + ${r.ips.length} 个节点 IP 到 anchor ${o.anchor}`);

  if (o.fuse > 0) {
    const pidFile = "/tmp/pf-killswitch-fuse.pid";
    // 同一次 sudo 里 fork 出保险丝：到点自动清空 anchor
    sh(
      `sudo sh -c '( sleep ${o.fuse}; pfctl -a ${o.anchor} -F all; echo "fuse fired at $(date +%T)" >> /tmp/pf-killswitch.log ) >/dev/null 2>&1 & echo $! > ${pidFile}'`,
    );
    console.log(`apply: 保险丝 ${o.fuse}s（pid $(cat ${pidFile} 2>/dev/null)），演练通过后执行 confirm`);
  } else {
    console.log("apply: 未启用保险丝（--fuse 0），撤销用 off");
  }
  console.log("\n演练：停掉核心 → 浏览器/curl 应全部失败 → 恢复核心 → 出口与之前一致 → confirm");
  console.log("之后装守护：bun scripts/pf-killswitch.ts install（换订阅自动跟）");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(`\n失败: ${e.message}`);
    process.exit(1);
  });
}
