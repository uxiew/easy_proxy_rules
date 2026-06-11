/**
 * Clash Verge / Clash Party 智能分流覆写脚本
 *
 * 脚本功能：
 * 1. 节点清洗 - 移除不可用、倍率异常、广告推广等垃圾节点
 * 2. 智能分组 - 为 AI、流媒体建立专用自动组
 * 3. 省流模式 - 强制机场默认自动选择调整为 60分钟测速
 * 4. 规则注入 - 直连规则(端口/IP) > 专用规则 > 默认规则
 *
 * TUN模式SSH直连解决方案：
 * - 新增 directSSHIPs 配置SSH服务器IP/网段
 * - 新增 directPorts 配置直连端口(默认22)
 * - 规则优先级：端口直连 > IP直连 > 域名直连 > 专用规则
 */

// CDN 配置（可切换）
const CDN_BASE = 'https://cdn.jsdmirror.com/gh'; // 推荐：JSDMirror站点
const CDN_BASE_1 = `${CDN_BASE}`; // jsDelivr官方CDN
// const CDN_BASE = "https://gcore.jsdelivr.net/gh";      // 备用：GCore CDN
// const CDN_BASE = "https://testingcf.jsdelivr.net/gh";  // 备用：Cloudflare CDN

// ===========================
// 第一部分：自定义关键词和规则
// ======= 自定义关键词 =======
// 代理关键词
const proxyKeywords = [
  // "example", 示例，可以添加需要代理的关键词
];

// 直连关键词
const directKeywords = [
    //"example",  示例，可以添加需要直连的关键词
  ],
  // 【直连网址 (白名单)】
  // 作用：列表内的域名，强制不走代理，直接连接。
  // 理由：国内网站走代理反而变慢，或解决某些应用在代理下无法使用的问题。
  directDomains = [
    'baidu.com',
    'qq.com',
    '163.com',
    'taobao.com',
    'jd.com',
    'cn', // 所有 .cn 结尾的域名
    'apple.com.cn', // 苹果服务
  ];

// 拦截关键词
const rejectKeywords = [
  //"example",  示例，可以添加需要拦截的关键词
  'adobe.io', //屏蔽Adobe正版检测可能违反软件许可协议
];

// 【直连端口】
// 作用：列表内的端口，强制不走代理，直接连接。
// 理由：解决TUN模式下特定端口流量被代理的问题(如SSH 22端口)。
const directPorts = [22];

// 【直连IP/网段】
// 作用：列表内的IP或CIDR网段，强制不走代理，直接连接。
// 理由：解决TUN模式下SSH服务器IP直连失效问题。
const directSSHIPs = [
  // "192.168.1.100",   // 单个IP地址
  // "10.0.0.0/8",      // CIDR网段格式
];

// ===========自动识别并分配 策略组=========
// ===========自动识别并分配 策略组=========
// ⚠️ 修复：移除了不兼容 Go 正则引擎的 or() 和 nor() 预查函数

