# todoDesk 智能助手设计

## 背景与目标

在 todoDesk 全局页面增加一个专注于个人事务管理的 AI 助手。用户可以用自然语言查询、创建、编辑和删除待办事项、倒数纪念日与习惯，也可以完成或取消习惯打卡。

助手不是开放式聊天机器人。首版只处理 todoDesk 业务域，支持多轮上下文和一条消息中的批量操作，例如：

- “我今天还有哪些待办？”
- “明天下午买咖啡豆，周五交周报。”
- “我今天喝咖啡了。”
- “3 月 12 日是我的生日。”
- “把刚才第二项改到下周一。”

成功标准：

- 查询结果来自当前用户的真实数据。
- 所有写操作先生成可编辑提案，只有用户明确确认后才执行。
- AI 创建的数据与普通页面创建的数据遵循同一套业务规则。
- 会话和消息按用户保存在后端，可跨设备查看。
- 执行状态与数据库实际结果一致，不显示虚假的成功状态。

## 已确认的产品决策

- 所有创建、编辑、删除、归档、打卡和取消打卡均需要确认。
- 首版支持查询现有数据，但不提供统计复盘、主动建议或开放式闲聊。
- 支持多轮对话和单条消息中的批量操作。
- 会话、消息和操作提案保存在后端，按用户隔离。
- 全局 AI Icon 位于工作区右下角。
- 点击后向左上展开约 640 × 520 的紧凑浮动面板。
- 左侧会话区默认显示为约 54px 的图标轨道，可在面板内展开完整会话列表。
- DeepSeek 负责理解、只读查询和提案生成；todoDesk 后端控制所有写入。

## 界面与交互

### 全局入口

AI Icon 固定在已登录应用的工作区右下角，不随待办、纪念日、习惯等页面切换消失。入口避开 Footer 装饰和系统窗口边缘，建议桌面间距为右侧 24px、底部 24px。

点击 Icon 后，聊天框从右下角向左上展开。点击关闭按钮、再次点击 Icon 或点击浮层外区域时收起。收起只关闭浮层，不结束会话或取消已经发出的请求。

### 聊天面板

面板包含：

- `SessionRail`：新建会话、会话切换、展开会话列表、重命名和删除。
- `ChatHeader`：当前会话标题、会话管理和关闭按钮。
- `MessageList`：用户消息、助手回复、查询结果和业务操作卡片。
- `ProposalCard`：批量预览、逐项编辑、移除、取消和确认。
- `Composer`：文本输入、发送状态和错误重试。

输入框使用 Enter 发送，Shift + Enter 换行。请求处理中禁用同一消息的重复提交，并显示“正在理解”或“正在查询”。首版使用非流式响应，优先保证 Tool Call 和结构化提案完整。

### 首次引导

新会话没有消息时显示助手能力和示例：

> 你好，我可以帮你查询和管理待办、倒数纪念日、习惯与打卡。试试输入“我今天有哪些待办？”、“我今天喝咖啡了”或“3 月 12 日是我的生日”。

示例使用可点击快捷短语，但点击后只填入输入框，不自动发送。

### 查询

查询不产生操作提案，可以直接返回真实结果。结果使用业务卡片展示关键字段，例如标题、状态、绝对日期、标签、纪念日类型或习惯计划。业务卡片的数据由后端只读工具结果生成；模型只能生成解释性文字，不能凭空增加工具结果中不存在的记录。

“明天”“本周五”等相对日期在界面中必须显示解析后的北京时间绝对值。查询无结果时明确说明未找到，不编造数据。

### 写操作提案

模型返回一个或多个结构化操作后，助手创建 `PENDING_CONFIRMATION` 提案。提案卡片必须展示：

- 操作类型和业务对象。
- 将要创建或修改的字段。
- 删除或打卡操作的目标。
- 相对日期解析后的北京时间。
- 编辑、移除、取消和确认按钮。

用户可以逐项编辑提案，也可以从批量提案中移除某一项。每次编辑都会增加提案版本。确认时客户端提交当前版本，避免旧窗口或旧数据重复执行。

### 歧义消解

当名称、日期或目标不明确时，助手不得自行猜测。例如“把咖啡那个删掉”同时匹配待办和习惯时，应展示候选项并要求用户选择。

如果缺少创建所必需的字段，助手用 `clarification` 回复提出一个明确问题。澄清完成后再生成提案。

### 执行结果

后端写入成功后才能显示“已完成”。批量操作逐项展示成功或失败：

- 全部成功：提案进入 `SUCCEEDED`，刷新相关页面数据。
- 部分失败：提案进入 `PARTIAL_FAILED`，保留成功结果，并允许只编辑或重试失败项。
- 全部失败：提案进入 `FAILED`，展示可理解的原因和重试入口。

## 系统架构

采用后端受控工具编排：

1. 桌面端通过现有 JWT 调用 todoDesk API。
2. `AiSessionService` 保存会话与消息。
3. `AiOrchestrator` 组装上下文并调用 DeepSeek。
4. DeepSeek 只能调用后端提供的只读工具。
5. DeepSeek 返回查询答复、澄清问题或结构化操作提案。
6. `ApprovalGate` 保存提案，但不执行任何写操作。
7. 用户确认后，`AiActionExecutor` 重新鉴权、校验和执行。
8. 执行器调用与普通页面共用的领域服务。
9. 执行结果持久化，并通知相关页面刷新。

