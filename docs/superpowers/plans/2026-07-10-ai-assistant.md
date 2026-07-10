# todoDesk AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DeepSeek-powered todoDesk assistant that can query tasks, anniversaries, habits, and check-ins, then create editable proposals and execute writes only after explicit user confirmation.

**Architecture:** The React/Tauri desktop app renders a compact assistant anchored to the bottom-right and talks only to authenticated Fastify endpoints. Fastify persists sessions/messages/proposals, gives DeepSeek read-only tools, validates the model result with shared Zod contracts, and routes confirmed actions through the same domain services used by ordinary CRUD routes. MySQL records proposal versions, idempotency keys, per-item results, and truthful execution status.

**Tech Stack:** Node.js 20+, TypeScript 5.8, React 19, Tauri 2, Fastify 5, MySQL 8, Prisma schema/migrations, Zod 3, Vitest 3, Testing Library, native `fetch`, DeepSeek OpenAI-compatible Chat Completions API.

## Global Constraints

- Before Task 1, use `superpowers:using-git-worktrees` to create an isolated worktree from the current committed HEAD; do not implement in the current dirty worktree.
- Never copy the API key from the conversation into source, tests, fixtures, documentation, shell history, or commits. Revoke it and use a newly generated key only through server environment configuration.
- All AI reads and writes derive `userId` from the authenticated JWT; model arguments must never contain an authoritative user ID.
- Every create, update, delete, archive, restore, check-in, and cancel-check-in requires a persisted editable proposal and explicit confirmation.
- DeepSeek receives read-only tools only. It never receives a tool that directly mutates todoDesk data.
- Interpret relative dates in `Asia/Shanghai` and display the resulting absolute date/time before confirmation.
- First release is non-streaming, text-only, todoDesk-domain-only, and excludes open chat, analytics, proactive suggestions, external web search, and multi-device live collaboration.
- Reuse current packages and UI libraries. Do not add another state library, component library, date library, HTTP SDK, or AI SDK.
- Preserve existing `Task`, `AnniversaryEvent`, `Habit`, and `HabitCheckIn` request schemas and behavior, including open-ended habit `endDate: null`.
- Keep the user's unrelated task/tag sorting edits out of AI-assistant commits.
- Each task ends with the exact focused tests listed in that task and a small commit. Run the full verification matrix in Task 16.

## File Map

### Shared contracts

- Modify `packages/shared/src/index.ts`: AI enums, request/response schemas, feature flag, and exported API types.
- Modify `packages/shared/src/index.test.ts`: contract and feature-flag tests.

### API persistence and domain layer

- Modify `apps/api/prisma/schema.prisma`: AI relations and four AI models.
- Create `apps/api/prisma/migrations/000026_ai_assistant/migration.sql`: AI tables, indexes, and foreign keys.
- Modify `apps/api/src/db.ts`: incremental AI schema bootstrap.
- Modify `apps/api/src/db.test.ts`: schema bootstrap expectations.
- Create `apps/api/src/services/task-domain.ts` and `.test.ts`: task query and commands shared by routes and AI.
- Create `apps/api/src/services/anniversary-domain.ts` and `.test.ts`: anniversary query and commands.
- Create `apps/api/src/services/habit-domain.ts` and `.test.ts`: habit query, commands, check-in, and cancellation.
- Modify `apps/api/src/routes/tasks.ts`, `anniversaries.ts`, and `habits.ts`: delegate CRUD to domain services.

### DeepSeek and AI backend

- Modify `apps/api/src/config.ts` and `apps/api/.env.example`: server-only DeepSeek configuration.
- Create `apps/api/src/services/deepseek-client.ts` and `.test.ts`: authenticated HTTP client, timeout, and response normalization.
- Create `apps/api/src/services/ai-tools.ts` and `.test.ts`: read-only tool definitions, execution, and observed-record registry.
- Create `apps/api/src/services/ai-store.ts` and `.test.ts`: sessions, messages, proposals, versioning, idempotency, and status persistence.
- Create `apps/api/src/services/ai-prompt.ts`: system prompt and JSON result instructions.
- Create `apps/api/src/services/ai-orchestrator.ts` and `.test.ts`: context compaction, tool loop, output validation, and proposal creation.
- Create `apps/api/src/services/ai-executor.ts` and `.test.ts`: confirmed per-item execution and truthful result aggregation.
- Create `apps/api/src/routes/ai.ts` and `apps/api/src/routes/ai.test.ts`: authenticated HTTP endpoints.
- Modify `apps/api/src/app.ts`: register AI routes.
- Modify `apps/api/src/services/app-bootstrap.ts` and `.test.ts`: expose `featureFlags.aiAssistant` only when the server is configured.
- Modify `apps/api/src/routes/app-bootstrap.ts`: pass DeepSeek configuration to bootstrap construction.

### Desktop client and UI

- Modify `apps/desktop/src/api/client.ts` and `.test.ts`: typed AI endpoints.
- Create `apps/desktop/src/components/ai/useAiAssistant.ts` and `.test.tsx`: session/message/request state.
- Create `apps/desktop/src/components/ai/AiAssistant.tsx` and `.test.tsx`: floating button, panel, and orchestration shell.
- Create `apps/desktop/src/components/ai/AiSessionRail.tsx`: collapsed/expanded session navigation.
- Create `apps/desktop/src/components/ai/AiMessageList.tsx`: message and query-result rendering.
- Create `apps/desktop/src/components/ai/AiComposer.tsx`: keyboard and request-state behavior.
- Create `apps/desktop/src/components/ai/AiProposalCard.tsx` and `.test.tsx`: edit/remove/confirm/cancel/retry flows.
- Create `apps/desktop/src/components/ai/AiActionEditor.tsx`: action-type dispatch.
- Create `apps/desktop/src/components/ai/AiTaskActionEditor.tsx`: task fields.
- Create `apps/desktop/src/components/ai/AiAnniversaryActionEditor.tsx`: anniversary fields.
- Create `apps/desktop/src/components/ai/AiHabitActionEditor.tsx`: habit fields.
- Create `apps/desktop/src/components/ai/AiCheckInActionEditor.tsx`: check-in date and note.
- Create `apps/desktop/src/components/ai/proposalDraft.ts` and `.test.ts`: immutable proposal edits and request mapping.
- Modify `apps/desktop/src/lib/desktopSync.ts` and `.test.ts`: cross-window domain reload event.
- Modify `apps/desktop/src/App.tsx` and `App.test.tsx`: feature-gated global assistant and local refresh signals.
- Modify `apps/desktop/src/components/AnniversaryPanel.tsx` and `.test.tsx`: refresh signal.
- Modify `apps/desktop/src/components/HabitPanel.tsx` and `.test.tsx`: refresh signal.
- Modify `apps/desktop/src/components/FloatingCard.tsx` and `.test.tsx`: external AI-triggered task/habit reloads.
- Modify `apps/desktop/src/styles.css`: compact bottom-right assistant styling.

### Documentation and smoke verification

- Create `apps/api/src/services/deepseek-smoke.test.ts`: explicit opt-in real-API smoke test.
- Modify `README.md`: server environment and smoke-test instructions without secrets.

---

### Task 1: Add shared AI contracts and the bootstrap feature flag

**Files:**
- Modify: `packages/shared/src/index.ts:20-540`
- Modify: `packages/shared/src/index.ts:550-790`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Produces: `AiModelResult`, `AiAction`, `ApiAiSession`, `ApiAiMessage`, `ApiAiProposal`, `ApiAiActionItem`.
- Produces: `createAiSessionRequestSchema`, `updateAiSessionRequestSchema`, `sendAiMessageRequestSchema`, `updateAiProposalRequestSchema`, `confirmAiProposalRequestSchema`.
- Produces: `AppFeatureFlags.aiAssistant: boolean`.

- [ ] **Step 1: Write failing contract tests**

Add a focused `describe("AI assistant contracts", ...)` block that proves a valid query answer, clarification, batch proposal, proposal edit, and confirmation parse, while an update without `targetId` and a create with `targetId` fail:

```ts
expect(aiModelResultSchema.parse({
  type: "proposal",
  summary: "创建两个待办",
  actions: [
    {
      clientId: "action-1",
      objectType: "TASK",
      actionType: "CREATE",
      targetId: null,
      input: {
        title: "买咖啡豆",
        startAt: null,
        dueAt: "2026-07-11T06:00:00.000Z",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        recurrenceRule: null,
        tagId: null
      }
    }
  ]
}).actions).toHaveLength(1);

expect(aiActionSchema.safeParse({
  clientId: "bad-update",
  objectType: "TASK",
  actionType: "UPDATE",
  targetId: null,
  input: { title: "缺少目标" }
}).success).toBe(false);

expect(confirmAiProposalRequestSchema.parse({
  version: 3,
  idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
})).toEqual({
  version: 3,
  idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
});
```

Update the shared default bootstrap expectation with `aiAssistant: true`. Task 11 will turn it off when the API key is absent, and Task 15 will force the desktop fallback to false until bootstrap succeeds.

- [ ] **Step 2: Run the tests and verify the new exports are missing**

Run: `npm test -w @todo/shared -- src/index.test.ts -t "AI assistant contracts|app bootstrap schema"`

Expected: FAIL with missing `aiModelResultSchema` exports or missing `aiAssistant` in the feature-flag schema.

- [ ] **Step 3: Implement the shared discriminated contracts**

Add literal value arrays and Zod schemas. Use an ordinary `z.union` for actions because multiple object types share action names:

