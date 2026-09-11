# services/agent（Step 4）

实现意图判定 → Plan → Generate → Validate → Repair → Degrade 状态机。默认使用离线 `DeterministicProvider` 便于本地验收；配置 `ANTHROPIC_API_KEY` 后可切换到 Anthropic Claude（Intent 使用 Haiku，其余阶段使用 Sonnet），结构化输出强制走 `emit_patch` tool use。

```bash
pnpm install
pnpm verify
pnpm cli -- "出一道关于光合作用的单选题，4 个选项"
pnpm dev
```

服务端入口为 `POST /agent/chat`，响应是 SSE。未注册的契约版本返回 `UNSUPPORTED_CONTRACT_VERSION`，不会静默回落到当前版本。

源码按职责拆分为 `contracts`、`providers`、`application`、`session` 与 `transport`。HTTP 启动入口位于 `src/transport/http/server.ts`，CLI 位于 `src/transport/cli/main.ts`；`pnpm architecture:check` 会阻止基础模块反向依赖传输层。

Eval 已冻结 48 条用例，`pnpm eval:smoke` 跑固定 10 条安全回归，`pnpm eval:full` 默认执行全量用例 × 两种策略 × 3 次采样并把指标写入 `eval/metrics`。详情见 `eval/README.md`。
