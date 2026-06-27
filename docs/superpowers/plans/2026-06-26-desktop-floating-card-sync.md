# Desktop Floating Card Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the main task page and the desktop floating task card synchronized immediately on the same machine without periodic refresh polling.

**Architecture:** Use a small desktop sync event bus for cross-window notifications and a Zustand-backed task board store inside each WebView. API writes remain the source of truth; successful writes publish task or preference events, and other windows patch their local store/state immediately.

**Tech Stack:** React 19, Tauri v2 event API, BroadcastChannel fallback for browser tests/previews, Zustand, Vitest/Testing Library.

---

### Task 1: Sync Bus And Store Tests

**Files:**
- Create: `apps/desktop/src/lib/desktopSync.ts`
- Create: `apps/desktop/src/stores/taskBoardStore.ts`
- Test: `apps/desktop/src/lib/desktopSync.test.ts`
- Test: `apps/desktop/src/stores/taskBoardStore.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that require:
- task upsert replaces an existing task by id and prepends a new task;
- task delete removes the id;
- sync listener ignores events from the current source id;
- sync emit posts a typed payload through the browser fallback when Tauri is unavailable.

- [ ] **Step 2: Run failing tests**

Run: `npm run test -w @todo/desktop -- desktopSync taskBoardStore`

Expected: FAIL because the files/modules do not exist yet.

- [ ] **Step 3: Implement minimal bus and store**

Add `desktopSync.ts` with typed `emitDesktopSyncEvent()` and `listenDesktopSyncEvents()` helpers. Add `taskBoardStore.ts` with Zustand actions for task snapshots, upsert, delete, tag snapshots, and reset.

- [ ] **Step 4: Run tests**

Run: `npm run test -w @todo/desktop -- desktopSync taskBoardStore`

Expected: PASS.

### Task 2: Floating Card Integration

**Files:**
- Modify: `apps/desktop/src/components/FloatingCard.tsx`
- Test: `apps/desktop/src/components/FloatingCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that require:
- a received `task:upserted` sync event updates visible floating card text without calling `api.tasks()` again;
- a received `preference:changed` sync event changes show-completed behavior without waiting for an interval;
- a floating card task status update emits `task:upserted`.

- [ ] **Step 2: Run failing tests**

Run: `npm run test -w @todo/desktop -- FloatingCard`

Expected: FAIL because the component still owns local state and has no sync listener.

- [ ] **Step 3: Implement minimal component wiring**

Use `useTaskBoardStore()` for tasks/tags, set snapshots on load, subscribe to `listenDesktopSyncEvents()`, patch store on task events, apply preference events, emit events after successful create/update/status/preference writes, and remove the 5-second preference polling interval.

- [ ] **Step 4: Run tests**

Run: `npm run test -w @todo/desktop -- FloatingCard`

Expected: PASS.

### Task 3: Main Task Page Integration

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/TaskPanel.tsx`
- Test: `apps/desktop/src/components/TaskPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that require `TaskPanel` to emit `task:upserted` after create/status/tag changes and `task:deleted` after delete. Main `App` consumes the same store and listens for floating card events.

- [ ] **Step 2: Run failing tests**

Run: `npm run test -w @todo/desktop -- TaskPanel`

Expected: FAIL because no sync event is emitted.

- [ ] **Step 3: Implement minimal page wiring**

Move task/tag snapshots in `App` to `useTaskBoardStore()`, emit preference events after successful preference saves, listen for task/preference sync events, and emit task events from `TaskPanel` successful writes.

- [ ] **Step 4: Run focused tests**

Run: `npm run test -w @todo/desktop -- TaskPanel FloatingCard desktopSync taskBoardStore`

Expected: PASS.

### Task 4: Final Verification

**Files:**
- Modify only the files touched above plus dependency metadata if Zustand must be added.

- [ ] **Step 1: Run desktop tests**

Run: `npm run test -w @todo/desktop`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w @todo/desktop`

Expected: PASS.