const smartGroups = {
  // --------------- 以下为静态代理组 ---------------
  AUTO: {
    proxies: ['US', 'JP', 'HK', 'SPEED', 'DIRECT'],
    // 根据 interval: 300（每 5 分钟），拿测试网址（代码里写的是 Apple 的测试页）去挨个测试组里的节点。
    // 在浏览器输入网址时，Clash 会自动选择当前测速结果最快、且能连通的节点。
    interval: 300, // 每 5 分钟
    type: 'url-test',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/adjust.svg`,
  },
  AI: {
    // 关键修改：将类型改为 fallback
    type: 'fallback',
    // 顺序很重要：流量会从左往右按顺序探测，第一个（新加坡）不通才跳下一个
    proxies: ['JP', 'US', 'SG', 'DE', 'KR'],
    // 建议缩短 interval，比如 200 秒探测一次，确保切换及时
    interval: 200,
    tolerance: 50, // 对于 fallback，这个值代表判定失败的容差
    icon: 'https://github.com/DustinWin/ruleset_geodata/releases/download/icons/ai.png',
  },
  ADS_FILTER: {
    proxies: ['REJECT', 'DIRECT', 'AUTO'], // 默认拦截，留备选项用于除错
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/bug.svg`,
  },
  NSFW: {
    proxies: ['JP', 'HK', 'KR'],
    icon: 'https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/Pornhub.png',
  },
  // _DIRECT: {
  //   proxies: ['DIRECT'], // 强制必须直连，不留备选项
  //   icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/link.svg`,
  // },
  // _REJECT: {
  //   proxies: ['REJECT'], // 强制必须拦截，不留备选项
  //   icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/block.svg`,
  // },
  CATCH: {
    proxies: ['AUTO', 'DIRECT'], // 未知流量优先走代理，以防外网连不上
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/fish.svg`,
  },
  // --------------- 以下为静态代理组 ---------------
  SPEED: {
    tolerance: 50,
    type: 'url-test',
    filter: '.*', // 匹配所有节点
    'exclude-filter': '套餐|剩余|到期|流量|官网', // 使用原生的排除字段
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/speed.svg`,
  },
  TW: {
    filter: '台|TW|Tai|🇹🇼',
    icon: `${CDN_BASE}/uxiew/easy_proxy_rules@main/assets/cn.svg`,
  },
  HK: {
    filter: '港|HK|Hong|🇭🇰',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/hk.svg`,
  },
  JP: {
    filter: 'JP|日|東|东|大阪|埼玉|🇯🇵|Japan',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg`,
  },
  KR: {
    filter: '韩|韓|首|爾|春川|🇰🇷|KR|Korea',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/kr.svg`,
  },
  SG: {
    filter: '新加坡|SG|坡|狮城|🇸🇬|Singapore',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/sg.svg`,
  },
  US: {
    type: 'url-test',
    tolerance: 100,
    filter: 'US|美|🇺🇸|States|American|洛杉',
    'exclude-filter': '日|俄|韩', // 直接写字符串即可
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/us.svg`,
  },
  UK: {
    filter: 'UK|英|🇬🇧|Kingdom|Britain|British|England',
    type: 'url-test',
    icon: `${CDN_BASE}/uxiew/easy_proxy_rules@main/assets/uk.svg`,
  },
  FR: {
    filter: 'FR|法国|🇫🇷',
    type: 'url-test',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/fr.svg`,
  },
  DE: {
    filter: 'DE|柏|德国|🇩🇪|Germany',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/de.svg`,
  },
  CA: {
    filter: 'CA|柏|加拿大|🇨🇦|Canada',
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/ca.svg`,
  },
  EU: {
    filter:
      '时|🇧🇪|丹|🇩🇰|希|🇬🇷|爱|🇮🇪|荷兰|NL|🇳🇱|意|🇮🇹|卢森|葡|🇵🇹|西班|🇪🇸|奥地利|🇦🇹|芬|🇫🇮|瑞典|🇸🇪|RO|罗马尼亚‌|🇷🇴‌',
    proxies: ['DE', 'FR'],
    icon: `${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/eu.svg`,
  },
};

