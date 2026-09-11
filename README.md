# @mmverick123/lowcode

实际发布包为 `@mmverick123/lowcode`，公共入口为 `@mmverick123/lowcode/contract`、`renderer`、`designer`。消费端为保持现有源码 import，使用 alias `@exam/lowcode` 指向该包。

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

首次发布前需要确认 GitHub 用户 `mmverick123` 对仓库有写权限，并创建带 `write:packages` 的 GitHub PAT。通过用户级 npm 配置使用 `https://npm.pkg.github.com/`；不得把 token 写入仓库。`pnpm pack:local` 仅用于发布内容预检。

发布成功后，消费项目使用 `pnpm add @exam/lowcode@npm:@mmverick123/lowcode@0.1.0 --save-exact` 从 GitHub Packages 安装。升级必须先发布新版本，再显式更新消费端版本和 lockfile。
