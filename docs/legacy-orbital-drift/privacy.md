# 数据与隐私 / Data & privacy

游戏无需账号。最高分、语言、音量设置保存在浏览器本机，与运营统计分开。

发布包默认没有数据接收地址，因此目前不向线上发送统计。若运营者配置并启用服务，游戏会发送随机匿名标识、游戏版本、语言、粗粒度操作类型、合法渠道标签、开玩/重玩/暂停/里程碑/死亡/分享动作，以及页面、前台和实际游玩时间。不记录输入内容、邮箱、指纹、IP、完整页面/来源网址或社交接收人。

在设置 → 数据与隐私关闭“允许匿名游玩统计”即可停止后续采集，并删除本机分析标识和待发队列；已经发出的在途请求无法撤回。其他标签页收到存储通知后同步关闭；存储完全禁用时只能关闭当前页。删除整个浏览器站点数据也会重置退出偏好，之后按照构建配置重新开启。离线单 HTML 始终不发送统计。

已接收数据保留 90 天，服务每日自动删除，重启时也清理。访客 ID 在 90 天不活动后过期；待发送事件保留最多 7 天/300 条。管理端只对持有服务端密钥的人开放；无公共排行榜或开放数据面板。导出和备份是运营者责任，保留时间应不长于原数据。部署平台或反向代理可能有自己的日志，部署时需关闭 URL/IP 访问日志并制定同样的保留策略。

这些匿名标识不表示真实独立人数；跨设备、浏览器和 itch.io 存储分区不能关联。分享完成不代表朋友看见；ref 只是可转发标签。用户可拒绝统计而继续玩、听声音和保存成绩卡。

No account is required. Best score, language and audio preferences stay in this browser. Analytics is unconfigured in the delivered release. When an operator enables it, it collects random anonymous IDs, coarse game metadata, campaign labels, play/share events and duration counters. It does not collect typed text, email, fingerprints, IP addresses, full URLs or share recipients. Disable collection in Settings → Data & privacy to remove this browser’s analytics ID and pending queue; in-flight/already received events cannot be recalled. Received events expire after 90 days; pending events after 7 days or 300 entries. Offline HTML never sends analytics. Anonymous IDs and referral labels cannot establish a person’s identity or prove that a friend saw a share. Operator queries and exports require an admin key.

正式启用前需在商店页面放置此说明并填入真实运营者联系方式；当前没有假设联系邮箱或承诺尚未存在的在线删除通道。
