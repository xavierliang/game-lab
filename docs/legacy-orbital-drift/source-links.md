# 来源链接与 iframe 验证

1.1 默认没有正式 URL。`public/orbital-config.js` 中的 officialUrl（正式商店页）、playUrl（受控直接试玩页）为空；成绩卡正常生成，链接复制按钮不显示。不能使用 localhost、example.com、占位域或 itch.io CDN 临时地址冒充正式地址。

## itch.io 能确认什么

2026-10-06 阅读 [官方 HTML5 文档](https://itch.io/docs/creators/html5)：上传 ZIP 的游戏由 iframe 承载，资源在平台 CDN 的子目录，必须使用相对路径、外部 API 使用 HTTPS。官方没有公开承诺将外层页面任意 query 转发给游戏。

外层 `https://作者.itch.io/游戏?utm_source=community` 与子游戏 iframe URL 是不同地址；跨域同源策略不允许直接读取 parent.location，referrer 常被裁剪为来源 origin。实现优先读取自己的 query；如果浏览器实际提供 HTTPS itch.io referrer 中的渠道参数，就只解析相同白名单字段，标记 evidence=referrer_query。不存完整来源 URL 或其他参数。referrer 被裁剪时仅识别 itch.io 或粗略 external。

实际公开样本：[Nicky Case 的 WBWWB 页面](https://ncase.itch.io/wbwwb)，只读 Chrome 验证记录见 [itch-attribution-probe.json](itch-attribution-probe.json)。外层带探测 UTM，iframe 自身地址只有平台 v 参数，parent.location 不可读；但 document.referrer 保留了完整外层 query，且该样本的 iframe allow 中包含 web-share。因此可条件归因；不能据一个样本保证本游戏、所有浏览器或所有启动方式相同。

本地实测跨端口（跨 origin）外层带 UTM、子 iframe 不带参数时，子游戏没有这些 UTM，记录 unknown 或粗略来源，外层 URL 不能直接读取。这验证了浏览器限制与降级，**不等于已在自己的 itch.io 草稿页验收**。尚无账号/正式项目，真实 itch.io 草稿页仍必须核验 iframe src、Origin、document.referrer 和 Permissions Policy。不将未经平台保证的外层 UTM 用作精确渠道报告。

系统分享的跨域 iframe 需要宿主允许 web-share；[Chromium 官方说明](https://developer.chrome.com/blog/web-share-api-in-third-party-iframes)给出 `allow="web-share"` 要求。无法改变 itch.io 宿主策略时使用已实现的下载/复制回退，不保证该处的系统分享可用。

## 可落地的精确入口

配套服务提供 `/play.html`，把同一份游戏静态包放入 `/play/index.html` iframe。这个自有包装页只把 allowlist 内的 campaign/ref 参数加入子游戏 URL，已做浏览器端到端验收。它是**同一游戏的独立试玩入口**，不将它的流量计作 itch.io 商店访问。

部署后，把真实 HTTPS `/play.html` 配置为 playUrl；officialUrl 填 itch.io 正式页。游戏分享默认优先 playUrl，添加 `utm_source=player&utm_medium=share&utm_campaign=score-card&ref=<随机share_id>`。没有 playUrl 时可分享 officialUrl，但不承诺 itch.io 页面中的 ref 能传入游戏。直接跳转去 itch.io 无法可靠关联后续开玩（referrer 在某些模式可提供参数，但没有平台保证），因此未实现虚假的“跳转等于开玩”统计。

生成社区渠道链接（脚本只生成文本，不访问/发布/发消息）：

```sh
node scripts/campaign-link.mjs --base https://你的真实域名/play.html --source community --medium invitation --campaign launch --content group-a
```

换成英文真实域名执行；示例不会自动写进游戏。每个受控渠道使用不同 content。UTM 和 ref 是公开的可转发标签，请勿填写邮箱、群成员名或敏感信息。

## 上线后验证

1. 正式游戏 URL 能匿名打开；/play.html 与 itch.io 包为同一版本。
2. 私密 QA 使用 environment=test 包；打开渠道链接，确认子 iframe 自己拥有白名单参数。
3. 后台 Test 导出中 current 正确、first 在同本机后续直接访问中保持首次；缺失 referrer 的访问是 unknown。
4. 在真实 itch.io 草稿页直接带外层 UTM 打开，观察真实 iframe URL 和 collection Origin。子地址含参数记 query；浏览器明确提供的 itch.io referrer 渠道记 referrer_query；其余保留粗粒度 itch.io/unknown。
5. 分享复制后的 ref 与另一无痕浏览器打开后的 referral_visit 对应；这是推荐标签访问，不是验证朋友身份。设备或存储隔离限制保留。
