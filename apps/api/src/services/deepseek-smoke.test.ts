import { describe, expect, it } from "vitest";
import { aiModelResultSchema } from "@todo/shared";
import { DeepSeekClient } from "./deepseek-client.js";

const runSmoke = process.env.RUN_DEEPSEEK_SMOKE === "true";

describe.runIf(runSmoke)("DeepSeek smoke", () => {
  it("returns a schema-valid synthetic todoDesk answer", async () => {
    const client = new DeepSeekClient({
      apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      apiUrl: process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
      timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 45_000),
      fetchImpl: fetch
    });

    const response = await client.complete({
      messages: [
        {
          role: "system",
          content: "Return only JSON matching: {\"type\":\"answer\",\"text\":string,\"records\":[]}."
        },
        {
          role: "user",
          content: "Synthetic test: there are no tasks today. Answer that there are no tasks."
        }
      ],
      tools: [],
      jsonOutput: true
    });

    expect(aiModelResultSchema.parse(JSON.parse(response.content ?? ""))).toMatchObject({
      type: "answer",
      records: []
    });
  }, 60_000);
});
