import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAction } from "@todo/shared";
import { ObservedRecordRegistry } from "./ai-tools.js";
import {
  AiStoreConflictError,
  createAiStore
} from "./ai-store.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("../db.js", () => ({
  execute: db.execute,
  id: () => "generated-id",
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  toMysqlDate: (date: Date | null | undefined) => (
    date ? date.toISOString().slice(0, 19).replace("T", " ") : null
  ),
  transaction: db.transaction
}));

const now = new Date("2026-07-10T04:00:00.000Z");

function sessionRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "session-1",
    userId: "user-1",
    title: "新会话",
    summary: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    ...patch
  };
}

function messageRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "USER",
    kind: "TEXT",
    content: "今天有什么待办",
    metadataJson: null,
    createdAt: now,
    ...patch
  };
}

function proposalRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proposal-1",
    sessionId: "session-1",
    messageId: "message-2",
    userId: "user-1",
    status: "PENDING_CONFIRMATION",
    version: 1,
    idempotencyKey: null,
    expiresAt: new Date("2026-07-10T12:30:00.000Z"),
    createdAt: now,
    updatedAt: now,
    ...patch
  };
}

function itemRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    proposalId: "proposal-1",
    position: 0,
    objectType: "TASK",
    actionType: "UPDATE",
    targetId: "task-1",
    inputJson: { title: "提交周报" },
    targetSnapshotJson: {
      objectType: "TASK",
      id: "task-1",
      title: "交周报",
      updatedAt: "2026-07-09T00:00:00.000Z"
    },
    status: "PENDING",
    resultJson: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    ...patch
  };
}

const action: AiAction = {
  clientId: "action-1",
  objectType: "TASK",
  actionType: "UPDATE",
  targetId: "task-1",
  input: { title: "提交周报" }
};

