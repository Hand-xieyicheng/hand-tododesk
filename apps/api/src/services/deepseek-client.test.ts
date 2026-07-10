import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DeepSeekClient,
  DeepSeekClientError,
  type DeepSeekClientOptions
} from "./deepseek-client.js";

function createClient(fetchImpl: typeof fetch, patch: Partial<DeepSeekClientOptions> = {}) {
  return new DeepSeekClient({
    apiKey: "test-key",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-v4-pro",
    timeoutMs: 45_000,
    fetchImpl,
    ...patch
  });
}

describe("DeepSeek client", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a non-streaming authenticated completion and normalizes tool calls", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call-1",
            type: "function",
            function: { name: "search_tasks", arguments: "{}" }
          }]
        }
      }]
    }), { status: 200 }));
    const client = createClient(fetchImpl);

    await expect(client.complete({
      messages: [{ role: "user", content: "今天有什么待办" }],
      tools: [{ type: "function", function: { name: "search_tasks" } }],
      jsonOutput: true
    })).resolves.toEqual({
      role: "assistant",
      content: null,
      toolCalls: [{
        id: "call-1",
        type: "function",
        function: { name: "search_tasks", arguments: "{}" }
      }]
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json"
        }),
        signal: expect.any(AbortSignal)
      })
    );
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: "deepseek-v4-pro",
      stream: false,
      response_format: { type: "json_object" }
    });
  });

  it("maps rate limits and invalid payloads to stable errors", async () => {
    const rateLimited = createClient(vi.fn<typeof fetch>().mockResolvedValue(
      new Response("busy", { status: 429 })
    ));
    await expect(rateLimited.complete({ messages: [], tools: [] })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "AI service is busy"
    });

    const invalid = createClient(vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 })
    ));
    await expect(invalid.complete({ messages: [], tools: [] })).rejects.toMatchObject({
      code: "INVALID_RESPONSE"
    });
  });

  it("aborts timed-out requests", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })
    ));
    const completion = createClient(fetchImpl, { timeoutMs: 1_000 }).complete({
      messages: [{ role: "user", content: "test" }],
      tools: []
    });
    const rejection = expect(completion).rejects.toMatchObject({ code: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
  });

  it("never exposes the API key through configuration or upstream failures", async () => {
    const missing = createClient(vi.fn<typeof fetch>(), { apiKey: "" });
    await expect(missing.complete({ messages: [], tools: [] })).rejects.toEqual(
      expect.any(DeepSeekClientError)
    );

    const failed = createClient(vi.fn<typeof fetch>().mockRejectedValue(
      new Error("request failed with test-key")
    ));
    const error = await failed.complete({ messages: [], tools: [] }).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "UPSTREAM", message: "AI service request failed" });
    expect(String(error)).not.toContain("test-key");
  });
});
