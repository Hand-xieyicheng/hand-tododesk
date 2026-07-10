import { describe, expect, it } from "vitest";
import { ensureAiSchema, toMysqlDate } from "./db.js";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

describe("db date formatting", () => {
  it("formats DATETIME values in local time instead of UTC", () => {
    const date = new Date(2026, 5, 22, 17, 12, 2, 345);

    expect(toMysqlDate(date)).toBe([
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    ].join(" "));
  });

  it("keeps nullable dates as null", () => {
    expect(toMysqlDate(null)).toBeNull();
    expect(toMysqlDate(undefined)).toBeNull();
  });
});

describe("AI incremental schema", () => {
  it("creates all AI tables with ownership, ordering, and idempotency indexes", async () => {
    const statements: string[] = [];

    await ensureAiSchema(async (sql) => {
      statements.push(sql);
    });

    const executedSql = statements.join("\n");
    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiSession`");
    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiMessage`");
    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiActionProposal`");
    expect(executedSql).toContain("CREATE TABLE IF NOT EXISTS `AiActionItem`");
    expect(executedSql).toContain("AiActionProposal_userId_idempotencyKey_key");
    expect(executedSql).toContain("AiActionItem_proposalId_position_key");
    expect(executedSql).toContain("FOREIGN KEY (`userId`) REFERENCES `User`(`id`)");
  });
});
