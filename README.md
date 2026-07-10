# 小柴记

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

   默认访问地址为 `http://localhost:8090/`。如当前机器上的 IPv6 解析异常，请使用 `http://127.0.0.1:8090/` 访问小柴记。

6. 启动 Tauri 桌面应用：

   ```bash
   npm run tauri:dev -w @todo/desktop
   ```

> 当前机器需要安装 Rust/Cargo 才能运行 Tauri 桌面壳。

## macOS 打包

首次打包前确认已安装依赖：

```bash
npm install
```

生成 macOS 桌面应用和 DMG 安装包：

```bash
npm run build:mac
```

产物位置：

- `.app`：`apps/desktop/src-tauri/target/release/bundle/macos/小柴记.app`
- `.dmg`：`apps/desktop/src-tauri/target/release/bundle/dmg/小柴记_0.2.0_aarch64.dmg`

## 应用内更新发布

桌面端使用 Tauri updater，从公开 GitHub Releases 读取版本元数据：

```text
https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json
```

首次发布前需要生成 updater 签名密钥：

```bash
cd apps/desktop
npx tauri signer generate
```

把生成的公钥替换到 `apps/desktop/src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，私钥和密码分别配置到 GitHub Secrets：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

推送 `v*.*.*` tag 后，`.github/workflows/release-desktop.yml` 会构建 macOS Apple Silicon 和 Windows x64，并上传安装包、签名文件和 `latest.json`。

后端 `GET /app/bootstrap` 会返回桌面端最低支持版本、最新版本、更新源和 feature flags，可通过以下环境变量控制：

```env
API_VERSION=0.2.0
DESKTOP_MIN_VERSION=0.1.0
DESKTOP_LATEST_VERSION=0.2.0
DESKTOP_UPDATE_ENDPOINT=https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json
HOST=127.0.0.1
UPLOAD_STORAGE_DIR=/var/lib/tododesk/uploads
FEATURE_FLAGS_JSON={"calendar":true,"pomodoro":true,"taskQuadrant":true,"floatingCard":true}
```

生产环境建议让 API 只监听 `127.0.0.1`，由 Nginx 对外提供 HTTPS 入口；只有需要局域网直接访问 API 时才把 `HOST` 改为 `0.0.0.0`。

`UPLOAD_STORAGE_DIR` 用于保存用户上传的头像和备忘录图片。生产环境必须指向发布目录之外的持久化目录或挂载卷，例如 `/var/lib/tododesk/uploads`；发版时不要删除该目录。服务启动时会尝试把旧版 `apps/api/public/avatar` 和 `apps/api/public/memo-assets` 中已有的文件复制到新的持久化目录。

## AI 助手

AI 助手由 API 服务调用 DeepSeek，桌面端不会读取或保存 API Key。所有新增、编辑、删除和打卡操作都会先生成可编辑提案，只有用户明确确认后才会写入。

在 `apps/api/.env` 配置以下服务端变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions`
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- `DEEPSEEK_TIMEOUT_MS=45000`

只有 `DEEPSEEK_API_KEY` 非空，且 `FEATURE_FLAGS_JSON` 未将 `aiAssistant` 设为 `false` 时，`/app/bootstrap` 才会向桌面端开放 AI 入口。修改环境变量后需要重启 API 服务。

真实 API 冒烟测试必须显式执行：

```bash
RUN_DEEPSEEK_SMOKE=true npm test -w @todo/api -- src/services/deepseek-smoke.test.ts
```

运行前请在当前 shell 或 `apps/api/.env` 中配置一个已轮换的测试 Key。默认 `npm test` 会跳过该测试，不会访问外部 AI 服务，也不会发送生产用户数据。

## macOS 使用教程

1. 启动后端服务。桌面 App 默认连接本机 `http://127.0.0.1:4020`，因此需要先配置 `apps/api/.env`、初始化数据库，并运行：

   ```bash
   npm run dev:api
   ```

2. 安装桌面 App。双击 `小柴记_0.2.0_aarch64.dmg`，把 `小柴记.app` 拖到 `Applications`。

3. 首次打开。如果 macOS 提示未验证开发者，右键点击 `小柴记.app`，选择“打开”，再确认一次。

4. 登录或注册后使用待办、日历、番茄钟、主题和个人中心功能。刷新 token 会保存在 macOS Keychain。

### 登录报 `Load failed`

这表示桌面 App 没有连上本机 API。按顺序检查：

1. 确认后端正在运行：

   ```bash
   npm run dev:api
   ```

2. 确认 `apps/api/.env` 里的 `EXTRA_APP_ORIGINS` 包含安装版 Tauri 的 Origin：

   ```env
   EXTRA_APP_ORIGINS=http://127.0.0.1:8090,http://tauri.localhost,https://tauri.localhost,tauri://localhost
   ```

3. 修改 `.env` 后需要重启后端服务，再重新登录。
