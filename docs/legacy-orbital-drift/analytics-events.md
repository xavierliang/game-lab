# 1.1 数据字典与口径

收集是可关闭的匿名运营统计，不是计费、反作弊或跨设备排名。浏览器提交的是不可信观测值；公开接收端即使有 CORS、校验和速率限制，也不能保证每条请求来自真人。

## 公共字段

`schema=1`；`id` 为随机 UUID，用于请求重试去重；`session_id` 每次文档挂载生成（BFCache 恢复延续，重载重建）；`visitor_id` 为该来源/环境本机存储内的随机 UUID，90 天不活动过期。清除存储、隐私模式、禁用存储、不同浏览器/设备、iframe 存储分区都可能产生不同访客，不能称为独立人数或跨设备留存。

`at` 为客户端 UTC 毫秒，服务端另存 `received_at`；拒绝超过 7 天或未来超过 5 分钟的数据。版本、平台 itch/standalone、语言 en/zh、粗粒度输入类型 touch/pointer 同送。不收集屏幕尺寸、UA、IP、邮箱、文本输入、完整访问网址、referrer 路径或其参数。IP 只在服务内存中以每进程随机盐哈希做分钟限流，不落库；反向代理需自行关闭访问日志或脱敏。

`current` 是本次归因；`first` 是此来源/环境本机首次可观测归因，不做 last-non-direct 覆盖。两者含 source、medium、campaign、content、referral、evidence。渠道值只接受 1–64 个 ASCII 字母/数字/下划线/点/连字符，不得编码个人信息。UTM 参数优先于 source/medium/campaign/content 别名。外层 itch.io 参数不推测：只有浏览器明确暴露 HTTPS itch.io referrer 的白名单字段时才提取并标 referrer_query；若只暴露 origin 或没有 referrer，降级记录。

每条事件包含三个**累计**计时器：`page_ms` 文档挂载后的单调时钟时间，含后台/暂停；`foreground_ms` 页面可见且拥有焦点的时间，暂停菜单也可计入，超过 30 秒的采样间隙不能证明有效停留而不计；`play_ms` 游戏物理引擎真正推进的模拟时间总和，跨局累计，暂停/后台/失焦停止。前台时间不是阅读或注意力证明；慢帧时模拟时间可能小于墙钟时间。启用统计时从零开始观察。

## 事件

| 事件 | 时机与特有字段 |
| --- | --- |
| session_start | 开始一次已启用的统计会话；每会话一次 |
| load_success / load_error | 游戏星图资源加载完成/失败；各每会话最多一次。JS 完全未下载、被阻断或无法执行时无法自报，不把缺失当成功 |
| run_start | 真正开始新局；run_id UUID、index（当前文档内第几局）、score_ms=0。index=1 为首局，>1 为重玩 |
| run_abandon | 正在进行/暂停的一局被重开；reason=restart，当前 score_ms。关闭页面无法可靠确认弃局，不伪造死亡 |
| pause / resume | 手动、设置、后台暂停及主动继续；run_id、score_ms；pause.reason 为 manual/settings/background |
| milestone | 30/60/120 秒阈值首次跨越；run_id、score_ms、milestone。每局每阈值一次 |
| death | 实际失败；run_id、score_ms、cause=planet/boundary/asteroid、new_record（严格高于本机最佳） |
| heartbeat / pagehide | 15 秒前台心跳及失焦/隐藏/页面离开快照。pagehide 不是可靠的会话结束确认 |
| share_open | 打开成绩卡；生成独立 share_id，与匿名访客 ID 无关 |
| card_ready / card_error | 真实 PNG 编码成功/失败 |
| share_intent | 用户点击系统分享按钮 |
| share_complete | Web Share promise resolved；method=file/text，仅代表系统完成交接，不代表发送、送达或对方打开 |
| share_cancel | AbortError；可能是取消或系统无分享目标。不算完成 |
| share_error / share_fallback | 权限拒绝/错误，或 API 不可用；提供 PNG/链接回退 |
| card_download | 发起 PNG 下载。不能知道是否完成落盘 |
| link_copy / link_copy_error | Clipboard promise 成功/失败；失败时可手工复制，手工复制无法观测 |
| referral_visit | 当前**游戏自己的 URL 或浏览器实际暴露的 HTTPS itch.io referrer**含合法 ref，采集会话中一次；表示带推荐标签的游戏载入，未必开玩或新用户 |

