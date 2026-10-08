# 事件与指标：多游戏协议 v2

客户端通用能力在 packages/game-services，玩法到通用协议的转换留在游戏目录。数据库每条记录带 game_id，事件主键 `(game_id, id)`；会话归属、逻辑去重、查询和导出均按游戏隔离。全站只汇总共同指标，不混合不同游戏的成绩单位或声称跨游戏去重人数。

## 身份与版本

- schema=2：事件协议；game_id：永久游戏身份；version：游戏版本；sdk_version：嵌入包的共享组件版本。
- id / session_id / visitor_id：随机 UUID。匿名访客按游戏、环境和接收地址隔离，不能推断跨游戏、浏览器、设备的同一人；存储清除、限制或 iframe 分区会改变标识。
- platform=itch/standalone；environment=production/test。file: 离线页关闭；本机和 webdriver 强制 Test；status=example 的游戏前端和服务端都拒绝作为 Production。
- current / first：本次与首次可观测来源；只接受白名单 source/medium/campaign/content/referral/evidence。itch.io referrer 若实际暴露参数可标记 referrer_query，否则记粗粒度来源或 unknown。不假装能读取跨域 parent URL。

## 事件

| 类型 | 说明 |
| --- | --- |
| session_start, load_success, load_error | 统计会话开始、游戏加载成功/失败；不能自报完全未执行的 JS |
| run_start | run_id、index、score=0；每局独立身份 |
| run_abandon | 用户重开未结束局；reason=restart，不伪造死亡 |
| pause, resume | manual/settings/background；actual play 不继续累加 |
| milestone | run_id、score、milestone（当前游戏登记的阶段 id） |
| run_end | run_id、score、outcome=completed/failed；可选 cause/new_record，原因限定为该游戏登记值 |
| heartbeat, pagehide | 计时累计快照，不是可靠的会话结束证据 |
| share_open, card_ready, card_error | 打开分享卡，PNG 生成结果 |
| share_intent, share_complete, share_cancel, share_error, share_fallback | 用户操作与系统结果；complete 不证明送达，AbortError 不算完成 |
| card_download, link_copy, link_copy_error | 发起下载、剪贴板结果；手工复制不可观测 |
| referral_visit | 实际 URL/referrer 含合法 ref 的载入，不代表新玩家 |

详情字段只有 run_id、score、milestone、cause、index、new_record、reason、share_id、method、outcome。禁止自由文本扩展。近星轨道单位 seconds、阶段 survive-30/60/120；信号点击单位 hits、阶段 five-hits。

## 计时、重试与统计

page_ms 为文档存活墙钟累计（含后台）；foreground_ms 为可见且有焦点的累计，超过 30 秒采样间隙不算有效前台；play_ms 为引擎实际推进的累计模拟时间，跨局相加。后台暂停由各游戏实现并测试；共享 SDK 不凭空推测游戏是否暂停。

15 秒心跳、关键事件、online/pageshow 触发发送。每批 ≤20 事件/约 28 KiB，8 秒超时、指数退避，最多 300 条/7 天。独立文档队列按游戏恢复；Beacon 不凭返回 true 删除事件，只有接收端确认或明确永久拒绝才移除。网络故障不阻断游戏。存储不可用、关页未送达、超过队列上限会导致低估，不承诺无损。

日期为 UTC、含结束日、最多 93 天。汇总按 session_start 所在日期的会话归组，包含截至查询时收到的该会话事件；导出按事件时间筛选。时长每会话取累计最大值再相加。

- 加载到开玩：同时加载成功且开玩的会话 ÷ 加载成功会话。
- 进入到开玩：开玩会话 ÷ 会话。
- 重玩率：有至少两次 run_start 的会话 ÷ 开玩会话。
- 阶段达成率：有开始事件且达到该阶段的局 ÷ 全部开始局（含未结束局，属于观测下界）。
- 分享点击率：既开玩又点击系统分享的会话 ÷ 开玩会话。复制、下载、取消单独展示。
- completed_runs 是观测到 run_end 的结束局数，不等于“通关”；outcomes 分开 completed 与 failed。
- score_distribution / mean_end_score 的单位来自每款游戏 manifest。仅对该游戏结束局计算。
- 推荐匹配只在同游戏、同查询队列中寻找已观测分享记录，不能跨游戏串联。别的浏览器点击不证明朋友身份。

每个比例同时返回 numerator/denominator/value，零分母时 value=null。全游戏查询返回各游戏分别汇总，仅累加会话/局数；不返回虚假的全站去重人数。首轮中途开启统计可能没有该局 run_start，完整局分析应从导出关联筛选。

## 旧版兼容

`POST /v2/events` 只接受 schema 2。`POST /events` 和 `/v1/events` 明确仅用于旧近星轨道 schema 1：固定映射 game_id=orbital-drift、sdk_version=0.0.0、毫秒成绩转秒、death 转 run_end/failed、数字里程碑转 survive-N。绝不依据浏览器随便猜游戏。

旧 SQLite 文件不自动原地修改。可通过 `node services/backend/import-legacy.mjs OLD.sqlite NEW.sqlite` 显式复制导入；只读打开旧文件，拒绝已存在的输出，保留收到时间并应用 90 天清理。旧发布包仍可回退。
