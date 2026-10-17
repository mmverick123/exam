# 项目整体验收报告

验收日期：2026-09-11

## 结论

Steps 1–6 的源码实现、质量门禁、离线 Eval、发布包与真实 Node 双服务 SSE 链路均通过。本机缺少 Docker/Podman/nerdctl，且未配置独立 Anthropic Eval Key，因此 Compose 实际启动和真实模型 A/B 属于环境待验项，不计为已执行。

## 自动化门禁

| 工程 | 结果 | 覆盖 |
| --- | --- | --- |
| `packages/lowcode` | 通过，33 tests | lint、typecheck、10 组件单文件约束、契约生成、快照、build、产物边界 |
| `services/agent` | 通过，11 tests | lint、typecheck、架构边界、状态机、HTTP/SSE、Eval 冻结检查 |
| `apps/platform` | 通过，2 tests | lint、typecheck、架构边界、后端接口、Web build |

## 功能验收

- Step 3–4：10/10，通过创建、Agent 补丁、Designer、undo/redo、发布门禁、答案剥离与作答数据校验。
- Step 5：9/9，通过 modify、标识符重整、非法锚点原子拒绝、Repair、真实 Platform → Agent SSE 转发及不支持版本显式失败。
- Step 6：8/8，通过 48 条用例冻结、Smoke、Full 指标、scripts 收口、tarball、Compose 拓扑静态断言与 `optionsSchema` 篡改拦截。

## Eval 基线

- 冻结 hash：`1e1be461766573c289ae02cecee032c173330968ab47ffac68ded97f6f368733`
- Full：48 cases × 2 strategies × 3 samples = 288 runs
- 确定性 Provider：一次通过率 95.83%，最终通过率 100%，平均修复 0.04 轮；每种策略 3 次层级错误均经 Repair 收敛
- `comparableModelExperiment=false`：上述数据不是 LLM 质量或策略提升结论

## 发布与部署

- `pnpm publish --dry-run --no-git-checks` 已通过 `prepublishOnly` 全部质量门禁；正式消费路径为 npm registry，不再使用本地 tarball。
- Agent 与 Platform 已从 GitHub Packages 安装 `@mmverick123/lowcode@0.1.0`，并通过 `@exam/lowcode` npm alias 保持源码 import 兼容；lockfile 记录 GitHub `/download/` tarball 与真实 SHA-512 integrity。
- `compose.yaml` 可由 YAML 解析器读取，包含 web / platform / agent / mysql 四服务；Caddy 配置包含 `flush_interval -1`。
- 已通过非容器的真实双服务 SSE 验收，事件顺序为 plan → patch → validation → done，响应带禁缓冲头。

## 环境待验与已知边界

1. 本机没有容器运行时，未执行 `docker compose up --build` 和经 Caddy 的实际流式请求。
2. 未提供 `EVAL_ANTHROPIC_API_KEY`，未执行真实 Anthropic 单阶段 / 两阶段多次采样。
3. GitHub Packages 的读取/发布依赖用户级 PAT；项目 `.npmrc` 只提交非敏感 scope → registry 映射，不包含 token。
4. Platform 当前仍使用内存仓储；Compose 中 MySQL 只初始化目标 schema，进程重启后的数据持久化尚未接入。
