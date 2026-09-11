# apps/platform（Step 2 消费端）

这是业务平台的最小可运行实现：Fastify API、内存仓储适配器，以及与 `@mmverick123/lowcode/contract`（消费端 alias 为 `@exam/lowcode/contract`）共享的题型/答案校验。`schema.sql` 提供 MySQL 表结构，后续可将 `QuestionTypeStore` 替换为 Prisma repository。

```bash
pnpm install
pnpm verify
pnpm dev
```

设计态接口默认要求 `Authorization: Bearer dev-token`（可用 `EXAM_PLATFORM_TOKEN` 覆盖）；`/api/exam/*` 为匿名消费端接口。服务端保存版本前会消毒题干 HTML、执行契约校验，消费端出口会递归剥离 `correctAnswer`。

后端源码位于 `src/backend`，其中 `domain`、`http/middleware`、`http/routes` 和 composition root 分离；前端位于 `src/frontend`，按 `app`、`pages`、`services`、`styles` 分层。`pnpm architecture:check` 强制前后端及 domain/HTTP 的依赖边界。