describe("AI store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => (
      callback({ execute: db.execute })
    ));
  });

  it("creates, lists, renames, and deletes only owned sessions", async () => {
    const store = createAiStore();
    db.queryOne
      .mockResolvedValueOnce(sessionRow({ id: "session-new" }))
      .mockResolvedValueOnce(sessionRow({ title: "工作安排" }));
    db.queryRows.mockResolvedValueOnce([
      sessionRow({ id: "session-2", lastMessageAt: new Date("2026-07-10T05:00:00.000Z") }),
      sessionRow()
    ]);

    await expect(store.createSession("user-1")).resolves.toMatchObject({
      id: "session-new",
      title: "新会话"
    });
    await expect(store.listSessions("user-1")).resolves.toHaveLength(2);
    await expect(store.renameSession("user-1", "session-1", "工作安排")).resolves.toMatchObject({
      title: "工作安排"
    });
    await expect(store.deleteSession("user-1", "session-1")).resolves.toBeUndefined();

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM `AiSession`"),
      ["session-1", "user-1"]
    );
  });

  it("paginates messages and updates the title from the first user message", async () => {
    const store = createAiStore();
    db.queryOne
      .mockResolvedValueOnce(sessionRow())
      .mockResolvedValueOnce(sessionRow())
      .mockResolvedValueOnce(messageRow({ id: "message-new" }));
    db.queryRows.mockResolvedValueOnce([
      messageRow({ id: "message-3", role: "ASSISTANT", createdAt: new Date("2026-07-10T04:03:00.000Z") }),
      messageRow({ id: "message-2", createdAt: new Date("2026-07-10T04:02:00.000Z") }),
      messageRow({ id: "message-1", createdAt: new Date("2026-07-10T04:01:00.000Z") })
    ]);

    await expect(store.listMessages("user-1", "session-1", undefined, 2)).resolves.toMatchObject({
      messages: [
        expect.objectContaining({ id: "message-2" }),
        expect.objectContaining({ id: "message-3" })
      ],
      nextCursor: "message-2"
    });
    await expect(store.appendMessage({
      userId: "user-1",
      sessionId: "session-1",
      role: "USER",
      kind: "TEXT",
      content: "今天有什么待办",
      metadata: null
    })).resolves.toMatchObject({ id: "message-new" });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("lastMessageAt"),
      expect.arrayContaining(["今天有什么待办", "session-1", "user-1"])
    );
  });

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

  it("creates proposals from observed snapshots and enforces edit versions", async () => {
    const store = createAiStore();
    const observed = new ObservedRecordRegistry();
    observed.add({
      objectType: "TASK",
      id: "task-1",
      updatedAt: "2026-07-09T00:00:00.000Z",
      snapshot: itemRow().targetSnapshotJson as Record<string, unknown>
    });
    db.queryOne
      .mockResolvedValueOnce({ id: "message-2" })
      .mockResolvedValueOnce(proposalRow({ id: "proposal-new" }))
      .mockResolvedValueOnce(proposalRow({ id: "proposal-new" }))
      .mockResolvedValueOnce(proposalRow({ id: "proposal-new", version: 2 }))
      .mockResolvedValueOnce(proposalRow({ id: "proposal-new", version: 2 }));
    db.queryRows
      .mockResolvedValueOnce([itemRow({ id: "item-new", proposalId: "proposal-new" })])
      .mockResolvedValueOnce([itemRow({ id: "item-new", proposalId: "proposal-new" })])
      .mockResolvedValueOnce([itemRow({
        id: "item-new",
        proposalId: "proposal-new",
        inputJson: { title: "完成并提交周报" }
      })])
      .mockResolvedValueOnce([itemRow({
        id: "item-new",
        proposalId: "proposal-new",
        inputJson: { title: "完成并提交周报" }
      })]);

    const proposal = await store.createProposal({
      userId: "user-1",
      sessionId: "session-1",
      messageId: "message-2",
      expiresAt: new Date("2026-07-10T12:30:00.000Z"),
      actions: [action],
      observedRecords: observed.snapshotMap()
    });
    expect(proposal.items[0]?.targetSnapshot).toMatchObject({ id: "task-1" });

    await expect(store.updateProposal({
      userId: "user-1",
      proposalId: "proposal-new",
      expectedVersion: 1,
      actions: [{ ...action, input: { title: "完成并提交周报" } }]
    })).resolves.toMatchObject({ version: 2 });
    await expect(store.updateProposal({
      userId: "user-1",
      proposalId: "proposal-new",
      expectedVersion: 1,
      actions: [{ ...action, input: { title: "完成并提交周报" } }]
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("cancels pending proposals with a conditional version update", async () => {
    const store = createAiStore();
    db.queryOne.mockResolvedValueOnce(proposalRow({ status: "CANCELLED", version: 2 }));
    db.queryRows.mockResolvedValueOnce([itemRow()]);

    await expect(store.cancelProposal("user-1", "proposal-1", 1)).resolves.toMatchObject({
      status: "CANCELLED",
      version: 2
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("status` = 'PENDING_CONFIRMATION'"),
      expect.arrayContaining(["proposal-1", "user-1", 1])
    );
  });

  it("claims execution, records item results, finishes truthfully, and replays idempotently", async () => {
    const store = createAiStore();
    db.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(proposalRow())
      .mockResolvedValueOnce(proposalRow({ status: "EXECUTING", idempotencyKey: "idem-1" }))
      .mockResolvedValueOnce(proposalRow({ status: "EXECUTING", idempotencyKey: "idem-1" }))
      .mockResolvedValueOnce(proposalRow({ status: "PARTIAL_FAILED", idempotencyKey: "idem-1" }))
      .mockResolvedValueOnce(proposalRow({ status: "EXECUTING", idempotencyKey: "idem-1" }));
    db.queryRows
      .mockResolvedValueOnce([itemRow()])
      .mockResolvedValueOnce([itemRow()])
      .mockResolvedValueOnce([
        itemRow({ status: "SUCCEEDED" }),
        itemRow({ id: "item-2", position: 1, status: "FAILED" })
      ])
      .mockResolvedValueOnce([
        itemRow({ status: "SUCCEEDED" }),
        itemRow({ id: "item-2", position: 1, status: "FAILED" })
      ])
      .mockResolvedValueOnce([itemRow()]);

    await expect(store.claimProposalForExecution({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 1,
      idempotencyKey: "idem-1",
      now
    })).resolves.toMatchObject({ replay: false, proposal: { status: "EXECUTING" } });

    await store.recordActionResult({
      proposalId: "proposal-1",
      itemId: "item-1",
      status: "SUCCEEDED",
      result: { id: "task-1" }
    });
    await expect(store.finishProposal("user-1", "proposal-1")).resolves.toMatchObject({
      status: "PARTIAL_FAILED"
    });

    await expect(store.claimProposalForExecution({
      userId: "user-1",
      proposalId: "proposal-1",
      expectedVersion: 1,
      idempotencyKey: "idem-1",
      now
    })).resolves.toMatchObject({ replay: true });
  });

  it("resets only failed items when preparing a retry", async () => {
    const store = createAiStore();
    db.queryOne
      .mockResolvedValueOnce(proposalRow({
        status: "PARTIAL_FAILED",
        idempotencyKey: "idem-old"
      }))
      .mockResolvedValueOnce(proposalRow({
        status: "PENDING_CONFIRMATION",
        version: 2,
        idempotencyKey: null
      }));
    db.queryRows
      .mockResolvedValueOnce([
        itemRow({ status: "SUCCEEDED" }),
        itemRow({ id: "item-2", position: 1, status: "FAILED" })
      ])
      .mockResolvedValueOnce([
        itemRow({ status: "SUCCEEDED" }),
        itemRow({ id: "item-2", position: 1, status: "PENDING" })
      ]);

    await expect(store.resetFailedItemsForRetry("user-1", "proposal-1")).resolves.toMatchObject({
      status: "PENDING_CONFIRMATION",
      version: 2,
      items: [
        expect.objectContaining({ status: "SUCCEEDED" }),
        expect.objectContaining({ status: "PENDING" })
      ]
    });
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE `proposalId` = ? AND `status` = 'FAILED'"),
      ["proposal-1"]
    );
  });

  it("reports missing and stale state with stable conflict errors", async () => {
    const store = createAiStore();
    db.execute.mockResolvedValueOnce({ affectedRows: 0 });
    db.queryOne.mockResolvedValueOnce(null);

    await expect(store.cancelProposal("user-1", "missing", 1)).rejects.toEqual(
      expect.any(AiStoreConflictError)
    );
    await expect(store.cancelProposal("user-1", "missing", 1)).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });
});
