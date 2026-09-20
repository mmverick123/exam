# 智能题型编排平台

契约驱动的题型 Designer、Renderer、消费平台与 LLM Agent 示例。项目采用 pnpm Monorepo，包含三个边界清晰的 TypeScript 工程：

```text
@mmverick123/lowcode ── contract / renderer / designer
       │                    │
       ├── services/agent       └── apps/platform
       │   Intent → Plan → Generate → Validate → Repair
       └──────────────────── platform SSE proxy → Agent
```

详细依赖方向见 [ARCHITECTURE.md](./ARCHITECTURE.md)，完整设计与取舍见 [设计方案.md](./设计方案.md)。

三项目安装、Agent key/URL、本机配置与 Compose 启动步骤见 [QUICKSTART.md](./QUICKSTART.md)。

## 快速启动

首次将 `services/agent` 和 `apps/platform` 的 `.env.local.example` 复制为 `.env.local` 并填写本机 token/key；非敏感端口和 URL 已由 `.env.defaults` 提供。此后在根目录用一条命令启动 Agent、Platform API 和 Web：

```powershell
pnpm dev
```

打开 `http://127.0.0.1:5173/question-types`。本机敏感配置不会提交到仓库，具体字段见 [QUICKSTART.md](./QUICKSTART.md#2-本机运行时配置)。

## 本地验证

```bash
pnpm install
pnpm verify
pnpm eval:smoke
```

Eval 用例、采样与指标解释见 [services/agent/eval/README.md](./services/agent/eval/README.md)。普通 `verify` 不调用 LLM；真实 Eval 必须使用独立的 `EVAL_ANTHROPIC_API_KEY`。

## 本地 Compose

```bash
docker compose up --build
```

打开 `http://localhost:8088`。Caddy 托管前端并把 `/api/*` 转发至 Platform；Platform 使用 raw stream 反代 Agent；Agent 逐事件发送 SSE。三层均关闭响应缓冲，Agent 与 MySQL 只在 Compose 内网暴露。

Platform 运行时使用 MySQL 持久化仓储，启动时按 `apps/platform/schema.sql` 初始化表结构与默认账号；题目、版本、项目权限、Session 和答案记录会在进程重启后从 MySQL 恢复。

## npm 发布与消费

`packages/lowcode` 是独立的 npm 包；Agent 和 Platform 的 `package.json` 只声明精确 registry 版本，不引用相邻源码目录。发布新版本时运行：

```bash
pnpm release:lowcode
```

发布前置脚本会执行完整 `verify`；发布目标为 GitHub Packages `https://npm.pkg.github.com/`。发布账号需要 `write:packages` 权限，凭据通过用户级 token 配置注入，不进入仓库；各工程提供 `.npmrc.example` 模板。

发布完成后，两个消费工程分别执行（版本必须替换为刚发布的版本）：

```bash
pnpm --dir services/agent add @exam/lowcode@npm:@mmverick123/lowcode@<version> --save-exact
pnpm --dir apps/platform add @exam/lowcode@npm:@mmverick123/lowcode@<version> --save-exact
```

发布目标仓库是当前 `mmverick123/exam`，不是已迁移前的 `exam-lowcode-lib`。版本递增、契约快照、发布顺序和 lockfile 同步的可复用流程见 `.codex/skills/lowcode-release/SKILL.md`。

源码仍从兼容 alias `@exam/lowcode/contract`、`@exam/lowcode/renderer`、`@exam/lowcode/designer` 三个子路径 import；实际 GitHub Packages 包是 `@mmverick123/lowcode`。根目录关闭 workspace 自动链接，Agent、Platform 和 Docker 构建均从 GitHub Packages 安装发布版本。

## 主要质量门禁

- 契约快照包含 schema 与 `defaultOptions`，防止静默破坏。
- `contract → renderer → designer`、Agent 分层和 Platform 前后端边界均有自动检查。
- 10 个注册组件强制单组件单源文件。
- create/modify 各 24 条 Eval 用例以 SHA-256 冻结。
- Smoke 守零非法下发；Full 输出一次/最终通过率、修复轮次、失败分布、耗时和 token。

## Step 6 离线基线

2026-09-11 冻结用例 hash 为 `1e1be461766573c289ae02cecee032c173330968ab47ffac68ded97f6f368733`。确定性 Provider 的 Full 运行覆盖 48 条用例、两种策略、每条 3 次，共 288 次：一次通过率 95.83%，最终通过率 100%，平均修复 0.04 轮；每种策略各有 3 次层级违规进入 Repair 并收敛。该数据用于验证评测框架和修复闭环，不是 LLM 质量结论。真实单阶段/两阶段对比必须配置独立 Anthropic Eval Key。

本机若未安装 Docker，仍可执行根目录 `pnpm verify`、`pnpm acceptance` 和上述 Eval；Compose 实际启动与 Caddy 转发验收需在具备 Docker 的环境补跑。
