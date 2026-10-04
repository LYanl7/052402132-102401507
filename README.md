# Mayoimon · 校园失物招领

根据 [Penpot 产品原型](https://design.penpot.app/#/view?file-id=24d9d841-759d-81bc-8008-b3847703e8ed&page-id=24d9d841-759d-81bc-8008-b3847703e8ee&section=interactions&index=0&share-id=763608af-2154-449d-a9b8-8dc781e8335a) 实现的移动端 Web 应用。采用 **Next.js 全栈应用 + TypeScript + Drizzle ORM + SQLite 本地数据库**，面向单机部署。

首页保留原型的双列卡片、顶部首页/寻物/招领切换、五栏导航与黄色发布按钮；物品插画以 SVG 实现。浏览器页面不模拟手机信号、时间或用户在线状态。

## 快速启动

要求 Node.js **22.16 或更高版本**，npm 11。Windows PowerShell：

```powershell
cd D:\mayoimono
npm install
npm run dev
```

访问 **http://localhost:3000**。页面、API、图片和 WebSocket 共用 3000 端口。无需云数据库、Redis或对象存储；真实地图需要配置百度地图浏览器 AK。

首次启动自动创建空数据库，可自行注册账号和发布信息。核对实时私聊时，用两个浏览器会话分别注册并登录两个账号。已有数据库会继续使用。

## 已实现功能

| 功能        | 实现                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| 用户        | 注册、登录、退出、七天会话、昵称及简介修改                                             |
| 首页 / 搜索 | 寻物/招领分类，名称/描述/地点关键词，类别、发布时间、排序和分页                        |
| 发布与管理  | 寻物/招领发布，最多 9 张图片，每张 5 MB，草稿，编辑，删除，标记找回/领回               |
| 详情与互动  | 图片查看、收藏/取消收藏、浏览次数、个人浏览历史及清空                                  |
| 附近        | 百度真实地图、Post 标记、距离排序、范围筛选、设备定位和拖动地图搜索周边                |
| 私聊        | 详情发起联系、双方实时消息、本地持久化、按设备确认重试、7 天服务端 TTL、最近 50 条对账 |
| 我的        | 浏览记录、收藏、我的发布、已完成记录、找回进展                                         |

访客可以浏览和搜索。发布、收藏、个人记录和私聊需要登录。草稿只对作者可见；编辑、删除和标记完成只允许作者操作。首页展示进行中的信息；完成的信息保留公开详情和搜索入口，停止发起新联系，已有会话保留。

附近页接入百度地图 JSAPI 4.0，默认浏览位置沿用原示例中心，**不代表设备当前位置**。点击定位按钮后使用设备位置，或拖动地图并点击“搜索此区域”；支持 500 米、1.5 / 3 / 5 公里范围和寻物 / 招领筛选，地图标记可打开 Post 详情，列表按直线距离排序。仅展示进行中且设置了百度地图位置的信息。地图服务失败时提供重试，已有查询列表仍可浏览。

发布 / 编辑页展开“地图位置”，可按城市和地址搜索、点击地图选点、使用设备定位，或手动填写 BD-09 经纬度。填写校园地点名称不会再自动套用示例坐标。地图和新 Post 统一使用 BD-09，设备 GPS 经百度官方接口转换。升级迁移保留旧 Post 和原坐标，将未确认坐标体系标为 legacy；旧 Post 仍可搜索和查看，重新选点并保存后才进入附近结果。

在 `apps/web/.env.local` 配置 `NEXT_PUBLIC_BAIDU_MAP_AK=你的浏览器AK`，在百度控制台开启 JavaScript API 并设置访问域名白名单；修改后重启开发服务，生产环境需重新构建。设备定位需要 HTTPS 或 localhost 安全环境。接入依据：[百度 JSAPI 加载文档](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concepts/load)、[坐标体系和转换](https://lbs.baidu.com/docs/jsapi?title=jsapi4/guide/concept/coord)。

原型中的“校园通知”未接入校方服务，不生成虚假的校方通知。物品归属核验和线下交接由双方完成。

## 项目结构

```text
mayoimono/
  apps/web/                 Next.js 全栈应用
    server.ts               单个 Node 服务入口，挂载 Next.js 和 WebSocket
    src/app/                页面及布局
      api/                  Route Handlers：HTTP 接口入口
      uploads/[filename]/   图片读取接口
    src/components/         表单、导航、会话和通用 UI
    src/lib/                浏览器 HTTP 客户端
    src/server/runtime.ts   进程内共享数据库和实时推送上下文
    src/modules/            按业务模块组织，模型与逻辑在同一目录内分文件
      user/                 用户模型、表定义、校验、注册登录和会话
      interaction/          收藏与历史模型、表定义和仓储
      private-chat/         私聊模型、表定义、服务、本地存储和同步
      message/              发布模型、表定义、校验、查询和状态逻辑
      infrastructure/       数据库连接、迁移、上传、错误和请求处理
    test/                   Route Handler 业务与权限集成测试
  tests/                    Playwright 浏览器流程测试
  data/                     本机数据库和上传图片（不入 Git）
  docs/                     架构、API、部署说明与页面截图
```

前后端按代码职责分离：浏览器组件通过 HTTP/WebSocket 使用服务端，不直接访问数据库。Next.js Route Handlers 调用五个业务模块，生产环境只运行一个 Node 进程。普通接口由 Next.js 处理，`server.ts` 负责启动服务并挂载 `/ws`，不另建后端框架。详见 [架构说明](docs/architecture.md)。

各业务模块的 `models.ts` 定义数据类型、`schema.ts` 定义数据库表，旁边的 `repository.ts` 使用 Drizzle 封装读写，`handlers.ts` / `service.ts` 保留业务逻辑。SQLite 驱动采用 `better-sqlite3`，现有数据库和 v1 迁移记录可继续使用。

## 构建与验证

服务端和测试使用统一的结构化日志，默认 `LOG_LEVEL=info`。接口响应的 `X-Request-Id` 可用于关联业务操作和请求错误。配置、事件及扩展方式见 [日志说明](docs/logging.md)。

```powershell
npm run check
npm test
npm run build
npm start
```

`check` 检查前后端 TypeScript；`test` 检查浏览器 HTTP 客户端的异常处理，并使用临时 SQLite 测试权限、输入校验、草稿、查询、收藏、历史、聊天、WebSocket、未读、文件上传及数据重开，不修改应用数据库。

浏览器测试首次需要安装 Chromium：

```powershell
npx playwright install chromium
npm run test:e2e
```

浏览器测试还验证本地存储失败不 ACK、超过 50 条离线积压、最近消息对账、刷新后的发送队列和多标签页序号分配。浏览器测试在 3001 启动一个独立 Next.js 服务，使用 `data/e2e/` 数据库，验证发布—搜索—收藏—联系—两账号实时聊天—编辑—完成及草稿照片流程。请保持 3001 端口空闲。测试仅在终端报告结果，关闭 trace、截图和视频，结束时清理 `test-results/`（包括最后运行记录）。需要页面预览图时单独运行 `preview:screenshots`。

已构建后可用生产服务跑同一套测试：

```powershell
$env:E2E_PRODUCTION = 'true'
npm run test:e2e
$env:E2E_PRODUCTION = $null
```

## 单机部署与数据

默认 SQLite 文件：`data/mayoimon.sqlite`，图片：`data/uploads/`。重启不会丢失数据，首次运行自动执行版本化建表迁移。SQLite 启用外键、WAL 和忙等待。旧数据库兼容测试使用的 Node 22 `node:sqlite` 会显示实验特性提示；运行时使用 better-sqlite3。

配置模板：`apps/web/.env.example`，复制为 `apps/web/.env.local` 后修改。`FRONTEND_ORIGIN` 可设置逗号分隔的前端来源，默认允许 localhost 和 127.0.0.1 的 3000 端口。

生产运行用 `npm run build` 后执行 `npm start`。页面、API 和 WebSocket 在同一 Node 进程中运行，数据库和上传目录使用本地磁盘。HTTPS、WebSocket 反向代理及备份说明见 [单机部署](docs/deployment.md)。

聊天记录和待发送队列按账号保存在当前浏览器的 IndexedDB 中，刷新不丢失；服务端默认只保留 7 天（`CHAT_TTL_DAYS=7`）用于重试和补拉。清除浏览器站点数据后，已过期记录无法恢复。升级会自动应用 v2 数据库迁移，旧消息按原创建时间计算有效期；客户端需刷新以使用新协议。

API 路由和协议见 [API 说明](docs/api.md)。

检查地图前端界面可执行 `npm run build` 后运行 `npm run preview:maps`。脚本自动启动独立的生产预览服务，使用空数据库和真实百度 SDK 截取附近、寻物 / 招领筛选、320 px 小屏、桌面及发布地图选点页面，同时更新首页、搜索、消息和我的发布的空状态截图。不创建演示 Post，不预填物品表单；图片和地图加载状态报告保存到 `docs/screenshots/`，结束后停止服务并删除临时预览数据库及登录账号。不会使用原校园示意图或替换百度地图响应；地图不可用时截图会呈现实际失败状态。
