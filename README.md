# @exam/lowcode

公共入口为 `@exam/lowcode/contract`、`@exam/lowcode/renderer`、`@exam/lowcode/designer`。契约注册表是组件 schema、默认值、校验器、Designer 属性面板与 Agent 工具定义的单一数据源；生成的 `contract/widgets.json`、`schema.json`、`version.json` 随 npm 包分发。

本包按标准 npm registry 流程发布，不再把相邻源码目录、`file:` tarball 或 `pnpm link` 作为消费端依赖。`prepublishOnly` 会在发布前执行完整 `verify`，发布内容由 `files` 白名单限制为构建产物、契约 JSON 与 README。

智能题型编排平台的低码组件包。当前完成 Step 1：契约层、生成产物、校验器、投影与归一化。

## 子路径入口

- `@exam/lowcode/contract`：registry、类型、校验器、投影和归一化函数。
- `@exam/lowcode/renderer`：Step 2 实现。
- `@exam/lowcode/designer`：Step 3 实现。

## 本地命令

```bash
pnpm verify
pnpm release:npm
```

`verify` 依次执行 lint、类型检查、契约生成、测试、契约快照检查、三入口构建和产物边界检查。契约有意变更时，应先判断 semver 影响，再运行 `pnpm contract:snapshot:update` 更新基线。

首次发布前需要在阿里云云效 Packages 创建 npm 制品仓库，并确认账号拥有 `@exam` scope 和写权限。通过 `ALIYUN_NPM_REGISTRY_URL` 指定仓库地址、`ALIYUN_NPM_TOKEN` 注入凭据；不得把 token 写入仓库。`pnpm pack:local` 仅用于发布内容预检，不是消费端安装方式。

发布成功后，消费项目使用 `pnpm add @exam/lowcode@0.1.0 --save-exact`（或等价的 `npm install --save-exact`）从 registry 安装。升级必须先发布新版本，再显式更新消费端版本和 lockfile。
