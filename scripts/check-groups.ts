#!/usr/bin/env bun
/**
 * check-groups —— 在把配置交给内核之前，先找出会让它整份拒载的结构问题
 *
 * 内核的硬错误里最难看懂的一类：
 *   loop is detected in ProxyGroup, please check following ProxyGroups: [AUTO US]
 *   proxy [X] not found
 * 客户端只把这句话弹成「添加配置失败」，既不说是哪条边闭的环，也不说是哪条规则指的。
 *
 * 用法：
 *   bun scripts/check-groups.ts --config <合成后的 yaml>    # 直接查现成配置
 *   bun scripts/check-groups.ts --profile <订阅原文 yaml>   # 先过一遍 smart.js 再查
 *   bun scripts/check-groups.ts --profile <订阅> --json     # 给脚本用
 *
 * 退出码：0 = 没问题；1 = 有硬错误（内核会拒载）；2 = 只有告警。
 * 只读本地文件，不联网。
 */

import fs from "node:fs";
import path from "node:path";

const BUILTIN = new Set(["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"]);

type Group = {
  name: string;
  type?: string;
  proxies?: string[];
  use?: string[] | string;
  filter?: string;
  "include-all"?: boolean;
  "include-all-proxies"?: boolean;
  "include-all-providers"?: boolean;
};

function usage(): never {
  console.error(
    [
      "用法: bun scripts/check-groups.ts --config <yaml> | --profile <yaml> [--json] [--quiet]",
      "  --config   已经是合成后的配置（含 override 结果）",
      "  --profile  订阅原文，先跑一遍 smart.js 再检查",
      "  --json     输出机器可读结果",
      "  --quiet    只打印结论",
    ].join("\n"),
  );
  process.exit(2);
}

function loadSmart(overridePath?: string): (cfg: any) => any {
  const file = overridePath ?? path.join(import.meta.dir, "..", "smart.js");
  const src = fs.readFileSync(file, "utf8");
  const mod: any = { exports: {} };
  const quietConsole = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };
  new Function("module", "exports", "console", src)(mod, mod.exports, quietConsole);
  if (typeof mod.exports !== "function") throw new Error(`${file} 没有导出 main(config)`);
  return mod.exports;
}

/** 环：只算「组引用了组」的边；节点、内置策略、provider 都不算 */
function findLoops(groups: Group[]) {
  const names = new Set(groups.map((g) => g.name));
  const adj = new Map<string, string[]>();
  for (const g of groups) {
    adj.set(g.name, (g.proxies ?? []).filter((m) => names.has(m)));
  }
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const loops: string[][] = [];
  const dfs = (n: string) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of adj.get(n) ?? []) {
      const s = state.get(m) ?? 0;
      if (s === 1) loops.push([...stack.slice(stack.indexOf(m)), m]);
      else if (s === 0) dfs(m);
    }
    stack.pop();
    state.set(n, 2);
  };
  for (const g of groups) if ((state.get(g.name) ?? 0) === 0) dfs(g.name);
  return loops;
}

type Report = {
  groups: number;
  nodes: number;
  loops: string[][];
  dangling: { group: string; missing: string[] }[];
  empty: string[];
  unknownRuleTargets: string[];
};

