# Agent Eval

用例集由 `cases/create.json` 与 `cases/modify.json` 组成，当前冻结为 48 条（各 24 条）。`case-set.sha256` 是冻结标识；变更用例时必须显式更新 hash 并重新跑基线，禁止在 prompt 优化后通过修改断言“提升”指标。

```bash
pnpm eval:smoke
pnpm eval:full
```

- `eval:smoke`：固定 10 条、每条一次，只守“零非法下发”。
- `eval:full`：48 条 × 两种策略 × 每条至少 3 次，生成一次/最终通过率、修复轮次、耗时、token 与失败模式分布。
- 默认使用 `DeterministicProvider`，结果可复现但不代表 LLM 质量。
- 真实实验需在本机 `.env.local` 中配置 `EVAL_PROVIDER=anthropic` 与独立的 `EVAL_ANTHROPIC_API_KEY`；可用 `EVAL_SAMPLES` 和 `EVAL_TOKEN_BUDGET` 调整采样次数与硬预算。
- 429、5xx、连接/超时错误会退避重试两次，仍失败记为 `infra-fail`；超过 50% 时整次运行状态为 `neutral`。

指标写入 `eval/metrics/<ISO timestamp>-<mode>-<provider>.json`，每次执行生成独立文件，不覆盖同日的历史采样。只有报告中的 `comparableModelExperiment=true` 才能被表述为真实模型下的单阶段/两阶段质量对比。

当前冻结基线（2026-09-11，hash `1e1be461766573c289ae02cecee032c173330968ab47ffac68ded97f6f368733`）使用离线确定性 Provider：Full 共 288 次运行，两种策略的一次通过率均为 95.83%，最终通过率均为 100%，平均修复轮次均为 0.04；每种策略各记录 3 次层级错误并全部修复。两策略结果相同是确定性 Provider 的实现性质，**不能**据此推断真实模型下两阶段策略没有收益。真实 A/B 数字须配置独立 Eval Key 后另跑。