### 模块边界

桌面端：

- `AiFloatingButton`：全局入口及展开状态。
- `AiChatPanel`：面板布局和会话加载。
- `AiSessionRail`：会话列表和管理。
- `AiMessageList`：消息、查询结果和状态显示。
- `AiProposalCard`：提案编辑、确认和重试。
- `AiComposer`：输入、发送和重试。

API：

- `ai/routes`：鉴权后的 HTTP 合约。
- `AiSessionService`：会话、消息和摘要。
- `DeepSeekClient`：超时、重试、请求和响应归一化。
- `AiOrchestrator`：上下文、Tool Call 循环和结构化输出。
- `AiProposalService`：提案版本、取消、过期和状态流转。
- `AiActionExecutor`：幂等执行和逐项结果。
- `TaskService`、`AnniversaryService`、`HabitService`：普通页面与 AI 共用的领域服务。

现有任务、纪念日和习惯路由中的业务逻辑需要按上述领域边界做针对性提取。路由与 AI 都调用相同服务；AI 不通过内部 HTTP 回调现有路由，也不直接拼接业务 SQL。

## DeepSeek 集成

服务端环境变量：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_API_URL`
- `DEEPSEEK_MODEL=deepseek-v4-pro`
- `DEEPSEEK_TIMEOUT_MS`

API Key 只存在于 API 服务端环境，不进入桌面包、前端环境变量、数据库、日志、设计文档或测试快照。用户在需求沟通中提供过的旧 Key 应吊销并重新生成。

DeepSeek V4 Pro 官方支持 JSON Output 和 Tool Calls。实现使用正式 API 地址；不依赖需要 `/beta` 地址的 strict mode。模型输出仍由 todoDesk 自己的 Zod Schema 校验。

参考：

- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)

### 上下文构建

每次请求包含：

- 当前北京时间和时区 `Asia/Shanghai`。
- 当前用户输入。
- 当前会话摘要。
- 最近 20 条用户与助手消息。
- 当前轮只读工具返回的必要数据。

不把当前用户的全部业务数据一次性发送给模型。会话增长后更新摘要，并保留最近消息，降低成本和上下文漂移。

### 只读工具

首版工具集合：

- `search_tasks`
- `search_anniversaries`
- `search_habits`
- `get_habit_checkins`

每个工具都从服务端当前用户身份获得 `userId`，模型不能传入或覆盖用户 ID。查询结果设置条数上限，只返回完成当前意图需要的字段。

模型没有创建、编辑、删除或打卡工具。写操作只能表现为最终的结构化提案，因此即使提示词被诱导，也无法绕过确认门。

### 编排限制

- 每条用户消息最多进行 4 轮 Tool Call。
- 每个查询工具限制返回条数，默认不超过 50 条。
- 最终结果必须是 `answer`、`proposal` 或 `clarification` 之一。
- JSON 或 Tool Call 校验失败时允许一次修复重试。
- 修复仍失败时返回可重试错误，不创建提案。

## 结构化合约

共享包新增 AI Schema。核心结果为判别联合：

- `answer`：只读查询答复和结构化结果；其中的业务记录 ID 必须来自当前轮工具结果。
- `clarification`：需要用户补充或选择的信息。
- `proposal`：一个或多个待确认的 `AiActionItem`。

支持的业务对象和动作：

- `TASK`：`CREATE`、`UPDATE`、`DELETE`。
- `ANNIVERSARY`：`CREATE`、`UPDATE`、`DELETE`。
- `HABIT`：`CREATE`、`UPDATE`、`DELETE`、`ARCHIVE`、`RESTORE`。
- `HABIT_CHECKIN`：`CHECK_IN`、`CANCEL_CHECK_IN`。

每个操作项的 `input` 必须再次通过现有对象对应的创建或更新 Schema。删除、编辑和打卡必须提供已由只读工具验证过的目标 ID，但执行时仍会重新校验归属和最新状态。

## 数据模型

### `AiSession`

- `id`
- `userId`
- `title`
- `summary`
- `lastMessageAt`
- `createdAt`
- `updatedAt`

会话默认使用首条用户消息生成标题。用户可以重命名或删除；删除会话级联删除对应的 AI 消息、提案和执行结果，但不撤销或删除已经创建的业务数据。

### `AiMessage`

- `id`
- `sessionId`
- `role`: `USER` 或 `ASSISTANT`
- `kind`: `TEXT`、`QUERY_RESULT`、`CLARIFICATION`、`PROPOSAL`、`EXECUTION_RESULT`、`ERROR`
- `content`
- `metadataJson`
- `createdAt`

内部 Tool Call 不作为普通聊天消息暴露给前端。必要的诊断信息使用服务端结构化日志记录。

### `AiActionProposal`

- `id`
- `sessionId`
- `messageId`
- `userId`
- `status`
- `version`
- `idempotencyKey`
- `expiresAt`
- `createdAt`
- `updatedAt`

状态：

- `PENDING_CONFIRMATION`
- `EXECUTING`
- `SUCCEEDED`
- `PARTIAL_FAILED`
- `FAILED`
- `CANCELLED`
- `EXPIRED`

### `AiActionItem`

- `id`
- `proposalId`
- `position`
- `objectType`
- `actionType`
- `targetId`
- `inputJson`
- `targetSnapshotJson`
- `status`
- `resultJson`
- `errorCode`
- `errorMessage`
- `createdAt`
- `updatedAt`

逐项结果支持部分失败和仅重试失败项。`targetSnapshotJson` 用于在确认时发现目标已被其他页面修改或删除。

## API 合约

所有 API 都使用现有 JWT 鉴权，并校验资源属于当前用户。

- `GET /ai/sessions`：按最后消息时间倒序读取会话。
- `POST /ai/sessions`：创建空会话。
- `PATCH /ai/sessions/:id`：重命名会话。
- `DELETE /ai/sessions/:id`：删除会话及其历史。
- `GET /ai/sessions/:id/messages`：游标分页读取消息。
- `POST /ai/sessions/:id/messages`：保存用户消息并运行 AI 编排。
- `PATCH /ai/proposals/:id`：按当前版本编辑或移除提案项目。
- `POST /ai/proposals/:id/confirm`：确认当前版本并执行。
- `POST /ai/proposals/:id/retry`：仅重试失败项目。
- `POST /ai/proposals/:id/cancel`：取消未执行提案。

确认接口要求客户端提交提案版本和幂等键。相同幂等键重复请求时返回第一次执行结果，不重复写入。

## 一致性与实时刷新

AI 执行成功后发送现有应用内数据变更事件，触发当前页面、固定桌面卡片和相关详情重新读取。首版沿用同一机器上的事件桥接，不引入定时轮询或新的多设备推送系统。

会话本身通过后端持久化实现跨设备读取。不同设备同时打开同一会话时，首版依赖消息重新加载和提案版本冲突保护，不实现实时协同编辑。

## 错误处理与安全

- DeepSeek 超时、限流或网络错误：保留用户消息，不创建提案，不执行写操作，并允许重试。
- JSON 或 Tool Call 非法：修复一次；仍失败则返回明确错误。
- 日期含糊：要求补充；相对日期必须显示解析后的北京时间。
- 目标同名或不明确：返回候选项，不自行选择。
- 提案过期：拒绝确认，并要求重新生成。
- 提案版本冲突：返回最新提案，不执行旧版本。
- 目标状态变化：该项失败并要求重新确认，不覆盖新数据。
- 批量部分失败：保留成功项，仅重试失败项。
- 重复确认：通过幂等键返回已有结果。
- 日志不记录 API Key，不记录完整敏感提示词或模型的隐藏推理内容。
- 所有模型文本按普通文本渲染，不直接注入 HTML。

## 测试计划

### 共享包

- `answer`、`clarification` 和 `proposal` 判别联合。
- 所有对象、动作和非法组合。
- 日期、版本和幂等键校验。
- 每个 Action Item 对现有业务 Schema 的映射。

### API 与服务

- 会话创建、列表、重命名、删除和消息分页。
- 不同用户不能读取或修改彼此的会话、消息和提案。
- 只读工具始终绑定当前用户。
- DeepSeek 超时、限流、空结果、无效 JSON 和无效 Tool Call。
- Tool Call 轮数上限和查询条数上限。
- 提案编辑、移除、取消、过期和版本冲突。
- 确认、幂等、部分失败和只重试失败项。
- 目标在确认前被编辑或删除时停止执行。
- AI 与普通页面调用同一领域服务并产生一致结果。

### 桌面端

- AI Icon 在各业务页面的右下角保持可见。
- 浮层展开、收起、外部点击和页面切换行为。
- 会话创建、切换、重命名、删除和跨设备重新加载。
- 首次引导、快捷短语和键盘发送。
- 查询结果、澄清候选、提案编辑和移除。
- 确认中防重复提交、部分失败和失败重试。
- 执行成功后刷新任务、纪念日、习惯和固定卡片。

### 端到端

至少覆盖：

- 查询今日待办。
- 批量创建两个待办并编辑其中一项。
- 创建阳历生日纪念日。
- 创建无结束日期的每日习惯。
- 对已有习惯完成和取消当天打卡。
- 编辑和删除同名候选项前先完成歧义选择。
- 重复点击确认不会创建重复数据。

真实 DeepSeek 冒烟测试通过显式环境开关运行，不进入默认 CI，也不使用生产用户数据。

## 首版不做

- 开放式问答和闲聊。
- 主动建议、统计复盘和习惯洞察。
- 语音、图片或文件输入。
- AI 自动执行或后台执行写操作。
- 流式回复。
- 多设备实时协同编辑。
- 新的 WebSocket 推送系统。
- 对外网搜索或第三方日历集成。
- AI 配置管理页面或用户自带 API Key。

这些能力应在受控提案、领域服务复用和执行状态可靠后再单独设计。
