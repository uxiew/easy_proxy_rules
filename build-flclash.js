#!/usr/bin/env node
/**
 * build-flclash.js —— 生成 FlClash 用的单文件覆写脚本
 * ------------------------------------------------------------
 * FlClash 没有覆写链（不能像 Clash Party 那样 script + YAML 依次叠加），
 * 只能跑一个脚本。这个脚本把「凭据头 + smart.js 全文」拼成一份文件：
 *
 *   flclash.js           凭据是占位符（提交进仓库，给别人参考）
 *   flclash-private.js   凭据是真实值（.gitignore 排除，粘贴到手机用）
 *
 * 真实凭据放在 flclash-credentials.json（同样 .gitignore 排除）：
 *   { "name": "🏠 住宅-JP", "server": "x.x.x.x", "port": 7012,
 *     "username": "xxx", "password": "xxx" }
 *
 * 用法：
 *   node build-flclash.js            # 两个文件都生成（有 credentials 时）
 *   node build-flclash.js --public   # 只生成占位符版
 *
 * ⚠️ smart.js 改动后必须重新生成，否则手机上跑的还是旧逻辑。
 *    生成的文件顶部会写入构建元信息（时间 / 源文件指纹 / 跳过项），
 *    拿到一份 flclash 配置时，看头部注释就知道它对应哪一版 smart.js。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SMART_PATH = path.join(ROOT, 'smart.js');
const smart = fs.readFileSync(SMART_PATH, 'utf8');

const PLACEHOLDER = {
  name: '🏠 住宅-JP',
  server: 'YOUR_HOST',
  port: 0,
  username: 'YOUR_USERNAME',
  password: 'YOUR_PASSWORD',
};

// ---------- 构建元信息 ----------

function gitHead() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function meta() {
  const sha = crypto.createHash('sha256').update(smart).digest('hex').slice(0, 12);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return {
    stamp,
    sha,
    lines: smart.split('\n').length,
    bytes: Buffer.byteLength(smart, 'utf8'),
    commit: gitHead(),
  };
}

function maskHost(host) {
  const s = String(host || '');
  if (!s || s === PLACEHOLDER.server) return PLACEHOLDER.server;
  if (s.length <= 7) return s;
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

function header(cred, m) {
  const isPublic = cred.server === PLACEHOLDER.server;
  const credLine = isPublic
    ? `住宅节点    : ${cred.name}  ->  ${PLACEHOLDER.server}:${PLACEHOLDER.port}   (占位符，使用前请填真实凭据)`
    : `住宅节点    : ${cred.name}  ->  ${maskHost(cred.server)}:${cred.port}`;

  const title = isPublic
    ? 'FlClash 覆写脚本（占位符版 / 可提交仓库）'
    : 'FlClash 覆写脚本（私有版 / 含真实凭据，勿提交勿分享）';

  return `/**
 * ${title}
 * ================================================================
 * 由 build-flclash.js 自动生成 —— 请勿手改，改 smart.js 后重新构建
 *
 * 构建时间    : ${m.stamp}
 * 源文件      : smart.js  sha256:${m.sha}  ${m.lines} 行 / ${m.bytes} 字节
 * 源码提交    : ${m.commit}
 * 构建命令    : node build-flclash.js
 * ${credLine}
 *
 * 本文件 = 凭据头 + smart.js 全文，与桌面端 Clash Party 同源同逻辑
 * （重建组/规则 + AI 走住宅 + 前置日本 + 国内直连 + 占位节点清洗）。
 *
 * FlClash 模式自动跳过的桌面专属项（写了会和 App 打架）：
 *   dns.listen 0.0.0.0:1053    -> 跳过，端口交给 FlClash 绑定
 *   listeners 7865 住宅专用口   -> 跳过，手机上用不到
 *   ipv6 / domain-strategy      -> 跳过，交给 App
 *   IP-ASN 规则                 -> 跳过，需要 ASN.mmdb，缺了内核启动会卡 75 秒
 *
 * DNS（手机端只换上游，不碰端口）：
 *   上游 = IP 型 DoH 1.12.12.12 / 120.53.53.53，不依赖明文 UDP 53；
 *   enhanced-mode 保持 fake-ip，海外域名的真实解析在出口完成，
 *   所以 DNS 归属地与出口 IP 归属地一致（都是日本）。
 *
 * !! 手机端「全局模式」有坑 !!
 *   全局模式走的是内核自建的 GLOBAL 组，它的第一个成员固定是 DIRECT，
 *   所以新装/清数据后切全局 = 全部直连（真实 IP 直接暴露）。
 *   要用全局模式，先在代理页把 GLOBAL 手动选成「住宅出口」，否则等于关掉代理。
 *   推荐直接用「规则模式」，末尾 MATCH,CATCH 已经兜住所有流量
 *   （CATCH 默认成员是 AUTO，行为等价；需要全站直连/断网时切 CATCH 即可）。
 *
 * !! 版本兼容性（很重要）!!
 *   FlClash 的覆写是「追加 rules、不替换 rules」，本脚本已自动补齐订阅规则
 *   引用的规则集与组名，所以换任何订阅都不会再报 rule set / proxy not found。
 *   但 v0.9.1 起 FlClash 会用订阅原文覆盖覆写生成的 proxies / proxy-groups，
 *   等于废掉「注入住宅节点 + 重建分组」。检测到这种情况脚本会自动退化为
 *   「只修 DNS」，并在日志打印提示。
 *   想保留住宅出口与 AI 分流：请把 FlClash 留在 v0.8.98。
 *
 * 安装：FlClash -> 工具 -> 覆写 -> 新建 -> 类型「脚本」-> 粘贴全文
 *       -> 对该订阅启用覆写 -> 打开 TUN
 * ================================================================
 */
// ============ 住宅节点凭据（唯一需要改的地方） ============
const FLCLASH_RESIDENTIAL = {
  name: ${JSON.stringify(cred.name)}, // 必须带 🏠 前缀（命中 smart.js 的 nodePattern）
  server: ${JSON.stringify(cred.server)},
  port: ${JSON.stringify(Number(cred.port))},
  username: ${JSON.stringify(cred.username)},
  password: ${JSON.stringify(cred.password)},
};
// ==========================================================

// ================= smart.js 全文（勿手改） =================

`;
}

function build(cred, m) {
  return header(cred, m) + smart;
}

// ---------- 主流程 ----------

const m = meta();

fs.writeFileSync(path.join(ROOT, 'flclash.js'), build(PLACEHOLDER, m), 'utf8');
console.log(`✓ flclash.js（占位符版，可提交）  源指纹 ${m.sha}`);

const credPath = path.join(ROOT, 'flclash-credentials.json');
if (fs.existsSync(credPath) && !process.argv.includes('--public')) {
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (!cred.server || !cred.port) {
    console.error('✗ flclash-credentials.json 缺 server/port');
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, 'flclash-private.js'), build(cred, m), 'utf8');
  console.log(`✓ flclash-private.js（私有版，勿提交）→ 粘贴到手机  源指纹 ${m.sha}`);
} else {
  console.log('（未找到 flclash-credentials.json，跳过私有版）');
}
