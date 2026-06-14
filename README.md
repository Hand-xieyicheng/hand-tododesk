# todoDesk

桌面端待办事项应用。首版使用 Tauri 2 + React + TypeScript 构建 macOS 优先桌面端，Node.js + Fastify + Prisma + MySQL 构建同步后端。

## 目录

- `apps/desktop`：Tauri + React 桌面端
- `apps/api`：Fastify API 服务
- `packages/shared`：共享 Zod schema、类型和 API contract

## 本地启动

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置后端：

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

   填入本机 MySQL 的 `DATABASE_URL`、`JWT_SECRET` 和 SMTP 配置。

3. 初始化数据库：

   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. 启动 API：

   ```bash
   npm run dev:api
   ```

5. 启动桌面前端预览：

   ```bash
   npm run dev:desktop
   ```

   当前机器上如有其他服务监听 `localhost:5173` 的 IPv6 地址，请使用 `http://127.0.0.1:5173/` 访问 todoDesk。

6. 启动 Tauri 桌面应用：

   ```bash
   npm run tauri:dev -w @todo/desktop
   ```

> 当前机器需要安装 Rust/Cargo 才能运行 Tauri 桌面壳。
