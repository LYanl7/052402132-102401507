# Mayoimono · 校园失物招领

根据 [Penpot 产品原型](https://design.penpot.app/#/view?file-id=24d9d841-759d-81bc-8008-b3847703e8ed&page-id=24d9d841-759d-81bc-8008-b3847703e8ee&section=interactions&index=0&share-id=763608af-2154-449d-a9b8-8dc781e8335a) 实现的移动端 Web 应用。采用 **Next.js 全栈应用 + TypeScript + Drizzle ORM + SQLite 本地数据库**，面向单机部署。

首页保留原型的双列卡片、顶部首页/寻物/招领切换、五栏导航与黄色发布按钮；物品插画以 SVG 实现。浏览器页面不模拟手机信号、时间或用户在线状态。

## 快速启动

要求 Node.js **22.16 或更高版本**，npm 11。Windows PowerShell：

```powershell
npm install
npm run dev
```

访问 **[http://localhost:3000](http://localhost:3000)**。真实地图需要配置百度地图浏览器端 AK。

首次启动自动创建空数据库，可自行注册账号和发布信息。核对实时私聊时，用两个浏览器会话分别注册并登录两个账号。已有数据库会继续使用。

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
    src/modules/            按业务模块组织
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

各业务模块的 `models.ts` 定义数据类型、`schema.ts` 定义数据库表，旁边的 `repository.ts` 使用 Drizzle 封装读写，`handlers.ts` / `service.ts` 保留业务逻辑。

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

浏览器测试还验证本地存储失败不 ACK、超过 50 条离线积压、最近消息对账、刷新后的发送队列和多标签页序号分配。浏览器测试在 3001 启动一个独立 Next.js 服务，使用 `data/e2e/` 数据库，验证发布—搜索—收藏—联系—两账号实时聊天—编辑—完成及草稿照片流程。请保持 3001 端口空闲。测试仅在终端报告结果，关闭 trace、截图和视频，结束时清理 `test-results/`（包括最后运行记录）。
