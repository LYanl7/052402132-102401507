# API 与 WebSocket

开发 API 基址：`http://127.0.0.1:3000`。浏览器通过前端同源 `/api` 使用 API。JSON 请求使用 `Content-Type: application/json`，图片上传使用 multipart/form-data。带 `*` 的路由要求登录 Cookie。

错误格式：`{"error":{"message":"请先登录"}}`。状态码：400 校验失败，401 未登录，403 无权或来源错误，404 不存在/不可见，409 状态冲突，413 上传超限，429 频率超限。Zod 校验错误附带 `issues`。

## 用户

| 方法   | 路径                  | 请求 / 返回                                      |
| ------ | --------------------- | ------------------------------------------------ |
| POST   | `/api/users/register` | `{email,password,name}` → `{user}` 和会话 Cookie |
| POST   | `/api/users/login`    | `{email,password}` → `{user}` 和会话 Cookie      |
| GET    | `/api/users/me`       | `{user}`，访客为 null                            |
| PATCH* | `/api/users/me`       | `{name,bio}` → `{user}`                          |
| POST   | `/api/users/logout`   | 撤销当前会话 → `{ok:true}`                       |

## 寻物与招领

| 方法    | 路径                      | 请求 / 返回                                                                    |
| ------- | ------------------------- | ------------------------------------------------------------------------------ |
| GET     | `/api/posts`              | q/type/status/category/days/sort/page/pageSize → `{items,total,page,pageSize}` |
| GET     | `/api/posts/nearby`       | lat/lng/radius/type → `{items,total}`，distance 单位为米                       |
| GET*    | `/api/posts/mine`         | status=active/completed/draft → `{items}`                                      |
| GET     | `/api/posts/:id`          | `{post}`，草稿仅作者可读                                                       |
| POST*   | `/api/posts`              | PostInput → `{post}`                                                           |
| PUT*    | `/api/posts/:id`          | 完整 PostInput → `{post}`，仅作者                                              |
| POST*   | `/api/posts/:id/complete` | 标记完成 → `{post}`，仅作者                                                    |
| DELETE* | `/api/posts/:id`          | 软删除 → `{ok:true}`，仅作者                                                   |
| POST*   | `/api/uploads`            | 一个 file 字段 → `{path:"/uploads/<uuid>.png"}`                                |

PostInput 示例：

```json
{
  "type": "lost",
  "title": "银色钥匙串",
  "category": "keys",
  "location": "图书馆 · 2楼",
  "occurredAt": "2026-09-27T06:20:00.000Z",
  "description": "有蓝色挂件，约三把钥匙",
  "contact": "站内联系",
  "images": [],
  "lat": 26.0588,
  "lng": 119.1968,
  "status": "active"
}
```

`type` 为 lost/found，`category` 为 keys/electronics/umbrella/wallet/card/other。发生时间使用 ISO 8601 UTC；前端显示浏览器本地时间。`days` 根据发布时间过滤，`sort` 为 newest/oldest。分页默认每页 20 条，最多 50 条。附近半径默认为 1500 米，允许 50–50000 米。images 必须是本账号上传的路径，最多九张。

草稿 status=draft 允许名称、地点、描述、发生时间为空，公开发布需补齐。经纬度同时填写或同时为 null。发布返回 Post，追加作者、favorite、浏览次数、创建和更新时间。

## 收藏与浏览

| 方法    | 路径                               | 返回                                          |
| ------- | ---------------------------------- | --------------------------------------------- |
| POST    | `/api/interactions/posts/:id/view` | 浏览数 +1，登录用户更新历史 → `{ok:true}`     |
| PUT*    | `/api/interactions/favorites/:id`  | 幂等收藏 → `{favorite:true}`                  |
| DELETE* | `/api/interactions/favorites/:id`  | 取消收藏 → `{favorite:false}`                 |
| GET*    | `/api/interactions/favorites`      | `{items}`                                     |
| GET*    | `/api/interactions/history`        | `{items}`                                     |
| DELETE* | `/api/interactions/history`        | 清空个人历史 → `{ok:true}`                    |
| GET*    | `/api/interactions/stats`          | `{history,favorites,active,completed,drafts}` |

读取详情不自动增加浏览数，客户端进入页面时显式调用 view，避免后台刷新重复计数。

## 私聊

服务端只保留 TTL 内的消息（默认 7 天）；客户端 IndexedDB 保存完整的已接收记录和待发送队列，服务器过期不会删除本地记录。

