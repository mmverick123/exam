# Agent 优化方案分析与工程落地建议

> 文档日期：2026-10-17  
> 适用项目：`exam-monorepo` 题型可视化编排平台  
> 结论摘要：当前系统已经具备“状态机编排 + LLM 决策 + 结构化补丁 + 契约校验 + 有限修复”的 Agent 闭环，适合作为 MVP。但在复杂请求、多目标修改、目标组件绑定和用户可解释确认方面，仍需要从“能生成合法补丁”升级到“只修改用户期望的对象，并且让用户在修改前看懂、可控地确认”。

---

## 实施进度（2026-10-17）

本轮已完成 P0 第一批保护，并开始落地 P1 中的候选事务和批次确认：

- Plan 现在携带目标节点、允许新增父容器、排除节点、风险、假设和验收条件；Anthropic `emit_plan` Schema 将节点 ID 限定为当前快照中的候选 ID。
- Generate / Repair 生成的 Patch 会由服务端 `validatePatchScope()` 再检查：编辑/删除/移动目标必须属于 Plan，新增父容器必须属于批准范围，不能新增计划外组件类型；移动目标容器也单独校验。
- 复杂插入可引用同一 Patch 中先前插入的临时节点；Contract 的实际层级校验仍是第二道防线。
- 前端现在展示计划目标、步骤、假设、风险、验收条件、校验状态，并将部分原始 Patch 操作翻译成易读描述；同时说明“确认”只保留在草稿，仍需手动保存。
- 新增了范围越权、父容器越权和嵌套插入的单元测试。
- Agent 补丁现在在独立的候选 Designer Store 中预览；只有用户确认后才提交到正式 Store，拒绝不会依赖 undo 栈回退。
- 请求携带画布快照 hash，返回候选和用户确认时都会比对当前快照；画布在生成期间或确认前发生变化时，候选会被拦截。
- 候选操作可按目标组件分组勾选；新增节点及其依赖插入作为一个组。包含删除/移动的高风险补丁整体作为一个组，且默认不勾选，需用户显式启用。
- 候选预览期间禁用画布编辑、保存和发布，避免把预览中的手工改动混入 Agent 结果。

**范围说明：**这是候选快照层面的隔离与乐观并发保护，不等于语义正确率已经得到保证。计划目标仍由同一个 LLM 选择；目前高风险是“先生成完整候选，再要求显式勾选高风险组”，还不是“先确认计划再调用生成模型”的两阶段 API。分组也只支持可安全独立应用的目标更新；破坏性操作保持整组原子确认。更完整的语义验收和真实 Anthropic Eval 仍待实施。

---

## 1. 分析范围与当前实现

### 1.1 关键链路

当前 Agent 的主流程位于：

- `services/agent/src/application/state-machine.ts`
- `services/agent/src/providers/types.ts`
- `services/agent/src/providers/anthropic-provider.ts`
- `services/agent/src/contracts/bundles.ts`
- `services/agent/src/contracts/tool-schema.ts`
- `packages/lowcode/src/contract/patch.ts`
- `apps/platform/src/frontend/pages/DesignPage.tsx`

现有链路为：

```text
用户请求
  ↓
Intent：create / modify / irrelevant
  ↓
Plan：选择组件类型并给出步骤
  ↓
Generate：通过 emit_patch 输出 QuestionPatch
  ↓
Apply：程序应用补丁
  ↓
Validate：Contract / Schema 校验
  ↓
Repair：失败后最多修复 3 次
  ↓
Deliver / Degrade / Reject
```

前端通过 `questionOutline` 发送当前画布的差量投影；Agent 返回 SSE 事件；前端收到 `patch` 后将补丁应用到 Designer，并提供“确认改动”或“拒绝并回退”。

### 1.2 当前已经做得比较好的地方

