import { config } from "./config.js";
import { buildApp } from "./app.js";
import { ensureSchema } from "./db.js";

await ensureSchema();
const app = await buildApp();

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