```ts
export const aiObjectTypeValues = ["TASK", "ANNIVERSARY", "HABIT", "HABIT_CHECKIN"] as const;
export const aiProposalStatusValues = [
  "PENDING_CONFIRMATION",
  "EXECUTING",
  "SUCCEEDED",
  "PARTIAL_FAILED",
  "FAILED",
  "CANCELLED",
  "EXPIRED"
] as const;
export const aiActionItemStatusValues = ["PENDING", "SUCCEEDED", "FAILED"] as const;
export const aiMessageRoleValues = ["USER", "ASSISTANT"] as const;
export const aiMessageKindValues = [
  "TEXT",
  "QUERY_RESULT",
  "CLARIFICATION",
  "PROPOSAL",
  "EXECUTION_RESULT",
  "ERROR"
] as const;

const aiTaskCreateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("TASK"),
  actionType: z.literal("CREATE"),
  targetId: z.null(),
  input: createTaskRequestSchema
});

const aiTaskUpdateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("TASK"),
  actionType: z.literal("UPDATE"),
  targetId: z.string().min(1),
  input: updateTaskRequestSchema
});

const noActionInputSchema = z.object({}).strict();

const aiTaskDeleteActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("TASK"),
  actionType: z.literal("DELETE"),
  targetId: z.string().min(1),
  input: noActionInputSchema
});

const aiAnniversaryCreateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("ANNIVERSARY"),
  actionType: z.literal("CREATE"),
  targetId: z.null(),
  input: createAnniversaryRequestSchema
});

const aiAnniversaryUpdateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("ANNIVERSARY"),
  actionType: z.literal("UPDATE"),
  targetId: z.string().min(1),
  input: updateAnniversaryRequestSchema
});

const aiAnniversaryDeleteActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("ANNIVERSARY"),
  actionType: z.literal("DELETE"),
  targetId: z.string().min(1),
  input: noActionInputSchema
});

const aiHabitCreateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("HABIT"),
  actionType: z.literal("CREATE"),
  targetId: z.null(),
  input: createHabitRequestSchema
});

const aiHabitUpdateActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("HABIT"),
  actionType: z.literal("UPDATE"),
  targetId: z.string().min(1),
  input: updateHabitRequestSchema
});

const aiHabitTargetActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("HABIT"),
  actionType: z.enum(["DELETE", "ARCHIVE", "RESTORE"]),
  targetId: z.string().min(1),
  input: noActionInputSchema
});

const aiHabitCheckInActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("HABIT_CHECKIN"),
  actionType: z.literal("CHECK_IN"),
  targetId: z.string().min(1),
  input: habitCheckInRequestSchema
});

const aiHabitCancelCheckInActionSchema = z.object({
  clientId: z.string().min(1),
  objectType: z.literal("HABIT_CHECKIN"),
  actionType: z.literal("CANCEL_CHECK_IN"),
  targetId: z.string().min(1),
  input: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
});

export const aiActionSchema = z.union([
  aiTaskCreateActionSchema,
  aiTaskUpdateActionSchema,
  aiTaskDeleteActionSchema,
  aiAnniversaryCreateActionSchema,
  aiAnniversaryUpdateActionSchema,
  aiAnniversaryDeleteActionSchema,
  aiHabitCreateActionSchema,
  aiHabitUpdateActionSchema,
  aiHabitTargetActionSchema,
  aiHabitCheckInActionSchema,
  aiHabitCancelCheckInActionSchema
]);

export const aiModelResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("answer"),
    text: z.string().trim().min(1).max(4000),
    records: z.array(z.object({
      objectType: z.enum(aiObjectTypeValues),
      id: z.string().min(1)
    })).max(50)
  }),
  z.object({
    type: z.literal("clarification"),
    prompt: z.string().trim().min(1).max(1000),
    candidates: z.array(z.object({
      objectType: z.enum(aiObjectTypeValues),
      id: z.string().min(1),
      label: z.string().min(1).max(240)
    })).max(20)
  }),
  z.object({
    type: z.literal("proposal"),
    summary: z.string().trim().min(1).max(1000),
    actions: z.array(aiActionSchema).min(1).max(50)
  })
]);

export const createAiSessionRequestSchema = z.object({});
export const updateAiSessionRequestSchema = z.object({ title: z.string().trim().min(1).max(160) });
export const sendAiMessageRequestSchema = z.object({ content: z.string().trim().min(1).max(4000) });
export const updateAiProposalRequestSchema = z.object({
  version: z.number().int().min(1),
  actions: z.array(aiActionSchema).min(1).max(50)
});
export const confirmAiProposalRequestSchema = z.object({
  version: z.number().int().min(1),
  idempotencyKey: z.string().uuid()
});
export const cancelAiProposalRequestSchema = z.object({ version: z.number().int().min(1) });

export type AiAction = z.infer<typeof aiActionSchema>;
export type AiModelResult = z.infer<typeof aiModelResultSchema>;
export type CreateAiSessionRequest = z.infer<typeof createAiSessionRequestSchema>;
export type UpdateAiSessionRequest = z.infer<typeof updateAiSessionRequestSchema>;
export type SendAiMessageRequest = z.infer<typeof sendAiMessageRequestSchema>;
export type UpdateAiProposalRequest = z.infer<typeof updateAiProposalRequestSchema>;
export type ConfirmAiProposalRequest = z.infer<typeof confirmAiProposalRequestSchema>;
export type CancelAiProposalRequest = z.infer<typeof cancelAiProposalRequestSchema>;
export type AiObjectType = (typeof aiObjectTypeValues)[number];
export type AiProposalStatus = (typeof aiProposalStatusValues)[number];
export type AiActionItemStatus = (typeof aiActionItemStatusValues)[number];
export type AiChangedDomain = "tasks" | "anniversaries" | "habits";

export interface ApiAiSession {
  id: string;
  title: string;
  summary: string | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiAiActionItem {
  id: string;
  position: number;
  objectType: AiObjectType;
  actionType: AiAction["actionType"];
  targetId: string | null;
  input: AiAction["input"];
  targetSnapshot: Record<string, unknown> | null;
  status: AiActionItemStatus;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ApiAiProposal {
  id: string;
  sessionId: string;
  messageId: string;
  status: AiProposalStatus;
  version: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  items: ApiAiActionItem[];
}

export interface ApiAiMessage {
  id: string;
  sessionId: string;
  role: (typeof aiMessageRoleValues)[number];
  kind: (typeof aiMessageKindValues)[number];
  content: string;
  metadata: {
    records?: Array<{ objectType: AiObjectType; id: string; data: Record<string, unknown> }>;
    candidates?: Array<{ objectType: AiObjectType; id: string; label: string }>;
    proposal?: ApiAiProposal;
  } | null;
  createdAt: string;
}
```

Add `aiAssistant: z.boolean()` and `aiAssistant: true` to the shared feature-flag schema/default. The server and desktop fallback enforce safe availability in Tasks 11 and 15.

- [ ] **Step 4: Run shared tests and build**

Run: `npm test -w @todo/shared -- src/index.test.ts -t "AI assistant contracts|app bootstrap schema"`

Expected: PASS.

Run: `npm run build -w @todo/shared`

Expected: exit 0 and updated declarations in `packages/shared/dist` without committing generated output.

- [ ] **Step 5: Commit the shared contract**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.test.ts
git commit -m "feat: add AI assistant contracts"
```

### Task 2: Add AI persistence schema and incremental bootstrap

**Files:**
- Modify: `apps/api/prisma/schema.prisma:49-330`
- Create: `apps/api/prisma/migrations/000026_ai_assistant/migration.sql`
- Modify: `apps/api/src/db.ts:330-450`
- Test: `apps/api/src/db.test.ts`

**Interfaces:**
- Produces MySQL tables: `AiSession`, `AiMessage`, `AiActionProposal`, `AiActionItem`.
- Produces: `ensureAiSchema()` invoked by `ensureIncrementalSchema()`.
- Consumes: status strings and JSON shapes from Task 1.

- [ ] **Step 1: Write failing incremental-schema tests**

Extend the `db.test.ts` mocked-SQL assertions to require all four tables and the proposal idempotency index:

```ts
expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiSession`");
expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiMessage`");
expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiActionProposal`");
expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiActionItem`");
expect(executedSql).toContain("AiActionProposal_userId_idempotencyKey_key");
```

- [ ] **Step 2: Run the focused database test and verify failure**

Run: `npm test -w @todo/api -- src/db.test.ts`

Expected: FAIL because AI table DDL is absent.

- [ ] **Step 3: Add Prisma models and the SQL migration**

Add relations to `User` and create models with these exact ownership and cascade rules:

```prisma
model AiSession {
  id            String             @id @default(cuid())
  userId        String
  title         String
  summary       String?            @db.Text
  lastMessageAt DateTime           @default(now())
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages      AiMessage[]
  proposals     AiActionProposal[]

  @@index([userId, lastMessageAt])
}

model AiMessage {
  id           String            @id @default(cuid())
  sessionId    String
  role         String
  kind         String
  content      String            @db.Text
  metadataJson Json?
  createdAt    DateTime          @default(now())
  session      AiSession         @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  proposal     AiActionProposal?

  @@index([sessionId, createdAt])
}

model AiActionProposal {
  id             String         @id @default(cuid())
  sessionId      String
  messageId      String         @unique
  userId         String
  status         String         @default("PENDING_CONFIRMATION")
  version        Int            @default(1)
  idempotencyKey String?
  expiresAt      DateTime
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  session        AiSession      @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  message        AiMessage      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user           User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  items          AiActionItem[]

  @@unique([userId, idempotencyKey])
  @@index([userId, status, expiresAt])
  @@index([sessionId, createdAt])
}

model AiActionItem {
  id                 String           @id @default(cuid())
  proposalId         String
  position           Int
  objectType         String
  actionType         String
  targetId           String?
  inputJson          Json
  targetSnapshotJson Json?
  status             String           @default("PENDING")
  resultJson         Json?
  errorCode          String?
  errorMessage       String?          @db.Text
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt
  proposal           AiActionProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)

  @@unique([proposalId, position])
  @@index([proposalId, status])
}
```

Write equivalent `CREATE TABLE` statements in `000026_ai_assistant/migration.sql`. Use `VARCHAR(191)`, `LONGTEXT`/`TEXT` where appropriate, `JSON`, `DATETIME(3)`, utf8mb4, and named foreign keys consistent with existing migrations.

- [ ] **Step 4: Implement `ensureAiSchema()`**

Add idempotent `CREATE TABLE IF NOT EXISTS` DDL for all four tables in dependency order and call it from `ensureIncrementalSchema()` after existing domain tables:

```ts
async function ensureAiSchema() {
  await execute(`CREATE TABLE IF NOT EXISTS \`AiSession\` (...)`);
  await execute(`CREATE TABLE IF NOT EXISTS \`AiMessage\` (...)`);
  await execute(`CREATE TABLE IF NOT EXISTS \`AiActionProposal\` (...)`);
  await execute(`CREATE TABLE IF NOT EXISTS \`AiActionItem\` (...)`);
}
```

Expand each statement with the same columns, indexes, and constraints as the migration; do not use abbreviated DDL in the implementation.

- [ ] **Step 5: Verify schema tests and Prisma generation**

Run: `npm test -w @todo/api -- src/db.test.ts`

Expected: PASS.

Run: `npm run prisma:generate`

Expected: exit 0 with all four models accepted.

- [ ] **Step 6: Commit the persistence layer**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/000026_ai_assistant/migration.sql apps/api/src/db.ts apps/api/src/db.test.ts
git commit -m "feat: add AI assistant persistence"
```

### Task 3: Extract the reusable task domain service

**Files:**
- Create: `apps/api/src/services/task-domain.ts`
- Create: `apps/api/src/services/task-domain.test.ts`
- Modify: `apps/api/src/routes/tasks.ts:1-455`
- Test: `apps/api/src/routes/tasks.test.ts`

**Interfaces:**
- Produces: `listTasks(userId)`, `getTask(userId, taskId)`, `createTask(userId, input)`, `updateTask(userId, taskId, input)`, `deleteTask(userId, taskId)`.
- Produces: `TaskDomainError` with codes `NOT_FOUND`, `TAG_NOT_FOUND`, and `INVALID_TIME_RANGE`.
- Consumes: existing task request schemas from Task 1/shared package.

- [ ] **Step 1: Write failing service tests for ownership and serialization**

Create tests with the existing hoisted DB mock pattern. Cover create, update, delete, missing task, foreign tag, and serialized tags/recurrence:

```ts
await expect(createTask("user-1", {
  title: "交周报",
  notes: null,
  startAt: null,
  dueAt: "2026-07-10T09:00:00.000Z",
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  tagId: null,
  recurrenceRule: null
})).resolves.toMatchObject({ title: "交周报" });

expect(db.execute).toHaveBeenCalledWith(
  expect.stringContaining("INSERT INTO `Task`"),
  expect.arrayContaining(["user-1", "交周报"])
);
```

- [ ] **Step 2: Verify the service test fails before extraction**

Run: `npm test -w @todo/api -- src/services/task-domain.test.ts`

Expected: FAIL because `task-domain.ts` does not exist.

- [ ] **Step 3: Move task CRUD and serialization behind explicit functions**

Implement this public surface while moving the existing SQL/recurrence/tag logic without changing behavior:

```ts
export class TaskDomainError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "TAG_NOT_FOUND" | "INVALID_TIME_RANGE",
    message: string
  ) {
    super(message);
  }
}

export interface TaskDomainService {
  listTasks(userId: string): Promise<ApiTask[]>;
  getTask(userId: string, taskId: string): Promise<ApiTask | null>;
  createTask(userId: string, input: CreateTaskRequest): Promise<ApiTask>;
  updateTask(userId: string, taskId: string, input: UpdateTaskRequest): Promise<ApiTask>;
  deleteTask(userId: string, taskId: string): Promise<void>;
}

export const taskDomainService: TaskDomainService = {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask
};
```