1. **模型不直接输出全量 JSON，而是输出 `QuestionPatch`**。这降低了覆盖整个画布、误改无关节点的风险。
2. **`emit_plan` 和 `emit_patch` 使用强制工具调用**，且 `emit_patch` 的 Schema 由组件契约中的 `optionsSchema` 生成，减少模型自由输出格式错误。
3. **Agent 组件清单由契约控制**，`page`、`image` 等组件可以通过 `agentExcluded` 排除。
4. **补丁在服务端应用后再进行校验**，不是只校验模型输出的局部结构。
5. **修复循环有硬上限**，当前最多 Repair 3 次，避免无限循环和成本失控。
6. **补丁层已经处理部分标识符重整**，包括新增节点 `id`、表单项 `name`、选项 `value` 与答案引用的协调。
7. **已有离线测试和 Eval 语料**，包括合法性、层级关系、既有选项 value 保留、未提及节点保护、修复次数等断言。
8. **前端没有自动保存 Agent 结果**，保存版本仍由用户主动触发，降低了误操作直接落库的风险。

### 1.3 当前实现的主要缺口

1. **Plan 只返回 `steps` 和 `selectedTypes`，没有明确目标节点、修改范围、排除范围、验收条件和风险等级。**
2. **模型生成的操作目标没有经过显式的“计划目标白名单”校验。** 当前主要依赖 `targetId` 是否存在以及补丁是否能通过结构校验，不能完整表达“用户只想改 A，不要碰 B”。
3. **复杂请求仍然是一次性生成一个补丁**。如果一个请求同时包含新增、删除、移动、改题干、改选项等动作，系统缺少业务层面的依赖排序和分组确认。
4. **前端是在收到 `patch` 时直接修改真实 Designer Store，再通过 `undo()` 回退。** 这不是严格意义上的 staged transaction：如果用户在预览过程中发生其他编辑，或者撤销栈状态变化，回退的边界可能不够清晰。
5. **前端目前展示的是原始操作名和组件 type，例如 `updateOptions → nodeId`，普通用户难以判断具体改了哪个组件、哪些字段以及改前改后是什么。**
6. **Agent 发出的 `plan` 和 `validation` 事件没有在前端展示。** 用户看不到 Agent 识别到的范围、前提假设、校验结果和未能完成的部分。
7. **错误提示过于统一。** `未能生成可应用的改动`、`AI 助手暂时不可用` 无法区分请求歧义、目标不存在、契约不兼容、校验失败、修复耗尽和网络中断。
8. **缺少基于画布版本或内容哈希的并发保护。** 用户在 Agent 生成期间手工修改画布时，返回补丁可能基于旧快照。
9. **当前验证以结构合法性为主，语义正确性和用户意图保持还不够完整。** “合法 JSON”不等于“改对了用户指定的组件”。

---

## 2. 复杂请求如何提高改动正确率

### 2.1 先判断请求复杂度，再决定执行策略

不要把所有请求都走同一条“生成一个补丁”的路径。建议在 Intent 后增加一个确定性的复杂度分级器，结合规则和模型结果：

| 等级 | 典型请求 | 推荐策略 |
| --- | --- | --- |
| L0 | 修改一个题干文字、修改一个选项文案 | 直接生成候选补丁，单批预览确认 |
| L1 | 新增一道单选题、修改一个组件的多个字段 | 单批补丁，显示字段级 Diff |
| L2 | 同时新增多个组件、调整层级和选项 | 先确认计划，再分组执行 |
| L3 | 删除/移动多个组件、批量重构组合题、目标不明确 | 必须澄清或分阶段确认，不允许直接执行 |

复杂度可以由以下因素累计：

- 涉及的目标节点数量；
- `insertChild`、`remove`、`move`、`updateOptions` 的组合数量；
- 是否包含破坏性操作；
- 是否涉及答案、选项 value、组件层级等高风险字段；
- 是否存在“第一个/那个/相关题目”等不明确指代；
- 预计新增、删除或移动的节点数量；
- 是否跨越多个容器。

