import type { FastifyInstance, FastifyReply } from "fastify";
import {
  habitDetailQuerySchema,
  habitListQuerySchema,
  updateHabitOrderRequestSchema,
  type CreateHabitRequest,
  type HabitCheckInRequest,
  type UpdateHabitRequest
} from "@todo/shared";
import { execute, queryRows, type DbRow } from "../db.js";
import {
  cancelHabitCheckIn,
  checkInHabit,
  createHabit,
  deleteHabit,
  getHabitDetail,
  HabitDomainError,
  listHabits,
  updateHabit
} from "../services/habit-domain.js";

function sendHabitDomainError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof HabitDomainError)) {
    throw error;
  }
  const statusCode = error.code === "NOT_FOUND" ? 404 : 400;
  return reply.code(statusCode).send({ error: error.message });
}

export async function habitRoutes(app: FastifyInstance) {
  app.get("/habits", { preHandler: app.authenticate }, async (request) => {
    const query = habitListQuerySchema.parse(request.query);
    return {
      habits: await listHabits(request.user.id, query.includeArchived === "true")
    };
  });

  app.put("/habits/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateHabitOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`Habit\`
       WHERE \`userId\` = ? AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Habit not found" });
    }

    await Promise.all(body.orderedIds.map((habitId, index) => execute(
      "UPDATE `Habit` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [(index + 1) * 1000, habitId, request.user.id]
    )));

    return { ok: true };
  });

  app.post("/habits", { preHandler: app.authenticate }, async (request, reply) => {
    try {
      const habit = await createHabit(
        request.user.id,
        request.body as CreateHabitRequest
      );
      return reply.code(201).send({ habit });
    } catch (error) {
      return sendHabitDomainError(reply, error);
    }
  });

  app.get("/habits/:id/detail", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    const query = habitDetailQuerySchema.parse(request.query);
    const detail = await getHabitDetail(request.user.id, habitId, query.month);
    if (!detail) {
      return reply.code(404).send({ error: "Habit not found" });
    }
    return detail;
  });

  app.patch("/habits/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    try {
      const habit = await updateHabit(
        request.user.id,
        habitId,
        request.body as UpdateHabitRequest
      );
      return { habit };
    } catch (error) {
      return sendHabitDomainError(reply, error);
    }
  });

  app.delete("/habits/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    try {
      await deleteHabit(request.user.id, habitId);
      return reply.code(204).send();
    } catch (error) {
      return sendHabitDomainError(reply, error);
    }
  });

  app.post("/habits/:id/check-ins", { preHandler: app.authenticate }, async (request, reply) => {
    const habitId = (request.params as { id: string }).id;
    try {
      const checkIn = await checkInHabit(
        request.user.id,
        habitId,
        request.body as HabitCheckInRequest
      );
      return reply.code(201).send({ checkIn });
    } catch (error) {
      return sendHabitDomainError(reply, error);
    }
  });

  app.delete("/habits/:id/check-ins/:date", { preHandler: app.authenticate }, async (request, reply) => {
    const { id: habitId, date } = request.params as { id: string; date: string };
    try {
      await cancelHabitCheckIn(request.user.id, habitId, date);
      return reply.code(204).send();
    } catch (error) {
      return sendHabitDomainError(reply, error);
    }
  });
}
