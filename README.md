# Game Lab · 小游戏仓库

这是为持续制作多款 HTML5 小游戏准备的独立 Git 仓库。每款游戏独立构建/发布/回退，共用跟踪、来源、分享和数据后台。代码公开不代表游戏或分析服务已上线：当前没有正式域名或线上接收配置，也没有上架 itch.io。

## 运行

Node **22.19+**、npm、Python 3。

```sh
npm ci
npm run check
npm run build
npm run package
npm run dev
```

- 游戏集合：<http://127.0.0.1:8810/>
- 近星轨道：<http://127.0.0.1:8810/orbital-drift/>
- 接入示例：<http://127.0.0.1:8810/signal-tap/>
- 数据后台：<http://127.0.0.1:8810/admin>。读取 `.data/admin-token.txt`，选择 Test 和游戏；密钥不进入 URL 或浏览器持久存储。

本地服务只监听回环，注入本地 Test 接收地址。正式包默认关闭分析、没有占位分享链接。`npm run dev` 前需构建；修改源代码后重新 build，服务静态文件立即更新。它不是 Vite 热更新服务。

## 目录与边界

```text
games/orbital-drift/        近星轨道 1.2.1；玩法、双语、声音、真实 PNG
games/signal-tap/          信号点击 0.1.1；第二游戏接入示例（Test-only）
packages/game-services/    版本 1.0.1；跟踪、离线队列、归因、分享公共功能
apps/portal/              游戏集合首页
services/backend/        多游戏接收、SQLite、受保护汇总与导出
tooling/                  游戏登记、公共构建与测试工具
scripts/                  独立构建、打包、新游戏生成
baselines/orbital-drift/   原 1.0.0 和 1.1.0 ZIP 回退基线
```

游戏身份和规则在各自 `game.json`。核心代码可以使用任意前端方式：近星轨道是 React，信号点击是原生 TypeScript，两者使用同一个 SDK。当前 Node 服务没有 npm 运行依赖，使用内置 SQLite；游戏站可作为独立静态站部署。

## 新增和单独发布

```sh
npm run new:game -- my-new-game
npm install
npm run build -- my-new-game
npm run package -- my-new-game
```

生成的游戏继承可运行的信号点击模板，默认仍是 example/Test。修改玩法、文案、计分和里程碑，完成验收后再改 `status: ready`。具体约定见 [新增游戏](docs/adding-a-game.md)。

打包输出：

- `release/<game-id>/<version>/<game-id>-<version>-itch.zip`：该游戏自己的 itch.io 包。
- 同目录 `preview.html`：直接 file: 打开的离线页，始终不收数；`licenses/` 为许可全文。
- 如游戏提供 `publishing/`，同目录也附封面与商店文案；这些素材不进入运行 ZIP。
- 同目录 `manifest.json`：版本与每个运行文件的大小/SHA256。
- `release/site.zip`：可部署的自有站，默认排除 example 游戏。
- `release/SHA256SUMS`：全部交付物哈希。

单游戏构建不重建其他游戏。全量 build 后 package 会刷新公开站包；若准备新的正式发布，先提升该游戏版本，再验收与发布。构建输出是本地候选包，不会自动部署。

## 验证

```sh
npm run check
npm run build && npm run package
npm run check:browser
npm run check:release
```

浏览器测试使用本机 Chrome；Linux CI 可安装 Playwright Chromium 并设置 `PLAYWRIGHT_CHANNEL=chromium`。所有测试数据库为临时 Test 数据，截图在 `test-results/`。检查包含两款游戏的真实浏览器行为、PNG、数据隔离、旧协议兼容、离线重试、隐私退出、单独构建和可重复打包。

## 域名与部署

推荐前缀 **play**，结构为 `play.<你的主域名>/<游戏 slug>/`。尚未配置或检查任何实际 DNS。数据服务和管理后台建议放在与游戏站不同的 origin，例如 `games-data.<你的主域名>`；具体品牌选择见 [域名方案](docs/domains.md)。

`site.config.json` 中仅保存公开配置；当前地址为空。可用 `SITE_CONFIG=/外部配置路径.json` 选择另一份公开配置，再构建。管理密钥只在服务端环境或本地 `.data` 中。生产接入、持久化、备份和静态站部署见 [部署指南](docs/deployment.md)。

[事件字典与兼容约定](docs/events.md) · [迁移记录](docs/migration.md) · [隐私与保留期](docs/privacy.md)

## 许可与来源

旧版发布包作为回退基线保留。管理密钥和数据库不属于公开内容。空间美术有 AI 辅助，音乐和音效为有来源的 CC0；各游戏运行包带原许可，详见 [第三方与内容说明](NOTICE.md)。项目代码尚未授予开源许可；公开可见不改变这一点，第三方组件继续适用各自许可证。