| 方法  | 路径                                | 请求 / 返回                                                                           |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| GET*  | `/api/chats`                        | `{items}`：会话元数据，服务端摘要及未读仅覆盖未过期消息                               |
| POST* | `/api/chats`                        | `{postId}` → `{conversation}`，相同双方及发布复用                                     |
| POST* | `/api/chats/:id/messages`           | `{content,deviceId,seqId,queuedAt}` → `{message}`                                     |
| GET*  | `/api/chats/delivery?deviceId=UUID` | `{items,ttlMs}`，本设备未确认的消息，每批最多 50 条                                   |
| POST* | `/api/chats/delivery`               | `{deviceId,ids}` → `{ok:true}`，本地事务提交后确认接收，最多 100 个 ID                |
| GET*  | `/api/chats/:id/sync`               | `{ids,ttlMs}`：服务端最近 50 条未过期消息的 ID 清单                                   |
| POST* | `/api/chats/:id/sync`               | `{ids}` → `{items,unavailable}`，按缺失 ID 补拉，已过期或不存在的 ID 放入 unavailable |
| POST* | `/api/chats/:id/read`               | `{ids}` → `{ok:true}`，只标记客户端实际显示的消息，不隐式读取最新位置                 |
| POST* | `/api/chats/read-all`               | 本人当前未过期消息全部已读；前端同时更新本地未读状态                                  |
| GET*  | `/api/chats/:id/messages`           | 兼容的 TTL 内历史查询，limit/before → `{items,nextCursor}`；新客户端同步不依赖该游标  |

消息结构：`{id,conversationId,senderId,deviceId,seqId,content,createdAt,expiresAt}`。`id` 是服务端消息 UUID，`expiresAt` 是毫秒时间戳，`createdAt` 是服务端接收时间。`queuedAt` 为客户端将消息写入本地发送队列的 ISO 时间；消息长度 1–2000 字符。

`deviceId` 是浏览器按账号持久化的随机 UUID，`seqId` 是该设备在该会话内分配的正安全整数。完整幂等键为 `(conversationId,senderId,deviceId,seqId)`。分配序号与写入本地队列处于同一个 IndexedDB 事务；多个标签页共用计数器和发送租约，按会话序号顺序提交。每条新消息递增，重试保留原标识。客户端没有累计同步游标。

首次接收返回 201，同标识同内容重试返回原消息及 200，重用标识但修改内容返回 409。发送时间超过 TTL、已过期或低于已接收上界且不存在的序号返回 410；设备时间明显超前返回 400。服务端保留每个会话/发送设备的一个最大已接收序号，避免 TTL 删除正文后旧重试重新生成消息；该记录不包含消息内容。外部客户端同样需要按会话有序发送，不能先提交较大序号再提交未接收过的较小序号。

所有聊天 HTTP 接口检查身份和成员权限。浏览器额外携带 `X-Chat-User-Id` 标识当前本地账号；如与 Cookie 身份不符则返回 401，防止切换账号时旧发送队列串号。ACK 只影响当前用户指定设备能够访问的消息；接收确认与已读分别存储。

WebSocket 地址：`ws://localhost:3000/ws?deviceId=UUID`，需带登录 Cookie 和允许的 Origin：

- 建立连接：`{"type":"ready","ttlMs":604800000}`。
- 投递消息：`{"type":"message","message":ChatMessage}`。
- 客户端本地持久化成功后回复：`{"type":"ack","ids":["消息UUID"]}`，每次最多 100 条。

服务端每秒检查未确认消息，按 1、2、4、8、16、30 秒间隔退避重试，之后最多每 30 秒重投一次。每批 50 条，确认后继续下一批，不限制总离线积压为 50 条。ACK 丢失可能导致重复投递，客户端按 ID 覆盖合并且保留本地已读状态。重连及服务重启后从数据库恢复未确认集合；新设备能接收 TTL 内全部消息。

WebSocket 不可用时，客户端每 5 秒用 HTTP 拉取未确认批次并 ACK；每轮最多处理 20 批，后续轮次继续处理。启动、重连、回到前台及周期检查时进行最近 50 条对账，按缺失 ID 补拉；清单与补拉之间过期的消息返回 unavailable，不会无限等待。所有本地存储写入失败均不发送 ACK。

服务端启动及每分钟清理过期正文、接收确认和已读记录；即使尚未清理，过期消息也不会被查询或投递。过期且未送达的消息不再恢复；客户端记录不会自动过期。清除站点数据或更换浏览器后只能恢复服务端 TTL 内的内容。本项目没有离线网页壳，断网冷启动仍需要页面资源已可用。

## 健康检查

`GET /api/health` → `{"ok":true}`。
