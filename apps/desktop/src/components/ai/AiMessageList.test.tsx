import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiAiMessage } from "@todo/shared";
import { AiMessageList } from "./AiMessageList";

const userMessage: ApiAiMessage = {
  id: "message-user",
  sessionId: "session-1",
  role: "USER",
  kind: "TEXT",
  content: "帮我创建待办",
  metadata: null,
  createdAt: "2026-07-10T04:00:00.000Z"
};

describe("AiMessageList", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows elapsed thinking time below the latest user message", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <AiMessageList
        messages={[userMessage]}
        thinking
        onDomainsChanged={vi.fn()}
        onProposalChanged={vi.fn()}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("思考中(0s)...");

    act(() => {
      vi.advanceTimersByTime(183_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("思考中(3m 3s)...");

    rerender(
      <AiMessageList
        messages={[userMessage]}
        thinking={false}
        onDomainsChanged={vi.fn()}
        onProposalChanged={vi.fn()}
      />
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