### 2.2 Plan 从“步骤描述”升级为“可执行变更计划”

当前：

```ts
interface PlanResult {
  steps: string[];
  selectedTypes: string[];
}
```

建议升级为：

```ts
interface AgentPlan {
  intent: 'create' | 'modify';
  summary: string;
  assumptions: string[];
  targetRefs: Array<{
    id: string;
    type: string;
    label: string;
    path: string;
    reason: string;
  }>;
  excludedIds: string[];
  groups: Array<{
    id: string;
    title: string;
    purpose: string;
    dependsOn: string[];
    risk: 'low' | 'medium' | 'high';
    expectedOps: string[];
  }>;
  acceptanceCriteria: string[];
  requiresClarification: boolean;
  clarificationQuestion?: string;
}
```

关键变化：

- `targetRefs` 明确“准备改谁”；
- `excludedIds` 明确“即使模型看到了，也不能碰谁”；
- `groups` 把一个复杂请求拆成有依赖关系的变更组；
- `acceptanceCriteria` 把用户意图转成可测试的验收条件；
- `assumptions` 让用户知道模型对“第一个组件”“当前题目”等指代的理解；
- `requiresClarification` 允许系统在信息不足时先提问，而不是猜测执行。

### 2.3 引入“澄清门”，不要让模型替用户猜目标

以下情况应在生成 Patch 前暂停：

- 当前画布中存在多个同类型、同标题或同名组件；
- 用户说“修改这道题”，但当前有多个题目；
- 用户说“删除错误选项”，但没有说明判断依据；
- 用户请求同时包含新增和删除，但删除目标无法唯一定位；
- 用户要求“保留原答案”，但又要求重建选项列表，二者可能冲突。

前端显示：

```text
我理解为：修改“第二道单选题”的题干，并保留现有选项和正确答案。
目前有两个候选目标，请选择：
[单选题：光合作用] [单选题：细胞呼吸]
```

这类一次澄清的成本，通常低于错误修改后让用户手工检查整张题型。

### 2.4 增加语义级不变量，而不仅是结构校验

现有 `validate()` 能判断结果是否符合 Contract，但复杂请求还需要判断“是否超出用户要求”。建议把用户请求解析为不变量，并在补丁应用后自动验证：

- **未提及节点保持不变**；
- **未提及字段保持不变**；
- “只改题干”时，不允许改选项、答案、分值和样式；
- “保留原有选项”时，既有 `optionItems[].value` 必须不变；
- “不改变顺序”时，既有节点和选项顺序必须不变；
- “删除某节点”时，只允许删除目标节点及其明确允许删除的后代；
- “新增两个选项”时，节点数量增量和选项数量增量必须匹配；
- “移动到末尾”时，只允许发生目标节点的位序变化；
- 所有 `targetId` 必须属于计划白名单；
- 所有新节点的父节点必须属于计划允许的容器。

这类校验建议放在共享的 Agent application 层或 Contract 层，避免只靠 Prompt 约束。

### 2.5 采用“候选结果 + 独立审查”而不是无限自我反思

可以把当前流程升级为：

```text
Plan
  ↓
Generate Candidate Patch
  ↓
Deterministic Scope Checker
  ↓
Contract Validator
  ↓
Semantic Acceptance Checker
  ↓
Deliver / Repair / Clarify
```

审查器应尽量是确定性代码，不使用同一个模型再次“解释自己是否正确”。模型自检可作为辅助，但不能替代：

- 目标范围检查；
- 操作数量和类型限制；
- 基线快照对比；
- 结构 Schema 校验；
- 语义不变量检查。

### 2.6 增加画布版本和快照哈希

前端请求中增加：

```ts
{
  baseRevision: number,
  baseSnapshotHash: string
}
```

Agent 返回：

```ts
{
  baseRevision: number,
  candidateRevision: number,
  snapshotHash: string
}
```

