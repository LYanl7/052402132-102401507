# 单机部署

运行一个 Next.js 服务进程，页面、API、图片和 WebSocket 共用 3000 端口。本地 SQLite 和 uploads 目录持久化数据。要求 Node.js 22.16 或更高版本，npm 11。

数据库使用 Drizzle ORM 和 `better-sqlite3`。部署时在目标操作系统运行 `npm ci` 安装对应的原生驱动，不跨系统复制 `node_modules`。Next.js 将该驱动和 ORM 作为服务端外部依赖加载。

## 本地或局域网演示

```powershell
cd D:\mayoimono
npm ci
npm run build
npm start
```

访问 http://localhost:3000。将 `apps/web/.env.example` 复制为 `.env.local` 后修改配置。局域网访问设置 `HOST=0.0.0.0`、`FRONTEND_ORIGIN=http://<服务器IP>:3000`，多个来源用逗号分隔。页面、REST、图片和 WebSocket 都使用浏览器当前主机和端口。

`npm run dev` 支持页面热更新和服务端代码重启。`npm start` 使用生产构建和编译后的入口，不依赖 tsx。请通过项目脚本启动，以挂载实时私聊连接。

## HTTPS 域名部署

`apps/web/.env.local` 示例：

```dotenv
HOST=127.0.0.1
PORT=3000
FRONTEND_ORIGIN=https://lost.example.com
COOKIE_SECURE=true
DATA_DIR=/srv/mayoimon-data
```

`DATA_DIR` 支持绝对路径，也支持相对于 `apps/web` 的路径；默认 `../../data` 即项目根目录下的 data。Windows 可使用 `DATA_DIR=D:/mayoimono-data`。修改服务端配置后重启；私聊默认根据 HTTPS 页面自动使用同源 `wss://<域名>/ws`。若有专门的 WebSocket 域名，可设置可选 `NEXT_PUBLIC_WS_URL` 并重新构建。

运行 `npm run build` 与 `npm start`，用操作系统服务或进程管理器保持这个进程运行。反向代理全部请求到 3000 端口，WebSocket 保留 Upgrade。Nginx 的 HTTPS server 内加入：

```nginx
client_max_body_size 6m;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location = /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}
```

用实际域名替换 lost.example.com，并配置数据目录写权限。HTTPS 证书和进程管理由服务器环境配置，此模板未在外部服务器部署。本项目采用自定义 Node 服务，不使用 Next.js standalone 输出或无状态 Serverless 部署。

## 备份和恢复

停止服务后备份整个 DATA_DIR，包含 SQLite、可能存在的 WAL/SHM 文件和 uploads。恢复时同样先停止服务，再恢复整个目录并检查文件权限。不要只复制运行中的 SQLite 主文件，否则可能漏掉 WAL 中已提交的数据。

重构沿用原有 `data/mayoimon.sqlite`、表结构、会话和上传文件，无需重新建库。首次启动自动建表，账号和信息通过页面创建。迁移版本记录在 schema_migrations，未来升级通过新增版本迁移保留数据。

`data`、`.env.local`、node_modules 和构建缓存被 Git 忽略，部署时使用 `npm ci` 从锁文件安装。生产环境从空数据库注册真实用户，公开演示账号仅用于本地演示。
