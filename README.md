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

- `.app`：`apps/desktop/src-tauri/target/release/bundle/macos/todoDesk.app`
- `.dmg`：`apps/desktop/src-tauri/target/release/bundle/dmg/todoDesk_0.1.0_aarch64.dmg`

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
API_VERSION=0.1.0
DESKTOP_MIN_VERSION=0.1.0
DESKTOP_LATEST_VERSION=0.1.0
DESKTOP_UPDATE_ENDPOINT=https://github.com/Hand-xieyicheng/hand-tododesk/releases/latest/download/latest.json
FEATURE_FLAGS_JSON={"calendar":true,"pomodoro":true,"taskQuadrant":true,"floatingCard":true}
```

## macOS 使用教程

1. 启动后端服务。桌面 App 默认连接本机 `http://127.0.0.1:4020`，因此需要先配置 `apps/api/.env`、初始化数据库，并运行：

   ```bash
   npm run dev:api
   ```

2. 安装桌面 App。双击 `todoDesk_0.1.0_aarch64.dmg`，把 `todoDesk.app` 拖到 `Applications`。

3. 首次打开。如果 macOS 提示未验证开发者，右键点击 `todoDesk.app`，选择“打开”，再确认一次。

4. 登录或注册后使用待办、日历、番茄钟、主题和个人中心功能。刷新 token 会保存在 macOS Keychain。

### 登录报 `Load failed`

这表示桌面 App 没有连上本机 API。按顺序检查：

1. 确认后端正在运行：

   ```bash
   npm run dev:api
   ```

2. 确认 `apps/api/.env` 里的 `EXTRA_APP_ORIGINS` 包含安装版 Tauri 的 Origin：

   ```env
   EXTRA_APP_ORIGINS=http://127.0.0.1:5173,http://tauri.localhost,https://tauri.localhost,tauri://localhost
   ```

3. 修改 `.env` 后需要重启后端服务，再重新登录。