服务端或前端在应用补丁前检查：

- 当前画布版本是否仍等于 `baseRevision`；
- 当前未提交画布哈希是否仍等于 `baseSnapshotHash`。

不一致时不要盲目应用，应提示：

```text
生成期间画布已发生变化，本次建议基于旧版本，是否重新生成？
```

这比尝试把旧补丁强行套到新画布上更安全。

---

## 3. 多个改动应该一次性确认，还是分批确认？

### 3.1 不建议“一律一次性”或“一律逐条确认”

两种极端都有问题：

- **全部一次性确认**：交互快，但用户可能看不清复杂变更，尤其是删除、移动和答案字段修改。
- **每个字段逐条确认**：安全但操作成本过高，用户会形成“无脑全部点击确认”的习惯。

建议采用**按风险和依赖自适应的分批确认策略**。

### 3.2 推荐确认策略

#### 低风险单目标变更：一次性确认

例如：

- 修改一个题干的措辞；
- 修改一个选项的 label；
- 修改一个组件的展示样式；
- 在明确容器中新增一个普通文本块。

显示一张简洁 Diff 卡片，用户一次确认即可。

#### 中风险多字段变更：按“目标组件”分组确认

例如：

```text
本次将修改 2 个组件：

A. 单选题「光合作用」
- 题干：旧文本 → 新文本
- 新增选项：D. 以上都不对

B. 组合题「基础知识」
- 新增 2 个子问

[全部确认] [逐组查看]
```

默认支持全部确认，但允许用户展开每组查看。

#### 高风险或破坏性变更：计划确认 + 分组执行

涉及以下动作时，建议分两步：

1. 先确认计划：改哪些组件、预计多少操作、哪些内容会被删除或移动；
2. 再生成候选结果，按变更组确认。

高风险动作包括：

- `remove`；
- 跨容器 `move`；
- 改变答案或正确选项；
- 整体替换 `optionItems`；
- 一次影响多个题目；
- 可能造成历史答案失效的操作。

### 3.3 事务语义

无论前端呈现为一次确认还是分组确认，底层都应有明确的事务边界：

- 每个变更组具有唯一 `groupId`；
- 组内 Patch 原子应用，要么全部成功，要么全部不应用；
- 用户确认前只存在于候选快照，不修改正式 Store；
- 用户拒绝某组时，不影响其他已确认组；
- 用户确认后仍不自动保存版本，保存仍由用户主动触发；
- 任意时刻都能回退整个 Agent Turn，而不是依赖普通编辑撤销栈碰运气。

### 3.4 对当前实现的判断

当前 `DesignPage.tsx` 是：

```text
收到 patch
  ↓
直接 applyPatch 到真实 store
  ↓
用户确认：清除 pendingPatch
用户拒绝：store.undo()
```

它适合 MVP 的“单批预览”，但不适合复杂多目标修改。建议改成：

```text
收到 candidate patch
  ↓
clone 当前快照并在 candidate store 中应用
  ↓
渲染候选画布和 Diff
  ↓
用户确认
  ↓
将 candidate snapshot / patch 原子提交到正式 store
```

---

## 4. 如何减少 Agent 操作到非用户期望的组件

这是当前最值得优先加强的方向。仅靠 Prompt 中的“请修改指定组件”不够，需要多层工程防线。

### 4.1 目标解析：给组件建立人类可读引用

发送给 Agent 的 outline 不应只有节点 JSON，还应附带扁平化索引：

```ts
interface AgentNodeRef {
  id: string;
  type: string;
  displayName: string;
  title?: string;
  path: string;
  parentId?: string;
  order: number;
  contentPreview?: string;
  immutableKeys: string[];
}
```

模型看到：

```text
nodeId=n_42
路径=页面 / 第2个组合题 / 第1个子问
类型=单选题
标题=光合作用基础
```

而不是只看到难以理解的 `n_42`。

### 4.2 计划目标白名单

