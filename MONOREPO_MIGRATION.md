# 三仓合并为 Monorepo 迁移教程

本文针对当前三个 GitHub 仓库：

- `mmverick123/exam-lowcode-lib`
- `mmverick123/exam-agent`
- `mmverick123/exam-platform`

目标是合并到一个新的 `mmverick123/exam` 仓库，同时保留原仓库提交历史，并继续让 Agent、Platform 从 GitHub Packages 下载 `@mmverick123/lowcode`，不直接引用相邻源码。

## 1. 目标目录

```text
exam/
├─ apps/
│  └─ platform/
├─ services/
│  └─ agent/
├─ packages/
│  └─ lowcode/
├─ acceptance/
├─ deploy/
├─ scripts/
├─ .dockerignore
├─ .env.compose.local.example
├─ .gitignore
├─ .npmrc
├─ compose.yaml
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
└─ README.md
```

工程职责不变：

```text
packages/lowcode  --发布-->  GitHub Packages
                                │
               npm install <----┼---- apps/platform
                                └---- services/agent
```

## 2. 迁移原则

1. 在一个新目录和新 GitHub 仓库中操作，不直接拆除当前三个仓库。
2. 使用 `git subtree` 导入代码，以保留三个项目的提交历史。
3. `apps/platform` 和 `services/agent` 继续声明：

   ```json
   "@exam/lowcode": "npm:@mmverick123/lowcode@0.1.0"
   ```

4. 根目录设置 `linkWorkspacePackages: false`，防止 pnpm 自动把消费端链接到 `packages/lowcode`。
5. `.env.local`、GitHub PAT、Anthropic key 不进入 Git。
6. 旧仓库在 Monorepo 验收完成后设为 archived，不删除。

## 3. 迁移前检查

当前三个仓库的改动应先全部提交并推送：

```powershell
cd C:\Users\aihack\Desktop\秋招\项目

git -C exam-lowcode-lib status --short
git -C exam-agent status --short
git -C exam-platform status --short

git -C exam-lowcode-lib fetch origin main
git -C exam-agent fetch origin main
git -C exam-platform fetch origin main
```

三个 `status --short` 都应没有输出。不要把以下文件加入提交：

```text
exam-agent/.env.local
exam-platform/.env.local
.env.compose.local
```

## 4. 创建空的 GitHub 仓库

在 GitHub 创建 `mmverick123/exam`：

- 不勾选 README、`.gitignore` 或 License。
- 默认分支使用 `main`。
- 仓库可见性根据项目需要选择。

本教程假定远端地址为：

```text
https://github.com/mmverick123/exam.git
```

## 5. 在新目录初始化 Monorepo

不要在当前 `项目` 目录直接执行 `git init`，否则会形成包含三个嵌套 `.git` 的仓库。请创建一个同级的新目录：

```powershell
cd C:\Users\aihack\Desktop\秋招
New-Item -ItemType Directory -Path exam-monorepo
cd exam-monorepo

git init -b main
git commit --allow-empty -m "chore: initialize monorepo"
git remote add origin https://github.com/mmverick123/exam.git
```

## 6. 导入三个仓库并保留历史

先导入 lowcode：

```powershell
git remote add lowcode https://github.com/mmverick123/exam-lowcode-lib.git
git fetch lowcode main
git subtree add --prefix=packages/lowcode lowcode main
```

再导入 Agent：

```powershell
git remote add agent https://github.com/mmverick123/exam-agent.git
git fetch agent main
git subtree add --prefix=services/agent agent main
```

最后导入 Platform：

```powershell
git remote add platform https://github.com/mmverick123/exam-platform.git
git fetch platform main
git subtree add --prefix=apps/platform platform main
```

导入完成后移除临时 remote；不会删除已经导入的历史：

```powershell
git remote remove lowcode
git remote remove agent
git remote remove platform
git remote -v
```

此时执行以下命令，应能看到三个旧仓库的历史：

