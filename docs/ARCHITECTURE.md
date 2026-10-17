# 工程目录与依赖约束

项目保留三个可独立安装、验证和发布的工程，避免把服务、应用与共享包合并成一个隐式耦合的 `src`。

## `packages/lowcode`

- `src/contract`：纯 TypeScript 契约、校验与 Patch 规则，不依赖 React。
- `src/renderer/{model,security,components}`：渲染模型、安全出口和 UI 组件；`components/widgets` 中 10 种注册组件各占一个源文件，共用逻辑只能下沉到 `components/shared`。
- `src/designer/{state,components}`：设计器状态与编辑 UI。
- 对外仍只暴露 `@exam/lowcode/contract`、`renderer`、`designer` 三个稳定入口。
- ESLint、`widget-layout:check` 与构建产物检查分别强制依赖方向、单组件单文件和产物边界。

## `services/agent`

- `src/contracts`：契约版本适配与模型工具 schema。
- `src/providers`：Provider 端口、离线实现和 Anthropic 实现。
- `src/application`：状态机用例编排。
- `src/session`：进程内会话基础设施。
- `src/transport/{http,cli}`：HTTP 与 CLI 两个适配入口。
- `src/index.ts`：库使用方的唯一公共 barrel，不承载启动副作用。

依赖方向：`contracts ← providers ← application ← transport`；`session` 只被 transport 使用。`architecture:check` 阻止低层反向依赖高层。

## `apps/platform`

- `src/backend/domain`：题型领域存储与业务规则。
- `src/backend/http/{middleware,routes}`：鉴权、错误处理和按资源拆分的路由。
- `src/backend/config`：运行时配置。
- `src/backend/main.ts`：服务端 composition root。
- `src/frontend/{app,pages,services,styles}`：前端启动、页面、API 和样式。

前端禁止导入后端源码，domain/config 禁止反向依赖 HTTP 或前端；约束由 `architecture:check` 自动检查。