Plan 确定目标后，生成阶段只能引用：

- `targetRefs` 中的 `targetId`；
- `targetRefs` 中允许的父节点；
- `selectedTypes` 中允许的新增组件类型。

服务端在应用 Patch 前逐项检查：

```text
updateOptions.targetId ∈ allowedTargetIds
remove.targetId ∈ allowedDeleteIds
move.targetId ∈ allowedMoveIds
insertChild.parentId ∈ allowedParentIds
insertChild.node.type ∈ allowedNewTypes
```

不满足就拒绝候选补丁并进入 Repair 或 Clarify，不要把它当成普通 Schema 错误。

### 4.3 目标锁定与指代消歧

工程上可以采用三段式目标绑定：

1. 模型返回候选目标 `targetId`；
2. 代码根据 `targetId` 绑定当前快照中的节点；
3. 代码把节点的 `type / path / title / content hash` 写入计划签名。

应用时重新检查签名。如果同一个 `id` 的类型或内容已经变化，拒绝使用旧计划。

### 4.4 “默认保留”与显式破坏性权限

默认策略应是：

> 用户没有明确要求的节点、字段、答案引用和选项 value 均不得改变。

对以下动作要求模型在 Patch 中显式声明原因：

- 删除节点；
- 移动节点；
- 替换整个选项数组；
- 改变 `correctAnswer`；
- 改变既有 `value`、`name` 或节点 `id`。

即使模型输出了这些操作，代码仍需经过风险规则检查。

### 4.5 限制 Patch 的操作预算

针对复杂度设硬上限：

- 单次最多影响多少目标节点；
- 单次最多插入、删除、移动多少节点；
- 单次最多修改多少 options key；
- 是否允许同时出现 `remove` 与 `insertChild`；
- 是否允许跨容器移动；
- 是否允许修改答案字段。

超限时拆成多个变更组，或者要求用户先确认计划。

### 4.6 组件级权限和字段级权限

`agentExcluded` 已经解决了“模型不应该看到哪些组件”的问题，建议扩展为：

```ts
agentPolicy: {
  visible: boolean;
  creatable: boolean;
  editableKeys: string[];
  destructiveKeys: string[];
  requiresConfirmation: boolean;
}
```

例如：

- `image`：可在画布中展示，但不可由 Agent 新增或修改；
- `correctAnswer`：可以修改，但必须高风险确认；
- `name`、`value`：由系统维护，模型只能引用，不能自由重写；
- 设计器内部字段：完全不可见、不可写。

### 4.7 评测必须加入“误触碰”指标

当前 Eval 已有 `preserveUnmentioned` 等断言，建议把它提升为一等指标，并新增：

- `targetPrecision`：被修改的节点中，用户目标节点占比；
- `targetRecall`：用户明确要求修改的目标中，实际被修改的比例；
- `unmentionedMutationRate`：未提及节点被修改的比例；
- `destructiveOperationRate`：未明确授权的删除、移动、答案修改比例；
- `scopeViolationRate`：超出计划白名单的操作比例；
- `clarificationRate`：有歧义请求中主动澄清的比例；
- `semanticPassRate`：结构合法且满足验收条件的比例。

这些指标比单纯的“最终 JSON 合法率”更能衡量 Agent 是否真的改对。

---

## 5. 前端聊天框当前暴露的信息是否合理

### 5.1 当前已经暴露的信息

当前界面包括：

- 用户原始请求；
- Agent 文本消息；
- `pendingPatch.summary`；
- 操作数量对应的原始列表；
- “确认改动”；
- “拒绝并回退”；
- 通用错误提示；
- 正在生成时的停止按钮。

### 5.2 合理之处

1. 有明确的预览状态和确认入口，不会自动保存。
2. 有拒绝并回退机制，用户不会被迫接受结果。
3. 用户可以中止 SSE 请求。
4. `pendingPatch` 时禁用继续输入，避免多个候选补丁重叠。
5. 适合展示简单请求的快速反馈。