Move the existing `TaskRow`, recurrence/tag helpers, serializer, create SQL, update transaction, and owned delete from `routes/tasks.ts` into private functions with the same names in `task-domain.ts`. Use `createTaskRequestSchema.parse` and `updateTaskRequestSchema.parse` inside the exported service methods so route callers and AI callers get identical validation. No SQL or behavior is rewritten in this extraction task.

- [ ] **Step 4: Delegate ordinary routes to the service**

Keep route-specific HTTP mapping in `routes/tasks.ts`:

```ts
app.post("/tasks", { preHandler: app.authenticate }, async (request, reply) => {
  try {
    const task = await createTask(request.user.id, request.body as CreateTaskRequest);
    return reply.code(201).send({ task });
  } catch (error) {
    return sendTaskDomainError(reply, error);
  }
});
```

Leave ordering, calendar expansion, and occurrence completion in the route for this task; only CRUD/query functions needed by AI move to the domain service.

- [ ] **Step 5: Verify service and route behavior**

Run: `npm test -w @todo/api -- src/services/task-domain.test.ts src/routes/tasks.test.ts`

Expected: PASS with the existing task route assertions unchanged except mocks/import locations.

- [ ] **Step 6: Commit the task boundary**

```bash
git add apps/api/src/services/task-domain.ts apps/api/src/services/task-domain.test.ts apps/api/src/routes/tasks.ts apps/api/src/routes/tasks.test.ts
git commit -m "refactor: extract task domain service"
```

### Task 4: Extract the reusable anniversary domain service

**Files:**
- Create: `apps/api/src/services/anniversary-domain.ts`
- Create: `apps/api/src/services/anniversary-domain.test.ts`
- Modify: `apps/api/src/routes/anniversaries.ts:1-275`
- Test: `apps/api/src/routes/anniversaries.test.ts`

**Interfaces:**
- Produces: `listAnniversaries(userId)`, `getAnniversary(userId, id)`, `createAnniversary(userId, input)`, `updateAnniversary(userId, id, input)`, `deleteAnniversary(userId, id)`.
- Produces: `AnniversaryDomainError` with code `NOT_FOUND`.
- Preserves lunar, solar, solar-term, repeat, direction, sort-order, and display calculation behavior.

- [ ] **Step 1: Write failing domain tests**

Cover owned query, lunar birthday creation, partial update normalization, and foreign-user rejection:

```ts
await expect(createAnniversary("user-1", {
  title: "生日",
  notes: null,
  category: "BIRTHDAY",
  date: "2027-03-12",
  repeat: "YEARLY",
  direction: "COUNTDOWN",
  cardStyle: "lavender",
  calendarType: "SOLAR",
  lunarMonth: null,
  lunarDay: null,
  solarTerm: null
})).resolves.toMatchObject({
  title: "生日",
  calendarType: "SOLAR"
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -w @todo/api -- src/services/anniversary-domain.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract the service without changing the route contract**

Implement:

```ts
export async function listAnniversaries(userId: string): Promise<ApiAnniversaryEvent[]>;
export async function getAnniversary(userId: string, id: string): Promise<ApiAnniversaryEvent | null>;
export async function createAnniversary(userId: string, input: CreateAnniversaryRequest): Promise<ApiAnniversaryEvent>;
export async function updateAnniversary(userId: string, id: string, input: UpdateAnniversaryRequest): Promise<ApiAnniversaryEvent>;
export async function deleteAnniversary(userId: string, id: string): Promise<void>;
```

Move `normalizeAnniversaryInput`, serialization, owned lookup, and CRUD SQL into the service. Keep manual ordering in the route.

- [ ] **Step 4: Update the HTTP routes to call the service**

Map `AnniversaryDomainError("NOT_FOUND")` to the existing 404 payload and keep Zod errors handled by the application error handler.

- [ ] **Step 5: Verify domain and route tests**

Run: `npm test -w @todo/api -- src/services/anniversary-domain.test.ts src/routes/anniversaries.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the anniversary boundary**

```bash
git add apps/api/src/services/anniversary-domain.ts apps/api/src/services/anniversary-domain.test.ts apps/api/src/routes/anniversaries.ts apps/api/src/routes/anniversaries.test.ts
git commit -m "refactor: extract anniversary domain service"
```

### Task 5: Extract the reusable habit and check-in domain service

**Files:**
- Create: `apps/api/src/services/habit-domain.ts`
- Create: `apps/api/src/services/habit-domain.test.ts`
- Modify: `apps/api/src/routes/habits.ts:1-430`
- Test: `apps/api/src/routes/habits.test.ts`

**Interfaces:**
- Produces: `listHabits(userId, includeArchived)`, `getHabit(userId, id)`, `createHabit`, `updateHabit`, `deleteHabit`, `checkInHabit`, `cancelHabitCheckIn`.
- Produces: `HabitDomainError` with codes `NOT_FOUND`, `ARCHIVED`, `FUTURE_CHECK_IN`, and `UNPLANNED_DATE`.
- Preserves current frequency normalization, `endDate: null`, stats, and check-in validity rules.

- [ ] **Step 1: Write failing domain tests**

Cover an open-ended daily habit, archive/restore, valid check-in, future rejection, unplanned-day rejection, and cancellation:

```ts
await expect(createHabit("user-1", {
  title: "喝咖啡",
  notes: null,
  icon: "Coffee",
  color: "mint",
  frequency: "DAILY",
  interval: 1,
  weekDays: [],
  monthDays: [],
  startDate: "2026-07-10",
  endDate: null
})).resolves.toMatchObject({
  title: "喝咖啡",
  endDate: null
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -w @todo/api -- src/services/habit-domain.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract habit CRUD, serialization, and check-ins**

Implement:

```ts
export async function listHabits(userId: string, includeArchived = false): Promise<ApiHabit[]>;
export async function getHabit(userId: string, id: string): Promise<ApiHabit | null>;
export async function createHabit(userId: string, input: CreateHabitRequest): Promise<ApiHabit>;
export async function updateHabit(userId: string, id: string, input: UpdateHabitRequest): Promise<ApiHabit>;
export async function deleteHabit(userId: string, id: string): Promise<void>;
export async function checkInHabit(userId: string, id: string, input: HabitCheckInRequest): Promise<ApiHabitLog>;
export async function cancelHabitCheckIn(userId: string, id: string, date: string): Promise<void>;
```

Move schedule normalization, owned lookups, stats serialization, `assertCheckInAllowed`, and CRUD/check-in SQL. Keep order and detail-calendar routes thin and backed by exported service helpers where needed.

- [ ] **Step 4: Update ordinary habit routes**

Use a `sendHabitDomainError` helper to preserve current HTTP status/error text. Do not weaken “future dates forbidden”, “planned date required”, or archived-habit restrictions for AI use.

- [ ] **Step 5: Verify domain and route tests**

Run: `npm test -w @todo/api -- src/services/habit-domain.test.ts src/routes/habits.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the habit boundary**

```bash
git add apps/api/src/services/habit-domain.ts apps/api/src/services/habit-domain.test.ts apps/api/src/routes/habits.ts apps/api/src/routes/habits.test.ts
git commit -m "refactor: extract habit domain service"
```

### Task 6: Add server-only DeepSeek configuration and HTTP client

**Files:**
- Modify: `apps/api/src/config.ts:15-70`
- Modify: `apps/api/.env.example`
- Create: `apps/api/src/services/deepseek-client.ts`
- Create: `apps/api/src/services/deepseek-client.test.ts`

**Interfaces:**
- Produces: `DeepSeekClient.complete(request): Promise<DeepSeekAssistantMessage>`.
- Produces: `DeepSeekClient.summarize(messages): Promise<string>`.
- Produces: `DeepSeekClientError` codes `NOT_CONFIGURED`, `TIMEOUT`, `RATE_LIMITED`, `UPSTREAM`, and `INVALID_RESPONSE`.
- Uses native `fetch`; no OpenAI SDK dependency.

- [ ] **Step 1: Write failing client tests**

Inject a mocked `fetchImpl` and assert the exact URL, bearer header, model, non-streaming body, timeout behavior, and sanitized errors:

```ts
const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
  choices: [{
    message: {
      role: "assistant",
      content: "{\"type\":\"answer\",\"text\":\"没有待办\",\"records\":[]}"
    }
  }]
}), { status: 200 }));

const client = new DeepSeekClient({
  apiKey: "test-key",
  apiUrl: "https://api.deepseek.com/v1/chat/completions",
  model: "deepseek-v4-pro",
  timeoutMs: 45_000,
  fetchImpl
});

await client.complete({ messages: [{ role: "user", content: "今天有什么待办" }], tools: [] });

expect(fetchImpl).toHaveBeenCalledWith(
  "https://api.deepseek.com/v1/chat/completions",
  expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({ Authorization: "Bearer test-key" })
  })
);
```

Also prove a 429 becomes `RATE_LIMITED`, an aborted request becomes `TIMEOUT`, an empty `choices` array becomes `INVALID_RESPONSE`, and no thrown message contains `test-key`.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @todo/api -- src/services/deepseek-client.test.ts`

Expected: FAIL because the client module does not exist.

- [ ] **Step 3: Add optional environment configuration**

Extend `envSchema` without making the whole API fail to boot when AI is not configured:

```ts
DEEPSEEK_API_KEY: z.string().optional().default(""),
DEEPSEEK_API_URL: z.string().url().default("https://api.deepseek.com/v1/chat/completions"),
DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-pro"),
DEEPSEEK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(45_000)
```

Add the same names to `.env.example` with an empty key. Never place a real-looking key in the example.

- [ ] **Step 4: Implement the typed native-fetch client**

Use these request/response types and one abort timer per request:

```ts
export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface DeepSeekAssistantMessage {
  role: "assistant";
  content: string | null;
  toolCalls: DeepSeekToolCall[];
}

export interface DeepSeekCompletionRequest {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    toolCallId?: string;
    toolCalls?: DeepSeekToolCall[];
  }>;
  tools: unknown[];
  jsonOutput?: boolean;
}

export interface DeepSeekClientOptions {
  apiKey: string;
  apiUrl: string;
  model: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
}

export class DeepSeekClientError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "TIMEOUT" | "RATE_LIMITED" | "UPSTREAM" | "INVALID_RESPONSE",
    message: string
  ) {
    super(message);
  }
}

function toWireMessages(messages: DeepSeekCompletionRequest["messages"]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {})
  }));
}

async function normalizeDeepSeekResponse(response: Response): Promise<DeepSeekAssistantMessage> {
  if (response.status === 429) throw new DeepSeekClientError("RATE_LIMITED", "AI service is busy");
  if (!response.ok) throw new DeepSeekClientError("UPSTREAM", `AI service returned ${response.status}`);
  const payload = await response.json() as {
    choices?: Array<{ message?: { role?: string; content?: string | null; tool_calls?: DeepSeekToolCall[] } }>;
  };
  const message = payload.choices?.[0]?.message;
  if (!message || message.role !== "assistant") {
    throw new DeepSeekClientError("INVALID_RESPONSE", "AI service returned an invalid response");
  }
  return { role: "assistant", content: message.content ?? null, toolCalls: message.tool_calls ?? [] };
}

export class DeepSeekClient {
  constructor(private readonly options: DeepSeekClientOptions) {}

