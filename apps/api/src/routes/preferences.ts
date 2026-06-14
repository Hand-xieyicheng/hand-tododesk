import type { FastifyInstance } from "fastify";
import { updateThemePreferenceRequestSchema } from "@todo/shared";
import { execute, queryOne, type DbRow } from "../db.js";

export async function preferenceRoutes(app: FastifyInstance) {
  app.get("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    await execute(
      "INSERT IGNORE INTO `UserThemePreference` (`userId`, `themeId`, `updatedAt`) VALUES (?, 'default', NOW(3))",
      [request.user.id]
    );
    const preference = await queryOne<DbRow & { themeId: string }>("SELECT `themeId` FROM `UserThemePreference` WHERE `userId` = ?", [request.user.id]);
    return { themeId: preference?.themeId ?? "default" };
  });

  app.put("/preferences/theme", { preHandler: app.authenticate }, async (request) => {
    const body = updateThemePreferenceRequestSchema.parse(request.body);
    await execute(
      `INSERT INTO \`UserThemePreference\` (\`userId\`, \`themeId\`, \`updatedAt\`)
       VALUES (?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE \`themeId\` = VALUES(\`themeId\`), \`updatedAt\` = NOW(3)`,
      [request.user.id, body.themeId]
    );
    return { themeId: body.themeId };
  });
}