### 5.3 不合理或信息不足之处

#### 1. 展示了实现细节，却没有展示用户关心的语义

当前类似：

```text
updateOptions → node_123
insertChild → single-choice
```

用户真正需要知道的是：

```text
修改「光合作用」单选题
- 题干：…… → ……
- 新增 1 个选项：D. 以上都不对
- 未修改正确答案
```

应隐藏原始 `op` 名称、内部节点 ID 和模型工具名，除非用户打开“技术详情”。

#### 2. 计划和校验结果没有展示

服务端已经发送 `plan` 和 `validation` 事件，但前端没有消费。建议至少显示：

- Agent 识别的目标；
- 将要执行的步骤；
- 预计影响的组件数量；
- 校验是否通过；
- 是否存在警告；
- 是否发生过修复；
- 哪些内容未执行。

#### 3. 错误提示无法帮助用户修正输入

建议按错误类型给出行动建议：

| 错误类型 | 用户提示 |
| --- | --- |
| 目标不明确 | “发现两个可能的目标，请选择要修改的题目。” |
| 超出范围 | “本次请求同时涉及 8 个组件，请拆成两步或先确认计划。” |
| 结构校验失败 | “生成结果不符合当前题型契约，未应用到画布。” |
| 修复耗尽 | “尝试 3 次仍未通过校验，未应用结果。可以缩小修改范围后重试。” |
| 画布已变化 | “生成期间画布已被修改，请重新生成。” |
| 网络中断 | “连接中断，当前候选结果未确认。” |

#### 4. 当前“确认改动”不是完全清晰的提交语义

因为补丁实际上已经应用到真实 Store，确认按钮更像“接受已预览的变更”，而不是“提交候选变更”。建议在 UI 文案上明确：

```text
预览中的候选改动
确认后保留在当前草稿，仍需点击“保存”才生成新版本。
```

同时在工程上改为候选 Store，避免 UI 文案与真实行为不一致。

#### 5. 没有对复杂变更提供逐组选择

多操作请求应提供：

- 全部确认；
- 按组查看；
- 拒绝某一组；
- 只应用安全组；
- 查看被跳过的组及原因。

### 5.4 推荐的用户可见信息层次

#### 默认层：面向普通用户

```text
已生成修改建议

影响 2 个组件，包含 4 项改动：
1. 修改「光合作用」题干
2. 新增 1 个选项
3. 保留原有正确答案
4. 未修改其他题目

校验：通过
风险：低

[确认全部改动] [查看详情] [拒绝]
```

#### 详情层：面向高级用户

```text
目标：question-group-2 / single-choice-1
操作：updateOptions、insertChild
基于画布版本：v12
校验：Contract v1.2.0，通过
修复次数：1
```

#### 不建议暴露的内容

- 隐藏式 Chain of Thought；
- 模型内部逐步推理全文；
- 原始 token 数量和 Provider 内部信息；
- 服务端堆栈和内部错误；
- 对普通用户没有意义的 Schema 路径。

可以展示“简短的执行理由”和“校验摘要”，但不要把内部推理当作用户界面内容。

---

## 6. 推荐的事件协议

当前 AgentEvent 已有：

```ts
type AgentEvent = {
  event: 'plan' | 'message' | 'patch' | 'validation' | 'done' | 'error';
  data: Record<string, unknown>;
}
```

建议将 `patch` 拆为“候选结果”和“提交结果”，并补充稳定字段：

```ts
interface AgentPlanEvent {
  planId: string;
  summary: string;
  targetRefs: AgentNodeRef[];
  groups: ChangeGroup[];
  assumptions: string[];
  requiresClarification: boolean;
}

interface AgentCandidateEvent {
  planId: string;
  baseRevision: number;
  baseSnapshotHash: string;
  groups: CandidateChangeGroup[];
  overallSummary: string;
  validation: {
    valid: boolean;
    errors: UserFacingIssue[];
    warnings: UserFacingIssue[];
  };
}

interface AgentDoneEvent {
  state: 'Deliver' | 'Degrade' | 'Reject';
  repairCount: number;
  skippedGroups?: Array<{ groupId: string; reason: string }>;
}
```

