# 新游戏接入

1. 运行 `npm run new:game -- my-game`。生成器只创建新目录，拒绝已有目录、路径穿越和保留路由；默认 `status: example`，始终 Test。
2. 编辑 `games/my-game/game.json`：id 永久不变；slug 是公开 URL；title/description 为双语标题和说明；version 为该游戏的独立版本；score.unit/buckets 定义本游戏成绩及分布；milestones 定义阶段 id 与目标值；causes 列出允许的结束原因。
3. 在 web/ 实现玩法。可保留 TypeScript 模板，也可使用 React 或自己的构建入口。公共构建配置输出相对资源路径，既支持自有站子路径也支持 itch.io。
4. 初始化公共 SDK：`releaseConfig({gameId: game.id, gameVersion: game.version, example: game.status === 'example'})`，再 `new Analytics(config, 'zh')`。游戏引擎只在实际更新时调用 `advancePlay(seconds)`；失焦/后台必须暂停，恢复后不得补算隐藏期间。
5. 游戏提供 `run_id`、局序号、开始/暂停/继续/阶段/结束事件。结束用通用 `run_end` + outcome=completed/failed；成绩 score 使用 manifest 中声明的单位。每局每阶段只发一次。既有旧引擎用薄适配层，例如近星轨道把 score_ms 转成秒，把 death 转成 run_end。
6. 使用共享 sharing 导出的 `referralLink`、`canvasPng` 或 `simpleScoreCard`、`systemShare`、`copyLink`。游戏自己决定卡片美术和文案，共享层负责真实 PNG 与系统 API 结果。PNG 应提前生成，用户点击时再调用系统分享，避免丢失用户手势。
7. 游戏存档键必须包含 game_id，例如 `game-lab:my-game:best`。统计 SDK 已按游戏/环境/接收地址分开队列和匿名 ID。共享隐私退出不删除游戏存档。
8. `npm install` 更新工作区链接和锁文件；`npm run check`，再 `npm run build -- my-game`、`npm run package -- my-game`。浏览器验收、素材许可和隐私说明完成后才改为 ready。

公共 SDK 固定为工作区版本 1.0.1，游戏依赖明确写版本。当前仍是同一工作区只有一份 SDK 源码；改共享行为必须跑全部游戏回归并按版本规则更新包和依赖。旧的已发布静态包内嵌原 SDK，不会因服务端升级自动加载新代码。服务接口 v2 兼容已发布协议；破坏性字段变更要新增协议或显式迁移。

`game.json` 只允许服务登记的匿名规则，不能把任意用户输入塞进事件 payload。新增事件种类/字段，需要更新共享类型、服务端白名单、事件字典和跨游戏隔离测试。
