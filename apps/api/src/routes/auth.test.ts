import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InjectOptions, Response } from "light-my-request";
import { buildApp } from "../app.js";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn()
}));

const mailer = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn()
}));

vi.mock("../db.js", () => ({
  asDate: (value: unknown) => value instanceof Date ? value : value ? new Date(String(value)) : null,
  execute: db.execute,
  id: () => "generated-id",
  queryOne: db.queryOne,
  queryRows: db.queryRows,
  toMysqlDate: (date: Date | null | undefined) => date ? date.toISOString().slice(0, 19).replace("T", " ") : null,
  transaction: db.transaction
}));

vi.mock("../services/mailer.js", () => ({
  sendPasswordResetEmail: mailer.sendPasswordResetEmail,
  sendVerificationEmail: mailer.sendVerificationEmail
}));

async function injectAuth(method: InjectOptions["method"], url: string, payload?: InjectOptions["payload"]): Promise<Response> {
  const app = await buildApp();
  const response = await app.inject({
    method,
    url,
    payload
  } satisfies InjectOptions);
  await app.close();
  return response;
}

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.queryOne.mockResolvedValue(null);
    db.queryRows.mockResolvedValue([]);
    db.transaction.mockImplementation(async (callback: (connection: { execute: typeof db.execute }) => Promise<unknown>) => callback({ execute: db.execute }));
  });

  it("resends a verification email when registering an unverified email again", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: "user-1",
      email: "pending@example.com",
      passwordHash: "old-hash",
      name: "Old Name",
      gender: "PRIVATE",
      avatarPath: null,
      emailVerifiedAt: null
    });

    const response = await injectAuth("POST", "/auth/register", {
      email: "pending@example.com",
      password: "Password123",
      name: "New Name"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: "user-1",
        email: "pending@example.com",
        name: "New Name",
        emailVerifiedAt: null
      },
      verificationEmailSent: true
    });
    expect(db.execute).toHaveBeenCalledWith(
      "UPDATE `EmailVerificationToken` SET `usedAt` = NOW(3) WHERE `userId` = ? AND `usedAt` IS NULL",
      ["user-1"]
    );
    expect(db.execute).toHaveBeenCalledWith(
      "INSERT INTO `EmailVerificationToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
      ["generated-id", "user-1", expect.any(String), expect.any(String)]
    );
    expect(mailer.sendVerificationEmail).toHaveBeenCalledWith("pending@example.com", expect.any(String), "registration");
  });

  it("keeps rejecting registration for an already verified email", async () => {
    db.queryOne.mockResolvedValueOnce({
      id: "user-1",
      email: "verified@example.com",
      passwordHash: "hash",
      name: null,
      gender: "PRIVATE",
      avatarPath: null,
      emailVerifiedAt: new Date("2026-06-01T00:00:00.000Z")
    });

    const response = await injectAuth("POST", "/auth/register", {
      email: "verified@example.com",
      password: "Password123"
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Email already registered" });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });
});
