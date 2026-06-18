import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = "demo@tododesk.local";
const password = "Password123";

async function main() {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "小柴记 Demo",
      passwordHash: await bcrypt.hash(password, 12),
      emailVerifiedAt: new Date(),
      themePreference: {
        create: { themeId: "default" }
      }
    }
  });

  const task = await prisma.task.upsert({
    where: { id: "demo_daily_task" },
    update: {},
    create: {
      id: "demo_daily_task",
      userId: user.id,
      title: "整理今日计划",
      notes: "示例重复任务",
      dueAt: new Date(),
      priority: "IMPORTANT_NOT_URGENT",
      recurrenceRule: {
        create: {
          frequency: "DAILY",
          interval: 1
        }
      }
    }
  });

  await prisma.pomodoroSession.createMany({
    data: [
      {
        id: "demo_pomodoro_session",
        userId: user.id,
        taskId: task.id,
        status: "COMPLETED",
        durationMinutes: 25,
        actualMinutes: 25,
        endedAt: new Date()
      }
    ],
    skipDuplicates: true
  });

  console.info(`Seeded demo user: ${email} / ${password}`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