  async complete(input: DeepSeekCompletionRequest): Promise<DeepSeekAssistantMessage> {
    if (!this.options.apiKey.trim()) {
      throw new DeepSeekClientError("NOT_CONFIGURED", "AI assistant is not configured");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.options.fetchImpl(this.options.apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: toWireMessages(input.messages),
          tools: input.tools,
          stream: false,
          ...(input.jsonOutput ? { response_format: { type: "json_object" } } : {})
        }),
        signal: controller.signal
      });
      return await normalizeDeepSeekResponse(response);
    } catch (error) {
      if (controller.signal.aborted) throw new DeepSeekClientError("TIMEOUT", "AI request timed out");
      if (error instanceof DeepSeekClientError) throw error;
      throw new DeepSeekClientError("UPSTREAM", "AI service request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  async summarize(parts: string[]): Promise<string> {
    const response = await this.complete({
      messages: [
        { role: "system", content: "Summarize todoDesk conversation context as JSON: {\"summary\": string}. Preserve referenced item names, dates, and unresolved user choices." },
        { role: "user", content: parts.join("\n").slice(0, 40_000) }
      ],
      tools: [],
      jsonOutput: true
    });
    return z.object({ summary: z.string().min(1).max(4000) }).parse(JSON.parse(response.content ?? "")).summary;
  }
}
```

Map upstream error bodies to stable local messages and never include headers, request bodies, or API keys in errors.

- [ ] **Step 5: Verify client tests and API typecheck**

Run: `npm test -w @todo/api -- src/services/deepseek-client.test.ts`

Expected: PASS.

Run: `npm run typecheck -w @todo/api`

Expected: exit 0.

- [ ] **Step 6: Commit the client**

```bash
git add apps/api/src/config.ts apps/api/.env.example apps/api/src/services/deepseek-client.ts apps/api/src/services/deepseek-client.test.ts
git commit -m "feat: add DeepSeek API client"
```

### Task 7: Implement read-only AI tools and observed-record validation

**Files:**
- Create: `apps/api/src/services/ai-tools.ts`
- Create: `apps/api/src/services/ai-tools.test.ts`

**Interfaces:**
- Consumes: domain query functions from Tasks 3-5.
- Produces: `AI_READ_TOOL_DEFINITIONS` for DeepSeek.
- Produces: `executeAiReadTool(name, rawArguments, context)`.
- Produces: `ObservedRecordRegistry` used by the orchestrator and proposal snapshotting.

- [ ] **Step 1: Write failing ownership, filter, and registry tests**

Use dependency injection to prove tools always call domain services with the authenticated context user and cap results at 50:

```ts
const context = createAiToolContext({
  userId: "user-1",
  taskDomain: { listTasks: vi.fn().mockResolvedValue([task]) },
  anniversaryDomain: fakeAnniversaryDomain,
  habitDomain: fakeHabitDomain
});

const result = await executeAiReadTool("search_tasks", JSON.stringify({
  query: "周报",
  statuses: ["TODO"],
  from: null,
  to: null,
  limit: 10
}), context);

expect(context.taskDomain.listTasks).toHaveBeenCalledWith("user-1");
expect(result.records).toEqual([expect.objectContaining({ id: task.id })]);
expect(context.observed.get("TASK", task.id)?.updatedAt).toBe(task.updatedAt);
```

Add equivalent tests for anniversaries, habits, and habit check-ins, plus invalid JSON arguments.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @todo/api -- src/services/ai-tools.test.ts`

Expected: FAIL because `ai-tools.ts` does not exist.

- [ ] **Step 3: Define tool argument schemas and DeepSeek JSON schemas**

Implement Zod schemas and JSON tool definitions with no `userId` property:

```ts
const searchTasksArgsSchema = z.object({
  query: z.string().trim().max(160),
  statuses: z.array(z.enum(taskStatusValues)).max(taskStatusValues.length),
  from: z.string().datetime().nullable(),
  to: z.string().datetime().nullable(),
  limit: z.number().int().min(1).max(50)
});

const searchAnniversariesArgsSchema = z.object({
  query: z.string().trim().max(160),
  categories: z.array(z.enum(anniversaryCategoryValues)).max(anniversaryCategoryValues.length),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  limit: z.number().int().min(1).max(50)
});

const searchHabitsArgsSchema = z.object({
  query: z.string().trim().max(160),
  includeArchived: z.boolean(),
  limit: z.number().int().min(1).max(50)
});

const getHabitCheckInsArgsSchema = z.object({
  habitId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.number().int().min(1).max(50)
});

export const AI_READ_TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_tasks",
      description: "Search the authenticated user's todoDesk tasks.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          statuses: { type: "array", items: { type: "string", enum: taskStatusValues } },
          from: { anyOf: [{ type: "string" }, { type: "null" }] },
          to: { anyOf: [{ type: "string" }, { type: "null" }] },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "statuses", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_anniversaries",
      description: "Search the authenticated user's anniversaries, birthdays, holidays, and countdowns.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          categories: { type: "array", items: { type: "string", enum: anniversaryCategoryValues } },
          from: { anyOf: [{ type: "string" }, { type: "null" }] },
          to: { anyOf: [{ type: "string" }, { type: "null" }] },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "categories", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_habits",
      description: "Search the authenticated user's habits.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          includeArchived: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["query", "includeArchived", "limit"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_habit_checkins",
      description: "Read check-ins for one observed habit owned by the authenticated user.",
      parameters: {
        type: "object",
        properties: {
          habitId: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 }
        },
        required: ["habitId", "from", "to", "limit"],
        additionalProperties: false
      }
    }
  }
] as const;
```

Validate parsed arguments with the matching Zod schema before each domain query. Keep the hand-written JSON Schema and Zod schema property names identical.

- [ ] **Step 4: Implement execution and observation**

Define an observed snapshot that never trusts model-provided ownership:

```ts
export interface ObservedRecord {
  objectType: AiObjectType;
  id: string;
  updatedAt: string;
  snapshot: Record<string, unknown>;
}

export class ObservedRecordRegistry {
  private readonly records = new Map<string, ObservedRecord>();
  add(record: ObservedRecord) { this.records.set(`${record.objectType}:${record.id}`, record); }
  get(objectType: AiObjectType, id: string) { return this.records.get(`${objectType}:${id}`); }
  has(objectType: AiObjectType, id: string) { return this.records.has(`${objectType}:${id}`); }
  snapshotMap() { return new Map(this.records); }
}
```

Filter records in application code, return only fields required for display/target selection, and register every returned record. `search_habits` registers `HABIT:<habitId>`. `get_habit_checkins` first requires that habit observation, then registers each returned log under `HABIT_CHECKIN:<habitId>:<date>`. A `CHECK_IN` action targets the observed habit ID; a `CANCEL_CHECK_IN` action targets the habit ID and must also match the composite observed check-in key for its input date.

- [ ] **Step 5: Verify tool tests**

Run: `npm test -w @todo/api -- src/services/ai-tools.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the read-only tools**

```bash
git add apps/api/src/services/ai-tools.ts apps/api/src/services/ai-tools.test.ts
git commit -m "feat: add read-only AI tools"
```

### Task 8: Persist AI sessions, messages, proposals, and execution state

**Files:**
- Create: `apps/api/src/services/ai-store.ts`
- Create: `apps/api/src/services/ai-store.test.ts`

**Interfaces:**
- Produces: `AiStore` with session/message/proposal methods.
- Produces: `AiStoreConflictError` codes `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE`, `EXPIRED`, and `IDEMPOTENCY_CONFLICT`.
- Consumes: Task 1 API types and Task 2 tables.

- [ ] **Step 1: Write failing store tests**

Cover user-scoped session list/create/rename/delete, cursor message pagination, append-message title update, proposal creation, versioned editing, cancellation, execution claim, per-item results, and repeated idempotency key:

```ts
const proposal = await store.createProposal({
  userId: "user-1",
  sessionId: "session-1",
  messageId: "message-2",
  expiresAt: new Date("2026-07-10T12:30:00.000Z"),
  actions: [action],
  observedRecords
});

await expect(store.updateProposal({
  userId: "user-1",
  proposalId: proposal.id,
  expectedVersion: 1,
  actions: editedActions
})).resolves.toMatchObject({ version: 2 });

await expect(store.updateProposal({
  userId: "user-1",
  proposalId: proposal.id,
  expectedVersion: 1,
  actions: editedActions
})).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @todo/api -- src/services/ai-store.test.ts`

Expected: FAIL because `ai-store.ts` does not exist.

- [ ] **Step 3: Implement session and message methods**

Expose this exact surface:

```ts
export interface AppendAiMessageInput {
  userId: string;
  sessionId: string;
  role: "USER" | "ASSISTANT";
  kind: ApiAiMessage["kind"];
  content: string;
  metadata: ApiAiMessage["metadata"];
}

export interface CreateAiProposalInput {
  userId: string;
  sessionId: string;
  messageId: string;
  expiresAt: Date;
  actions: AiAction[];
  observedRecords: ReadonlyMap<string, ObservedRecord>;
}

export interface UpdateAiProposalInput {
  userId: string;
  proposalId: string;
  expectedVersion: number;
  actions: AiAction[];
}

