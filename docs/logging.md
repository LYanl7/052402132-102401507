# 日志使用与排障

服务端与测试统一使用 `apps/web/src/modules/infrastructure/logger.ts`。日志按行输出 JSON，包含 UTC 时间 `timestamp`、级别 `level`、模块 `scope` 和固定事件名 `event`，可由进程管理器收集与轮转。`debug` / `info` 输出到标准输出，`warn` / `error` 输出到标准错误；Node 测试 reporter 将结构化事件与原有测试输出一起输出。

## 配置

在 `apps/web/.env.local` 设置 `LOG_LEVEL=info`（默认）。可选 `debug`、`info`、`warn`、`error`、`silent`，仅输出该级别及更严重的日志；无效值回退为 `info`。业务 Logger 在实际写入时读取配置，因此入口加载环境变量前创建 Logger 也能使用最终配置。修改服务配置后重启服务。

测试进程不加载应用的 `.env.local`，使用 shell 环境变量：

```powershell
$env:LOG_LEVEL = 'debug'
npm test
npm run test:e2e
$env:LOG_LEVEL = $null
```

常规维护使用 `info`；排查聊天投递、ACK、重试与浏览记录时使用 `debug`。封装不自行创建日志文件；长期部署通过服务管理工具保存日志，并配置保留时间和文件轮转。Next.js、Node 和测试框架自身的输出仍保留原格式。

## 新增业务日志

```ts
import { createLogger } from '../infrastructure/logger.ts';

const log = createLogger('message');
// 数据写入成功后记录，只传排障需要的标识和状态。
log.info('post.completed', { postId: post.id });
// 异常对象保留 name、message、stack、cause 和 code。
log.error('operation.failed', { error });
// 子 Logger 绑定整个任务都会使用的标识。
const taskLog = log.child({ taskId });
taskLog.debug('task.started');
```

事件名使用固定字符串，动态数据放在字段中。HTTP `endpoint` 自动记录请求方法、路径（不包含查询参数）、状态、耗时及已认证用户 ID；4xx 使用 `warn`，5xx 使用 `error`，其他响应使用 `info`。非预期异常保留堆栈，客户端仍只收到通用错误消息。

每个接口响应返回 `X-Request-Id`。自定义服务器为请求生成编号，封装使用进程共享的 `AsyncLocalStorage` 将编号传入业务日志；直接调用 Route Handler 的测试同样会生成编号。并发请求相互隔离，绑定的 `userId` 只在对应业务调用中生效。可按请求编号查询 `http.completed` 和对应的业务事件，失败请求日志不包含请求体或验证输入。

现有事件覆盖用户注册/登录/退出/资料更新、信息创建/更新/完成/删除、收藏/历史/上传、会话建立/消息接收/幂等去重、WebSocket 连接/拒绝/关闭/投递/ACK/重试、过期消息清理、数据库迁移/开关和服务启动/关闭。查询由 HTTP 完成日志覆盖；高频投递、ACK 和浏览事件使用 `debug`。

## 隐私与可靠性

不传整个请求、响应、业务输入或用户对象。封装递归脱敏密码、token、secret、cookie、Authorization、sessionHash、API key、凭证等字段，以及 email、content、body、payload、headers、query、contact，输出 `[REDACTED]`。聊天正文、邮箱、联系方式、上传原始文件名及检索词不由业务日志记录。

脱敏依据字段名，无法识别任意字符串中的秘密；尤其不要将凭证、聊天正文或用户输入拼入事件名、错误消息或堆栈。错误日志和测试失败详情可能包含自由文本，收集系统应按内部诊断数据管理。

循环引用、BigInt 和异常 cause 可序列化；不调用字段对象的自定义 `toJSON`。输出目标抛错或字段读取失败会丢弃该条日志，避免日志失败改变已经提交的业务结果。

## 测试日志

`npm test` 使用 Node 自定义 reporter，在原有可读结果之外记录 `test.started`、`test.passed`、`test.failed`、`test.skipped`、`test.todo` 与 `test.finished`。包含用例名、文件位置、耗时，失败时包含异常和原因，保留原有失败退出码。

`npm run test:e2e` 使用附加 Playwright reporter，记录运行总数、用例 ID/名称、重试次数、实际结果、耗时及失败详情。套件自身异常使用 `test.runner_failed`。已有测试产物清理策略保持原样，日志输出可由 CI 或终端保存。

`logger.test.ts` 和 `http-logging.test.ts` 验证级别过滤、配置、脱敏、异常序列化、并发隔离、输出失败保护，以及真实 HTTP 封装的响应/日志关联。
