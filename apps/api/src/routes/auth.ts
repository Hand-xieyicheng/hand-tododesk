import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import {
  defaultThemeId,
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

const defaultTagNames = ["工作", "生活", "娱乐"] as const;

function emailVerificationSuccessPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>小柴记邀请已接受</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#eef7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18352f;">
    <main style="width:min(520px,calc(100vw - 32px));background:#ffffff;border:1px solid #d6ebe2;border-radius:18px;box-shadow:0 18px 42px rgba(15,118,110,0.14);overflow:hidden;">
      <section style="background:#0f766e;color:#ffffff;padding:28px 32px;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.78;">TODODESK INVITATION</div>
        <h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;">邀请已接受</h1>
      </section>
      <section style="padding:28px 32px 32px;">
        <p style="margin:0;font-size:16px;line-height:1.8;color:#24443e;">邮箱验证已完成，现在可以回到小柴记应用登录。</p>
      </section>
    </main>
  </body>
</html>`;
}

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
      if (existing.emailVerifiedAt) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const token = createOpaqueToken();
      const name = body.name ?? null;

      await transaction(async (connection) => {
        await connection.execute(
          "UPDATE `User` SET `passwordHash` = ?, `name` = ?, `updatedAt` = NOW(3) WHERE `id` = ?",
          [passwordHash, name, existing.id]
        );
        await connection.execute(
          "UPDATE `EmailVerificationToken` SET `usedAt` = NOW(3) WHERE `userId` = ? AND `usedAt` IS NULL",
          [existing.id]
        );
        await connection.execute(
          "INSERT INTO `EmailVerificationToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
          [id(), existing.id, hashToken(token), toMysqlDate(addHours(new Date(), 24))]
        );
      });

      void sendVerificationEmail(existing.email, token, "registration");
      return reply.send({
        user: publicUser({ ...existing, name, emailVerifiedAt: null }),
        verificationEmailSent: true
      });
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
        "INSERT INTO `UserThemePreference` (`userId`, `themeId`, `updatedAt`) VALUES (?, ?, NOW(3))",
        [user.id, defaultThemeId]
      );
      for (const tagName of defaultTagNames) {
        await connection.execute(
          "INSERT INTO `Tag` (`id`, `userId`, `name`) VALUES (?, ?, ?)",
          [id(), user.id, tagName]
        );
      }
    });

    void sendVerificationEmail(user.email, token, "registration");
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

    return reply.type("text/html; charset=utf-8").send(emailVerificationSuccessPage());
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