export interface RecordAiActionResultInput {
  proposalId: string;
  itemId: string;
  status: "SUCCEEDED" | "FAILED";
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface AiStore {
  listSessions(userId: string): Promise<ApiAiSession[]>;
  createSession(userId: string): Promise<ApiAiSession>;
  renameSession(userId: string, sessionId: string, title: string): Promise<ApiAiSession>;
  deleteSession(userId: string, sessionId: string): Promise<void>;
  getSession(userId: string, sessionId: string): Promise<ApiAiSession | null>;
  listMessages(userId: string, sessionId: string, cursor?: string, limit?: number): Promise<{
    messages: ApiAiMessage[];
    nextCursor: string | null;
  }>;
  appendMessage(input: AppendAiMessageInput): Promise<ApiAiMessage>;
  loadConversationContext(userId: string, sessionId: string, recentLimit: number): Promise<{
    session: ApiAiSession;
    recentMessages: ApiAiMessage[];
    overflowMessages: ApiAiMessage[];
  }>;
  updateSessionSummary(userId: string, sessionId: string, summary: string): Promise<void>;
}
```

Every SQL statement must include an owned session lookup or `userId` predicate. Generate the default title from the first user message using `content.trim().slice(0, 40)`; later model-generated title improvement is out of scope.

- [ ] **Step 4: Implement proposal and execution-state methods**

Extend the same `AiStore` interface with:

```ts
createProposal(input: CreateAiProposalInput): Promise<ApiAiProposal>;
getProposal(userId: string, proposalId: string): Promise<ApiAiProposal | null>;
updateProposal(input: UpdateAiProposalInput): Promise<ApiAiProposal>;
cancelProposal(userId: string, proposalId: string, expectedVersion: number): Promise<ApiAiProposal>;
claimProposalForExecution(input: {
  userId: string;
  proposalId: string;
  expectedVersion: number;
  idempotencyKey: string;
  now: Date;
}): Promise<{ proposal: ApiAiProposal; replay: boolean }>;
recordActionResult(input: RecordAiActionResultInput): Promise<void>;
finishProposal(userId: string, proposalId: string): Promise<ApiAiProposal>;
resetFailedItemsForRetry(userId: string, proposalId: string): Promise<ApiAiProposal>;
```

Use conditional updates for edit, cancel, and execution claim. Cancellation must match `userId`, `id`, `version`, and `PENDING_CONFIRMATION` atomically. Execution uses `UPDATE ... WHERE userId = ? AND id = ? AND version = ? AND status = 'PENDING_CONFIRMATION'`. If a matching idempotency key already exists, return its stored proposal with `replay: true`. `resetFailedItemsForRetry` increments the version, resets only failed items to `PENDING`, changes the proposal back to `PENDING_CONFIRMATION`, and clears the previous `idempotencyKey` before a new retry claim.

- [ ] **Step 5: Verify store tests**

Run: `npm test -w @todo/api -- src/services/ai-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the store**

```bash
git add apps/api/src/services/ai-store.ts apps/api/src/services/ai-store.test.ts
git commit -m "feat: persist AI conversations and proposals"
```

### Task 9: Implement the prompt, context compaction, and orchestrator

**Files:**
- Create: `apps/api/src/services/ai-prompt.ts`
- Create: `apps/api/src/services/ai-orchestrator.ts`
- Create: `apps/api/src/services/ai-orchestrator.test.ts`

**Interfaces:**
- Consumes: `DeepSeekClient`, `AiStore`, AI read tools, and Task 1 schemas.
- Produces: `AiOrchestrator.processUserMessage(userId, sessionId, content): Promise<ProcessAiMessageResult>`.
- Produces: validated `TEXT`, `QUERY_RESULT`, `CLARIFICATION`, or `PROPOSAL` assistant messages.

- [ ] **Step 1: Write failing orchestrator tests**

Cover direct answer, one and multiple tool calls, maximum four rounds, invalid output repair once, invalid record reference rejection, update/delete target observation, proposal persistence without execution, and context summary after more than 20 messages:

```ts
deepSeek.complete
  .mockResolvedValueOnce({
    role: "assistant",
    content: null,
    toolCalls: [{
      id: "tool-1",
      type: "function",
      function: { name: "search_tasks", arguments: "{\"query\":\"周报\",\"statuses\":[\"TODO\"],\"from\":null,\"to\":null,\"limit\":10}" }
    }]
  })
  .mockResolvedValueOnce({
    role: "assistant",
    content: "{\"type\":\"answer\",\"text\":\"找到 1 个待办\",\"records\":[{\"objectType\":\"TASK\",\"id\":\"task-1\"}]}",
    toolCalls: []
  });

const result = await orchestrator.processUserMessage("user-1", "session-1", "周报还没做吗");
expect(result.assistantMessage.kind).toBe("QUERY_RESULT");
expect(store.createProposal).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @todo/api -- src/services/ai-orchestrator.test.ts`

Expected: FAIL because the prompt/orchestrator modules do not exist.

- [ ] **Step 3: Write the bounded system prompt**

Export a pure builder whose output includes the current Beijing date/time, domain boundary, allowed result types, explicit confirmation rule, and JSON examples:

```ts
export function buildAiSystemPrompt(now: Date) {
  const beijingNow = formatInTimeZone(now, "Asia/Shanghai");
  return [
    "You are the todoDesk transaction assistant.",
    "Only handle tasks, anniversaries, habits, and habit check-ins.",
    "You may call read-only tools. Never claim a write succeeded.",
    "For every write intent, return type=proposal. The server will ask the user to confirm.",
    "For ambiguous targets, return type=clarification and candidates from tool results.",
    `Current time: ${beijingNow} Asia/Shanghai.`,
    "Return one JSON object matching answer, clarification, or proposal."
  ].join("\n");
}
```

Implement `formatInTimeZone` with `Intl.DateTimeFormat` and an ISO-like `YYYY-MM-DD HH:mm:ss` result; do not add a timezone dependency.

- [ ] **Step 4: Implement the tool loop and final validation**

The core loop must be bounded and append assistant/tool messages correctly:

```ts
export interface ProcessAiMessageResult {
  userMessage: ApiAiMessage;
  assistantMessage: ApiAiMessage;
}

for (let round = 0; round < 4; round += 1) {
  const assistant = await deepSeek.complete({
    messages,
    tools: AI_READ_TOOL_DEFINITIONS,
    jsonOutput: true
  });
  messages.push(toConversationAssistantMessage(assistant));

  if (assistant.toolCalls.length === 0) {
    return validateAndPersistFinalResult(assistant.content, context);
  }

  for (const call of assistant.toolCalls) {
    const result = await executeAiReadTool(call.function.name, call.function.arguments, context);
    messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
  }
}
throw new AiOrchestratorError("TOOL_LIMIT", "AI tool limit exceeded");

function toConversationAssistantMessage(message: DeepSeekAssistantMessage) {
  return {
    role: "assistant" as const,
    content: message.content,
    toolCalls: message.toolCalls
  };
}

async function validateAndPersistFinalResult(
  content: string | null,
  context: AiOrchestrationContext
): Promise<ProcessAiMessageResult> {
  const result = await parseModelResultWithOneRepair(content, context);
  validateObservedReferences(result, context.observed);

  if (result.type === "answer") {
    const records = result.records.map((record) => {
      const observed = context.observed.get(record.objectType, record.id)!;
      return { objectType: record.objectType, id: record.id, data: observed.snapshot };
    });
    const assistantMessage = await context.store.appendMessage({
      userId: context.userId,
      sessionId: context.sessionId,
      role: "ASSISTANT",
      kind: "QUERY_RESULT",
      content: result.text,
      metadata: { records }
    });
    return { userMessage: context.userMessage, assistantMessage };
  }

  if (result.type === "clarification") {
    const assistantMessage = await context.store.appendMessage({
      userId: context.userId,
      sessionId: context.sessionId,
      role: "ASSISTANT",
      kind: "CLARIFICATION",
      content: result.prompt,
      metadata: { candidates: result.candidates }
    });
    return { userMessage: context.userMessage, assistantMessage };
  }

  const baseMessage = await context.store.appendMessage({
    userId: context.userId,
    sessionId: context.sessionId,
    role: "ASSISTANT",
    kind: "PROPOSAL",
    content: result.summary,
    metadata: null
  });
  const proposal = await context.store.createProposal({
    userId: context.userId,
    sessionId: context.sessionId,
    messageId: baseMessage.id,
    expiresAt: new Date(context.now.getTime() + 30 * 60 * 1000),
    actions: result.actions,
    observedRecords: context.observed.snapshotMap()
  });
  return {
    userMessage: context.userMessage,
    assistantMessage: { ...baseMessage, metadata: { proposal } }
  };
}
```

Define `AiOrchestrationContext` with `userId`, `sessionId`, `now`, `userMessage`, `store`, `deepSeek`, and `observed`. `validateObservedReferences` rejects answer records and clarification candidates absent from the registry. For ordinary non-create actions it requires `<objectType>:<targetId>`; for `CHECK_IN` it requires `HABIT:<targetId>`; for `CANCEL_CHECK_IN` it requires both `HABIT:<targetId>` and `HABIT_CHECKIN:<targetId>:<input.date>`. `parseModelResultWithOneRepair` first parses `JSON.parse(content)` with `aiModelResultSchema`; on failure it makes one JSON-output repair call containing the validation issues and invalid output, parses once more, then throws `AiOrchestratorError("INVALID_RESULT", ...)` without creating a proposal. `AiStore.createProposal` copies the matching observed snapshots into proposal items and updates the message's `metadataJson` in the same transaction.

- [ ] **Step 5: Implement context compaction**

Load `summary + recent 20 messages`. When overflow messages exist, call `deepSeek.summarize` once and store a maximum 4,000-character summary:

```ts
const context = await store.loadConversationContext(userId, sessionId, 20);
if (context.overflowMessages.length > 0) {
  const summary = await deepSeek.summarize([
    context.session.summary ?? "",
    ...context.overflowMessages.map((message) => `${message.role}: ${message.content}`)
  ]);
  await store.updateSessionSummary(userId, sessionId, summary.slice(0, 4000));
}
```

Summary failure must not fail the user's main request; retain the previous summary and continue with recent messages.

- [ ] **Step 6: Verify orchestrator tests**

Run: `npm test -w @todo/api -- src/services/ai-orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the orchestrator**

```bash
git add apps/api/src/services/ai-prompt.ts apps/api/src/services/ai-orchestrator.ts apps/api/src/services/ai-orchestrator.test.ts
git commit -m "feat: orchestrate AI assistant messages"
```

### Task 10: Execute only confirmed proposals with truthful per-item results

**Files:**
- Create: `apps/api/src/services/ai-executor.ts`
- Create: `apps/api/src/services/ai-executor.test.ts`

**Interfaces:**
- Consumes: `AiStore` and domain command functions from Tasks 3-5.
- Produces: `AiActionExecutor.confirm(input)` and `AiActionExecutor.retryFailed(input)`.
- Returns: final `ApiAiProposal` plus changed domain names for desktop refresh.

- [ ] **Step 1: Write failing executor tests**

Cover: no write before `confirm`, successful create, stale snapshot rejection, cross-user target rejection, mixed success/failure, repeated idempotency replay, and retrying failed items only:

```ts
const result = await executor.confirm({
  userId: "user-1",
  proposalId: "proposal-1",
  expectedVersion: 2,
  idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f",
  now: new Date("2026-07-10T08:00:00.000Z")
});

expect(taskDomain.createTask).toHaveBeenCalledTimes(1);
expect(result.proposal.status).toBe("SUCCEEDED");
expect(result.changedDomains).toEqual(["tasks"]);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @todo/api -- src/services/ai-executor.test.ts`

Expected: FAIL because the executor does not exist.

- [ ] **Step 3: Implement action dispatch**

Use an exhaustive switch that reparses every item input before calling a domain service:

```ts
async function executeAction(userId: string, item: ApiAiActionItem) {
  if (item.objectType === "TASK" && item.actionType === "CREATE") {
    return taskDomain.createTask(userId, createTaskRequestSchema.parse(item.input));
  }
  if (item.objectType === "TASK" && item.actionType === "UPDATE") {
    await assertFreshTaskTarget(userId, item);
    return taskDomain.updateTask(userId, requireTargetId(item), updateTaskRequestSchema.parse(item.input));
  }
  if (item.objectType === "TASK" && item.actionType === "DELETE") {
    await assertFreshTaskTarget(userId, item);
    await taskDomain.deleteTask(userId, requireTargetId(item));
    return { id: requireTargetId(item), deleted: true };
  }
  if (item.objectType === "ANNIVERSARY" && item.actionType === "CREATE") {
    return anniversaryDomain.createAnniversary(userId, createAnniversaryRequestSchema.parse(item.input));
  }
  if (item.objectType === "ANNIVERSARY" && item.actionType === "UPDATE") {
    await assertFreshAnniversaryTarget(userId, item);
    return anniversaryDomain.updateAnniversary(userId, requireTargetId(item), updateAnniversaryRequestSchema.parse(item.input));
  }
  if (item.objectType === "ANNIVERSARY" && item.actionType === "DELETE") {
    await assertFreshAnniversaryTarget(userId, item);
    await anniversaryDomain.deleteAnniversary(userId, requireTargetId(item));
    return { id: requireTargetId(item), deleted: true };
  }
  if (item.objectType === "HABIT" && item.actionType === "CREATE") {
    return habitDomain.createHabit(userId, createHabitRequestSchema.parse(item.input));
  }
  if (item.objectType === "HABIT" && item.actionType === "UPDATE") {
    await assertFreshHabitTarget(userId, item);
    return habitDomain.updateHabit(userId, requireTargetId(item), updateHabitRequestSchema.parse(item.input));
  }
  if (item.objectType === "HABIT" && item.actionType === "DELETE") {
    await assertFreshHabitTarget(userId, item);
    await habitDomain.deleteHabit(userId, requireTargetId(item));
    return { id: requireTargetId(item), deleted: true };
  }
  if (item.objectType === "HABIT" && item.actionType === "ARCHIVE") {
    await assertFreshHabitTarget(userId, item);
    return habitDomain.updateHabit(userId, requireTargetId(item), { archived: true });
  }
  if (item.objectType === "HABIT" && item.actionType === "RESTORE") {
    await assertFreshHabitTarget(userId, item);
    return habitDomain.updateHabit(userId, requireTargetId(item), { archived: false });
  }
  if (item.objectType === "HABIT_CHECKIN" && item.actionType === "CHECK_IN") {
    await assertFreshHabitTarget(userId, item);
    return habitDomain.checkInHabit(userId, requireTargetId(item), habitCheckInRequestSchema.parse(item.input));
  }
  if (item.objectType === "HABIT_CHECKIN" && item.actionType === "CANCEL_CHECK_IN") {
    await assertFreshCheckInTarget(userId, item);
    const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(item.input);
    await habitDomain.cancelHabitCheckIn(userId, requireTargetId(item), input.date);
    return { habitId: requireTargetId(item), date: input.date, deleted: true };
  }
  throw new AiExecutionError("UNSUPPORTED_ACTION", `${item.objectType}:${item.actionType}`);
}
```

Implement `assertFreshTaskTarget`, `assertFreshAnniversaryTarget`, `assertFreshHabitTarget`, and `assertFreshCheckInTarget` by reloading the owned target and comparing current timestamps with `item.targetSnapshot`. A missing target maps to `NOT_FOUND`; a timestamp mismatch maps to `STALE_TARGET`; both perform no write. `CHECK_IN` stores and compares `{ habitUpdatedAt }`. `CANCEL_CHECK_IN` stores and compares `{ habitUpdatedAt, checkInUpdatedAt, date }` so neither the habit nor the log can silently change before confirmation.

- [ ] **Step 4: Aggregate per-item outcomes and idempotency**

Claim the proposal first. If `replay` is true, return stored results without dispatch. Otherwise execute items sequentially, record each result immediately, and call `finishProposal`:

```ts
for (const item of proposal.items.filter((candidate) => candidate.status === "PENDING")) {
  try {
    const result = await executeAction(userId, item);
    await store.recordActionResult({ proposalId, itemId: item.id, status: "SUCCEEDED", result });
  } catch (error) {
    await store.recordActionResult({
      proposalId,
      itemId: item.id,
      status: "FAILED",
      errorCode: domainErrorCode(error),
      errorMessage: safeDomainErrorMessage(error)
    });
  }
}
const finalProposal = await store.finishProposal(userId, proposalId);
```

`finishProposal` maps all success to `SUCCEEDED`, mixed results to `PARTIAL_FAILED`, and no successes to `FAILED`.

- [ ] **Step 5: Verify executor tests**

Run: `npm test -w @todo/api -- src/services/ai-executor.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the approval executor**

```bash
git add apps/api/src/services/ai-executor.ts apps/api/src/services/ai-executor.test.ts
git commit -m "feat: execute confirmed AI proposals"
```

### Task 11: Expose authenticated AI routes and configuration-aware bootstrap

**Files:**
- Create: `apps/api/src/routes/ai.ts`
- Create: `apps/api/src/routes/ai.test.ts`
- Modify: `apps/api/src/app.ts:1-100`
- Modify: `apps/api/src/services/app-bootstrap.ts`
- Modify: `apps/api/src/services/app-bootstrap.test.ts`
- Modify: `apps/api/src/routes/app-bootstrap.ts`

**Interfaces:**
- Consumes: `AiStore`, `AiOrchestrator`, and `AiActionExecutor`.
- Produces authenticated routes under `/ai`.
- Produces `featureFlags.aiAssistant = configuredFlag && Boolean(DEEPSEEK_API_KEY)`.

- [ ] **Step 1: Write failing route and bootstrap tests**

Create route dependencies as stubs and cover unauthenticated 401, user scoping, all route methods, status mapping, version conflict 409, unconfigured AI 503, and key-dependent bootstrap:

```ts
const deps: AiRouteDependencies = {
  configured: true,
  store: fakeStore,
  orchestrator: { processUserMessage: vi.fn() },
  executor: { confirm: vi.fn(), retryFailed: vi.fn() }
};

const response = await injectAi(deps, "POST", "/ai/sessions/session-1/messages", {
  content: "明天买咖啡豆"
});

expect(deps.orchestrator.processUserMessage).toHaveBeenCalledWith(
  "user-1",
  "session-1",
  "明天买咖啡豆"
);
```

In `app-bootstrap.test.ts`, assert a configured key exposes AI and an empty key forces it off even if `FEATURE_FLAGS_JSON` asks for it.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -w @todo/api -- src/routes/ai.test.ts src/services/app-bootstrap.test.ts`

Expected: FAIL because AI routes and bootstrap behavior are absent.

- [ ] **Step 3: Implement the route factory and error mapping**

Export a dependency-injected plugin factory:

```ts
export interface AiRouteDependencies {
  configured: boolean;
  store: AiStore;
  orchestrator: Pick<AiOrchestrator, "processUserMessage">;
  executor: Pick<AiActionExecutor, "confirm" | "retryFailed">;
}

export function createAiRoutes(deps: AiRouteDependencies) {
  return async function aiRoutes(app: FastifyInstance) {
    app.addHook("preHandler", app.authenticate);
    app.addHook("preHandler", async (_request, reply) => {
      if (!deps.configured) return reply.code(503).send({ error: "AI assistant is not configured" });
    });

    app.get("/ai/sessions", async (request) => ({
      sessions: await deps.store.listSessions(request.user.id)
    }));

    app.post("/ai/sessions", async (request, reply) => {
      createAiSessionRequestSchema.parse(request.body);
      return reply.code(201).send({ session: await deps.store.createSession(request.user.id) });
    });

    app.patch("/ai/sessions/:id", async (request) => {
      const { id } = request.params as { id: string };
      const body = updateAiSessionRequestSchema.parse(request.body);
      return { session: await deps.store.renameSession(request.user.id, id, body.title) };
    });

    app.delete("/ai/sessions/:id", async (request, reply) => {
      const { id } = request.params as { id: string };
      await deps.store.deleteSession(request.user.id, id);
      return reply.code(204).send();
    });

    app.get("/ai/sessions/:id/messages", async (request) => {
      const { id } = request.params as { id: string };
      const query = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
      return deps.store.listMessages(request.user.id, id, query.cursor, query.limit);
    });

    app.post("/ai/sessions/:id/messages", async (request) => {
      const { id } = request.params as { id: string };
      const body = sendAiMessageRequestSchema.parse(request.body);
      return deps.orchestrator.processUserMessage(request.user.id, id, body.content);
    });

    app.patch("/ai/proposals/:id", async (request) => {
      const { id } = request.params as { id: string };
      const body = updateAiProposalRequestSchema.parse(request.body);
      return { proposal: await deps.store.updateProposal({
        userId: request.user.id,
        proposalId: id,
        expectedVersion: body.version,
        actions: body.actions
      }) };
    });

    app.post("/ai/proposals/:id/confirm", async (request) => {
      const { id } = request.params as { id: string };
      const body = confirmAiProposalRequestSchema.parse(request.body);
      return deps.executor.confirm({ userId: request.user.id, proposalId: id, expectedVersion: body.version, idempotencyKey: body.idempotencyKey, now: new Date() });
    });

    app.post("/ai/proposals/:id/retry", async (request) => {
      const { id } = request.params as { id: string };
      const body = confirmAiProposalRequestSchema.parse(request.body);
      return deps.executor.retryFailed({ userId: request.user.id, proposalId: id, expectedVersion: body.version, idempotencyKey: body.idempotencyKey, now: new Date() });
    });

    app.post("/ai/proposals/:id/cancel", async (request) => {
      const { id } = request.params as { id: string };
      const body = cancelAiProposalRequestSchema.parse(request.body);
      return { proposal: await deps.store.cancelProposal(request.user.id, id, body.version) };
    });
  };
}
```

Wrap handlers with one route error mapper: `NOT_FOUND` → 404, `VERSION_CONFLICT`/`INVALID_STATE`/`IDEMPOTENCY_CONFLICT` → 409, `EXPIRED` → 410, DeepSeek `RATE_LIMITED` → 429, `TIMEOUT` → 504, and `NOT_CONFIGURED` → 503. Return local stable messages only; do not expose upstream bodies.

- [ ] **Step 4: Wire production dependencies and register the routes**

Construct the DeepSeek client, store, tools, orchestrator, and executor once in a small `createProductionAiDependencies(config)` function exported from `routes/ai.ts`. Register its plugin in `app.ts` after auth and domain routes.

Pass `DEEPSEEK_API_KEY` into `buildAppBootstrap` and compute:

```ts
const parsedFlags = parseFeatureFlags(config.FEATURE_FLAGS_JSON);
const featureFlags = {
  ...parsedFlags,
  aiAssistant: parsedFlags.aiAssistant && Boolean(config.DEEPSEEK_API_KEY.trim())
};
```

The desktop fallback in Task 15 will still force AI off until bootstrap succeeds.

- [ ] **Step 5: Verify route, bootstrap, and application tests**

Run: `npm test -w @todo/api -- src/routes/ai.test.ts src/services/app-bootstrap.test.ts src/app.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the AI HTTP surface**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/ai.test.ts apps/api/src/app.ts apps/api/src/services/app-bootstrap.ts apps/api/src/services/app-bootstrap.test.ts apps/api/src/routes/app-bootstrap.ts
git commit -m "feat: expose AI assistant API"
```

### Task 12: Add typed desktop API client methods

**Files:**
- Modify: `apps/desktop/src/api/client.ts:1-470`
- Modify: `apps/desktop/src/api/client.test.ts`

**Interfaces:**
- Consumes: Task 1 request/response types.
- Produces: `api.aiSessions`, `createAiSession`, `renameAiSession`, `deleteAiSession`, `aiMessages`, `sendAiMessage`, `updateAiProposal`, `confirmAiProposal`, `retryAiProposal`, and `cancelAiProposal`.

- [ ] **Step 1: Write failing request-shape tests**

Mock `fetch` and assert method, URL, and parsed body for message send, versioned edit, and confirmation:

```ts
await api.confirmAiProposal("proposal-1", {
  version: 2,
  idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
});

expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining("/ai/proposals/proposal-1/confirm"),
  expect.objectContaining({
    method: "POST",
    body: JSON.stringify({
      version: 2,
      idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
    })
  })
);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -w @todo/desktop -- src/api/client.test.ts -t "AI assistant"`

Expected: FAIL because AI client methods do not exist.

- [ ] **Step 3: Implement all typed client methods**

Follow the current `request<T>` pattern:

```ts
async aiSessions() {
  return request<{ sessions: ApiAiSession[] }>("/ai/sessions");
},
async createAiSession() {
  return request<{ session: ApiAiSession }>("/ai/sessions", {
    method: "POST",
    body: JSON.stringify(createAiSessionRequestSchema.parse({}))
  });
},
async renameAiSession(sessionId: string, input: UpdateAiSessionRequest) {
  return request<{ session: ApiAiSession }>(`/ai/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify(updateAiSessionRequestSchema.parse(input))
  });
},
async deleteAiSession(sessionId: string) {
  return request<void>(`/ai/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
},
async aiMessages(sessionId: string, cursor?: string) {
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return request<{ messages: ApiAiMessage[]; nextCursor: string | null }>(
    `/ai/sessions/${encodeURIComponent(sessionId)}/messages?${params}`
  );
},
async sendAiMessage(sessionId: string, input: SendAiMessageRequest) {
  return request<{ userMessage: ApiAiMessage; assistantMessage: ApiAiMessage }>(
    `/ai/sessions/${encodeURIComponent(sessionId)}/messages`,
    { method: "POST", body: JSON.stringify(sendAiMessageRequestSchema.parse(input)) }
  );
},
async updateAiProposal(proposalId: string, input: UpdateAiProposalRequest) {
  return request<{ proposal: ApiAiProposal }>(`/ai/proposals/${encodeURIComponent(proposalId)}`, {
    method: "PATCH",
    body: JSON.stringify(updateAiProposalRequestSchema.parse(input))
  });
},
async confirmAiProposal(proposalId: string, input: ConfirmAiProposalRequest) {
  return request<{ proposal: ApiAiProposal; changedDomains: AiChangedDomain[] }>(
    `/ai/proposals/${encodeURIComponent(proposalId)}/confirm`,
    { method: "POST", body: JSON.stringify(confirmAiProposalRequestSchema.parse(input)) }
  );
},
async retryAiProposal(proposalId: string, input: ConfirmAiProposalRequest) {
  return request<{ proposal: ApiAiProposal; changedDomains: AiChangedDomain[] }>(
    `/ai/proposals/${encodeURIComponent(proposalId)}/retry`,
    { method: "POST", body: JSON.stringify(confirmAiProposalRequestSchema.parse(input)) }
  );
},
async cancelAiProposal(proposalId: string, input: CancelAiProposalRequest) {
  return request<{ proposal: ApiAiProposal }>(`/ai/proposals/${encodeURIComponent(proposalId)}/cancel`, {
    method: "POST",
    body: JSON.stringify(cancelAiProposalRequestSchema.parse(input))
  });
}
```

Import every referenced request/response type and schema from `@todo/shared`; keep all identifiers exactly as defined in Task 1.

- [ ] **Step 4: Verify client tests and typecheck**

Run: `npm test -w @todo/desktop -- src/api/client.test.ts -t "AI assistant"`

Expected: PASS.

Run: `npm run typecheck -w @todo/desktop`

Expected: exit 0.

- [ ] **Step 5: Commit the desktop client**

```bash
git add apps/desktop/src/api/client.ts apps/desktop/src/api/client.test.ts
git commit -m "feat: add AI assistant desktop client"
```

### Task 13: Build the compact assistant shell, sessions, and query messages

**Files:**
- Create: `apps/desktop/src/components/ai/useAiAssistant.ts`
- Create: `apps/desktop/src/components/ai/useAiAssistant.test.tsx`
- Create: `apps/desktop/src/components/ai/AiAssistant.tsx`
- Create: `apps/desktop/src/components/ai/AiAssistant.test.tsx`
- Create: `apps/desktop/src/components/ai/AiSessionRail.tsx`
- Create: `apps/desktop/src/components/ai/AiMessageList.tsx`
- Create: `apps/desktop/src/components/ai/AiComposer.tsx`

**Interfaces:**
- Consumes: Task 12 `api` methods.
- Produces: `<AiAssistant enabled onDomainsChanged />`.
- Produces: session state with `activeSessionId`, `sessions`, `messages`, `loading`, `sending`, and `error`; panel `open` remains local to `AiAssistant`.

- [ ] **Step 1: Write failing hook and component tests**

Cover: icon toggles panel, empty first open creates a session, existing sessions load newest first, collapsed rail expands, session rename/delete, initial suggestions fill but do not send, Enter sends, Shift+Enter inserts a newline, repeated submit is blocked, and query records render:

```tsx
render(<AiAssistant enabled onDomainsChanged={vi.fn()} />);

fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }));
await screen.findByRole("dialog", { name: "AI 助手" });

