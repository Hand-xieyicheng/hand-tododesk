import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { ZodError } from "zod";
import { appOrigins, config } from "./config.js";
import { authPlugin } from "./plugins/auth.js";
import { appBootstrapRoutes } from "./routes/app-bootstrap.js";
import { authRoutes } from "./routes/auth.js";
import { pomodoroRoutes } from "./routes/pomodoro.js";
import { preferenceRoutes } from "./routes/preferences.js";
import { taskRoutes } from "./routes/tasks.js";
import { userRoutes } from "./routes/users.js";
import { AVATAR_MAX_BYTES, avatarDirectory, ensureAvatarDirectory } from "./services/avatar.js";
import { memoRoutes } from "./routes/memos.js";
import { MEMO_ASSET_MAX_BYTES, ensureMemoAssetDirectory, memoAssetDirectory } from "./services/memo-assets.js";

export async function buildApp() {
  const app = Fastify({
    logger: config.NODE_ENV !== "test"
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    if (!rawBody) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(rawBody));
    } catch (error) {
      done(error as Error);
    }
  });

  await ensureAvatarDirectory();
  await ensureMemoAssetDirectory();

  await app.register(cors, {
    origin: appOrigins,
    credentials: true
  });
  await app.register(fastifyStatic, {
    root: avatarDirectory,
    prefix: "/avatar/"
  });
  await app.register(fastifyStatic, {
    root: memoAssetDirectory,
    prefix: "/memo-assets/",
    decorateReply: false
  });
  await app.register(multipart, {
    limits: {
      fileSize: Math.max(AVATAR_MAX_BYTES, MEMO_ASSET_MAX_BYTES),
      files: 1
    }
  });

  await authPlugin(app);
  await app.register(appBootstrapRoutes);
  await app.register(authRoutes);
  await app.register(memoRoutes);
  await app.register(taskRoutes);
  await app.register(pomodoroRoutes);
  await app.register(preferenceRoutes);
  await app.register(userRoutes);

  app.get("/health", async () => ({ ok: true }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation failed",
        issues: error.issues
      });
    }

    app.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  return app;
}
