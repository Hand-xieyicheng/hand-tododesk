# AI Proposal State Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure reloaded AI conversation messages expose the current persisted proposal status and results so completed proposals remain read-only after switching sessions.

**Architecture:** Keep `AiActionProposal` and `AiActionItem` as the source of truth. Hydrate proposal message metadata inside `AiStore.listMessages` after pagination, using the existing owned `getProposal` lookup, while leaving stored message snapshots and frontend interaction logic unchanged.

**Tech Stack:** TypeScript, Fastify service layer, MySQL, Vitest, React Testing Library

## Global Constraints

- Preserve the existing message pagination order and `nextCursor` behavior.
- Keep completed proposal cards visible as read-only result cards.
- Do not add a proposal detail endpoint or rewrite existing `AiMessage.metadataJson` rows.
- Do not change proposal execution, idempotency, cancellation, expiration, or retry semantics.
- Preserve all unrelated uncommitted workspace changes.

---

### Task 1: Hydrate proposal messages from the current proposal tables

**Files:**
- Modify: `apps/api/src/services/ai-store.test.ts`
- Modify: `apps/api/src/services/ai-store.ts:392-440`

**Interfaces:**
- Consumes: `AiStore.getProposal(userId: string, proposalId: string): Promise<ApiAiProposal | null>`
- Produces: `AiStore.listMessages(...)` returns `ApiAiMessage.metadata.proposal` from current proposal and action-item rows when the message is a proposal.

- [ ] **Step 1: Write the failing stale-snapshot regression test**

Add this test to `apps/api/src/services/ai-store.test.ts` after the existing message pagination test:

```ts
it("hydrates proposal messages with the current persisted status and item results", async () => {
  const store = createAiStore();
  db.queryOne
    .mockResolvedValueOnce(sessionRow())
    .mockResolvedValueOnce(proposalRow({ status: "SUCCEEDED" }));
  db.queryRows
    .mockResolvedValueOnce([
      messageRow({
        id: "message-2",
        role: "ASSISTANT",
        kind: "PROPOSAL",
        metadataJson: {
          proposal: {
            id: "proposal-1",
            sessionId: "session-1",
            messageId: "message-2",
            status: "PENDING_CONFIRMATION",
            version: 1,
            expiresAt: "2026-07-10T12:30:00.000Z",
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            items: []
          }
        }
      })
    ])
    .mockResolvedValueOnce([
      itemRow({ status: "SUCCEEDED", resultJson: { id: "task-1" } })
    ]);

  const result = await store.listMessages("user-1", "session-1");

  expect(result.messages[0]?.metadata?.proposal).toMatchObject({
    id: "proposal-1",
    status: "SUCCEEDED",
    items: [
      expect.objectContaining({
        status: "SUCCEEDED",
        result: { id: "task-1" }
      })
    ]
  });
});
```

- [ ] **Step 2: Run the regression test and verify RED**

Run:

```bash
npm test -w @todo/api -- src/services/ai-store.test.ts
```

Expected: FAIL because `listMessages` returns the stale `PENDING_CONFIRMATION` proposal from `metadataJson` and does not call `getProposal`.

- [ ] **Step 3: Implement minimal read-time hydration**

In `AiStore.listMessages`, serialize and reverse the page, then replace proposal metadata only when the current proposal exists:

```ts
const messages = page.map(serializeMessage).reverse();
const hydratedMessages = await Promise.all(messages.map(async (message) => {
  const proposalId = message.kind === "PROPOSAL"
    ? message.metadata?.proposal?.id
    : undefined;
  if (!proposalId) {
    return message;
  }
  const proposal = await store.getProposal(userId, proposalId);
  if (!proposal) {
    return message;
  }
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      proposal
    }
  };
}));
return {
  messages: hydratedMessages,
  nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
};
```

- [ ] **Step 4: Run the API store test and verify GREEN**

Run:

```bash
npm test -w @todo/api -- src/services/ai-store.test.ts
```

Expected: all AI store tests PASS, including the stale-snapshot regression.

- [ ] **Step 5: Commit the backend fix**

```bash
git add apps/api/src/services/ai-store.ts apps/api/src/services/ai-store.test.ts
git commit -m "fix: hydrate current AI proposal state"
```

### Task 2: Lock the completed-card read-only UI contract

**Files:**
- Modify: `apps/desktop/src/components/ai/AiProposalCard.test.tsx`

**Interfaces:**
- Consumes: `AiProposalCardProps.proposal: ApiAiProposal`
- Produces: Regression coverage that `SUCCEEDED` cards retain results and expose no pending-confirmation controls.

- [ ] **Step 1: Add the completed proposal rendering test**

Add this test to `apps/desktop/src/components/ai/AiProposalCard.test.tsx`:

```tsx
it("keeps a succeeded proposal read-only after conversation reload", () => {
  render(
    <AiProposalCard
      proposal={proposal({
        status: "SUCCEEDED",
        items: [{
          ...proposal().items[0]!,
          status: "SUCCEEDED",
          result: { id: "task-1" }
        }]
      })}
      onChanged={vi.fn()}
      onDomainsChanged={vi.fn()}
    />
  );

  expect(screen.getByText("执行成功")).toBeInTheDocument();
  expect(screen.getByText("已完成")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "取消提案" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "保存修改" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "确认执行" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused desktop test**

Run:

```bash
npm test -w @todo/desktop -- src/components/ai/AiProposalCard.test.tsx
```

Expected: PASS, confirming the existing card renderer already satisfies the approved read-only UI once it receives the current status.

- [ ] **Step 3: Commit the UI contract test**

```bash
git add apps/desktop/src/components/ai/AiProposalCard.test.tsx
git commit -m "test: lock completed AI proposal display"
```

### Task 3: Verify the complete fix

**Files:**
- Verify: `apps/api/src/services/ai-store.ts`
- Verify: `apps/api/src/services/ai-store.test.ts`
- Verify: `apps/desktop/src/components/ai/AiProposalCard.test.tsx`

**Interfaces:**
- Consumes: completed Task 1 and Task 2 changes.
- Produces: verified API and desktop behavior with no type or formatting regressions.

- [ ] **Step 1: Run focused AI tests**

```bash
npm test -w @todo/api -- src/services/ai-store.test.ts src/services/ai-executor.test.ts
npm test -w @todo/desktop -- src/components/ai/AiProposalCard.test.tsx src/components/ai/AiAssistant.test.tsx
```

Expected: all focused API and desktop tests PASS.

- [ ] **Step 2: Run API and desktop type checks**

```bash
npm run typecheck -w @todo/api
npm run typecheck -w @todo/desktop
```

Expected: both commands exit with code 0 and report no TypeScript errors.

- [ ] **Step 3: Run complete API and desktop test suites**

```bash
npm test -w @todo/api
npm test -w @todo/desktop
```

Expected: both suites report zero failed tests.

- [ ] **Step 4: Check the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated existing workspace changes remain untouched.