fireEvent.click(screen.getByRole("button", { name: "我今天有哪些待办？" }));
expect(screen.getByRole("textbox", { name: "给 AI 助手发送消息" })).toHaveValue("我今天有哪些待办？");
expect(api.sendAiMessage).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -w @todo/desktop -- src/components/ai/useAiAssistant.test.tsx src/components/ai/AiAssistant.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the state hook**

Keep request sequencing in one focused hook:

```ts
export function useAiAssistant() {
  const [sessions, setSessions] = useState<ApiAiSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiAiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const errorMessage = (error: unknown) => error instanceof Error
    ? error.message
    : "AI 助手请求失败，请稍后重试";

  async function send(content: string) {
    if (!activeSessionId || sending || !content.trim()) return;
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setSending(true);
    setError("");
    try {
      const result = await api.sendAiMessage(activeSessionId, { content: content.trim() });
      if (requestId.current !== currentRequest) return;
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      await reloadSessions();
    } catch (caught) {
      if (requestId.current === currentRequest) setError(errorMessage(caught));
    } finally {
      if (requestId.current === currentRequest) setSending(false);
    }
  }

  return { sessions, activeSessionId, messages, loading, sending, error, send, reloadSessions, selectSession, createSession, renameSession, deleteSession };
}
```

Use request IDs for session switches so a slow previous session cannot replace the active message list.

