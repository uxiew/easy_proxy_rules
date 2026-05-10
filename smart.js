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
const CDN_BASE_1 = '${CDN_BASE}'; // jsDelivr官方CDN
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
    'microsoft.com', // 微软服务直连通常更稳
    'apple.com', // 苹果服务
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
const or = (words) => `^(?=.*(${words})).*$`;
const nor = (words) => `^(?!.*(${words})).*$`;

const smartGroups = {
  延迟选优: {
    type: 'url-test',
    tolerance: 50,
    filter: nor('套餐|剩余|到期|流量|官网'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/speed.svg',
  },
  台湾: {
    filter: or('台|TW|Tai|🇹🇼'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/cn.svg',
  },
  韩国: {
    filter: or('韩|韓|KR|首|爾|春川|🇰🇷|Korea'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/kr.svg',
  },
  香港: {
    filter: '^(?=.*(港|HK|Hong|🇭🇰)).*$',
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/hk.svg',
  },
  日本: {
    filter: or('JP|日|東|东|大阪|埼玉|🇯🇵|Japan'),
    // icon: "https://testingcf.jsdelivr.net/gh/Orz-3/mini@master/Color/JP.png",
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg',
  },
  新加坡: {
    filter: or('新加坡|SG|坡|狮城|🇸🇬|Singapore'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg',
  },
  美国: {
    type: 'url-test',
    tolerance: 100,
    filter: or('US|美|🇺🇸|States|American|洛杉'),
    'exclude-filter': '(?i)日|俄|韩',
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/us.svg',
  },
  英国: {
    filter: or('EG|英|🇬🇧|Kingdom|British|England'),
    type: 'url-test',
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/us.svg',
  },
  德国: {
    filter: or('柏|德|🇩🇪'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/jp.svg',
  },
  欧盟: {
    filter: or('时|🇧🇪|丹|🇩🇰|法|🇫🇷|德|🇩🇪|希|爱|意|卢森|荷|葡|牙|英|奥|芬|瑞'),
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/flags/eu.svg',
  },
  // ---------------
  节点选择: {
    proxies: ['美国', '延迟选优', 'DIRECT'],
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/adjust.svg',
  },
  AI: {
    proxies: ['新加坡', '日本', '美国', '德国', '韩国'],
    interval: 300, // 专用组保留 5分钟测速，保持敏感度
    icon: 'https://github.com/DustinWin/ruleset_geodata/releases/download/icons/ai.png',
  },
  NSFW: {
    proxies: ['日本', '香港', '韩国'],
    icon: 'https://github.com/DustinWin/ruleset_geodata/releases/download/icons/ai.png',
  },
  全局直连: {
    proxies: ['DIRECT', '节点选择', '延迟选优'],
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/link.svg',
  },
  全局拦截: {
    proxies: ['REJECT', 'DIRECT', '节点选择', '延迟选优'],
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/block.svg',
  },
  广告过滤: {
    proxies: ['REJECT', 'DIRECT', '节点选择', '延迟选优'],
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/bug.svg',
  },
  漏网之鱼: {
    proxies: ['DIRECT', '节点选择', '延迟选优'],
    icon: '${CDN_BASE}/clash-verge-rev/clash-verge-rev.github.io@main/docs/assets/icons/fish.svg',
  },
};

// ===========================
// 自动生成规则
const customRules = [
  // 代理关键词规则
  ...proxyKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},节点选择`),
  // 直连关键词规则
  ...directKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},DIRECT`),
  // 拦截关键词规则
  ...rejectKeywords.map((keywords) => `DOMAIN-KEYWORD,${keywords},REJECT`),

  // 其他预设规则
  'DOMAIN-SUFFIX,googleapis.cn,节点选择', // Google 服务
  'DOMAIN-SUFFIX,gstatic.com,节点选择', // Google 静态资源
  'DOMAIN-SUFFIX,xn--ngstr-lra8j.com,节点选择', // Google Play下载服务
  'DOMAIN-SUFFIX,github.io,节点选择', // GitHub Pages
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
  'GEOIP,LAN,全局直连,no-resolve',
  'RULE-SET,private,全局直连',
  'RULE-SET,applications,全局直连',
  'RULE-SET,lancidr,全局直连,no-resolve',

  // 国内直连
  'RULE-SET,ChinaMedia,全局直连',
  'RULE-SET,ChinaDomain,全局直连',
  'RULE-SET,direct,全局直连',
  'RULE-SET,cncidr,全局直连,no-resolve',
  'GEOIP,CN,全局直连,no-resolve',

  // AI服务规则
  'RULE-SET,ai,AI',

  // 通用服务代理规则
  'RULE-SET,OneDrive,节点选择',
  'RULE-SET,icloud,节点选择',
  'RULE-SET,apple,节点选择',
  'RULE-SET,google,节点选择',
  'RULE-SET,GoogleCN,节点选择',
  'RULE-SET,telegramcidr,节点选择,no-resolve',
  'RULE-SET,telegramcidr,节点选择,no-resolve',
  'RULE-SET,nsfw,NSFW,no-resolve',

  // 国外代理
  'RULE-SET,proxy,节点选择',
  'RULE-SET,gfw,节点选择',
  'RULE-SET,tld-not-cn,节点选择',

  //拦截规则
  'RULE-SET,reject,全局拦截',
  'RULE-SET,BanEasyListChina,广告过滤',
  'RULE-SET,BanEasyList,广告过滤',

  // 兜底规则
  'MATCH,漏网之鱼',
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
  ai: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: `${CDN_BASE}//uxiew/easy_proxy_rules@main/ruleset/ai.yaml`,
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
    url: '${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/telegram.yaml',
    path: './ruleset/uxiew/telegram.yaml',
  },
  // 🔞 魅力艺术
  nsfw: {
    ...ruleProviderCommon,
    behavior: 'classical',
    format: 'text',
    url: '${CDN_BASE}/uxiew/easy_proxy_rules@main/ruleset/nsfw.list',
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

  // 覆盖代理组配置
  config['proxy-groups'] = Object.entries(smartGroups).map(
    ([name, i]) => (
      console.log(i.type),
      {
        ...groupBaseOption,
        name,
        'include-all': i['include-all'] || true,
        type: i.type || 'select',
        ...i,
      }
    ),
  );

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