// ===========================
// 自动生成规则
const customRules = [
  // 代理关键词规则
  ...proxyKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},AUTO`),
  // 直连关键词规则
  ...directKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},DIRECT`),
  // 拦截关键词规则
  ...rejectKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},REJECT`),

  // 其他预设规则
  'DOMAIN-SUFFIX,googleapis.cn,AUTO', // Google 服务
  'DOMAIN-SUFFIX,gstatic.com,AUTO', // Google 静态资源
  'DOMAIN-SUFFIX,xn--ngstr-lra8j.com,AUTO', // Google Play下载服务
  'DOMAIN-SUFFIX,github.io,AUTO', // GitHub Pages
];

// 4.3 域名直连规则 (第三优先级)
directDomains.forEach((domain) => {
  customRules.push(`DOMAIN-SUFFIX,${domain},DIRECT`);
});

// 4.1 端口直连规则 (最高优先级 - TUN模式下优先匹配端口)
directPorts.forEach((port) => {
  customRules.push(`DST-PORT,${port},DIRECT`);
});

// ===========================
// 第二部分：规则集和代理组配置
// ======= 自定义规则集 =======
const customRuleSets = [
  // 局域网与私有地址
  'GEOIP,LAN, DIRECT, no-resolve',
  'RULE-SET,private, DIRECT',
  'RULE-SET,applications, DIRECT',
  'RULE-SET,lancidr, DIRECT,no-resolve',

  // 国内直连
  'RULE-SET,ChinaMedia, DIRECT',
  'RULE-SET,ChinaDomain, DIRECT',
  'RULE-SET,direct, DIRECT',
  'RULE-SET,cncidr, DIRECT,no-resolve',
  'GEOIP,CN,DIRECT,no-resolve',

  // AI服务规则
  'RULE-SET,AI, AI',

  // 通用服务代理规则
  'RULE-SET,GoogleCN,AUTO',
  'RULE-SET,apple,AUTO',
  'RULE-SET,OneDrive,AUTO',
  'RULE-SET,icloud,AUTO',
  'RULE-SET,google,AUTO',
  'RULE-SET,telegramcidr,AUTO,no-resolve',
  'RULE-SET,telegramcidr,AUTO,no-resolve',
  'RULE-SET,nsfw,NSFW,no-resolve',

  // 国外代理
  'RULE-SET,proxy,AUTO',
  'RULE-SET,gfw,AUTO',
  'RULE-SET,tld-not-cn,AUTO',

  //拦截规则
  'RULE-SET,reject,REJECT',
  'RULE-SET,BanEasyListChina,ADS_FILTER',
  'RULE-SET,BanEasyList,ADS_FILTER',

  // 兜底规则
  'MATCH, AUTO',
];

// ======== 配置代理组 ========
// 规则集通用配置
const ruleProviderCommon = {
  type: 'http',
  format: 'yaml',
  interval: 86400,
};

// 规则集提供者
const ruleProviders = {
  // 拦截规则集
  reject: {
    ...ruleProviderCommon,
    behavior: 'domain',
    type: 'http',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/reject.txt`,
    path: './ruleset/loyalsoldier/reject.yaml',
  },
  BanEasyListChina: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/BanEasyListChina.list`,
    path: './ruleset/acl4ssr/BanEasyListChina.yaml',
  },
  BanEasyList: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/BanEasyList.list`,
    path: './ruleset/acl4ssr/BanEasyList.yaml',
  },
  // 局域网与私有地址
  private: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/private.txt`,
    path: './ruleset/loyalsoldier/private.yaml',
  },
  applications: {
    ...ruleProviderCommon,
    behavior: 'classical',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/applications.txt`,
    path: './ruleset/loyalsoldier/applications.yaml',
  },
  lancidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/lancidr.txt`,
    path: './ruleset/loyalsoldier/lancidr.yaml',
  },
  // 通用服务代理规则集
  OneDrive: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/OneDrive.list`,
    path: './ruleset/acl4ssr/OneDrive.yaml',
  },
  icloud: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/icloud.txt`,
    path: './ruleset/loyalsoldier/icloud.yaml',
  },
  apple: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/apple.txt`,
    path: './ruleset/loyalsoldier/apple.yaml',
  },
  google: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/google.txt`,
    path: './ruleset/loyalsoldier/google.yaml',
  },
  GoogleCN: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/GoogleCN.list`,
    path: './ruleset/acl4ssr/GoogleCN.yaml',
  },
  telegramcidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/telegramcidr.txt`,
    path: './ruleset/loyalsoldier/telegramcidr.yaml',
  },
  github: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: 'https://raw.githubusercontent.com/klierx/clash-verge-rev-rules/refs/heads/master/ruleset/github.yaml',
  },
  // 国内直连
  ChinaMedia: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/ChinaMedia.list`,
    path: './ruleset/acl4ssr/ChinaMedia.yaml',
  },
  ChinaDomain: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/ACL4SSR/ACL4SSR/Clash/ChinaDomain.list`,
    path: './ruleset/acl4ssr/ChinaDomain.yaml',
  },
  direct: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/direct.txt`,
    path: './ruleset/loyalsoldier/direct.yaml',
  },
  // AI服务规则集
  AI: {
    ...ruleProviderCommon,
    behavior: 'classical',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/ai.yaml`,
    path: './ruleset/uxiew/ai.yaml',
  },
  cncidr: {
    ...ruleProviderCommon,
    behavior: 'ipcidr',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/cncidr.txt`,
    path: './ruleset/loyalsoldier/cncidr.yaml',
  },
  // 国外代理
  proxy: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/proxy.txt`,
    path: './ruleset/loyalsoldier/proxy.yaml',
  },
  gfw: {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/gfw.txt`,
    path: './ruleset/loyalsoldier/gfw.yaml',
  },
  'tld-not-cn': {
    ...ruleProviderCommon,
    behavior: 'domain',
    url: `${CDN_BASE}/Loyalsoldier/clash-rules@release/tld-not-cn.txt`,
    path: './ruleset/loyalsoldier/tld-not-cn.yaml',
  },
  telegram: {
    ...ruleProviderCommon,
    behavior: 'classical',
    type: 'http',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/telegram.yaml`,
    path: './ruleset/uxiew/telegram.yaml',
  },
  // 🔞 魅力艺术
  nsfw: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/nsfw.list`,
    path: './ruleset/uxiew/nsfw.yaml',
  },
};

