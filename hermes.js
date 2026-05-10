// 8. 【Hermes 专用网址 (固定代理)】
// 作用：Hermes 相关域名强制走 "🤖 Hermes固定代理"。
// 理由：把 Telegram / Gemini / 第三方 Codex / 微信 iLink 这些 Hermes 依赖锁到
//       同一条稳定代理链，减少轮询断连和区域漂移。
const hermesDomains = [
    // === Hermes 当前主模型 / 第三方 OpenAI 中转 ===
    'hi-code.cc',

    // === Google Gemini ===
    'generativelanguage.googleapis.com',
    'aistudio.google.com',

    // === Telegram ===
    'api.telegram.org',
    'telegram.org',
    't.me',

    // === Weixin iLink Bot API ===
    'ilinkai.weixin.qq.com',
    'novac2c.cdn.weixin.qq.com',
  ],
  // 【Hermes 专用 IP/网段】
  // 作用：当 Hermes/Telegram 直接命中 IP 时，仍然固定走 Hermes 代理组。
  // 理由：Telegram 经常回退到 149.154.* 的直连 IP，如果只写域名规则可能拦不住。
  hermesIPs = ['149.154.160.0/20'];

// ---  新建“Hermes固定代理”组 ---
const hermesGroupName = '🤖 Hermes固定代理', // Hermes 专用固定代理组
  // 【Hermes 固定代理地区】
  // 作用：Hermes 相关流量固定走这类节点。
  // 理由：你已经把 Hermes 的代理切到新加坡，单独锁定可以避免 Telegram/Gemini/微信
  //       在“自动选择”里跳来跳去，导致轮询和上游请求不稳定。
  hermesRegionKeywords = ['新加坡', 'SG'];

const hermesNodes = allProxyNames.filter((name) =>
  hermesRegionKeywords.some((k) => name.includes(k)),
);

if (hermesNodes.length > 0) {
  config['proxy-groups'] = config['proxy-groups'].filter(
    (g) => g.name !== hermesGroupName,
  );

  const hermesGroup = {
    name: hermesGroupName,
    type: 'url-test',
    url: 'http://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 30,
    proxies: hermesNodes,
  };

  config['proxy-groups'].unshift(hermesGroup);
}

// Hermes IP 固定代理规则 (第四优先级)
if (hermesNodes.length > 0) {
  hermesIPs.forEach((ipOrCidr) => {
    const trimmed = ipOrCidr.trim();
    if (!trimmed) return;
    if (trimmed.includes('/')) {
      newRules.push(`IP-CIDR,${trimmed},${hermesGroupName}`);
    } else {
      newRules.push(`IP-CIDR,${trimmed}/32,${hermesGroupName}`);
    }
  });
}

// Hermes 域名固定代理规则 (第五优先级)
if (hermesNodes.length > 0) {
  hermesDomains.forEach((domain) => {
    newRules.push(`DOMAIN-SUFFIX,${domain},${hermesGroupName}`);
  });
}
