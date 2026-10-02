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

| 方法  | 路径                      | 请求 / 返回                                                |
| ----- | ------------------------- | ---------------------------------------------------------- |
| GET*  | `/api/chats`              | `{items}`，包含对方、关联发布、最后消息和 unread           |
| POST* | `/api/chats`              | `{postId}` → `{conversation}`，相同双方及发布复用          |
| GET*  | `/api/chats/:id/messages` | limit/before → `{items,nextCursor}`，items 按发送顺序排列  |
| POST* | `/api/chats/:id/messages` | `{content,clientId}` → `{message}`，clientId 是客户端 UUID |
| POST* | `/api/chats/:id/read`     | 当前历史全部已读 → `{ok:true}`                             |
| POST* | `/api/chats/read-all`     | 本人全部会话已读 → `{ok:true}`                             |

消息长度为 1–2000 字符。同 senderId/clientId 的重试返回原消息；修改内容或会话却复用 clientId 返回 409。历史默认最近 50 条，最多 100 条；nextCursor 非 null 时传入 before 读取更早的消息。会话、发送、历史和已读全部检查成员权限。

WebSocket 地址：`ws://localhost:3000/ws`。请求需带会话 Cookie 及允许的 Origin。连接建立收到 `{"type":"ready"}`，新消息收到 `{"type":"message","message":ChatMessage}`。WebSocket 为推送通道，发送指令走上述 HTTP 接口。断线重新读取历史，不依赖内存消息。

## 健康检查

`GET /api/health` → `{"ok":true}`。
