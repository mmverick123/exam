# apps/platform（Step 2 消费端）

这是业务平台实现：Fastify API、MySQL 持久化仓储，以及与 `@mmverick123/lowcode/contract`（消费端 alias 为 `@exam/lowcode/contract`）共享的题型/答案校验。生产启动必须配置 `DATABASE_URL`，服务会在启动 ready 阶段执行 `schema.sql` 并创建默认管理员/用户账号；测试可通过 `buildServer(new QuestionTypeStore())` 显式使用内存替身。

```bash
pnpm install
pnpm verify
pnpm dev
```

设计态接口默认要求 `Authorization: Bearer dev-token`（可用 `EXAM_PLATFORM_TOKEN` 覆盖），正式用户使用 HttpOnly `exam_session` Cookie；`/api/exam/*` 为兼容匿名消费端接口。服务端保存版本前会消毒题干 HTML、执行契约校验，消费端出口会递归剥离 `correctAnswer`，答案记录写入 MySQL。

后端源码位于 `src/backend`，其中 `domain`、`http/middleware`、`http/routes` 和 composition root 分离；前端位于 `src/frontend`，按 `app`、`pages`、`services`、`styles` 分层。`pnpm architecture:check` 强制前后端及 domain/HTTP 的依赖边界。
