# Orbital Drift 1.1.0 — itch.io 待发布包

2026-10-06。代码、分析服务与本地验收已完成；尚未上传 itch.io，没有正式游戏 URL 或线上接收服务。

## 交付与构建

- `release/orbital-drift-1.1.0-itch.zip`：上传候选包，根目录 index.html，相对资源，不依赖 Hive/Node。
- `release/orbital-drift-preview.html`：自包含离线试玩；即使经 HTTP 打开也不发送统计。
- `release/orbital-drift-publishing-kit.zip`：上述内容、封面、双语文案、许可、文档、服务、静态包、可构建源码、旧 ZIP。包内 MANIFEST.sha256 校验各文件。
- `release/orbital-drift-1.0.0-itch.zip`：原始回退包，不覆盖。旧离线版、旧完整素材包与 manifest 另存 `release/rollback/1.0.0/`。
- `release/build-manifest.json`：运行文件与交付物大小/SHA256。`release/SHA256SUMS` 另含完整素材包自身哈希。

```sh
npm ci
npm run check
npm run package:itch
npm run check:browser
npm run check:release
```

Node 22.19+、Python 3；浏览器测试使用已安装的 Chrome。固定源码、锁文件与工具链可字节重复构建；ZIP 固定时间与排序，kit 每次从显式清单重新组装，避免旧文件残留。解压 kit 后 source/ 可独立重建，source/release 已含必要封面和回退输入。包里没有 .env、数据库、管理密钥、日志或测试数据。

## 本地接通与线上配置

`npm run analytics` 后，试玩 http://127.0.0.1:8747/play.html；数据 http://127.0.0.1:8747/admin。将 `.analytics/admin-token.txt` 内容粘入密钥栏，选择 Test。默认 Production 为零。服务只监听回环，本机数据库不代表线上数据。

线上接通需要集中提供：**真实 itch.io 游戏 URL，以及一个明确用于本游戏的新 HTTPS 服务主机/部署访问权限**。真实 itch.io 草稿页可访问后才能核实游戏 iframe origin 并配置精确 CORS。无需提供个人账号密码；管理 token 在服务端生成，不能写入浏览器包。上线前还需运营者的真实联系渠道用于隐私说明。

按 [当前部署指南](../deployment.md) 部署服务、持久卷和同版静态包。编辑 `public/orbital-config.js`，填写 analyticsEndpoint、officialUrl、playUrl，再检查和重构建。当前均为空，不生成假链接或假来源。默认分享优先受控 /play.html；itch.io 外层 UTM 不承诺进入子 iframe，详见 [来源验证和链接说明](source-links.md)。服务的 health 不能证明已收到真实玩家数据，必须从公开浏览器实玩后核对 Production 导出。

在商店页附 [隐私说明](privacy.md)；[事件与指标字典](analytics-events.md) 说明累计时长、分母、队列、去重、来源降级、取消、回访限制和导出范围。退出采集位于设置 → 数据与隐私，游戏仍可正常玩、播放音频和保存卡片。

## itch.io 草稿页操作（待用户上传）

1. 项目 Orbital Drift，类型 HTML；上传 1.1.0 ZIP，勾选浏览器游玩，保持 Draft。
2. 建议嵌入 960×600、Click to play、Fullscreen button，关闭滚动条。移动端策略见 [itch.io 官方文档](https://itch.io/docs/creators/html5)。
3. 用 itch-cover.png 作宣传封面；实机截图请使用实际游玩图，不能把 AI 封面当实机截图。
4. 初始免费；Action / Survival；Space、Physics、Singleplayer、2D、Arcade；English / 简体中文；Keyboard / Touchscreen。真实手机验证后再声明 Mobile Friendly。
5. 声明美术/封面及代码有 AI 辅助，音频为有来源的 CC0，Credits 已包含署名。
6. 验证键盘/触屏、音量、音乐、失焦暂停恢复、重玩、设置、PNG、iframe Web Share 权限回退、资源和窄屏。
7. 先用 Test 配置验证草稿页 HTTP 入库与 origin、真实 iframe 参数、分享 ref；确认后切 Production 再打包。
8. 用户决定公开时间。本轮不上传、不上架、不代发社区消息。

## 内容、许可与回退

新增 30/60/120 秒阶段反馈，不扩成商店/金币/排行榜。成绩为物理模拟时间，屏幕大小影响边界与陨石，不声明跨设备公平竞技。音乐、音效、双语、独立离线版及原玩法保留。

音乐 wipics《Outer Space Loop》，[来源](https://opengameart.org/content/outer-space-loop)；音效 [Kenney Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) 与 [Interface Sounds](https://kenney.nl/assets/interface-sounds)，均 CC0。原始下载/处理脚本/许可/哈希在 audio-sources/，运行许可 public/licenses/，构建附前端依赖许可。旧版细节见 历史 1.0 指南（未纳入此仓库），其中“无分析服务”是当时状态。

上传保留的 1.0.0 ZIP 即可回退游戏；无需删除独立分析服务数据库。旧版没有新埋点。1.0.0 ZIP 哈希与原 manifest 核对。

## 验证范围

`npm run check` 覆盖 TypeScript、物理/状态/里程碑/后台计时/独立局 ID、音频、界面、来源、分享成功/取消/拒绝/回退、离线队列，以及 HTTP→SQLite→鉴权汇总/导出、去重、CORS、大小/速率限制、持久化与保留期。

`check:browser` 在真实 Chrome 做 PNG 签名/尺寸和下载、真实游玩入库、iframe/跨域参数降级、320×568/844×390、离线页及新旧 ZIP 启动检查，产物在 test-results/。系统分享分支通过 API mock 测试，不向任何人发送。真实 iOS/Android 多点触控、系统分享面板、完整循环主观听感、实际 itch.io 上传运行仍待复核。

既有开发工具依赖树存在 npm audit 提示；不等同静态包或零第三方运行依赖接收服务使用了那些服务端组件。本轮未升级无关的旧 Sites/vinext 栈，也不宣称完成全依赖安全审计。
