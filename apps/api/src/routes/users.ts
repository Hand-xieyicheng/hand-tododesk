import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  updateProfileRequestSchema
} from "@todo/shared";
import { execute, id, queryOne, toMysqlDate, transaction, type DbRow } from "../db.js";
import {
  AVATAR_MAX_BYTES,
  assertSquareAvatar,
  avatarDirectory,
  avatarExtensionForMime,
  createAvatarFilename,
  ensureAvatarDirectory,
  removeAvatarFile
} from "../services/avatar.js";
import { sendVerificationEmail } from "../services/mailer.js";
import { addHours, createOpaqueToken, hashToken } from "../services/tokens.js";
import { publicUser, type UserRow } from "../services/users.js";

async function getCurrentUser(userId: string) {
  return queryOne<UserRow>("SELECT * FROM `User` WHERE `id` = ?", [userId]);
}

export async function userRoutes(app: FastifyInstance) {
  app.get("/users/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = await getCurrentUser(request.user.id);
    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return { user: publicUser(user) };
  });

  app.patch("/users/me", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateProfileRequestSchema.parse(request.body);
    const current = await getCurrentUser(request.user.id);
    if (!current) {
      return reply.code(404).send({ error: "User not found" });
    }

    const name = Object.hasOwn(body, "name") ? body.name ?? null : current.name;
    const gender = body.gender ?? current.gender ?? "PRIVATE";

    await execute(
      "UPDATE `User` SET `name` = ?, `gender` = ?, `updatedAt` = NOW(3) WHERE `id` = ?",
      [name, gender, request.user.id]
    );

    const user = await getCurrentUser(request.user.id);
    return { user: publicUser(user ?? { ...current, name, gender }) };
  });

  app.post("/users/me/avatar", { preHandler: app.authenticate }, async (request, reply) => {
    const current = await getCurrentUser(request.user.id);
    if (!current) {
      return reply.code(404).send({ error: "User not found" });
    }

    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Avatar file is required" });
    }

    const extension = avatarExtensionForMime(file.mimetype);
    if (!extension) {
      return reply.code(400).send({ error: "Avatar must be PNG, JPEG, or WebP" });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: "Avatar must be 2MB or smaller" });
    }

    if (buffer.length > AVATAR_MAX_BYTES || file.file.truncated) {
      return reply.code(413).send({ error: "Avatar must be 2MB or smaller" });
    }

    try {
      assertSquareAvatar(buffer);
    } catch {
      return reply.code(400).send({ error: "Avatar must be a 1:1 image" });
    }

    await ensureAvatarDirectory();
    const filename = createAvatarFilename(request.user.id, extension);
    const avatarPath = path.join(avatarDirectory, filename);
    await fs.writeFile(avatarPath, buffer, { flag: "wx" });

    try {
      await execute("UPDATE `User` SET `avatarPath` = ?, `updatedAt` = NOW(3) WHERE `id` = ?", [filename, request.user.id]);
      await removeAvatarFile(current.avatarPath);
    } catch (error) {
      await removeAvatarFile(filename);
      throw error;
    }

    const user = await getCurrentUser(request.user.id);
    return { user: publicUser(user ?? { ...current, avatarPath: filename }) };
  });

  app.post("/users/me/email-change", { preHandler: app.authenticate }, async (request, reply) => {
    const body = changeEmailRequestSchema.parse(request.body);
    const current = await getCurrentUser(request.user.id);
    if (!current) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (!(await bcrypt.compare(body.currentPassword, current.passwordHash))) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    if (body.email === current.email) {
      return reply.code(400).send({ error: "New email must be different" });
    }

    const existing = await queryOne<DbRow & { id: string }>("SELECT `id` FROM `User` WHERE `email` = ? AND `id` <> ?", [
      body.email,
      request.user.id
    ]);
    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const token = createOpaqueToken();
    await transaction(async (connection) => {
      await connection.execute(
        "UPDATE `User` SET `email` = ?, `emailVerifiedAt` = NULL, `updatedAt` = NOW(3) WHERE `id` = ?",
        [body.email, request.user.id]
      );
      await connection.execute(
        "UPDATE `EmailVerificationToken` SET `usedAt` = NOW(3) WHERE `userId` = ? AND `usedAt` IS NULL",
        [request.user.id]
      );
      await connection.execute(
        "INSERT INTO `EmailVerificationToken` (`id`, `userId`, `tokenHash`, `expiresAt`) VALUES (?, ?, ?, ?)",
        [id(), request.user.id, hashToken(token), toMysqlDate(addHours(new Date(), 24))]
      );
    });

    void sendVerificationEmail(body.email, token, "email-change");
    const user = await getCurrentUser(request.user.id);
    return { user: publicUser(user ?? { ...current, email: body.email, emailVerifiedAt: null }), verificationEmailSent: true };
  });

  app.post("/users/me/password", { preHandler: app.authenticate }, async (request, reply) => {
    const body = changePasswordRequestSchema.parse(request.body);
    const current = await getCurrentUser(request.user.id);
    if (!current) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (!(await bcrypt.compare(body.currentPassword, current.passwordHash))) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 12);
    await transaction(async (connection) => {
      await connection.execute("UPDATE `User` SET `passwordHash` = ?, `updatedAt` = NOW(3) WHERE `id` = ?", [
        passwordHash,
        request.user.id
      ]);
      await connection.execute("UPDATE `RefreshToken` SET `revokedAt` = NOW(3) WHERE `userId` = ? AND `revokedAt` IS NULL", [
        request.user.id
      ]);
    });

    return reply.code(204).send();
  });
}