// 最终规则列表
const rules = [...customRules, ...customRuleSets];

// ===========================
// 第三部分：DNS配置
// ===========================
const dnsConfig = {
  // 开关，true表示启用Clash的DNS处理器
  enable: true,
  enable: true,
  listen: '0.0.0.0:1053',
  ipv6: false,
  'use-system-hosts': true,
  'respect-rules': true,
  'cache-algorithm': 'arc',

  'default-nameserver': ['223.5.5.5', '119.29.29.29'],

  'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29', '114.114.114.114'],

  // Fake-IP 配置
  'enhanced-mode': 'fake-ip',
  'fake-ip-range': '198.18.0.1/16',
  'fake-ip-filter': [
    '*.lan',
    '*.local',
    '*.msftconnecttest.com',
    'localhost.ptlogin2.qq.com',
    '+.stun.*',
    'geosite:cn',
  ],

  'nameserver-policy': {
    // 中国域名用国内DNS
    'geosite:cn': [
      'https://doh.pub/dns-query',
      'https://dns.alidns.com/dns-query',
    ],

    // 国外域名用国外DNS
    'geosite:geolocation-!cn': [
      'https://1.1.1.1/dns-query',
      'https://8.8.8.8/dns-query',
    ],
  },

  // 主DNS服务器组（会被 nameserver-policy 覆盖），用于解析国内域名，以获取最快的CDN节点。
  // 使用加密DNS (DoH/DoT) 可以防止ISP的DNS污染。
  nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],

  // 备用DNS服务器组。当主DNS解析结果不理想（如被污染或IP归属地非中国）时，
  // Clash会使用此组DNS进行再次查询，以获取真实、无污染的海外IP。
  fallback: [
    'https://dns.google/dns-query', // Google DNS (DoH)
    'https://1.1.1.1/dns-query', // Cloudflare DNS (DoH)
    'tls://8.8.4.4:853', // Google DNS (DoT)
    'https://8.8.8.8/dns-query',
  ],

  // 防污染过滤
  'fallback-filter': {
    geoip: true,
    'geoip-code': 'CN',
    ipcidr: ['240.0.0.0/4', '0.0.0.0/8'],
    domain: ['+.google.com', '+.youtube.com', '+.github.com'],
  },
};
// ===========================
// 第四部分：主函数
// ===========================
// 程序入口
function main(config) {
  // 验证配置
  if (!config) {
    throw new Error('配置对象为空');
  }

  const proxyCount = config?.proxies?.length ?? 0;
  const proxyProviderCount = config?.['proxy-providers']
    ? Object.keys(config['proxy-providers']).length
    : 0;

  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error('配置文件中未找到任何代理节点');
  }

  // 1. 定义前置节点组名称 (必须在下面 proxy-groups 中存在)
  const entranceGroupName = '港台日新韩-自动';

  // 2. 定义静态住宅 IP 节点，并直接绑定前置代理组
  const myStaticNode = {
    name: '🏠 静态住宅落地',
    type: 'http',
    server: '166.141.100.13',
    port: 5782,
    username: 'test',
    password: '12345678',
    'skip-cert-verify': true,
    // 核心改动：在这里指定 dialer-proxy，实现链式代理
    'dialer-proxy': entranceGroupName,
  };

  // 3. 将静态住宅节点注入到 proxies 列表
  if (!config.proxies) {
    config.proxies = [];
  }
  // config.proxies.push(myStaticNode);

  // 覆盖DNS配置
  config.dns = dnsConfig;

  // 代理组通用配置
  const groupBaseOption = {
    interval: 300,
    timeout: 3000,
    //url: "https://www.gstatic.com/generate_204",
    url: 'http://www.apple.com/library/test/success.html',
    lazy: true,
    'max-failed-times': 3,
    hidden: false,
  };

  // {
  //   ...groupBaseOption,
  //   name: '🔗 链式-住宅IP',
  //   type: 'url-test',
  //   proxies: [myStaticNode.name], // 此时连接该节点会自动经过 entranceGroupName
  // },

  // ===========================
  // 覆盖代理组配置：JS 递归展开版
  // ===========================

  // 1. 收集当前订阅所有原始节点名称
  const allProxyNames = Array.isArray(config.proxies)
    ? config.proxies.map((p) => p.name).filter(Boolean)
    : [];

  const BUILTIN_PROXIES = ['DIRECT', 'REJECT', 'GLOBAL'];

  // 2. 判断某个组自身 filter 能匹配到哪些真实节点
  function getFilterMatchedNodes(groupConfig) {
    if (!groupConfig.filter) return [];

    const filterRegex = new RegExp(groupConfig.filter, 'i');
    const excludeRegex = groupConfig['exclude-filter']
      ? new RegExp(groupConfig['exclude-filter'], 'i')
      : null;

    return allProxyNames.filter((pName) => {
      const included = filterRegex.test(pName);
      const excluded = excludeRegex ? excludeRegex.test(pName) : false;
      return included && !excluded;
    });
  }

  // 3. 缓存，避免重复计算
  const expandCache = new Map();

  // 4. 递归展开某个组最终应该包含的节点
  function expandGroup(groupName, visiting = new Set()) {
    if (expandCache.has(groupName)) {
      return expandCache.get(groupName);
    }

    const groupConfig = smartGroups[groupName];
    if (!groupConfig) {
      return [];
    }

    // 防止循环引用：A -> B -> A
    if (visiting.has(groupName)) {
      console.log(
        `[节点清洗] 检测到循环引用，已跳过: ${[...visiting, groupName].join(' -> ')}`,
      );
      return [];
    }

    visiting.add(groupName);

    let result = [];

    // 4.1 展开当前组自己的 filter 匹配节点
    result.push(...getFilterMatchedNodes(groupConfig));

    // 4.2 展开当前组 proxies 中的内容
    if (Array.isArray(groupConfig.proxies)) {
      for (const p of groupConfig.proxies) {
        if (allProxyNames.includes(p) || BUILTIN_PROXIES.includes(p)) {
          // 真实节点或内置策略
          result.push(p);
        } else if (smartGroups[p]) {
          // 引用的是另一个智能组：递归展开其具体节点
          result.push(...expandGroup(p, visiting));
        }
      }
    }

    visiting.delete(groupName);

    // 去重
    result = [...new Set(result)];

    expandCache.set(groupName, result);
    return result;
  }

  // 5. 计算所有活跃组
  const activeGroups = new Set();

  Object.keys(smartGroups).forEach((name) => {
    const expanded = expandGroup(name);
    if (expanded.length > 0) {
      activeGroups.add(name);
    }
  });

  // 6. 组装最终 proxy-groups
  const finalGroups = [];

  Object.entries(smartGroups).forEach(([name, groupConfig]) => {
    if (!activeGroups.has(name)) {
      console.log(`[节点清洗] 组 "${name}" 无匹配节点或有效引用，已自动去除`);
      return;
    }

    let combinedProxies = expandGroup(name);

    // 极端防空组崩溃兜底
    if (combinedProxies.length === 0) {
      combinedProxies = ['DIRECT'];
    }

    const clashGroup = {
      ...groupBaseOption,
      name,
      type: groupConfig.type || (groupConfig.filter ? 'url-test' : 'select'),
      ...groupConfig,
      proxies: combinedProxies,
      'include-all': false,
    };

    // 关键：禁止 Clash 内核再次二次 filter
    delete clashGroup.filter;
    delete clashGroup['exclude-filter'];

    finalGroups.push(clashGroup);
  });

  config['proxy-groups'] = finalGroups;

  // config['proxy-groups'] = Object.entries(smartGroups).map(([name, i]) => {
  //   return {
  //     ...groupBaseOption,
  //     name,
  //     'include-all': i['include-all'] || true,
  //     type: i.type || 'select',
  //     ...i,
  //   };
  // });

  // 覆盖规则配置
  config['rule-providers'] = ruleProviders;
  config.rules = rules;

  // 返回修改后的配置
  return config;
}

// Node.js 环境支持
if (typeof module !== 'undefined' && module.exports) {
  module.exports = main;
}
