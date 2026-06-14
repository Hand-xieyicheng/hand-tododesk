import type { FastifyInstance } from "fastify";
import {
  completePomodoroSessionRequestSchema,
  createPomodoroSessionRequestSchema
} from "@todo/shared";
import { asDate, execute, id, queryOne, queryRows, toMysqlDate, type DbRow } from "../db.js";

type PomodoroRow = DbRow & {
  id: string;
  taskId: string;
  status: "RUNNING" | "COMPLETED" | "CANCELLED";
  durationMinutes: number;
  actualMinutes: number | null;
  startedAt: Date | string;
  endedAt: Date | string | null;
};

function serializeSession(session: PomodoroRow) {
  return {
    id: session.id,
    taskId: session.taskId,
    status: session.status,
    durationMinutes: session.durationMinutes,
    actualMinutes: session.actualMinutes,
    startedAt: asDate(session.startedAt)?.toISOString() ?? new Date().toISOString(),
    endedAt: asDate(session.endedAt)?.toISOString() ?? null
  };
}

export async function pomodoroRoutes(app: FastifyInstance) {
  app.post("/pomodoro/sessions", { preHandler: app.authenticate }, async (request, reply) => {
    const body = createPomodoroSessionRequestSchema.parse(request.body);
    const task = await queryOne("SELECT `id` FROM `Task` WHERE `id` = ? AND `userId` = ? AND `status` <> 'ARCHIVED'", [body.taskId, request.user.id]);
    if (!task) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const sessionId = id();
    await execute(
      `INSERT INTO \`PomodoroSession\`
        (\`id\`, \`userId\`, \`taskId\`, \`status\`, \`durationMinutes\`, \`updatedAt\`)
       VALUES (?, ?, ?, 'RUNNING', ?, NOW(3))`,
      [sessionId, request.user.id, body.taskId, body.durationMinutes]
    );

    const session = await queryOne<PomodoroRow>("SELECT * FROM `PomodoroSession` WHERE `id` = ?", [sessionId]);
    return reply.code(201).send({ session: session ? serializeSession(session) : null });
  });

  app.patch("/pomodoro/sessions/:id/complete", { preHandler: app.authenticate }, async (request, reply) => {
    const sessionId = (request.params as { id: string }).id;
    const body = completePomodoroSessionRequestSchema.parse(request.body ?? {});
    const existing = await queryOne<PomodoroRow>(
      "SELECT * FROM `PomodoroSession` WHERE `id` = ? AND `userId` = ? AND `status` = 'RUNNING'",
      [sessionId, request.user.id]
    );
    if (!existing) {
      return reply.code(404).send({ error: "Running session not found" });
    }

    await execute(
      "UPDATE `PomodoroSession` SET `status` = 'COMPLETED', `endedAt` = NOW(3), `actualMinutes` = ?, `updatedAt` = NOW(3) WHERE `id` = ?",
      [body.actualMinutes ?? existing.durationMinutes, sessionId]
    );

    const session = await queryOne<PomodoroRow>("SELECT * FROM `PomodoroSession` WHERE `id` = ?", [sessionId]);
    return { session: session ? serializeSession(session) : null };
  });

  app.patch("/pomodoro/sessions/:id/cancel", { preHandler: app.authenticate }, async (request, reply) => {
    const sessionId = (request.params as { id: string }).id;
    const existing = await queryOne<PomodoroRow>(
      "SELECT * FROM `PomodoroSession` WHERE `id` = ? AND `userId` = ? AND `status` = 'RUNNING'",
      [sessionId, request.user.id]
    );
    if (!existing) {
      return reply.code(404).send({ error: "Running session not found" });
    }

    const startedAt = asDate(existing.startedAt) ?? new Date();
    const actualMinutes = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60000));
    await execute(
      "UPDATE `PomodoroSession` SET `status` = 'CANCELLED', `endedAt` = NOW(3), `actualMinutes` = ?, `updatedAt` = NOW(3) WHERE `id` = ?",
      [actualMinutes, sessionId]
    );

    const session = await queryOne<PomodoroRow>("SELECT * FROM `PomodoroSession` WHERE `id` = ?", [sessionId]);
    return { session: session ? serializeSession(session) : null };
  });

  app.get("/pomodoro/stats", { preHandler: app.authenticate }, async (request) => {
    const rows = await queryRows<DbRow & {
      taskId: string;
      title: string;
      completedMinutes: number;
      completedSessions: number;
    }>(
      `SELECT ps.taskId, t.title,
        COALESCE(SUM(COALESCE(ps.actualMinutes, ps.durationMinutes)), 0) AS completedMinutes,
        COUNT(*) AS completedSessions
       FROM \`PomodoroSession\` ps
       INNER JOIN \`Task\` t ON t.id = ps.taskId
       WHERE ps.userId = ? AND ps.status = 'COMPLETED'
       GROUP BY ps.taskId, t.title
       ORDER BY completedMinutes DESC`,
      [request.user.id]
    );

    return {
      totalCompletedMinutes: rows.reduce((sum, row) => sum + Number(row.completedMinutes), 0),
      totalCompletedSessions: rows.reduce((sum, row) => sum + Number(row.completedSessions), 0),
      byTask: rows.map((row) => ({
        taskId: row.taskId,
        title: row.title,
        completedMinutes: Number(row.completedMinutes),
        completedSessions: Number(row.completedSessions)
      }))
    };
  });
}