- [ ] **Step 4: Implement the shell components**

`AiAssistant` owns open/closed UI. `AiSessionRail` receives data/actions only. `AiComposer` owns draft text and keyboard behavior. `AiMessageList` renders text/query/clarification/error kinds. For `PROPOSAL`, Task 13 renders an explicit read-only summary card from `message.content` and `message.metadata.proposal`; Task 14 upgrades that card to the complete editor without changing the message contract.

```tsx
interface AiAssistantProps {
  enabled: boolean;
  onDomainsChanged(domains: AiChangedDomain[]): void | Promise<void>;
}

export function AiAssistant({ enabled, onDomainsChanged }: AiAssistantProps) {
  const [open, setOpen] = useState(false);
  const state = useAiAssistant();
  if (!enabled) return null;
  return (
    <div className={`ai-assistant${open ? " is-open" : ""}`}>
      {open ? (
        <section aria-label="AI 助手" className="ai-assistant-panel" role="dialog">
          <AiSessionRail
            sessions={state.sessions}
            activeSessionId={state.activeSessionId}
            onCreate={state.createSession}
            onDelete={state.deleteSession}
            onRename={state.renameSession}
            onSelect={state.selectSession}
          />
          <div className="ai-assistant-conversation">
            <AiMessageList messages={state.messages} onDomainsChanged={onDomainsChanged} />
            <AiComposer disabled={state.sending} onSend={state.send} />
          </div>
        </section>
      ) : null}
      <button aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"} className="ai-assistant-trigger" type="button" onClick={() => setOpen((value) => !value)}>
        <Sparkles aria-hidden="true" size={22} />
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Verify shell tests**

Run: `npm test -w @todo/desktop -- src/components/ai/useAiAssistant.test.tsx src/components/ai/AiAssistant.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the assistant shell**

```bash
git add apps/desktop/src/components/ai/useAiAssistant.ts apps/desktop/src/components/ai/useAiAssistant.test.tsx apps/desktop/src/components/ai/AiAssistant.tsx apps/desktop/src/components/ai/AiAssistant.test.tsx apps/desktop/src/components/ai/AiSessionRail.tsx apps/desktop/src/components/ai/AiMessageList.tsx apps/desktop/src/components/ai/AiComposer.tsx
git commit -m "feat: add AI assistant chat shell"
```

### Task 14: Add editable proposal cards and domain-specific editors

**Files:**
- Create: `apps/desktop/src/components/ai/proposalDraft.ts`
- Create: `apps/desktop/src/components/ai/proposalDraft.test.ts`
- Create: `apps/desktop/src/components/ai/AiProposalCard.tsx`
- Create: `apps/desktop/src/components/ai/AiProposalCard.test.tsx`
- Create: `apps/desktop/src/components/ai/AiActionEditor.tsx`
- Create: `apps/desktop/src/components/ai/AiTaskActionEditor.tsx`
- Create: `apps/desktop/src/components/ai/AiAnniversaryActionEditor.tsx`
- Create: `apps/desktop/src/components/ai/AiHabitActionEditor.tsx`
- Create: `apps/desktop/src/components/ai/AiCheckInActionEditor.tsx`
- Modify: `apps/desktop/src/components/ai/AiMessageList.tsx`
- Modify: `apps/desktop/src/components/ai/useAiAssistant.ts`

**Interfaces:**
- Produces immutable helpers: `replaceAction`, `removeAction`, `toUpdateAiProposalRequest`.
- Produces `<AiProposalCard proposal onChanged onDomainsChanged />`.
- Supports every action/input field from Task 1 and all proposal states.

- [ ] **Step 1: Write failing draft-helper tests**

Prove one action can be edited or removed without mutating the source and that the update request retains the current version:

```ts
const edited = replaceAction(proposal, "action-1", (action) => ({
  ...action,
  input: { ...action.input, title: "修改后的标题" }
}));

expect(edited.items[0].input).toMatchObject({ title: "修改后的标题" });
expect(proposal.items[0].input).toMatchObject({ title: "原始标题" });
expect(toUpdateAiProposalRequest(edited)).toMatchObject({ version: proposal.version });
```

- [ ] **Step 2: Write failing card behavior tests**

Cover edit/save version update, remove, cancel, confirm with one UUID idempotency key, duplicate-click prevention, partial failure, edit/retry failed only, and absolute Beijing date display:

```tsx
render(<AiProposalCard proposal={proposal} onChanged={onChanged} onDomainsChanged={onDomainsChanged} />);
fireEvent.change(screen.getByLabelText("待办标题"), { target: { value: "买两包咖啡豆" } });
fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
await waitFor(() => expect(api.updateAiProposal).toHaveBeenCalledWith(
  proposal.id,
  expect.objectContaining({ version: proposal.version })
));

fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
await waitFor(() => expect(api.confirmAiProposal).toHaveBeenCalledTimes(1));
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -w @todo/desktop -- src/components/ai/proposalDraft.test.ts src/components/ai/AiProposalCard.test.tsx`

Expected: FAIL because proposal helpers/components do not exist.

- [ ] **Step 4: Implement immutable draft helpers and editor dispatch**

Use an exhaustive object-type switch:

```tsx
export function AiActionEditor({ action, disabled, onChange }: AiActionEditorProps) {
  switch (action.objectType) {
    case "TASK":
      return <AiTaskActionEditor action={action} disabled={disabled} onChange={onChange} />;
    case "ANNIVERSARY":
      return <AiAnniversaryActionEditor action={action} disabled={disabled} onChange={onChange} />;
    case "HABIT":
      return <AiHabitActionEditor action={action} disabled={disabled} onChange={onChange} />;
    case "HABIT_CHECKIN":
      return <AiCheckInActionEditor action={action} disabled={disabled} onChange={onChange} />;
    default:
      return assertNever(action);
  }
}
```

Implement all writable fields:

- Task: title, notes, start/due time, priority, status, tag, recurrence.
- Anniversary: title, notes, category, date, repeat, direction, card style, calendar type, lunar month/day, solar term.
- Habit: title, notes, icon, color, frequency, interval, week days, month days, start date, nullable end date, archive/restore action.
- Check-in: target habit, date, nullable note; cancellation shows the fixed target/date read-only.

Use existing `animal-island-ui`, Ant DatePicker, `dayjs`, and current shared date helpers. Do not introduce a generic JSON editor.

- [ ] **Step 5: Implement card lifecycle and idempotency**

Generate an idempotency key only when the user first clicks confirm and retain it until that request resolves or returns a retryable transport error:

```ts
const idempotencyKeyRef = useRef<string | null>(null);

async function confirm() {
  if (busy) return;
  idempotencyKeyRef.current ??= crypto.randomUUID();
  setBusy(true);
  try {
    const result = await api.confirmAiProposal(proposal.id, {
      version: proposal.version,
      idempotencyKey: idempotencyKeyRef.current
    });
    onChanged(result.proposal);
    onDomainsChanged(result.changedDomains);
    idempotencyKeyRef.current = null;
  } finally {
    setBusy(false);
  }
}
```

Retain the key when the request fails before any HTTP response, because the server may have committed the operation. Clear it after a parsed server response. `retryFailed` uses a separate newly generated key so it cannot replay the original confirmation. Render actions only for legal statuses: edit/cancel/confirm for pending, spinner for executing, results for terminal states, and “重试失败项” only for partial/failed proposals.

- [ ] **Step 6: Replace proposal placeholders in the message list**

Read the linked proposal from `message.metadata` and render `AiProposalCard`. When a proposal changes, replace both the in-memory message metadata and proposal cache so reopening the panel shows the new version/result without a full reload.

- [ ] **Step 7: Verify proposal tests and typecheck**

Run: `npm test -w @todo/desktop -- src/components/ai/proposalDraft.test.ts src/components/ai/AiProposalCard.test.tsx src/components/ai/AiAssistant.test.tsx`

Expected: PASS.

