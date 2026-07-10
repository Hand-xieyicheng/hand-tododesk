import type { FastifyInstance, FastifyReply } from "fastify";
import {
  updateAnniversaryOrderRequestSchema,
  type CreateAnniversaryRequest,
  type UpdateAnniversaryRequest
} from "@todo/shared";
import { execute, queryRows, type DbRow } from "../db.js";
import {
  AnniversaryDomainError,
  createAnniversary,
  deleteAnniversary,
  listAnniversaries,
  updateAnniversary
} from "../services/anniversary-domain.js";

function sendAnniversaryDomainError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof AnniversaryDomainError)) {
    throw error;
  }
  return reply.code(404).send({ error: error.message });
}

export async function anniversaryRoutes(app: FastifyInstance) {
  app.get("/anniversaries", { preHandler: app.authenticate }, async (request) => {
    return { anniversaries: await listAnniversaries(request.user.id) };
  });

  app.put("/anniversaries/order", { preHandler: app.authenticate }, async (request, reply) => {
    const body = updateAnniversaryOrderRequestSchema.parse(request.body);
    const placeholders = body.orderedIds.map(() => "?").join(", ");
    const rows = await queryRows<DbRow & { id: string }>(
      `SELECT \`id\`
       FROM \`AnniversaryEvent\`
       WHERE \`userId\` = ? AND \`id\` IN (${placeholders})`,
      [request.user.id, ...body.orderedIds]
    );
    if (rows.length !== body.orderedIds.length) {
      return reply.code(404).send({ error: "Anniversary not found" });
    }

    await Promise.all(body.orderedIds.map((eventId, index) => execute(
      "UPDATE `AnniversaryEvent` SET `sortOrder` = ?, `updatedAt` = NOW(3) WHERE `id` = ? AND `userId` = ?",
      [(index + 1) * 1000, eventId, request.user.id]
    )));

    return { ok: true };
  });

  app.post("/anniversaries", { preHandler: app.authenticate }, async (request, reply) => {
    try {
      const anniversary = await createAnniversary(
        request.user.id,
        request.body as CreateAnniversaryRequest
      );
      return reply.code(201).send({ anniversary });
    } catch (error) {
      return sendAnniversaryDomainError(reply, error);
    }
  });

  app.patch("/anniversaries/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const eventId = (request.params as { id: string }).id;
    try {
      const anniversary = await updateAnniversary(
        request.user.id,
        eventId,
        request.body as UpdateAnniversaryRequest
      );
      return { anniversary };
    } catch (error) {
      return sendAnniversaryDomainError(reply, error);
    }
  });

  app.delete("/anniversaries/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const eventId = (request.params as { id: string }).id;
    try {
      await deleteAnniversary(request.user.id, eventId);
      return reply.code(204).send();
    } catch (error) {
      return sendAnniversaryDomainError(reply, error);
    }
  });
}