分享事件包含 share_id；服务端可关联窗口内 card_ready/link_copy/share_complete 与 referral_visit。链接可被再次转发、本人点击或机器人打开，因此称“匹配推荐会话”，不称“新增朋友”。`same_browser_referral_sessions` 是同本机匿名标识的匹配，不是身份判断。若关闭统计仍可分享，接收端可以看到推荐标签，但发送方事件缺失是正常现象。

## 可靠性与限度

每 15 秒、关键动作、online、pageshow 尝试发送。一次 ≤20 个事件、约 28 KiB；8 秒超时，指数退避 + 抖动，最长 5 分钟间隔；恢复在线强制重试。localStorage 队列最多 300 条、最长 7 天；优先淘汰心跳，再淘汰最老事件。存储不可用时仅内存队列，关闭会丢失。网络失败不抛到游戏。

服务端事务入库后返回 accepted IDs；客户端只删除已确认或明确永久拒绝的 IDs。sendBeacon 的 true 仅意味着浏览器接受排队，**不删除队列**；后续重发由数据库去重。事件 id 主键 + 会话开始/加载/推荐事件的会话语义键 + run_start/death/abandon/milestone 的局语义键双重去重。每个文档使用独立存储队列；新载入合并未过期队列，确认后清除各队列中的已收 ID。并发标签页的旧副本最多导致重复重试，再由服务去重。服务不可达超过保留上限、最后一次心跳未送达等会低估时长。

本地、webdriver、file: 离线版始终 Test 或关闭；环境在前端包和查询中显式区分。人为伪造环境仍可能绕过公开采集接口的标签，这是所有无登录客户端统计的限制。

## 汇总分母与范围

默认 Production；查询指定 UTC 起止日期（含结束日，最多 93 天）。**会话队列口径**：session_start.at 在日期范围的会话，包含截至查询时已收到的该会话事件，跨午夜游玩归开始日。每日访客不可直接相加作为期间去重访客。时长用每会话累计值最大值再求和，绝不能累加心跳快照。各 rate 返回 numerator、denominator、value；分母为零时 value=null。

| 指标 | 定义 |
| --- | --- |
| sessions / visitors | 观测到 session_start 的会话 / 这些会话中去重匿名访客 |
| loaded_sessions | 有 load_success 的会话 |
| started_sessions / started_visitors | 有 run_start 的会话 / 匿名访客 |
| entry_to_start | 开玩会话 ÷ 会话 |
| load_to_start | 同时有 load_success 与 run_start 的会话 ÷ 加载成功会话 |
| runs / completed_runs / abandoned_runs | run_start / death / run_abandon 次数（已语义去重） |
| replay | 至少两次 run_start 的会话 ÷ 开玩会话 |
| runs_per_started_session/visitor | 局数 ÷ 开玩会话/匿名访客 |
| milestones[30/60/120] | 有开始且达标的去重局 ÷ 所有开始局；含未结束局，因此是观测下界，不是完成局通过率 |
| death_causes / score_distribution | 已观测 death 的原因与成绩区间，分母 completed_runs；不包含未完成、关闭或重开局 |
| share_intent_rate | 点击系统分享的会话 ÷ 开玩会话；PNG 下载和复制单独看 actions |
| referral_sessions | 当前来源有 ref 的会话；匹配数只在当前查询窗口的已观测发送事件中查找 |
| sources / dimensions | 当前来源组及版本/平台/语言/输入类型对应的会话、开玩会话等 |

在飞行中开启统计可能只捕获该局后续事件、没有 run_start，此局不进入开玩分母，但死亡会成为已观测死亡；建议研究完整局时从导出筛选有 run_start 的 run_id。首次来源保存在导出中，可与 current 对照；无充分证据不报告真实跨日回访率。

导出是**事件发生时间**范围，而非会话开始队列，含原始字段与服务接收时间；窗口边界的条数不必与汇总完全一致。NDJSON 无损；CSV 中 JSON 字段需解码，所有字段转义并防电子表格公式注入。一次最多 20 万条，超出改用较短时间段。