```powershell
git log --oneline --all --graph --decorate
```

## 7. 纳入当前根目录编排文件

当前 `C:\Users\aihack\Desktop\秋招\项目` 根目录不是 Git 仓库，其中的联调、部署和验收文件需要复制到新 Monorepo：

```powershell
$sourceRoot = 'C:\Users\aihack\Desktop\秋招\项目'
$targetRoot = 'C:\Users\aihack\Desktop\秋招\exam-monorepo'

Copy-Item "$sourceRoot\acceptance" "$targetRoot\acceptance" -Recurse
Copy-Item "$sourceRoot\deploy" "$targetRoot\deploy" -Recurse
Copy-Item "$sourceRoot\scripts" "$targetRoot\scripts" -Recurse
Copy-Item "$sourceRoot\.dockerignore" "$targetRoot\.dockerignore"
Copy-Item "$sourceRoot\.env.compose.local.example" "$targetRoot\.env.compose.local.example"
Copy-Item "$sourceRoot\.gitignore" "$targetRoot\.gitignore"
Copy-Item "$sourceRoot\compose.yaml" "$targetRoot\compose.yaml"
Copy-Item "$sourceRoot\README.md" "$targetRoot\README.md"
Copy-Item "$sourceRoot\QUICKSTART.md" "$targetRoot\QUICKSTART.md"
Copy-Item "$sourceRoot\ARCHITECTURE.md" "$targetRoot\ARCHITECTURE.md"
Copy-Item "$sourceRoot\ACCEPTANCE.md" "$targetRoot\ACCEPTANCE.md"
Copy-Item "$sourceRoot\设计方案.md" "$targetRoot\设计方案.md"
```

不要复制根目录或子项目中的 `node_modules`、`.pnpm-store`、`dist`、`.env.local` 和 `.git`。

## 8. 建立统一 pnpm workspace

根目录新建 `pnpm-workspace.yaml`：

```yaml
packages:
  - apps/*
  - services/*
  - packages/*
  - acceptance

linkWorkspacePackages: false

allowBuilds:
  esbuild: true

onlyBuiltDependencies:
  - esbuild

minimumReleaseAgeExclude:
  - '@mmverick123/lowcode'
```

`linkWorkspacePackages: false` 是本项目的关键约束：即使本地存在 `packages/lowcode`，Agent 和 Platform 也必须通过 registry 安装已经发布的版本。

根目录 `.npmrc` 只保存非敏感 registry 映射：

```ini
@mmverick123:registry=https://npm.pkg.github.com/
shared-workspace-lockfile=true
link-workspace-packages=false
```

GitHub PAT 继续保存在用户级 npm 配置中，不要写进根目录 `.npmrc`。

删除三个子项目的 workspace 配置和 lockfile，只保留根目录一个 `pnpm-lock.yaml`：

```powershell
git rm packages/lowcode/pnpm-workspace.yaml
git rm services/agent/pnpm-workspace.yaml
git rm apps/platform/pnpm-workspace.yaml

git rm packages/lowcode/pnpm-lock.yaml
git rm services/agent/pnpm-lock.yaml
git rm apps/platform/pnpm-lock.yaml
```

三个子项目的 `.npmrc` 内容已经收口到根目录，也可以删除重复文件：

```powershell
git rm packages/lowcode/.npmrc
git rm services/agent/.npmrc
git rm apps/platform/.npmrc
```

`acceptance/pnpm-lock.yaml` 是从当前非 Git 根目录复制来的未跟踪文件，直接删除：

```powershell
Remove-Item -LiteralPath acceptance\pnpm-lock.yaml
```

然后从根目录重新安装：

```powershell
pnpm install
```

检查实际安装来源：

```powershell
pnpm --filter exam-agent why @exam/lowcode
pnpm --filter exam-platform why @exam/lowcode
```

