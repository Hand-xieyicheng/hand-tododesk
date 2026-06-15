import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { buildAppBootstrap } from "../services/app-bootstrap.js";

export async function appBootstrapRoutes(app: FastifyInstance) {
  app.get("/app/bootstrap", async () => buildAppBootstrap(config));
}
