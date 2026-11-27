#!/usr/bin/env bun
/**
 * Manage a single DoH endpoint in Clash Party (mihomo-party) as a global YAML
 * override. Commands: status | check | apply | restore | update
 *
 * Run with any of:
 *   bun scripts/clash-party-doh.ts <cmd>
 *   tsx scripts/clash-party-doh.ts <cmd>
 *   node --experimental-strip-types scripts/clash-party-doh.ts <cmd>
 *
 * Design: declarative config + atomic writes + timestamped backups + idempotent
 * apply. The app data files are only touched inside the paths from the config.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

type Slot = "nameserver" | "proxy-server-nameserver" | "fallback";
type Position = "prepend" | "append";

type Config = {
  dohUrl: string;
  browserDohUrl?: string;
  notes?: string;
  slot: Slot;
  position: Position;
  appDataDir: string;
  override: { id: string; name: string };
  backupDir: string;
};

const SCRIPT_DIR = path.dirname(path.resolve(process.argv[1]));
const PROJECT_ROOT = path.dirname(SCRIPT_DIR);
const CONFIG_PATH = path.join(SCRIPT_DIR, "clash-party-doh.json");
const START = "  # >>> clash-party-doh";
const END = "  # <<< clash-party-doh";
const SLOTS: Slot[] = ["nameserver", "proxy-server-nameserver", "fallback"];

function readText(file: string): string {
  return fs.readFileSync(file, "utf8");
}

function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644;
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, file);
}

function resolvePath(value: string): string {
  if (value === "~" || value.startsWith("~/")) return path.join(os.homedir(), value.slice(1));
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

function loadRaw(): Config {
  const cfg = JSON.parse(readText(CONFIG_PATH)) as Config;
  if (!cfg.dohUrl || !cfg.appDataDir || !cfg.override?.id) {
    throw new Error("invalid config: dohUrl / appDataDir / override.id are required");
  }
  if (!SLOTS.includes(cfg.slot)) throw new Error(`invalid slot: ${cfg.slot}`);
  if (cfg.position !== "prepend" && cfg.position !== "append") {
    throw new Error(`invalid position: ${cfg.position}`);
  }
  return cfg;
}

function normalize(cfg: Config): Config {
  return {
    ...cfg,
    appDataDir: resolvePath(cfg.appDataDir),
    backupDir: resolvePath(cfg.backupDir ?? "backups/clash-party-doh"),
  };
}

function loadConfig(): Config {
  return normalize(loadRaw());
}

function saveConfig(cfg: Config): void {
  writeAtomic(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

function paths(cfg: Config) {
  return {
    registry: path.join(cfg.appDataDir, "override.yaml"),
    overrideFile: path.join(cfg.appDataDir, "override", `${cfg.override.id}.yaml`),
    runtime: path.join(cfg.appDataDir, "work", "config.yaml"),
  };
}

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backup(cfg: Config, label: string): string {
  const dir = path.join(cfg.backupDir, `${stamp()}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  const { registry, overrideFile, runtime } = paths(cfg);
  const copied: Record<string, string> = {};
  for (const [name, file] of Object.entries({
    "override.yaml": registry,
    [`override-${cfg.override.id}.yaml`]: overrideFile,
    "work-config.yaml": runtime,
  })) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(dir, name));
      copied[name] = sha256(file);
    }
  }
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ label, at: new Date().toISOString(), config: cfg, sha256: copied }, null, 2) + "\n",
  );
  return dir;
}

function overrideFileText(cfg: Config): string {
  const key = cfg.position === "prepend" ? `+${cfg.slot}` : `${cfg.slot}+`;
  return [
    "# Managed by clash-party-doh.ts — do not edit by hand.",
    `# Source: ${CONFIG_PATH}`,
    `doh-source: '${cfg.dohUrl}'`,
    "dns:",
    `  ${key}:`,
    `    - '${cfg.dohUrl}'`,
    "",
  ].join("\n");
}

function registryBlock(cfg: Config): string[] {
  return [
    START,
    `  - id: ${cfg.override.id}`,
    `    name: ${cfg.override.name}`,
    "    type: local",
    "    ext: yaml",
    "    global: true",
    `    updated: ${Date.now()}`,
    END,
  ];
}

function withRegistry(text: string, cfg: Config, present: boolean): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === START);
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && l === END);
    if (end < 0) throw new Error("registry has a start marker but no end marker");
    if (!present) {
      lines.splice(start, end - start + 1);
      return lines.join("\n").replace(/\n{3,}$/, "\n\n");
    }
    lines.splice(start, end - start + 1, ...registryBlock(cfg));
    return lines.join("\n");
  }
  if (!present) return text;
  if (!lines.some((l) => l.trim() === "items:")) {
    throw new Error("override.yaml has no 'items:' key");
  }
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return [...lines, ...registryBlock(cfg), ""].join("\n");
}

function dnsQueryBase64Url(): string {
  const header = Buffer.concat([
    crypto.randomBytes(2),
    Buffer.from([0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ]);
  const qname = Buffer.from([7, ...Buffer.from("example"), 3, ...Buffer.from("com"), 0]);
  return Buffer.concat([header, qname, Buffer.from([0x00, 0x01, 0x00, 0x01])]).toString("base64url");
}

function expandTemplate(url: string, dns: string): string {
  if (!url.includes("{?dns}")) throw new Error(`not a DoH URI template: ${url}`);
  return url.replace("{?dns}", `?dns=${dns}`);
}

async function check(cfg: Config): Promise<void> {
  const url = expandTemplate(cfg.dohUrl, dnsQueryBase64Url());
  const res = await fetch(url, { headers: { accept: "application/dns-message" } });
  const type = res.headers.get("content-type") ?? "";
  const body = await res.arrayBuffer();
  if (res.status !== 200 || !type.includes("application/dns-message") || body.byteLength < 12) {
    throw new Error(`DoH check failed: HTTP ${res.status}, content-type=${type}, bytes=${body.byteLength}`);
  }
  console.log(`DoH OK: ${cfg.dohUrl} -> HTTP ${res.status}, ${type}, ${body.byteLength} bytes`);
}

function status(cfg: Config): void {
  const { registry, overrideFile, runtime } = paths(cfg);
  const reg = fs.existsSync(registry) ? readText(registry) : "";
  const rt = fs.existsSync(runtime) ? readText(runtime) : "";
  console.log(`config        : ${CONFIG_PATH}`);
  console.log(`DoH URL       : ${cfg.dohUrl}`);
  console.log(`browser DoH   : ${cfg.browserDohUrl ?? "(unset)"}`);
  if (cfg.notes) console.log(`note          : ${cfg.notes}`);
  console.log(`slot/position : ${cfg.slot} / ${cfg.position}`);
  console.log(`override      : id=${cfg.override.id} name=${cfg.override.name}`);
  console.log(`registry      : ${reg.includes(START) ? "registered" : "not registered"} (${registry})`);
  console.log(`override file : ${fs.existsSync(overrideFile) ? "present" : "absent"} (${overrideFile})`);
  console.log(`runtime hits  : ${rt.split(cfg.dohUrl).length - 1} in ${runtime}`);
  if (fs.existsSync(cfg.backupDir)) {
    const dirs = fs.readdirSync(cfg.backupDir).filter((d) =>
      fs.statSync(path.join(cfg.backupDir, d)).isDirectory()).sort();
    console.log(`backups       : ${dirs.length} (latest: ${dirs.at(-1) ?? "none"})`);
  } else {
    console.log("backups       : none");
  }
}

function apply(cfg: Config): void {
  const { registry, overrideFile } = paths(cfg);
  if (!fs.existsSync(registry)) throw new Error(`registry not found: ${registry}`);
  const reg = readText(registry);
  const desiredFile = overrideFileText(cfg);
  const currentFile = fs.existsSync(overrideFile) ? readText(overrideFile) : "";
  const registered = reg.split("\n").some((l) => l === START);
  if (currentFile === desiredFile && registered) {
    console.log("apply: no change (already installed and idempotent)");
    return;
  }
  const dir = backup(cfg, "before-apply");
  writeAtomic(overrideFile, desiredFile);
  writeAtomic(registry, withRegistry(reg, cfg, true));
  console.log(`apply: installed ${cfg.dohUrl}`);
  console.log(`apply: backup  ${dir}`);
  console.log("apply: WARNING - ECH answers can hide the real SNI as cloudflare-ech.com;");
  console.log("       rule-based routing in Clash Party may misroute those domains.");
  console.log("       For ECH, prefer the browser DoH setting: " + (cfg.browserDohUrl ?? "(unset)"));
  console.log("apply: reload the profile/core in Clash Party to rebuild work/config.yaml");
}

function restore(cfg: Config): void {
  const { registry, overrideFile } = paths(cfg);
  if (!fs.existsSync(registry)) throw new Error(`registry not found: ${registry}`);
  const reg = readText(registry);
  const registered = reg.split("\n").some((l) => l === START);
  if (!registered && !fs.existsSync(overrideFile)) {
    console.log("restore: no change (nothing installed)");
    return;
  }
  const dir = backup(cfg, "before-restore");
  writeAtomic(registry, withRegistry(reg, cfg, false));
  if (fs.existsSync(overrideFile)) {
    fs.renameSync(overrideFile, path.join(dir, `override-${cfg.override.id}.yaml.removed`));
  }
  console.log(`restore: removed the override; backup ${dir}`);
  console.log("restore: reload the profile/core in Clash Party to rebuild work/config.yaml");
}

async function update(args: string[]): Promise<void> {
  const raw = loadRaw();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    if (key === "--url") raw.dohUrl = value;
    else if (key === "--slot") {
      if (!SLOTS.includes(value as Slot)) throw new Error(`invalid slot: ${value}`);
      raw.slot = value as Slot;
    } else if (key === "--position") {
      if (value !== "prepend" && value !== "append") throw new Error(`invalid position: ${value}`);
      raw.position = value as Position;
    } else throw new Error(`unknown update option: ${key}`);
  }
  if (fs.existsSync(CONFIG_PATH)) backup(normalize(raw), "before-config-update");
  saveConfig(raw);
  console.log(`update: config saved (${raw.dohUrl}, ${raw.slot}/${raw.position})`);
  apply(normalize(raw));
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const cfg = loadConfig();
  switch (cmd) {
    case "status": status(cfg); break;
    case "check": await check(cfg); break;
    case "browser":
      if (!cfg.browserDohUrl) throw new Error("browserDohUrl is not set in config");
      console.log(cfg.browserDohUrl);
      console.log("Paste this into browser Secure DNS (Chrome/Edge/Firefox) to get ECH.");
      break;
    case "apply": apply(cfg); break;
    case "restore": restore(cfg); break;
    case "update": await update(args); break;
    default:
      console.log("usage: clash-party-doh.ts <status|check|browser|apply|restore|update [--url URL] [--slot SLOT] [--position prepend|append]>");
      process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
