# Repository Agent Rules

## Project quick reference

This is a pnpm/TypeScript monorepo for a schema-driven exam question designer. Read this section before scanning the repository; use `docs/ARCHITECTURE.md` only when deeper dependency-boundary detail is needed and `docs/设计方案.md` only for historical decisions.

### Top-level projects

- `packages/lowcode`: shared low-code package published as `@mmverick123/lowcode`. It exposes the stable `contract`, `renderer`, and `designer` entry points.
  - `src/contract`: framework-free types, widget registry, per-widget JSON Schemas/defaults, validation, projections, sanitization, answers, and patch application.
  - `src/renderer`: React question renderer.
  - `src/designer`: React designer and its state store.
  - `contract/`: generated `schema.json`, `widgets.json`, and `version.json`; do not hand-edit these artifacts.
- `services/agent`: Fastify/Anthropic service. Its flow is `Intent -> Plan -> Generate -> Validate -> Repair -> Deliver/Degrade`.
  - `src/contracts`: contract-version adapter and generated model tool schema.
  - `src/providers`: Anthropic and deterministic providers.
  - `src/application/state-machine.ts`: orchestration, patch application, validation, and repair loop.
  - `src/transport`: HTTP/SSE and CLI entry points.
- `apps/platform`: Fastify API plus React/Vite frontend.
  - `src/backend/domain`: persistence and business rules; production uses MySQL.
  - `src/backend/http`: auth and resource routes, including the raw SSE proxy to Agent.
  - `src/frontend`: admin/designer/exam pages and API client.
- `acceptance/`: cross-project acceptance checks. `deploy/` and `docker-compose.yml` contain the deployment topology.

### Dependency and source-of-truth rules

- Lowcode contract data originates in `packages/lowcode/src/contract/registry.ts`; generated contract JSON is derived from it.
- Source imports use the compatibility alias `@exam/lowcode/*`, while the actual package is `@mmverick123/lowcode` on GitHub Packages.
- Although the lowcode source exists in this monorepo, `apps/platform` and `services/agent` intentionally consume an exact published npm version. Workspace auto-linking is disabled. Never assume a local lowcode source edit is visible to either consumer.
- Allowed dependency directions are `contract -> renderer -> designer`, Agent `contracts -> providers -> application -> transport`, and Platform backend/domain must not import HTTP/frontend code. Architecture scripts enforce these boundaries.

### Agent, schema, and canvas data flow

- Agent does not dynamically connect to the designer or discover lowcode functions over RPC/MCP. It imports the published `@exam/lowcode/contract` module.
- `services/agent/src/contracts/bundles.ts` builds a versioned adapter from `widgetDefinitions`, `registry`, `formConfigSchema`, and `validate`. Only the current `CONTRACT_VERSION` is registered unless an explicit compatibility bundle is added.
- The model first selects component types with the forced `emit_plan` tool. `services/agent/src/contracts/tool-schema.ts` then builds the forced `emit_patch` input schema from those components' `optionsSchema` values. The model emits a `QuestionPatch`; it never directly invokes lowcode JavaScript functions.
- On each chat request, `apps/platform/src/frontend/pages/DesignPage.tsx` sends `outlineForAgent(store.getJson())` as `questionOutline`. This is a snapshot of the current canvas with redundant default-valued options removed, not a live store reference.
- Platform proxies `/api/agent/chat` to the Agent `/agent/chat` SSE endpoint. Agent normalizes and validates the outline, applies the generated patch with `applyQuestionPatch`, validates the result, and retries repair at most three times.
- The frontend receives the patch over SSE and applies it to the designer store as a preview. Confirm keeps it; reject calls store undo. Persistence happens only when the user subsequently saves a version.

### Common commands

- `pnpm dev`: start Agent, Platform API, and Vite frontend; the UI is normally at `http://127.0.0.1:5173/question-types`.
- `pnpm verify`: run all standard lint, typecheck, architecture, test, contract, and web-build checks without calling an LLM.
- `pnpm acceptance`: run cross-project acceptance checks.
- `pnpm eval:smoke`: run the Agent smoke evaluation; real Anthropic evaluation requires the dedicated eval key described in `services/agent/eval/README.md`.
- Local secrets belong in each service's `.env.local`; consult `docs/QUICKSTART.md` and the checked-in `.env.local.example` files. Never commit tokens.

## Lowcode package changes

Any change under `packages/lowcode` or any change that affects the lowcode contract, renderer, designer, or published package must be released before the task is considered complete.

1. Increment `packages/lowcode/package.json` to a new semver version; never overwrite a version already published.
2. If contract artifacts change, review the semver impact and update the contract snapshot with `pnpm --filter @mmverick123/lowcode contract:snapshot:update`.
3. Run the lowcode release workflow described in `.codex/skills/lowcode-release/SKILL.md`. The package must be published to `https://npm.pkg.github.com/` with repository metadata pointing to `mmverick123/exam`.
4. After publication, install the exact new alias version in the affected consumer. For shared lowcode changes, update both `apps/platform` and `services/agent`, then regenerate `pnpm-lock.yaml` and reinstall dependencies.
5. Verify the installed package version and run the affected consumer's typecheck/build before reporting completion.

Do not use `file:` dependencies, `pnpm link`, or a pre-publication version in a frozen lockfile as a substitute for publishing and installing the real package.

