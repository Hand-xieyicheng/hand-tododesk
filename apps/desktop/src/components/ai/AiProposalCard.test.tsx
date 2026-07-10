import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiAiProposal } from "@todo/shared";
import { AiProposalCard } from "./AiProposalCard";

const apiMock = vi.hoisted(() => ({
  updateAiProposal: vi.fn(),
  confirmAiProposal: vi.fn(),
  retryAiProposal: vi.fn(),
  cancelAiProposal: vi.fn()
}));

vi.mock("../../api/client", () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  }
}));

function proposal(patch: Partial<ApiAiProposal> = {}): ApiAiProposal {
  return {
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
        title: "买咖啡豆",
        notes: null,
        startAt: null,
        dueAt: "2026-07-11T06:00:00.000Z",
        priority: "IMPORTANT_NOT_URGENT",
        status: "TODO",
        tagId: null,
        recurrenceRule: null
      },
      targetSnapshot: null,
      status: "PENDING",
      result: null,
      errorCode: null,
      errorMessage: null
    }],
    ...patch
  };
}

describe("AiProposalCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiMock.updateAiProposal.mockImplementation(async (_id, input) => ({
      proposal: proposal({ version: input.version + 1 })
    }));
    apiMock.confirmAiProposal.mockResolvedValue({
      proposal: proposal({ status: "SUCCEEDED" }),
      changedDomains: ["tasks"]
    });
    apiMock.cancelAiProposal.mockResolvedValue({
      proposal: proposal({ status: "CANCELLED", version: 3 })
    });
    apiMock.retryAiProposal.mockResolvedValue({
      proposal: proposal({ status: "SUCCEEDED", version: 4 }),
      changedDomains: ["tasks"]
    });
  });

  it("edits, saves, and confirms once with an idempotency key", async () => {
    const onChanged = vi.fn();
    const onDomainsChanged = vi.fn();
    render(
      <AiProposalCard
        proposal={proposal()}
        onChanged={onChanged}
        onDomainsChanged={onDomainsChanged}
      />
    );

    expect(screen.getByText(/北京时间/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("待办标题"), {
      target: { value: "买两包咖啡豆" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(apiMock.updateAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({ version: 2 })
    ));
    expect(apiMock.updateAiProposal.mock.calls[0]?.[1].actions[0].input).toMatchObject({
      title: "买两包咖啡豆"
    });

    const confirmButton = screen.getByRole("button", { name: "确认执行" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    await waitFor(() => expect(apiMock.confirmAiProposal).toHaveBeenCalledTimes(1));
    expect(apiMock.confirmAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({
        version: 3,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/)
      })
    );
    expect(onDomainsChanged).toHaveBeenCalledWith(["tasks"]);
  });

  it("cancels pending proposals and retries failed items", async () => {
    const onChanged = vi.fn();
    const { rerender } = render(
      <AiProposalCard
        proposal={proposal()}
        onChanged={onChanged}
        onDomainsChanged={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "取消提案" }));
    await waitFor(() => expect(apiMock.cancelAiProposal).toHaveBeenCalledWith(
      "proposal-1",
      { version: 2 }
    ));

    rerender(
      <AiProposalCard
        proposal={proposal({
          status: "PARTIAL_FAILED",
          items: [{
            ...proposal().items[0]!,
            status: "FAILED",
            errorCode: "STALE_TARGET",
            errorMessage: "目标已变化"
          }]
        })}
        onChanged={onChanged}
        onDomainsChanged={vi.fn()}
      />
    );
    expect(screen.getByText("目标已变化")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));
    await waitFor(() => expect(apiMock.retryAiProposal).toHaveBeenCalledOnce());
  });
});