function analyse(cfg: any): Report {
  const groups: Group[] = Array.isArray(cfg["proxy-groups"]) ? cfg["proxy-groups"] : [];
  const nodes = new Set<string>((cfg.proxies ?? []).map((p: any) => p?.name).filter(Boolean));
  const groupNames = new Set(groups.map((g) => g?.name).filter(Boolean));
  const known = new Set([...BUILTIN, ...nodes, ...groupNames]);

  const dangling: { group: string; missing: string[] }[] = [];
  const empty: string[] = [];
  for (const g of groups) {
    if (!g?.name) continue;
    const mem = Array.isArray(g.proxies) ? g.proxies : [];
    const missing = mem.filter((m) => !known.has(m));
    if (missing.length) dangling.push({ group: g.name, missing });
    const dynamic = !!(g["include-all"] || g["include-all-proxies"] || g["include-all-providers"] || g.use || g.filter);
    if (!mem.length && !dynamic) empty.push(g.name);
  }

  const unknownRuleTargets: string[] = [];
  const rules: any[] = Array.isArray(cfg.rules) ? cfg.rules : [];
  for (const r of rules) {
    const parts = String(r).split(",").map((s) => s.trim());
    if (parts.length < 2) continue;
    // 最后一个非 no-resolve 字段是目标（MATCH,X / RULE-SET,name,X / GEOIP,cn,X）
    let target = "";
    for (let i = parts.length - 1; i >= 1; i--) {
      if (parts[i] && parts[i].toLowerCase() !== "no-resolve") {
        target = parts[i];
        break;
      }
    }
    if (target && !known.has(target) && !unknownRuleTargets.includes(target)) unknownRuleTargets.push(target);
  }

  return { groups: groups.length, nodes: nodes.size, loops: findLoops(groups), dangling, empty, unknownRuleTargets };
}

function main() {
  const argv = process.argv.slice(2);
  let config: string | undefined;
  let profile: string | undefined;
  let override: string | undefined;
  let json = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--config" && v) { config = v; i++; }
    else if (k === "--profile" && v) { profile = v; i++; }
    else if (k === "--override" && v) { override = v; i++; }
    else if (k === "--json") json = true;
    else if (k === "--quiet") quiet = true;
    else if (k === "-h" || k === "--help") usage();
    else usage();
  }
  if (!config && !profile) usage();

  let cfg: any;
  if (profile) {
    cfg = structuredClone(Bun.YAML.parse(fs.readFileSync(profile, "utf8")));
    const mainFn = loadSmart(override);
    try {
      cfg = mainFn(cfg);
    } catch (e: any) {
      console.error(`smart.js 执行失败：${e.message}`);
      process.exit(1);
    }
  } else {
    cfg = Bun.YAML.parse(fs.readFileSync(config!, "utf8"));
  }

  const r = analyse(cfg);
  const hard = r.loops.length > 0 || r.dangling.length > 0 || r.empty.length > 0 || r.unknownRuleTargets.length > 0;

  if (quiet) {
    console.log(
      hard
        ? `❌ ${[r.loops.length && `${r.loops.length} 处环`, r.dangling.length && `${r.dangling.length} 处悬空`,
            r.empty.length && `${r.empty.length} 个空组`, r.unknownRuleTargets.length && `${r.unknownRuleTargets.length} 个未知策略`]
            .filter(Boolean).join("，")}`
        : `✅ ${r.nodes} 节点 / ${r.groups} 组：结构检查通过`,
    );
    process.exit(hard ? 1 : 0);
  }

  if (json) {
    console.log(JSON.stringify({ source: config ?? profile, ...r }, null, 2));
    process.exit(hard ? 1 : 0);
  }

  console.log(`源        : ${profile ? `${profile}（已过 smart.js）` : config}`);
  console.log(`规模      : ${r.nodes} 个节点 / ${r.groups} 个组`);

  if (r.loops.length) {
    console.log(`\n❌ 组循环（内核会报 loop is detected in ProxyGroup 并整份拒载）`);
    for (const l of r.loops) console.log(`   ${l.join(" → ")}`);
  }
  if (r.dangling.length) {
    console.log(`\n❌ 悬空引用（内核会报 proxy not found）`);
    for (const d of r.dangling.slice(0, 8)) console.log(`   ${d.group} → ${d.missing.join(", ")}`);
    if (r.dangling.length > 8) console.log(`   … 还有 ${r.dangling.length - 8} 个组`);
  }
  if (r.empty.length) {
    console.log(`\n❌ 空组（url-test/select 没有成员，且不是动态收编）`);
    console.log(`   ${r.empty.join(", ")}`);
  }
  if (r.unknownRuleTargets.length) {
    console.log(`\n❌ 规则指向不存在的策略`);
    console.log(`   ${r.unknownRuleTargets.join(", ")}`);
  }

  if (!hard) console.log(`\n✅ 结构检查通过：无环、无悬空引用、无空组`);
  process.exit(hard ? 1 : 0);
}

main();
