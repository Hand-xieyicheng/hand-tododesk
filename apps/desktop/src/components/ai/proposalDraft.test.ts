import { describe, expect, it } from "vitest";
import type { ApiAiProposal } from "@todo/shared";
import {
  removeAction,
  replaceAction,
  toUpdateAiProposalRequest
} from "./proposalDraft";

const proposal: ApiAiProposal = {
  id: "proposal-1",
  sessionId: "session-1",
  messageId: "message-1",
  status: "PENDING_CONFIRMATION",
  version: 2,
  expiresAt: "2026-07-10T12:30:00.000Z",
  createdAt: "2026-07-10T12:00:00.000Z",
  updatedAt: "2026-07-10T12:00:00.000Z",
  items: [{
    id: "action-1",
    position: 0,
    objectType: "TASK",
    actionType: "CREATE",
    targetId: null,
    input: {
      title: "原始标题",
      priority: "IMPORTANT_NOT_URGENT",
      status: "TODO"
    },
    targetSnapshot: null,
    status: "PENDING",
    result: null,
    errorCode: null,
    errorMessage: null
  }, {
    id: "action-2",
    position: 1,
    objectType: "TASK",
    actionType: "DELETE",
    targetId: "task-2",
    input: {},
    targetSnapshot: { id: "task-2", updatedAt: "2026-07-10T00:00:00.000Z" },
    status: "PENDING",
    result: null,
    errorCode: null,
    errorMessage: null
  }]
};

describe("proposal draft helpers", () => {
  it("edits and removes actions without mutating the source", () => {
    const edited = replaceAction(proposal, "action-1", (action) => ({
      ...action,
      input: { ...action.input, title: "修改后的标题" }
    }));
    const removed = removeAction(edited, "action-2");

    expect(edited.items[0]?.input).toMatchObject({ title: "修改后的标题" });
    expect(proposal.items[0]?.input).toMatchObject({ title: "原始标题" });
    expect(removed.items.map((item) => item.id)).toEqual(["action-1"]);
    expect(proposal.items).toHaveLength(2);
  });

  it("maps the draft back to a versioned update request", () => {
    const request = toUpdateAiProposalRequest(proposal);
    expect(request.version).toBe(2);
    expect(request.actions).toHaveLength(2);
    expect(request.actions[0]).toMatchObject({
        clientId: "action-1",
        objectType: "TASK",
        actionType: "CREATE",
        targetId: null,
        input: expect.objectContaining({ title: "原始标题" })
    });
  });
});
