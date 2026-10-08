# 部署准备（尚未部署）

两个独立交付部分：`release/site.zip` 是静态游戏站；`services/backend/` 是接收 API、SQLite 和受保护管理页。新增游戏一般不需要新增服务器。游戏站使用 play.<主域名>，数据/后台建议 games-data.<主域名>；二者应为不同 origin。正式环境 Node 服务默认不提供玩家游戏文件，避免把管理入口与游戏脚本放在同一 origin。

## 配置与构建

复制 site.config.json 到安全工作位置，填写真实 HTTPS publicOrigin 和 analyticsEndpoint（后者以 /v2/events 结尾），再设置 `SITE_CONFIG=/路径/配置.json`。games 下可填每款游戏实际 itch.io officialUrl；playUrl 自动使用 publicOrigin/slug/，推荐分享优先自有稳定入口。无真实地址时留空，不填 localhost 或示例域名。

```sh
npm ci
npm run check
npm run build
npm run package
npm run check:browser
```

部署 site.zip 至静态托管，允许目录 index.html、正确 MIME，资源路径保持相对。使用正确的缓存策略：入口/运行配置及时更新，带 hash 的资源可长期缓存；发布时先上传完整新资源再切换入口，保留上一版本以便回退。不要把不存在的资源一律重写为首页。

生产 backend 环境：NODE_ENV=production、HOST=0.0.0.0、PORT=8810、PUBLIC_ORIGIN=数据服务的真实 HTTPS origin、ADMIN_TOKEN=服务端随机高强度 token、ALLOWED_ORIGINS=逗号分隔的精确 game 站/itch.io iframe origins、DATA_DIR=持久卷目录。

```sh
docker build -f services/backend/Dockerfile -t game-lab-backend:0.1.0 .
docker run --env-file /安全位置/game-lab.env -p 127.0.0.1:8810:8810 -v game-lab-data:/data game-lab-backend:0.1.0
```

由 HTTPS 反向代理接入该服务；不要将容器端口直接无 TLS 对公网暴露。API 和后台可以共享这一数据服务的 origin，游戏站保持单独 origin。本地 `.data/admin-token.txt` 是自动生成的开发密钥，不复制进镜像，也不写入 site.config、JS、URL 或 Git。

服务无第三方 npm 运行依赖，Node 22 的内置 SQLite 有 ExperimentalWarning。当前单进程、持久磁盘适合首批反馈；若托管环境不能提供持久本地磁盘或需要多实例写入，先替换数据层为托管 SQL，再部署，不要把 SQLite 放到临时文件系统。

## 查询与兼容

管理页 `/admin`；`GET /admin/games`、`/admin/summary?game_id=orbital-drift&environment=production`、`/admin/export?...&format=csv` 均要求 Authorization: Bearer。game_id=all 返回分游戏汇总/导出，不混合成绩。现有近星轨道 `/events` 协议保留；新包使用 /v2/events。

CORS 只限制浏览器跨域调用，公开事件仍可能被伪造，不是付费/反作弊接口。输入校验、批次上限、事务去重、每 socket 来源与全局分钟限制、每日总事件限制均保留。代理后默认按代理 socket 计数；放大流量前在可信代理处加源 IP 限流并调整 MAX_REQUESTS_PER_MINUTE / MAX_EVENTS_PER_DAY。不开不必要的请求日志。

## 持续维护

- 持久卷、定期备份和恢复演练。停止写入后完整备份 SQLite 文件及 WAL，或使用在线 backup；不能运行中只复制主文件。
- 监测 /health、写入错误、磁盘空间和容量。健康检查能响应不等于收到玩家事件，必须定期实玩验证。
- 90 天保留和导出/备份清理；管理密钥轮换；在不同 origin 部署游戏与管理入口。
- 游戏版本、SDK版本和事件 schema 分开升级。旧游戏包已内嵌 SDK，不能假设玩家会立刻更新。
- 变更域名/slug 时保持旧分享地址的跳转与可用性，保留必要的合法 UTM/ref；未知来源如实降级。

当前没有进行远程部署、DNS 配置、itch.io 上传或任何付费操作。真实主域名和托管入口确认后，再配置公开地址并实测平台 iframe 来源与分享权限。
