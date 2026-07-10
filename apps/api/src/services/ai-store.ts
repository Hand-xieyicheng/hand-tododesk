import type {
  AiAction,
  AiActionItemStatus,
  AiObjectType,
  AiProposalStatus,
  ApiAiActionItem,
  ApiAiMessage,
  ApiAiProposal,
  ApiAiSession
} from "@todo/shared";
import {
  execute,
  id,
  queryOne,
  queryRows,
  toMysqlDate,
  transaction,
  type DbRow
} from "../db.js";
import type { ObservedRecord } from "./ai-tools.js";

type AiSessionRow = DbRow & {
  id: string;
  userId: string;
  title: string;
  summary: string | null;
  lastMessageAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type AiMessageRow = DbRow & {
  id: string;
  sessionId: string;
  role: ApiAiMessage["role"];
  kind: ApiAiMessage["kind"];
  content: string;
  metadataJson: unknown;
  createdAt: Date | string;
};

type AiProposalRow = DbRow & {
  id: string;
  sessionId: string;
  messageId: string;
  userId: string;
  status: AiProposalStatus;
  version: number | string;
  idempotencyKey: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type AiActionItemRow = DbRow & {
  id: string;
  proposalId: string;
  position: number | string;
  objectType: AiObjectType;
  actionType: AiAction["actionType"];
  targetId: string | null;
  inputJson: unknown;
  targetSnapshotJson: unknown;
  status: AiActionItemStatus;
  resultJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

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
}

export class AiStoreConflictError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "INVALID_STATE"
      | "EXPIRED"
      | "IDEMPOTENCY_CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "AiStoreConflictError";
  }
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    return value as T;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function serializeSession(row: AiSessionRow): ApiAiSession {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    lastMessageAt: iso(row.lastMessageAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

function serializeMessage(row: AiMessageRow): ApiAiMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    kind: row.kind,
    content: row.content,
    metadata: parseJson<ApiAiMessage["metadata"]>(row.metadataJson, null),
    createdAt: iso(row.createdAt)
  };
}

function serializeActionItem(row: AiActionItemRow): ApiAiActionItem {
  return {
    id: row.id,
    position: Number(row.position),
    objectType: row.objectType,
    actionType: row.actionType,
    targetId: row.targetId,
    input: parseJson<AiAction["input"]>(row.inputJson, {}),
    targetSnapshot: parseJson<Record<string, unknown> | null>(
      row.targetSnapshotJson,
      null
    ),
    status: row.status,
    result: parseJson<Record<string, unknown> | null>(row.resultJson, null),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage
  };
}

function serializeProposal(
  row: AiProposalRow,
  items: AiActionItemRow[]
): ApiAiProposal {
  return {
    id: row.id,
    sessionId: row.sessionId,
    messageId: row.messageId,
    status: row.status,
    version: Number(row.version),
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    items: items.map(serializeActionItem)
  };
}

function observedKey(objectType: AiObjectType, recordId: string) {
  return [objectType, recordId].join(":");
}

function targetObservedKey(action: AiAction) {
  if (action.actionType === "CREATE") {
    return null;
  }
  if (action.objectType === "HABIT_CHECKIN") {
    if (action.actionType === "CANCEL_CHECK_IN") {
      return observedKey(
        "HABIT_CHECKIN",
        [action.targetId, action.input.date].join(":")
      );
    }
    return observedKey("HABIT", action.targetId);
  }
  return observedKey(action.objectType, action.targetId);
}

function snapshotsForActions(
  actions: AiAction[],
  observedRecords: ReadonlyMap<string, ObservedRecord>
) {
  return actions.map((action) => {
    const key = targetObservedKey(action);
    if (!key) {
      return null;
    }
    const observed = observedRecords.get(key);
    if (!observed) {
      throw new AiStoreConflictError(
        "INVALID_STATE",
        "Proposal target was not observed"
      );
    }
    return observed.snapshot;
  });
}

async function insertActionItems(
  executor: { execute(sql: string, values?: unknown[]): Promise<unknown> },
  proposalId: string,
  actions: AiAction[],
  snapshots: Array<Record<string, unknown> | null>
) {
  for (const [position, action] of actions.entries()) {
    await executor.execute(
      `INSERT INTO \`AiActionItem\`
        (\`id\`, \`proposalId\`, \`position\`, \`objectType\`, \`actionType\`, \`targetId\`, \`inputJson\`, \`targetSnapshotJson\`, \`status\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(3))`,
      [
        id(),
        proposalId,
        position,
        action.objectType,
        action.actionType,
        action.targetId,
        JSON.stringify(action.input),
        snapshots[position] ? JSON.stringify(snapshots[position]) : null
      ]
    );
  }
}

async function getMessage(
  userId: string,
  sessionId: string,
  messageId: string
) {
  return queryOne<AiMessageRow>(
    `SELECT m.*
     FROM \`AiMessage\` m
     INNER JOIN \`AiSession\` s ON s.\`id\` = m.\`sessionId\`
     WHERE m.\`id\` = ? AND m.\`sessionId\` = ? AND s.\`userId\` = ?`,
    [messageId, sessionId, userId]
  );
}

function createStore(): AiStore {
  const store: AiStore = {
    async listSessions(userId) {
      const rows = await queryRows<AiSessionRow>(
        `SELECT * FROM \`AiSession\`
         WHERE \`userId\` = ?
         ORDER BY \`lastMessageAt\` DESC, \`createdAt\` DESC, \`id\` DESC`,
        [userId]
      );
      return rows.map(serializeSession);
    },

    async createSession(userId) {
      const sessionId = id();
      await execute(
        `INSERT INTO \`AiSession\`
          (\`id\`, \`userId\`, \`title\`, \`updatedAt\`)
         VALUES (?, ?, '新会话', NOW(3))`,
        [sessionId, userId]
      );
      const session = await store.getSession(userId, sessionId);
      if (!session) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      return session;
    },

    async renameSession(userId, sessionId, title) {
      const result = await execute(
        "UPDATE `AiSession` SET `title` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
        [title.trim(), sessionId, userId]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      const session = await store.getSession(userId, sessionId);
      if (!session) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      return session;
    },

    async deleteSession(userId, sessionId) {
      const result = await execute(
        "DELETE FROM `AiSession` WHERE `id` = ? AND `userId` = ?",
        [sessionId, userId]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
    },

    async getSession(userId, sessionId) {
      const row = await queryOne<AiSessionRow>(
        "SELECT * FROM `AiSession` WHERE `id` = ? AND `userId` = ?",
        [sessionId, userId]
      );
      return row ? serializeSession(row) : null;
    },

    async listMessages(userId, sessionId, cursor, limit = 50) {
      const session = await store.getSession(userId, sessionId);
      if (!session) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      const boundedLimit = Math.max(1, Math.min(100, limit));
      let rows: AiMessageRow[];
      if (cursor) {
        const cursorRow = await getMessage(userId, sessionId, cursor);
        if (!cursorRow) {
          throw new AiStoreConflictError("NOT_FOUND", "AI message cursor not found");
        }
        rows = await queryRows<AiMessageRow>(
          `SELECT * FROM \`AiMessage\`
           WHERE \`sessionId\` = ?
             AND (\`createdAt\` < ? OR (\`createdAt\` = ? AND \`id\` < ?))
           ORDER BY \`createdAt\` DESC, \`id\` DESC
           LIMIT ?`,
          [
            sessionId,
            cursorRow.createdAt,
            cursorRow.createdAt,
            cursorRow.id,
            boundedLimit + 1
          ]
        );
      } else {
        rows = await queryRows<AiMessageRow>(
          `SELECT * FROM \`AiMessage\`
           WHERE \`sessionId\` = ?
           ORDER BY \`createdAt\` DESC, \`id\` DESC
           LIMIT ?`,
          [sessionId, boundedLimit + 1]
        );
      }
      const hasMore = rows.length > boundedLimit;
      const page = rows.slice(0, boundedLimit);
      return {
        messages: page.map(serializeMessage).reverse(),
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
      };
    },

    async appendMessage(input) {
      const session = await store.getSession(input.userId, input.sessionId);
      if (!session) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      const messageId = id();
      await execute(
        `INSERT INTO \`AiMessage\`
          (\`id\`, \`sessionId\`, \`role\`, \`kind\`, \`content\`, \`metadataJson\`)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          messageId,
          input.sessionId,
          input.role,
          input.kind,
          input.content,
          input.metadata ? JSON.stringify(input.metadata) : null
        ]
      );
      const generatedTitle = input.content.trim().slice(0, 40) || "新会话";
      await execute(
        `UPDATE \`AiSession\`
         SET \`lastMessageAt\` = NOW(3),
             \`title\` = CASE
               WHEN ? = 'USER' AND \`title\` = '新会话' THEN ?
               ELSE \`title\`
             END,
             \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ?`,
        [input.role, generatedTitle, input.sessionId, input.userId]
      );
      const message = await getMessage(input.userId, input.sessionId, messageId);
      if (!message) {
        throw new AiStoreConflictError("NOT_FOUND", "AI message not found");
      }
      return serializeMessage(message);
    },

    async loadConversationContext(userId, sessionId, recentLimit) {
      const session = await store.getSession(userId, sessionId);
      if (!session) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
      const rows = await queryRows<AiMessageRow>(
        `SELECT * FROM \`AiMessage\`
         WHERE \`sessionId\` = ?
         ORDER BY \`createdAt\` ASC, \`id\` ASC`,
        [sessionId]
      );
      const messages = rows.map(serializeMessage);
      const splitAt = Math.max(0, messages.length - Math.max(1, recentLimit));
      return {
        session,
        recentMessages: messages.slice(splitAt),
        overflowMessages: messages.slice(0, splitAt)
      };
    },

    async updateSessionSummary(userId, sessionId, summary) {
      const result = await execute(
        "UPDATE `AiSession` SET `summary` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
        [summary, sessionId, userId]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session not found");
      }
    },

    async createProposal(input) {
      const ownedMessage = await queryOne<DbRow & { id: string }>(
        `SELECT m.\`id\`
         FROM \`AiMessage\` m
         INNER JOIN \`AiSession\` s ON s.\`id\` = m.\`sessionId\`
         WHERE m.\`id\` = ? AND m.\`sessionId\` = ? AND s.\`userId\` = ?`,
        [input.messageId, input.sessionId, input.userId]
      );
      if (!ownedMessage) {
        throw new AiStoreConflictError("NOT_FOUND", "AI session or message not found");
      }
      const snapshots = snapshotsForActions(input.actions, input.observedRecords);
      const proposalId = id();
      await transaction(async (connection) => {
        await connection.execute(
          `INSERT INTO \`AiActionProposal\`
            (\`id\`, \`sessionId\`, \`messageId\`, \`userId\`, \`status\`, \`version\`, \`expiresAt\`, \`updatedAt\`)
           VALUES (?, ?, ?, ?, 'PENDING_CONFIRMATION', 1, ?, NOW(3))`,
          [
            proposalId,
            input.sessionId,
            input.messageId,
            input.userId,
            toMysqlDate(input.expiresAt)
          ]
        );
        await insertActionItems(connection, proposalId, input.actions, snapshots);
      });
      const proposal = await store.getProposal(input.userId, proposalId);
      if (!proposal) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      await execute(
        `UPDATE \`AiMessage\` m
         INNER JOIN \`AiSession\` s ON s.\`id\` = m.\`sessionId\`
         SET m.\`metadataJson\` = ?
         WHERE m.\`id\` = ? AND m.\`sessionId\` = ? AND s.\`userId\` = ?`,
        [
          JSON.stringify({ proposal }),
          input.messageId,
          input.sessionId,
          input.userId
        ]
      );
      return proposal;
    },

    async getProposal(userId, proposalId) {
      const row = await queryOne<AiProposalRow>(
        "SELECT * FROM `AiActionProposal` WHERE `id` = ? AND `userId` = ?",
        [proposalId, userId]
      );
      if (!row) {
        return null;
      }
      const items = await queryRows<AiActionItemRow>(
        "SELECT * FROM `AiActionItem` WHERE `proposalId` = ? ORDER BY `position` ASC",
        [proposalId]
      );
      return serializeProposal(row, items);
    },

    async updateProposal(input) {
      const current = await store.getProposal(input.userId, input.proposalId);
      if (!current) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      if (current.version !== input.expectedVersion) {
        throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
      }
      if (current.status !== "PENDING_CONFIRMATION") {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal cannot be edited");
      }

      const observed = new Map<string, ObservedRecord>();
      for (const item of current.items) {
        const snapshot = item.targetSnapshot;
        const objectType = snapshot?.objectType;
        const recordId = snapshot?.id;
        if (
          typeof objectType === "string" &&
          typeof recordId === "string" &&
          typeof snapshot?.updatedAt === "string"
        ) {
          observed.set(
            observedKey(objectType as AiObjectType, recordId),
            {
              objectType: objectType as AiObjectType,
              id: recordId,
              updatedAt: snapshot.updatedAt,
              snapshot
            }
          );
        }
      }
      const snapshots = snapshotsForActions(input.actions, observed);
      const result = await execute(
        `UPDATE \`AiActionProposal\`
         SET \`version\` = \`version\` + 1, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ? AND \`version\` = ?
           AND \`status\` = 'PENDING_CONFIRMATION'`,
        [input.proposalId, input.userId, input.expectedVersion]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
      }
      await transaction(async (connection) => {
        await connection.execute(
          "DELETE FROM `AiActionItem` WHERE `proposalId` = ?",
          [input.proposalId]
        );
        await insertActionItems(
          connection,
          input.proposalId,
          input.actions,
          snapshots
        );
      });
      const updated = await store.getProposal(input.userId, input.proposalId);
      if (!updated) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      return updated;
    },

    async cancelProposal(userId, proposalId, expectedVersion) {
      const result = await execute(
        `UPDATE \`AiActionProposal\`
         SET \`status\` = 'CANCELLED', \`version\` = \`version\` + 1, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ? AND \`version\` = ?
           AND \`status\` = 'PENDING_CONFIRMATION'`,
        [proposalId, userId, expectedVersion]
      );
      if (!result.affectedRows) {
        await throwProposalConflict(store, userId, proposalId, expectedVersion);
      }
      const proposal = await store.getProposal(userId, proposalId);
      if (!proposal) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      return proposal;
    },

    async claimProposalForExecution(input) {
      const replayRow = await queryOne<AiProposalRow>(
        "SELECT * FROM `AiActionProposal` WHERE `userId` = ? AND `idempotencyKey` = ?",
        [input.userId, input.idempotencyKey]
      );
      if (replayRow) {
        if (replayRow.id !== input.proposalId) {
          throw new AiStoreConflictError(
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key belongs to another proposal"
          );
        }
        const items = await queryRows<AiActionItemRow>(
          "SELECT * FROM `AiActionItem` WHERE `proposalId` = ? ORDER BY `position` ASC",
          [replayRow.id]
        );
        return {
          proposal: serializeProposal(replayRow, items),
          replay: true
        };
      }

      const current = await store.getProposal(input.userId, input.proposalId);
      if (!current) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      if (current.version !== input.expectedVersion) {
        throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
      }
      if (current.status !== "PENDING_CONFIRMATION") {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal cannot be executed");
      }
      if (new Date(current.expiresAt).getTime() <= input.now.getTime()) {
        await execute(
          `UPDATE \`AiActionProposal\` SET \`status\` = 'EXPIRED', \`updatedAt\` = NOW(3)
           WHERE \`id\` = ? AND \`userId\` = ? AND \`status\` = 'PENDING_CONFIRMATION'`,
          [input.proposalId, input.userId]
        );
        throw new AiStoreConflictError("EXPIRED", "AI proposal expired");
      }

      const result = await execute(
        `UPDATE \`AiActionProposal\`
         SET \`status\` = 'EXECUTING', \`idempotencyKey\` = ?, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ? AND \`version\` = ?
           AND \`status\` = 'PENDING_CONFIRMATION'`,
        [
          input.idempotencyKey,
          input.proposalId,
          input.userId,
          input.expectedVersion
        ]
      );
      if (!result.affectedRows) {
        await throwProposalConflict(
          store,
          input.userId,
          input.proposalId,
          input.expectedVersion
        );
      }
      const proposal = await store.getProposal(input.userId, input.proposalId);
      if (!proposal) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      return { proposal, replay: false };
    },

    async recordActionResult(input) {
      const result = await execute(
        `UPDATE \`AiActionItem\`
         SET \`status\` = ?, \`resultJson\` = ?, \`errorCode\` = ?,
             \`errorMessage\` = ?, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`proposalId\` = ?`,
        [
          input.status,
          input.result ? JSON.stringify(input.result) : null,
          input.errorCode ?? null,
          input.errorMessage ?? null,
          input.itemId,
          input.proposalId
        ]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("NOT_FOUND", "AI action item not found");
      }
    },

    async finishProposal(userId, proposalId) {
      const current = await store.getProposal(userId, proposalId);
      if (!current) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      if (current.status !== "EXECUTING") {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal is not executing");
      }
      const succeeded = current.items.filter((item) => item.status === "SUCCEEDED").length;
      const finalStatus: AiProposalStatus = succeeded === current.items.length && succeeded > 0
        ? "SUCCEEDED"
        : succeeded === 0 ? "FAILED" : "PARTIAL_FAILED";
      const result = await execute(
        `UPDATE \`AiActionProposal\` SET \`status\` = ?, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ? AND \`status\` = 'EXECUTING'`,
        [finalStatus, proposalId, userId]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal state changed");
      }
      const proposal = await store.getProposal(userId, proposalId);
      if (!proposal) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      return proposal;
    },

    async resetFailedItemsForRetry(userId, proposalId) {
      const current = await store.getProposal(userId, proposalId);
      if (!current) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      if (current.status !== "FAILED" && current.status !== "PARTIAL_FAILED") {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal cannot be retried");
      }
      const result = await execute(
        `UPDATE \`AiActionProposal\`
         SET \`status\` = 'PENDING_CONFIRMATION', \`version\` = \`version\` + 1,
             \`idempotencyKey\` = NULL, \`updatedAt\` = NOW(3)
         WHERE \`id\` = ? AND \`userId\` = ? AND \`status\` IN ('FAILED', 'PARTIAL_FAILED')`,
        [proposalId, userId]
      );
      if (!result.affectedRows) {
        throw new AiStoreConflictError("INVALID_STATE", "AI proposal state changed");
      }
      await execute(
        `UPDATE \`AiActionItem\`
         SET \`status\` = 'PENDING', \`resultJson\` = NULL, \`errorCode\` = NULL,
             \`errorMessage\` = NULL, \`updatedAt\` = NOW(3)
         WHERE \`proposalId\` = ? AND \`status\` = 'FAILED'`,
        [proposalId]
      );
      const proposal = await store.getProposal(userId, proposalId);
      if (!proposal) {
        throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
      }
      return proposal;
    }
  };
  return store;
}

async function throwProposalConflict(
  store: AiStore,
  userId: string,
  proposalId: string,
  expectedVersion: number
): Promise<never> {
  const current = await store.getProposal(userId, proposalId);
  if (!current) {
    throw new AiStoreConflictError("NOT_FOUND", "AI proposal not found");
  }
  if (current.version !== expectedVersion) {
    throw new AiStoreConflictError("VERSION_CONFLICT", "AI proposal version changed");
  }
  if (new Date(current.expiresAt).getTime() <= Date.now()) {
    throw new AiStoreConflictError("EXPIRED", "AI proposal expired");
  }
  throw new AiStoreConflictError("INVALID_STATE", "AI proposal state changed");
}

export function createAiStore(): AiStore {
  return createStore();
}

export const aiStore = createAiStore();