输出应指向 `npm:@mmverick123/lowcode@0.1.0` 或 GitHub Packages 下载地址，而不是 `link:../../packages/lowcode`。

## 9. 根目录 package.json

使用下面的根目录 `package.json`：

```json
{
  "name": "exam-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.19.0",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "verify": "pnpm verify:lowcode && pnpm verify:agent && pnpm verify:platform",
    "verify:lowcode": "pnpm --dir packages/lowcode verify",
    "verify:agent": "pnpm --dir services/agent verify",
    "verify:platform": "pnpm --dir apps/platform verify",
    "eval:smoke": "pnpm --dir services/agent eval:smoke",
    "release:lowcode": "pnpm --dir packages/lowcode release:npm"
  }
}
```

## 10. 修改一键启动路径

编辑根目录 `scripts/dev.mjs`，只需修改三个 `cwd`：

```js
const definitions = [
  { name: 'agent', cwd: path.join(root, 'services', 'agent'), script: 'dev' },
  { name: 'platform-api', cwd: path.join(root, 'apps', 'platform'), script: 'dev' },
  { name: 'platform-web', cwd: path.join(root, 'apps', 'platform'), script: 'dev:web' },
];
```

本机配置位置变为：

```text
services/agent/.env.local
apps/platform/.env.local
```

首次复制模板：

```powershell
Copy-Item services\agent\.env.local.example services\agent\.env.local
Copy-Item apps\platform\.env.local.example apps\platform\.env.local
```

以后仍然只需一条命令：

```powershell
pnpm dev
```

## 11. 更新 Docker 与 Compose 路径

将 `deploy/Dockerfile.agent` 中的路径改为：

```dockerfile
COPY services/agent ./services/agent
WORKDIR /workspace/services/agent
```

将 `deploy/Dockerfile.platform` 中的路径改为：

```dockerfile
COPY apps/platform ./apps/platform
WORKDIR /workspace/apps/platform
```

将 `deploy/Dockerfile.web` 中的构建路径改为：

```dockerfile
COPY apps/platform ./apps/platform
WORKDIR /workspace/apps/platform

# 最终复制路径
COPY --from=build /workspace/apps/platform/dist /srv
```

将 `compose.yaml` 的 schema 挂载路径改为：

```yaml
- ./apps/platform/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
```

继续使用：

```powershell
Copy-Item .env.compose.local.example .env.compose.local
docker compose --env-file .env.compose.local up --build
```

## 12. 更新验收脚本与文档路径

根目录文件中所有旧目录名需要替换：

| 旧路径 | 新路径 |
| --- | --- |
| `exam-lowcode-lib/` | `packages/lowcode/` |
| `exam-agent/` | `services/agent/` |
| `exam-platform/` | `apps/platform/` |

重点检查：

- `acceptance/*.acceptance.ts` 中的 import 和文件 URL。
- `scripts/check-architecture.ts`。
- `README.md`、`QUICKSTART.md`、`ARCHITECTURE.md`、`ACCEPTANCE.md`、`设计方案.md`。
- `.dockerignore` 和 Compose 路径。

可以用以下命令查找遗漏：

```powershell
rg -n "exam-lowcode-lib|exam-agent|exam-platform" . --glob '!node_modules/**' --glob '!pnpm-lock.yaml'
```

对于文档中的旧仓库链接可以保留；对于本地文件路径、import 和构建路径必须修改。

## 13. 更新 lowcode 发布元数据

