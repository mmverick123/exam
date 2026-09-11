# 快速启动与三项目联调

Monorepo 包含 `packages/lowcode`（npm 包）、`services/agent`（默认端口 3001）和 `apps/platform`（API 3000、Web 5173）。实际发布包为 `@mmverick123/lowcode`；Agent 和 Platform 通过 npm alias 从 GitHub Packages 安装它，源码 import 仍使用 `@exam/lowcode`。

## 1. 首次安装

需要 Node.js 22+、Corepack 和 pnpm。若终端找不到 `pnpm`，先执行：

```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

首次在仓库根目录统一安装依赖：

```powershell
cd C:\Users\aihack\Desktop\秋招\项目\exam-monorepo
pnpm install
```

## 2. 本机运行时配置

非敏感默认值已经提交在各工程的 `.env.defaults` 中。token、API key 和私有网关地址只写入本机的 `.env.local`；该文件已被 Git 忽略，不要提交。

首次配置时复制模板：

```powershell
cd C:\Users\aihack\Desktop\秋招\项目\exam-monorepo
Copy-Item services\agent\.env.local.example services\agent\.env.local
Copy-Item apps\platform\.env.local.example apps\platform\.env.local
```

如果目标文件已经存在，不需要再次复制。配置优先级为：启动命令所在进程已有的环境变量 > `.env.local` > `.env.defaults`。

Agent 的 `services/agent/.env.local`：

```dotenv
AGENT_SERVICE_TOKEN=replace-with-a-local-service-token
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
EVAL_PROVIDER=deterministic
EVAL_ANTHROPIC_API_KEY=
```

- 不填写 `ANTHROPIC_API_KEY` 时使用离线 `DeterministicProvider`。
- 使用 Anthropic 或兼容网关时填写 `ANTHROPIC_API_KEY`；网关地址填入 `ANTHROPIC_BASE_URL`。
- 真实 Eval 使用独立的 `EVAL_ANTHROPIC_API_KEY`，不要复用线上 key，并把 `EVAL_PROVIDER` 改为 `anthropic`。

Platform 的 `apps/platform/.env.local`：

```dotenv
EXAM_PLATFORM_TOKEN=replace-with-a-local-platform-token
VITE_EXAM_PLATFORM_TOKEN=replace-with-the-same-local-platform-token
AGENT_SERVICE_TOKEN=replace-with-the-agent-service-token
```

必须保证：

- `EXAM_PLATFORM_TOKEN` 与 `VITE_EXAM_PLATFORM_TOKEN` 相同。
- Platform 的 `AGENT_SERVICE_TOKEN` 与 Agent 的 `AGENT_SERVICE_TOKEN` 相同。

`VITE_EXAM_PLATFORM_TOKEN` 会被 Vite 编译进浏览器代码，只适合作为本机演示鉴权，不能视为生产环境秘密。生产部署应改用登录态、HttpOnly Cookie 或由服务端签发的短期凭据。

Agent 支持的主要配置：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `PORT` | `3001` | Agent HTTP 端口 |
| `AGENT_SERVICE_TOKEN` | 无 | Platform → Agent 服务凭证，本机文件必填 |
| `ANTHROPIC_API_KEY` | 无 | Claude key；留空使用确定性 provider |
| `ANTHROPIC_BASE_URL` | 官方地址 | Anthropic 兼容网关 URL |
| `AGENT_INTENT_MODEL` | `claude-haiku-4-5` | Intent 模型 |
| `AGENT_MODEL` | `claude-sonnet-5` | Plan / Generate / Repair 模型 |

Platform 的非敏感默认配置位于 `apps/platform/.env.defaults`：API 端口为 3000，Agent URL 为 `http://127.0.0.1:3001`。

## 3. 一条命令启动三项目

完成一次本机配置后，以后只需在项目根目录运行：

```powershell
cd C:\Users\aihack\Desktop\秋招\项目\exam-monorepo
pnpm dev
```

该命令同时启动 Agent、Platform API 和 Web，并为日志添加服务名前缀。打开 <http://127.0.0.1:5173/question-types>；按 `Ctrl+C` 会统一停止三个进程。

设计页输入“出一道关于光合作用的单选题，4 个选项”，应看到 `plan → patch → validation → done`。

如需单独调试，也可以分别运行（无需再设置 `$env:`）：

```powershell
cd services\agent
pnpm dev

cd ..\..\apps\platform
pnpm dev

# 另一个终端
cd C:\Users\aihack\Desktop\秋招\项目\exam-monorepo\apps\platform
pnpm dev:web
```

## 4. GitHub Packages 发布与安装

GitHub Packages 的 npm scope 必须与 GitHub 用户名或 Organization 匹配。当前仓库所有者为 `mmverick123`，因此包名是 `@mmverick123/lowcode`；消费端使用 npm alias 保留 `@exam/lowcode/...` import。

首次发布：

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)**。
2. 创建 token，至少授予 `write:packages`、`read:packages`；私有仓库还需 `repo`。
3. 在本机执行 `pnpm login --scope=@mmverick123 --auth-type=legacy --registry=https://npm.pkg.github.com`，密码处粘贴 token。凭据会存入用户级 npm 配置，不进入项目文件。
4. 在仓库根目录执行 `pnpm release:lowcode`。

只预检、不上传：

```powershell
pnpm --dir packages/lowcode publish --dry-run --no-git-checks
```

消费端安装已发布版本：

```powershell
pnpm --dir services/agent add @exam/lowcode@npm:@mmverick123/lowcode@0.1.0 --save-exact
pnpm --dir apps/platform add @exam/lowcode@npm:@mmverick123/lowcode@0.1.0 --save-exact
```

## 5. Compose 模式

Compose 使用独立的根目录 `.env.compose.local`，首次复制模板并填写 token/key：

```powershell
cd C:\Users\aihack\Desktop\秋招\项目\exam-monorepo
Copy-Item .env.compose.local.example .env.compose.local
docker compose --env-file .env.compose.local up --build
```

打开 <http://127.0.0.1:8088>。停止服务：

```powershell
docker compose down
```

## 6. 验证与 Eval

```powershell
pnpm verify
pnpm eval:smoke
```

真实 Eval 的 provider 和独立 key 写入 `services/agent/.env.local` 后，仍直接执行 `pnpm eval:smoke`，无需手工设置环境变量。

常见问题：Agent 报 key 缺失时检查 `services/agent/.env.local`；Platform 502 时检查 Agent 是否监听 3001；401 时检查两侧 service token 是否一致；页面 `/api` 失败时检查 Platform API 是否监听 3000。
