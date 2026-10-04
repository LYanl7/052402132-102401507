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
TRUSTED_PROXIES=127.0.0.1,::1
CHAT_TTL_DAYS=7
NEXT_PUBLIC_BAIDU_MAP_AK=你的百度地图浏览器AK
```

`DATA_DIR` 支持绝对路径，也支持相对于 `apps/web` 的路径；默认 `../../data` 即项目根目录下的 data。Windows 可使用 `DATA_DIR=D:/mayoimono-data`。修改服务端配置后重启；私聊默认根据 HTTPS 页面自动使用同源 `wss://<域名>/ws`。若有专门的 WebSocket 域名，可设置可选 `NEXT_PUBLIC_WS_URL` 并重新构建。

百度地图 AK 需为浏览器应用并开启 JavaScript API 服务，将实际访问域名加入 Referer 白名单。本地开发允许 localhost / 127.0.0.1；修改 `NEXT_PUBLIC_BAIDU_MAP_AK` 后重启开发服务，生产环境需重新构建。浏览器设备定位需要 HTTPS 或 localhost，普通 HTTP 局域网访问仍可用地图手动选点。应用被禁用、配额不足或网络失败时地图提供提示和重试，Post 列表接口独立于百度服务运行。

运行 `npm run build` 与 `npm start`，用操作系统服务或进程管理器保持这个进程运行。反向代理全部请求到 3000 端口，WebSocket 保留 Upgrade。Nginx 的 HTTPS server 内加入：

```nginx
client_max_body_size 6m;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
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

`TRUSTED_PROXIES` 是逗号分隔的可信代理 IP 地址，支持 IPv4、IPv6 精确地址，不支持网段或主机名；默认留空，直接访问时忽略转发头。上面的单层 Nginx 配置用 `$remote_addr` 覆盖客户端传入的 `X-Forwarded-For`，应用只信任来自配置内代理的转发信息，因此不同客户端不再共享代理 IP 的限流额度。不要将普通客户端地址加入可信代理列表。若代理不在本机，将其实际连接应用的地址填入配置，并限制应用端口仅供代理访问。

多层代理时，每层需正确覆盖或追加其实际来源地址，并配置所有可信代理的精确地址。应用从直接连接的代理开始，由右向左检查转发链，遇到首个非可信代理地址即停止；缺失或无效转发头退回按直接连接地址限流。IPv4 和对应的 IPv4-mapped IPv6 地址使用同一个限流标识。修改配置后重启服务。

## 备份和恢复

服务端默认按行输出 JSON 日志，使用 `LOG_LEVEL` 控制级别，由进程管理器保存和轮转。按接口响应的 `X-Request-Id` 可关联请求耗时、业务事件及错误。详见 [日志说明](logging.md)。

停止服务后备份整个 DATA_DIR，包含 SQLite、可能存在的 WAL/SHM 文件和 uploads。恢复时同样先停止服务，再恢复整个目录并检查文件权限。不要只复制运行中的 SQLite 主文件，否则可能漏掉 WAL 中已提交的数据。

重构沿用原有 `data/mayoimon.sqlite`、表结构、会话和上传文件，无需重新建库。首次启动自动建表，账号和信息通过页面创建。迁移版本记录在 schema_migrations，未来升级通过新增版本迁移保留数据。

`data`、`.env.local`、node_modules 和构建缓存被 Git 忽略，部署时使用 `npm ci` 从锁文件安装。首次运行使用空数据库，账号与 Post 由用户通过页面创建，不预置演示账号或发布。

## 聊天记录保留策略

服务器消息默认保留 7 天，可用 CHAT_TTL_DAYS 配置。启动时和每分钟清理过期消息及其接收、已读记录；清理前查询也会过滤到期项。配置影响新接收消息的到期时间，既有消息沿用已经写入的 expires_at。v1 升级消息按原创建时间加 7 天迁移，过期消息会在服务启动时清理。升级前可按上述流程备份，升级后刷新浏览器使用新协议。

客户端 IndexedDB 按账号保存完整已接收消息和发送队列，不跟随服务端 TTL 删除。本机数据库备份不包含浏览器聊天历史；浏览器站点数据被清理或换设备后，服务端只能补发尚未过期的消息。旧服务端备份中的消息仍受原到期时间限制，恢复启动会清理过期项。