修改 `packages/lowcode/package.json` 的 repository：

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/mmverick123/exam.git",
    "directory": "packages/lowcode"
  }
}
```

包名、exports 和 publishConfig 保持不变：

```json
{
  "name": "@mmverick123/lowcode",
  "publishConfig": {
    "access": "restricted",
    "registry": "https://npm.pkg.github.com/"
  }
}
```

发布新版本时：

```powershell
pnpm --dir packages/lowcode version patch --no-git-tag-version
pnpm release:lowcode
```

首次从新仓库发布前，在 GitHub Packages 的 `@mmverick123/lowcode` 包设置中确认新 `exam` 仓库已连接并拥有写权限；使用 classic PAT 发布时仍需 `write:packages`。

后续发布与消费端安装遵循 `.codex/skills/lowcode-release/SKILL.md`，避免把已迁移前的 `exam-lowcode-lib` 当作发布目标，或在包尚未发布前提前生成指向新版本的 frozen lockfile。

发布后更新两个消费端中的精确版本，再执行根目录 `pnpm install`：

```powershell
pnpm --dir services/agent add @exam/lowcode@npm:@mmverick123/lowcode@0.1.1 --save-exact
pnpm --dir apps/platform add @exam/lowcode@npm:@mmverick123/lowcode@0.1.1 --save-exact
pnpm install
```

这样可以保证开发、CI 和生产都在验证真实发布包，而不是 Monorepo 内的源码链接。

## 14. 根目录忽略规则

根目录 `.gitignore` 建议至少包含：

```gitignore
node_modules/
.pnpm-store/
**/node_modules/
**/dist/
**/.env.local
.env.compose.local
.playwright-cli/
output/playwright/
services/agent/eval/metrics/
```

提交前检查：

```powershell
git status --short
git ls-files | rg "\.env\.local$|auth\.ini$"
git grep -n -E "ghp_|github_pat_|_authToken="
```

后两条命令应该没有真实凭据输出。

## 15. 整体验收

先运行三项目门禁：

```powershell
pnpm verify
pnpm eval:smoke
```

再检查 lowcode 确实来自 registry：

```powershell
pnpm --filter exam-agent why @exam/lowcode
pnpm --filter exam-platform why @exam/lowcode
```

启动联调：

```powershell
pnpm dev
```

检查：

- `http://127.0.0.1:5173/question-types` 返回 200。
- `http://127.0.0.1:3000/api/question-types` 携带 Platform token 后返回 200。
- Agent 在缺少 `x-agent-token` 时返回 401。
- 题型列表可以进入设计页。
- 设计器可以添加组件、撤销、保存并调用 AI 助手。

有 Docker 的环境再运行：

```powershell
docker compose --env-file .env.compose.local config
docker compose --env-file .env.compose.local up --build
```

## 16. 创建并推送迁移提交

建议先查看完整改动：

```powershell
git status --short
git diff --check
git diff --stat
```

创建提交：

```powershell
git add -A
git commit -m "chore: consolidate projects into monorepo"
git push -u origin main
```

确认 GitHub 上的目录、历史和 CI 均正常后，再把三个旧仓库设置为 archived，并在旧仓库 README 顶部添加迁移提示：

```markdown
> This repository has moved to https://github.com/mmverick123/exam.
```

不要立即删除旧仓库或 GitHub Packages。现有 `@mmverick123/lowcode` 包版本仍被 Agent 和 Platform 的 lockfile 引用。

## 17. 推荐的后续 CI

Monorepo 稳定后建议建立三个独立 workflow：

- `verify.yml`：任何代码变更执行根目录 `pnpm verify`。
- `lowcode-release.yml`：只在 `packages/lowcode/**` 变化且创建 tag 时发布 GitHub Package。
- `consumer-registry-check.yml`：安装依赖后检查 Agent/Platform 的 lowcode 解析结果不是 `link:` 或 `workspace:`。

建议使用路径过滤避免不相关任务重复执行，但合并到 `main` 前仍应保留一次完整整体验收。

## 回滚方案

迁移过程中不要修改或归档三个旧仓库。若 Monorepo 验收失败：

1. 停止向新 `exam` 仓库推送。
2. 继续使用当前三个仓库的 `main` 分支。
3. 修复迁移分支后重新验收。
4. 只有新仓库稳定运行一段时间后，才归档旧仓库。

由于原仓库和 GitHub Packages 都没有被删除，整个迁移过程是可逆的。
