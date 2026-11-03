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
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const smart = fs.readFileSync(path.join(ROOT, 'smart.js'), 'utf8');

const PLACEHOLDER = {
  name: '🏠 住宅-JP',
  server: 'YOUR_HOST',
  port: 0,
  username: 'YOUR_USERNAME',
  password: 'YOUR_PASSWORD',
};

function header(cred) {
  const note = cred.server === PLACEHOLDER.server
    ? [
        '/**',
        ' * FlClash 覆写脚本（由 build-flclash.js 生成，勿手改——改 smart.js 后重新生成）',
        ' * ---------------------------------------------------------------',
        ' * 与桌面端 Clash Party 完全同源：同一份 smart.js 全量逻辑',
        ' * （重建组/规则 + AI 走住宅 + 前置日本 + 国内直连 + 占位节点清洗），',
        ' * 凭据在下面的 FLCLASH_RESIDENTIAL 里填好后，整份粘贴到：',
        ' *   FlClash → 工具 → 覆写 → 新建 → 类型「脚本」',
        ' * 再到对应订阅的配置里启用该覆写。',
        ' *',
        ' * ⚠️ 填了真实凭据后这份文件只放本机/手机，不要提交到任何仓库。',
        ' */',
      ].join('\n')
    : [
        '/**',
        ' * FlClash 覆写脚本（私有版，由 build-flclash.js 生成——勿提交、勿分享）',
        ' * 与桌面端 Clash Party 同源同逻辑：smart.js 全量 + 下方住宅凭据。',
        ' * 改 smart.js 后要重新运行 node build-flclash.js 并重新粘贴到手机。',
        ' */',
      ].join('\n');

  return `${note}
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

function build(cred) {
  return header(cred) + smart;
}

// 占位符版（提交进仓库）
fs.writeFileSync(path.join(ROOT, 'flclash.js'), build(PLACEHOLDER), 'utf8');
console.log('✓ flclash.js（占位符版，可提交）');

// 私有版（有凭据文件才生成）
const credPath = path.join(ROOT, 'flclash-credentials.json');
if (fs.existsSync(credPath) && !process.argv.includes('--public')) {
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  if (!cred.server || !cred.port) {
    console.error('✗ flclash-credentials.json 缺 server/port');
    process.exit(1);
  }
  fs.writeFileSync(path.join(ROOT, 'flclash-private.js'), build(cred), 'utf8');
  console.log('✓ flclash-private.js（私有版，勿提交）→ 粘贴到手机');
} else {
  console.log('（未找到 flclash-credentials.json，跳过私有版）');
}
