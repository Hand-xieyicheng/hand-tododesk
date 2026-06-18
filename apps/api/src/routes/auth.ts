import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema
} from "@todo/shared";
import { config } from "../config.js";
import { asDate, execute, id, queryOne, toMysqlDate, transaction, type DbRow } from "../db.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/mailer.js";
import { addHours, createOpaqueToken, hashToken, signAccessToken } from "../services/tokens.js";
import { publicUser, type UserRow } from "../services/users.js";

type TokenRow = DbRow & {
  id: string;
  userId: string;
  expiresAt: Date | string;
  usedAt: Date | string | null;
};

async function issueTokens(user: { id: string; email: string }) {
  const refreshToken = createOpaqueToken();
  await execute(
    "INSERT INTO `RefreshToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
    [id(), user.id, hashToken(refreshToken), toMysqlDate(addHours(new Date(), config.REFRESH_TOKEN_TTL_HOURS))]
  );

  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email }),
    refreshToken,
    expiresIn: config.ACCESS_TOKEN_TTL_SECONDS
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const body = registerRequestSchema.parse(request.body);
    const existing = await queryOne<UserRow>("SELECT * FROM `User` WHERE `email` = ?", [body.email]);
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const token = createOpaqueToken();
    const user = {
      id: id(),
      email: body.email,
      name: body.name ?? null,
      passwordHash,
      emailVerifiedAt: null
    };

    await transaction(async (connection) => {
      await connection.execute(
        "INSERT INTO `User` (`id`, `email`, `passwordHash`, `name`, `updatedAt`) VALUES (?, ?, ?, ?, NOW(3))",
        [user.id, user.email, passwordHash, user.name]
      );
      await connection.execute(
        "INSERT INTO `EmailVerificationToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
        [id(), user.id, hashToken(token), toMysqlDate(addHours(new Date(), 24))]
      );
      await connection.execute(
        "INSERT INTO `UserThemePreference` (`userId`, `themeId`, `updatedAt`) VALUES (?, 'default', NOW(3))",
        [user.id]
      );
    });

    void sendVerificationEmail(user.email, token);
    return reply.code(201).send({ user: publicUser(user), verificationEmailSent: true });
  });

  app.get("/auth/verify-email", async (request, reply) => {
    const token = String((request.query as { token?: string }).token ?? "");
    const record = await queryOne<TokenRow & UserRow>(
      "SELECT evt.*, u.email, u.name, u.emailVerifiedAt FROM `EmailVerificationToken` evt INNER JOIN `User` u ON u.id = evt.userId WHERE evt.tokenHash = ?",
      [hashToken(token)]
    );

    const expiresAt = asDate(record?.expiresAt);
    if (!record || record.usedAt || !expiresAt || expiresAt < new Date()) {
      return reply.code(400).send({ error: "Invalid or expired verification token" });
    }

    await transaction(async (connection) => {
      await connection.execute("UPDATE `User` SET `emailVerifiedAt` = NOW(3), `updatedAt` = NOW(3) WHERE `id` = ?", [record.userId]);
      await connection.execute("UPDATE `EmailVerificationToken` SET `usedAt` = NOW(3) WHERE `id` = ?", [record.id]);
    });

    return reply.type("text/html").send("<h1>小柴记邮箱验证成功</h1><p>现在可以回到应用登录。</p>");
  });

  app.post("/auth/login", async (request, reply) => {
    const body = loginRequestSchema.parse(request.body);
    const user = await queryOne<UserRow>("SELECT * FROM `User` WHERE `email` = ?", [body.email]);
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    if (!user.emailVerifiedAt) {
      return reply.code(403).send({ error: "Email is not verified" });
    }

    const tokens = await issueTokens(user);
    return { user: publicUser(user), tokens };
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = refreshRequestSchema.parse(request.body);
    const record = await queryOne<DbRow & {
      id: string;
      revokedAt: Date | string | null;
      expiresAt: Date | string;
      userId: string;
      email: string;
    }>(
      "SELECT rt.*, u.email FROM `RefreshToken` rt INNER JOIN `User` u ON u.id = rt.userId WHERE rt.tokenHash = ?",
      [hashToken(body.refreshToken)]
    );

    const expiresAt = asDate(record?.expiresAt);
    if (!record || record.revokedAt || !expiresAt || expiresAt < new Date()) {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }

    return {
      accessToken: signAccessToken({ sub: record.userId, email: record.email }),
      refreshToken: body.refreshToken,
      expiresIn: config.ACCESS_TOKEN_TTL_SECONDS
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const body = refreshRequestSchema.safeParse(request.body);
    if (body.success) {
      await execute("UPDATE `RefreshToken` SET `revokedAt` = NOW(3) WHERE `tokenHash` = ? AND `revokedAt` IS NULL", [hashToken(body.data.refreshToken)]);
    }
    return reply.code(204).send();
  });

  app.post("/auth/forgot-password", async (request) => {
    const body = forgotPasswordRequestSchema.parse(request.body);
    const user = await queryOne<UserRow>("SELECT * FROM `User` WHERE `email` = ?", [body.email]);
    if (user) {
      const token = createOpaqueToken();
      await execute(
        "INSERT INTO `PasswordResetToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
        [id(), user.id, hashToken(token), toMysqlDate(addHours(new Date(), 1))]
      );
      void sendPasswordResetEmail(user.email, token);
    }
    return { ok: true };
  });

  app.post("/auth/reset-password", async (request, reply) => {
    const body = resetPasswordRequestSchema.parse(request.body);
    const record = await queryOne<TokenRow>("SELECT * FROM `PasswordResetToken` WHERE `tokenHash` = ?", [hashToken(body.token)]);
    const expiresAt = asDate(record?.expiresAt);
    if (!record || record.usedAt || !expiresAt || expiresAt < new Date()) {
      return reply.code(400).send({ error: "Invalid or expired reset token" });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    await transaction(async (connection) => {
      await connection.execute("UPDATE `User` SET `passwordHash` = ?, `updatedAt` = NOW(3) WHERE `id` = ?", [passwordHash, record.userId]);
      await connection.execute("UPDATE `PasswordResetToken` SET `usedAt` = NOW(3) WHERE `id` = ?", [record.id]);
      await connection.execute("UPDATE `RefreshToken` SET `revokedAt` = NOW(3) WHERE `userId` = ? AND `revokedAt` IS NULL", [record.userId]);
    });

    return { ok: true };
  });
}