注意：服务端可以保留完整内部事件用于日志和评测，但发送给前端的事件应该经过 user-facing projection，避免把内部错误和原始工具数据直接暴露给用户。

---

## 7. 分阶段落地方案

### P0：先解决“误改”和“不可解释”

1. Plan 增加 `targetRefs`、`excludedIds`、`acceptanceCriteria`、`risk`。
2. 增加目标白名单校验，所有 Patch 操作必须落在计划范围内。
3. 加入 `baseRevision` / `snapshotHash`，阻止旧快照补丁覆盖新画布。
4. 前端把原始 op/type 改成面向用户的语义 Diff。
5. 前端消费 `plan` 和 `validation` 事件。
6. 错误码分层并给出可操作的用户提示。
7. 将“未提及节点保持不变”作为所有 modify 请求的默认断言。

### P1：解决复杂请求的正确率和确认体验

1. 引入复杂度分级器。
2. 复杂请求先展示计划，再生成候选 Patch。
3. 对高风险操作增加明确确认。
4. 将多个操作按目标组件或业务意图分组。
5. 使用候选 Store / 候选快照，而不是先改真实 Store 再 undo。
6. 支持按组确认、按组拒绝和全部确认。
7. 扩展 Eval：目标精度、未提及节点变更率、范围违规率、语义通过率。

### P2：提升规模化和长期稳定性

1. 将组件级 Agent 权限、字段级权限纳入 Registry Contract。
2. 为 Plan、Candidate Patch、User Confirmation 建立可审计记录。
3. 记录每次失败的原因分类，形成真实请求回放集。
4. 对高风险场景增加人工复核或发布门禁。
5. 根据真实评测结果优化模型、Prompt、候选组件索引和澄清策略。

---

## 8. 建议的验收标准

完成 P0 后，至少应满足：

- Agent 不得修改不在计划白名单中的节点；
- 用户未提及的节点在 modify 请求中保持字节级或结构级不变；
- 画布版本发生变化时，旧补丁不得自动应用；
- 用户能看到目标组件名称、变化摘要、风险和校验结果；
- 复杂请求可以明确显示“需要澄清”或“需要先确认计划”；
- 删除、移动、答案修改等高风险操作不能仅依靠一个模糊的“确认改动”按钮；
- 所有失败都能区分为输入歧义、范围违规、契约失败、修复耗尽或网络失败；
- Eval 中新增并持续监控：
  - `unmentionedMutationRate = 0`；
  - `scopeViolationRate = 0`；
  - 目标节点绑定正确率；
  - 语义验收通过率；
  - 高风险操作误执行率。

---

## 9. 最终结论

当前项目不是缺少 Agent 能力，而是已经完成了第一阶段的“结构安全闭环”：模型负责意图、计划和补丁，程序负责应用、校验和有限修复。下一阶段的重点不应是简单增加 Prompt，而应建立三层更强的控制：

```text
用户意图层：目标、范围、假设、验收条件
        ↓
计划与权限层：目标白名单、字段权限、风险分组、操作预算
        ↓
执行与交互层：候选快照、语义 Diff、版本校验、分组确认、可审计回退
```

针对本项目的直接建议是：

> **简单请求一次性预览确认；复杂请求先确认计划，再按目标或风险分组确认；所有请求都必须先在候选快照中执行，经过范围校验和语义校验后，才允许提交到正式画布。**

这样可以同时解决三个核心问题：

1. 复杂请求的改动正确率；
2. Agent 误操作非目标组件的风险；
3. 用户无法理解 Agent 到底改了什么的问题。
