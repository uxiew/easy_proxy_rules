// PAC（Proxy Auto-Configuration）文件是一个用 JavaScript 编写的脚本文件，
// 它的作用是让客户端（通常是网页浏览器或操作系统）能够自动选择正确的代理服务器来访问特定的 URL。

const DIRECT_DOMAINS = [
  // --- 通用/基础服务 ---
  'localhost', // 本地回环地址
  '127.*', // 本地回环IP段
  '*.local', // 本地网络发现
  '*.lan', // 局域网常见后缀
  '*.home', // 家庭网络常见后缀
  '*.m.jd.com', // 微信/QQ内置浏览器内的JD
  '*.m.taobao.com', // 微信/QQ内置浏览器内的淘宝
  '*.weixin.qq.com', // 微信相关
  '*.tencent.com', // 腾讯系基础服务
  '*.aliyun.com', // 阿里云
  '*.aliyuncs.com', // 阿里云对象存储等
  '*.cloud.tencent.com', // 腾讯云
  '*.cdn.qq.com', // 腾讯CDN
  '*.gtimg.com', // 腾讯CDN/静态资源
  // --- 搜索引擎 ---
  '*.baidu.com', // 百度 (搜索、地图、百科等)
  '*.sogou.com', // 搜狗
  '*.so.com', // 360搜索
  '*.haosou.com', // 360搜索
  '*.bytedance.com', // 字节跳动相关
  '*.toutiao.com', // 今日头条
  '*.zhihu.com', // 知乎
  // --- 社交媒体与通讯 ---
  '*.qq.com', // 腾讯QQ、QQ空间、邮箱等
  '*.weibo.com', // 新浪微博
  '*.wechat.com', // 微信
  '*.douyin.com', // 抖音 (国内版)
  '*.kuaishou.com', // 快手
  '*.dingtalk.com', // 钉钉
  '*.feishu.cn', // 飞书
  '*.work.weixin.qq.com', // 微信企业版
  // --- 电子商务/购物 ---
  '*.taobao.com', // 淘宝
  '*.tmall.com', // 天猫
  '*.jd.com', // 京东
  '*.pinduoduo.com', // 拼多多
  '*.suning.com', // 苏宁易购
  '*.vip.com', // 唯品会
  '*.sf-express.com', // 顺丰快递
  '*.jd-ex.com', // 京东快递
  '*.kuaidi100.com', // 快递100
  // --- 视频/直播/音乐 ---
  '*.iqiyi.com', // 爱奇艺
  '*.youku.com', // 优酷
  '*.tudou.com', // 土豆
  '*.bilibili.com', // 哔哩哔哩 (B站)
  '*.tencentvideo.com', // 腾讯视频
  '*.douyucdn.cn', // 斗鱼直播
  '*.huya.com', // 虎牙直播
  '*.miguvideo.com', // 咪咕视频
  '*.wangyiyun.com', // 网易云音乐
  '*.qqmusic.qq.com', // QQ音乐
  '*.kugou.com', // 酷狗音乐
  // --- 新闻/资讯 ---
  '*.xinhuanet.com', // 新华网
  '*.people.com.cn', // 人民网
  '*.huanqiu.com', // 环球网
  '*.sina.com.cn', // 新浪新闻等
  '*.163.com', // 网易新闻等
  '*.ifeng.com', // 凤凰网
  '*.cnr.cn', // 中国之声/央广网
  '*.cctv.com', // 央视网
  // --- 金融/银行/支付 ---
  '*.alipay.com', // 支付宝
  '*.tenpay.com', // 财付通 (微信支付相关)
  '*.icbc.com.cn', // 中国工商银行
  '*.cmbchina.com', // 招商银行
  '*.bankofchina.com', // 中国银行
  '*.ccb.com', // 中国建设银行
  '*.abchina.com', // 中国农业银行
  '*.psbc.com', // 邮储银行
  '*.paic.com.cn', // 平安银行/保险
  // (您可以根据自己常用的银行添加)
  // --- 应用商店/更新 ---
  '*.appstore.qq.com', // 腾讯应用宝
  '*.xiaomi.com', // 小米应用商店/服务
  '*.huawei.com', // 华为应用商店/服务
  '*.oppomobile.com', // OPPO手机服务
  '*.vivo.com.cn', // Vivo手机服务
  // --- 工具类 ---
  '*.amap.com', // 高德地图
  '*.map.baidu.com', // 百度地图
  '*.ele.me', // 饿了么
  '*.meituan.com', // 美团
  '*.dianping.com', // 大众点评
  '*.ctrip.com', // 携程
  '*.qunar.com', // 去哪儿
  '*.fliggy.com', // 飞猪
  // --- 其他常用服务 ---
  '*.cnzz.com', // 站长统计
  '*.58.com', // 58同城
  '*.ganji.com', // 赶集网
  '*.douban.com', // 豆瓣
  '*.lagou.com', // 拉勾招聘
  '*.zhaopin.com', // 智联招聘
];

/**
 * FindProxyForURL 是 PAC 文件的核心函数，也是唯一必须存在的函数。
 * 当你的浏览器或操作系统需要访问一个 URL 时，它会调用这个函数，并传入当前的 URL 和对应的 Hostname（域名）。
 * 这个函数内部包含一系列 JavaScript 逻辑，用于判断基于 url 和 host，流量应该如何处理。
 * @param {String} url 当前的 URL
 * @param {String} host 对应的 Hostname（域名）
 * @returns {String} 指示如何进行连接
 */
function FindProxyForURL(url, host) {
  if (
    isPlainHostName(host) || // e.g., "localhost"
    isInNet(host, '10.0.0.0', '255.0.0.0') || // Class A private range
    isInNet(host, '172.16.0.0', '255.240.0.0') || // Class B private range
    isInNet(host, '192.168.0.0', '255.255.0.0') || // Class C private range
    isInNet(host, '127.0.0.0', '255.0.0.0') || // Loopback addresses
    host == '::1' || // IPv6 loopback
    isInNet(host, 'fc00::', 'ff00::') // IPv6 unique local addresses
  ) {
    return 'DIRECT';
  }
  for (let i = 0; i < DIRECT_DOMAINS.length; i++) {
    if (shExpMatch(host, DIRECT_DOMAINS[i])) {
      return 'DIRECT';
    }
  }
  return 'PROXY 127.0.0.1:%mixed-port%; SOCKS5 127.0.0.1:%mixed-port%; DIRECT;';
}
