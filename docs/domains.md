# 子域名选择

推荐 **play**：简短、像一个邀请动作，适合各种轻量游戏，也方便以后加入互动体验。**games** 是更直白的第二选择，适合作品目录；**arcade** 风格更强，但容易让人联想到街机/动作类。**lab** 更像实验室，不适合默认玩家入口。

建议结构（以下均是示意，不是已配置地址）：

| 用途 | 地址结构 |
| --- | --- |
| 游戏首页 | play.<你的主域名>/ |
| 近星轨道 | play.<你的主域名>/orbital-drift/ |
| 其他游戏 | play.<你的主域名>/<slug>/ |
| 数据 API 和受保护后台 | games-data.<你的主域名>/v2/events 与 /admin |

游戏路径是长期对外链接，不包含构建号、CDN hash、服务器地址。游戏版本更新只换背后的文件，保留 URL。更改 slug 时在静态托管层配置旧 URL → 新 URL 的重定向，同时保留明确的 UTM/ref 参数；不要靠永久保存全部行为日志来维持链接可用。

目前只是前缀建议，没有检查主域名归属、DNS 占用、证书或实际可达性。确认已有主域名后再设置 `site.config.json`、部署和 DNS；当前不会自动购买域名或创建付费订阅。

同一 origin 的不同路径共享 localStorage；本仓库按 game_id 区分匿名 ID、队列和游戏存档，退出偏好则有意共用。路径分隔不是安全隔离：如果将来接入不受信任的第三方游戏，使用独立子域名/受控 iframe；后台与玩家游戏保持不同 origin。[MDN 同源规则](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)

配置真实 publicOrigin 后，可以执行 `npm run link -- --game orbital-drift --source community --medium invitation --campaign launch` 生成该游戏的渠道链接。脚本只输出链接，不会发帖或发送消息；地址为空时拒绝生成。