Run: `npm run typecheck -w @todo/desktop`

Expected: exit 0.

- [ ] **Step 8: Commit proposal editing**

```bash
git add apps/desktop/src/components/ai
git commit -m "feat: add editable AI proposal cards"
```

### Task 15: Integrate the global UI and cross-window domain refresh

**Files:**
- Modify: `apps/desktop/src/lib/desktopSync.ts`
- Modify: `apps/desktop/src/lib/desktopSync.test.ts`
- Modify: `apps/desktop/src/App.tsx:1-1120`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/components/AnniversaryPanel.tsx`
- Modify: `apps/desktop/src/components/AnniversaryPanel.test.tsx`
- Modify: `apps/desktop/src/components/HabitPanel.tsx`
- Modify: `apps/desktop/src/components/HabitPanel.test.tsx`
- Modify: `apps/desktop/src/components/FloatingCard.tsx`
- Modify: `apps/desktop/src/components/FloatingCard.test.tsx`
- Modify: `apps/desktop/src/styles.css`

**Interfaces:**
- Produces: `DesktopDataDomain = "tasks" | "anniversaries" | "habits"`.
- Produces sync event `{ type: "domain-data:reload-requested"; domains: DesktopDataDomain[] }`.
- Integrates the assistant only when bootstrap says `aiAssistant: true`.

- [ ] **Step 1: Write failing sync and App tests**

Prove the typed event validates and crosses windows, App hides AI before bootstrap or without configuration, App shows it after configured bootstrap, and local changed domains trigger the right refresh signals:

```ts
await emitDesktopSyncEvent({
  type: "domain-data:reload-requested",
  domains: ["tasks", "anniversaries", "habits"]
});

expect(rawListener.mock.calls[0][0].detail).toMatchObject({
  type: "domain-data:reload-requested",
  domains: ["tasks", "anniversaries", "habits"]
});
```

Add component tests proving `refreshSignal` changes call `load()` in anniversary/habit panels and external task/habit domains refresh the floating card.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -w @todo/desktop -- src/lib/desktopSync.test.ts src/App.test.tsx src/components/AnniversaryPanel.test.tsx src/components/HabitPanel.test.tsx src/components/FloatingCard.test.tsx`

Expected: FAIL because the domain event, feature flag, and refresh signals are absent.

- [ ] **Step 3: Extend desktop sync validation**

Add the domain event to the union and validator:

```ts
export type DesktopDataDomain = "tasks" | "anniversaries" | "habits";

export type DomainDataReloadRequestedEvent = {
  sourceId: string;
  type: "domain-data:reload-requested";
  domains: DesktopDataDomain[];
};

if (value.type === "domain-data:reload-requested") {
  return Array.isArray(value.domains) && value.domains.every((domain) =>
    domain === "tasks" || domain === "anniversaries" || domain === "habits"
  );
}
```

Append `DomainDataReloadRequestedEvent` to the current `DesktopSyncEvent` union without changing its existing members.

- [ ] **Step 4: Add local and cross-window refresh wiring**

In App, keep integer signals for anniversary and habit panels and a callback that reloads only changed domains. After local AI execution, call the callback and emit the event for other windows:

```ts
const [anniversaryRefreshSignal, setAnniversaryRefreshSignal] = useState(0);
const [habitRefreshSignal, setHabitRefreshSignal] = useState(0);

const handleAiDomainsChanged = useCallback(async (domains: DesktopDataDomain[]) => {
  if (domains.includes("tasks")) await loadAppData();
  if (domains.includes("anniversaries")) setAnniversaryRefreshSignal((value) => value + 1);
  if (domains.includes("habits")) setHabitRefreshSignal((value) => value + 1);
  await emitDesktopSyncEvent({ type: "domain-data:reload-requested", domains });
}, [loadAppData]);
```

When receiving an external event, perform local refresh without re-emitting it. Add `refreshSignal` props and effects to anniversary/habit panels. FloatingCard reloads tasks or habits when the external domains include them.

- [ ] **Step 5: Mount the assistant with a safe fallback flag**

Use a fallback that keeps existing features available but AI hidden until bootstrap succeeds:

```ts
const featureFlags: AppFeatureFlags = appBootstrap?.featureFlags ?? {
  ...defaultAppFeatureFlags,
  aiAssistant: false
};

{featureFlags.aiAssistant ? (
  <AiAssistant enabled onDomainsChanged={handleAiDomainsChanged} />
) : null}
```

Mount inside the authenticated app shell but outside routed page content so navigation does not destroy the active panel.

- [ ] **Step 6: Add the compact right-bottom styles**

Implement exact layout constraints in `styles.css`:

```css
.ai-assistant {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 80;
}

.ai-assistant-panel {
  position: absolute;
  right: 0;
  bottom: 56px;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr);
  width: min(640px, calc(100vw - 48px));
  height: min(520px, calc(100vh - 96px));
  overflow: hidden;
  border: 1px solid var(--app-border-color);
  border-radius: 16px;
  background: var(--app-surface-color);
  box-shadow: 0 22px 54px rgb(25 58 50 / 24%);
}
```

Add expanded session width, composer, message cards, proposal editors, focus states, reduced-motion behavior, and a narrow-window rule that keeps at least 16px viewport margin. Use existing theme variables; do not hard-code a separate light-only theme.

- [ ] **Step 7: Verify integration tests and desktop build**

Run: `npm test -w @todo/desktop -- src/lib/desktopSync.test.ts src/App.test.tsx src/components/AnniversaryPanel.test.tsx src/components/HabitPanel.test.tsx src/components/FloatingCard.test.tsx src/components/ai/AiAssistant.test.tsx`

Expected: PASS.

Run: `npm run build -w @todo/desktop`

Expected: exit 0.

- [ ] **Step 8: Commit the global integration**

```bash
git add apps/desktop/src/lib/desktopSync.ts apps/desktop/src/lib/desktopSync.test.ts apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/components/AnniversaryPanel.tsx apps/desktop/src/components/AnniversaryPanel.test.tsx apps/desktop/src/components/HabitPanel.tsx apps/desktop/src/components/HabitPanel.test.tsx apps/desktop/src/components/FloatingCard.tsx apps/desktop/src/components/FloatingCard.test.tsx apps/desktop/src/styles.css
git commit -m "feat: integrate global AI assistant"
```

### Task 16: Add end-to-end coverage, opt-in smoke test, documentation, and full verification

**Files:**
- Extend: `apps/api/src/routes/ai.test.ts`
- Extend: `apps/desktop/src/components/ai/AiAssistant.test.tsx`
- Create: `apps/api/src/services/deepseek-smoke.test.ts`
- Modify: `README.md`

**Interfaces:**
- Verifies complete flows with mocked DeepSeek and real route/component boundaries.
- Provides an explicit `RUN_DEEPSEEK_SMOKE=true` real-API check that never runs in default CI.

- [ ] **Step 1: Add backend full-flow tests**

Use the route dependency factory with an in-memory fake store/domain services and scripted DeepSeek responses. Cover these complete user flows through HTTP injection:

```ts
it("creates an editable proposal and writes only after confirmation", async () => {
  const sent = await injectAi(deps, "POST", "/ai/sessions/session-1/messages", {
    content: "明天下午买咖啡豆，周五交周报"
  });
  expect(sent.statusCode).toBe(200);
  expect(taskDomain.createTask).not.toHaveBeenCalled();

  const proposal = sent.json().assistantMessage.metadata.proposal;
  const confirmed = await injectAi(deps, "POST", `/ai/proposals/${proposal.id}/confirm`, {
    version: proposal.version,
    idempotencyKey: "86b5957a-3d25-4d74-8b4f-cd49566baf2f"
  });
  expect(confirmed.statusCode).toBe(200);
  expect(taskDomain.createTask).toHaveBeenCalledTimes(2);
});
```

Add equivalent tests for query-only, solar birthday creation, open-ended daily habit creation, check-in/cancel, ambiguous target clarification, proposal edit before confirm, and duplicate confirm replay.

- [ ] **Step 2: Add desktop full-flow component tests**

Script API responses and drive the user-visible controls through: open panel, choose/create session, query, receive proposal, edit second item, confirm, render per-item results, and emit changed domains. Add partial-failure edit/retry coverage.

- [ ] **Step 3: Add the opt-in real DeepSeek smoke test**

Gate the test at module load and use only synthetic text:

```ts
const runSmoke = process.env.RUN_DEEPSEEK_SMOKE === "true";

describe.runIf(runSmoke)("DeepSeek smoke", () => {
  it("returns a schema-valid todoDesk answer", async () => {
    const client = new DeepSeekClient({
      apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      apiUrl: process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
      timeoutMs: 45_000,
      fetchImpl: fetch
    });
    const response = await client.complete({
      messages: [
        { role: "system", content: "Return JSON: {\"type\":\"answer\",\"text\":string,\"records\":[]}." },
        { role: "user", content: "我今天没有任何待办，请回答没有待办。" }
      ],
      tools: [],
      jsonOutput: true
    });
    expect(aiModelResultSchema.parse(JSON.parse(response.content ?? ""))).toMatchObject({ type: "answer" });
  });
});
```

Default `npm test` must report this test skipped, not failed.

- [ ] **Step 4: Document configuration and safe activation**

Add a README section containing only variable names and placeholder-free instructions:

```md
## AI 助手

AI 助手由 API 服务调用 DeepSeek。桌面端不会读取 API Key。

在 `apps/api/.env` 配置：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions`
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- `DEEPSEEK_TIMEOUT_MS=45000`

只有 Key 非空且 `FEATURE_FLAGS_JSON` 未关闭 `aiAssistant` 时，`/app/bootstrap` 才会向桌面端开放入口。

真实 API 冒烟测试需显式执行 `RUN_DEEPSEEK_SMOKE=true npm test -w @todo/api -- src/services/deepseek-smoke.test.ts`，默认测试不会访问外部服务。
```

- [ ] **Step 5: Run the complete test matrix**

Run: `npm test`

Expected: all shared, API, and desktop tests PASS; the real DeepSeek smoke test is skipped.

- [ ] **Step 6: Run complete typecheck and production builds**

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0 with shared, API, and desktop builds complete.

- [ ] **Step 7: Run an explicitly authorized real smoke test**

Only when a newly rotated test key is present in the local environment, run:

`RUN_DEEPSEEK_SMOKE=true npm test -w @todo/api -- src/services/deepseek-smoke.test.ts`

Expected: PASS with one schema-valid answer. If no test key is available, record this check as not run; do not paste a key into the command.

- [ ] **Step 8: Review the final diff for secrets and unrelated edits**

Run: `git diff --check`

Expected: no output.

Run: `git diff --name-only main...HEAD`

Expected: only files listed in this plan, plus intentional lockfile changes if an already-declared dependency version was normalized. No `.env`, `.superpowers/`, generated `dist`, or unrelated tag-sorting files.

Run: `git grep -n -E "(^|[^A-Za-z])sk-[A-Za-z0-9]{20,}"`

Expected: no output from tracked implementation/docs/tests. If the developer's ignored `.env` contains a local key, do not display or stage it.

- [ ] **Step 9: Commit the final verification assets**

```bash
git add apps/api/src/routes/ai.test.ts apps/desktop/src/components/ai/AiAssistant.test.tsx apps/api/src/services/deepseek-smoke.test.ts README.md
git commit -m "test: verify AI assistant flows"
```

## Execution Notes

- After every task, inspect `git status --short` before staging and stage only that task's files.
- The current primary worktree contains unrelated user edits. Keep the isolated implementation worktree separate until the user chooses how to integrate it.
- When a task exposes an unexpected failing existing test, use `superpowers:systematic-debugging` before changing implementation.
- Before claiming any task or the full feature is complete, use `superpowers:verification-before-completion` and quote fresh command results.
