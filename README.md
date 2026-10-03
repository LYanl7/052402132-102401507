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

访问 **http://localhost:3000**。页面、API、图片和 WebSocket 共用 3000 端口。无需云数据库、Redis、对象存储或账号密钥。

首次启动自动创建空数据库，可自行注册账号和发布信息。核对实时私聊时，用两个浏览器会话分别注册并登录两个账号。已有数据库会继续使用。

## 已实现功能

| 功能        | 实现                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| 用户        | 注册、登录、退出、七天会话、昵称及简介修改                                             |
| 首页 / 搜索 | 寻物/招领分类，名称/描述/地点关键词，类别、发布时间、排序和分页                        |
| 发布与管理  | 寻物/招领发布，最多 9 张图片，每张 5 MB，草稿，编辑，删除，标记找回/领回               |
| 详情与互动  | 图片查看、收藏/取消收藏、浏览次数、个人浏览历史及清空                                  |
| 附近        | 校园示意地图、坐标标记、距离排序、范围筛选、可选设备定位                               |
| 私聊        | 详情发起联系、双方实时消息、本地持久化、按设备确认重试、7 天服务端 TTL、最近 50 条对账 |
| 我的        | 浏览记录、收藏、我的发布、已完成记录、找回进展                                         |

访客可以浏览和搜索。发布、收藏、个人记录和私聊需要登录。草稿只对作者可见；编辑、删除和标记完成只允许作者操作。首页展示进行中的信息；完成的信息保留公开详情和搜索入口，停止发起新联系，已有会话保留。

附近页的底图和预置校园地点坐标来自示意数据，**不是实际校园导航地图**。距离按保存的经纬度计算；默认参考点是示例校园中心。允许定位后使用设备坐标查询。自定义地点没有坐标时不会进入附近结果，可在发布页补充经纬度。示意地图只显示位于示例校园边界内的标记，列表展示查询范围内的所有匹配项。

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
    src/server/
      runtime.ts            进程内共享数据库和实时推送上下文
      modules/
        user/               用户、密码和会话
        interaction/        收藏和浏览历史
        private-chat/       会话、消息、未读和 WebSocket
        message/            寻物/招领发布、查询、状态和距离
        infrastructure/     SQLite、迁移、上传、错误和请求处理
    test/                   Route Handler 业务与权限集成测试
  packages/shared/          前后端共享类型、Zod 输入校验和地点数据
  tests/                    Playwright 浏览器流程测试
  data/                     本机数据库和上传图片（不入 Git）
  docs/                     架构、API、部署说明与页面截图
```

前后端按代码职责分离：浏览器组件通过 HTTP/WebSocket 使用服务端，不直接访问数据库。Next.js Route Handlers 调用五个业务模块，生产环境只运行一个 Node 进程。普通接口由 Next.js 处理，`server.ts` 负责启动服务并挂载 `/ws`，不另建后端框架。详见 [架构说明](docs/architecture.md)。

数据库表模型位于 `infrastructure/schema.ts`，各模块的 `repository.ts` 使用 Drizzle 封装读写，`handlers.ts` / `service.ts` 保留业务逻辑。SQLite 驱动采用 `better-sqlite3`，现有数据库和 v1 迁移记录可继续使用。

## 构建与验证

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

浏览器测试还验证本地存储失败不 ACK、超过 50 条离线积压、最近消息对账、刷新后的发送队列和多标签页序号分配。浏览器测试在 3001 启动一个独立 Next.js 服务，使用 `data/e2e/` 数据库，验证发布—搜索—收藏—联系—两账号实时聊天—编辑—完成及草稿照片流程。请保持 3001 端口空闲。生成的页面截图位于 `docs/screenshots/`，失败时保留 trace 与截图。

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
