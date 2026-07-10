import { z } from "zod";

export interface DeepSeekToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
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
    this.name = "DeepSeekClientError";
  }
}

const toolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string()
  })
});

const completionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().nullable().optional(),
      tool_calls: z.array(toolCallSchema).optional()
    })
  })).min(1)
});

function toWireMessages(messages: DeepSeekCompletionRequest["messages"]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls ? { tool_calls: message.toolCalls } : {})
  }));
}

async function normalizeDeepSeekResponse(response: Response): Promise<DeepSeekAssistantMessage> {
  if (response.status === 429) {
    throw new DeepSeekClientError("RATE_LIMITED", "AI service is busy");
  }
  if (!response.ok) {
    throw new DeepSeekClientError("UPSTREAM", `AI service returned ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DeepSeekClientError("INVALID_RESPONSE", "AI service returned an invalid response");
  }
  const parsed = completionResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new DeepSeekClientError("INVALID_RESPONSE", "AI service returned an invalid response");
  }
  const message = parsed.data.choices[0]?.message;
  if (!message) {
    throw new DeepSeekClientError("INVALID_RESPONSE", "AI service returned an invalid response");
  }
  return {
    role: "assistant",
    content: message.content ?? null,
    toolCalls: message.tool_calls ?? []
  };
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
          ...(input.jsonOutput
            ? { response_format: { type: "json_object" } }
            : {})
        }),
        signal: controller.signal
      });
      return await normalizeDeepSeekResponse(response);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DeepSeekClientError("TIMEOUT", "AI request timed out");
      }
      if (error instanceof DeepSeekClientError) {
        throw error;
      }
      throw new DeepSeekClientError("UPSTREAM", "AI service request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  async summarize(parts: string[]): Promise<string> {
    const response = await this.complete({
      messages: [
        {
          role: "system",
          content: "Summarize todoDesk conversation context as JSON: {\"summary\": string}. Preserve referenced item names, dates, and unresolved user choices."
        },
        {
          role: "user",
          content: parts.join("\n").slice(0, 40_000)
        }
      ],
      tools: [],
      jsonOutput: true
    });

    try {
      return z.object({
        summary: z.string().trim().min(1).max(4000)
      }).parse(JSON.parse(response.content ?? "")).summary;
    } catch {
      throw new DeepSeekClientError("INVALID_RESPONSE", "AI service returned an invalid summary");
    }
  }
}
