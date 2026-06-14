import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../services/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
    };
  }
}

export async function authPlugin(app: FastifyInstance) {
  app.decorateRequest("user", null as unknown as FastifyRequest["user"]);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }

    try {
      const payload = verifyAccessToken(header.slice("Bearer ".length));
      request.user = {
        id: payload.sub,
        email: payload.email
      };
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }
  });
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
