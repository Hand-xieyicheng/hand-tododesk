import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiTask } from "@todo/shared";
import { getTodayEndDatetimeLocal } from "../lib/datetime";
import { TaskPanel } from "./TaskPanel";

const apiMock = vi.hoisted(() => ({
  createTag: vi.fn(),
  createTask: vi.fn(),
  deleteTag: vi.fn(),
  deleteTask: vi.fn(),
  taskQuadrants: vi.fn(),
  updateTag: vi.fn(),
  updateTask: vi.fn()
}));

const dndMock = vi.hoisted(() => ({
  draggables: new Map<string, { data: unknown; disabled?: boolean }>(),
  draggableTransform: { x: 24, y: 32, scaleX: 1.4, scaleY: 2 },
  droppables: new Map<string, { data: unknown }>(),
  handlers: {} as {
    onDragCancel?: () => void;
    onDragEnd?: (event: { active: { id: string; data: { current: unknown } }; over: { id: string; data: { current: unknown } } | null }) => void | Promise<void>;
    onDragStart?: (event: { active: { id: string; data: { current: unknown } } }) => void;
  }
}));

vi.mock("@dnd-kit/core", async () => {
  const React = await import("react");
  return {
    DndContext: ({ children, onDragCancel, onDragEnd, onDragStart }: any) => {
      dndMock.handlers = { onDragCancel, onDragEnd, onDragStart };
      return React.createElement("div", { "data-testid": "kanban-dnd-context" }, children);
    },
    DragOverlay: ({ children }: any) => (
      children ? React.createElement("div", { "data-testid": "kanban-drag-overlay" }, children) : null
    ),
    KeyboardSensor: function KeyboardSensor() {},
    PointerSensor: function PointerSensor() {},
    closestCenter: vi.fn(),
    useDraggable: ({ data, disabled, id }: any) => {
      dndMock.draggables.set(String(id), { data, disabled });
      return {
        attributes: { "data-draggable-id": String(id) },
        isDragging: false,
        listeners: {},
        setNodeRef: vi.fn(),
        transform: dndMock.draggableTransform
      };
    },
    useDroppable: ({ data, id }: any) => {
      dndMock.droppables.set(String(id), { data });
      return {
        isOver: false,
        setNodeRef: vi.fn()
      };
    },
    useSensor: vi.fn((sensor, options) => ({ options, sensor })),
    useSensors: vi.fn((...sensors) => sensors)
  };
});

vi.mock("animal-island-ui", () => ({
  Button: ({ children, danger, disabled, htmlType, icon, onClick, title, ...props }: any) => (
    <button aria-label={props["aria-label"]} disabled={disabled} type={htmlType ?? "button"} title={title} data-danger={danger ? "true" : undefined} onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <section className={className}>{children}</section>,
  Divider: () => <hr />,
  Input: ({ allowClear: _allowClear, shadow: _shadow, onChange, value, ...props }: any) => <input {...props} value={value} onChange={onChange} />,
  Modal: ({ children, onClose, open, title }: any) => (
    open ? (
      <div aria-label={typeof title === "string" ? title : undefined} role="dialog">
        <button aria-label="关闭" type="button" onClick={onClose}>关闭</button>
        {children}
      </div>
    ) : null
  ),
  Select: ({ onChange, options, value }: any) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option: any) => {
        const optionValue = option.value ?? option.key;
        return <option key={optionValue} value={optionValue}>{option.label}</option>;
      })}
    </select>
  ),
  Tooltip: ({ children, className, title }: any) => (
    <div className={className}>
      {children}
      <div role="tooltip">{title}</div>
    </div>
  )
}));

vi.mock("../api/client", () => ({
  api: apiMock
}));

const task: ApiTask = {
  id: "task-1",
  title: "准备周报",
  notes: "整理本周项目进展和风险",
  dueAt: "2026-06-15T10:00:00.000Z",
  priority: "IMPORTANT_URGENT",
  status: "TODO",
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  completedAt: null,
  recurrenceRule: {
    frequency: "WEEKLY",
    interval: 1,
    until: null,
    count: null,
    byWeekday: null
  },
  tags: [{ id: "tag-1", name: "工作" }],
  pomodoroCompletedCount: 2,
  pomodoroCompletedMinutes: 50
};

const tagOptions = [
  { id: "tag-1", name: "工作" },
  { id: "tag-2", name: "生活" }
];

function taskWith(patch: Partial<ApiTask>): ApiTask {
  return {
    ...task,
    ...patch,
    tags: patch.tags ?? task.tags
  };
}

function emptyQuadrants() {
  return {
    IMPORTANT_URGENT: [],
    IMPORTANT_NOT_URGENT: [],
    NOT_IMPORTANT_URGENT: [],
    NOT_IMPORTANT_NOT_URGENT: []
  };
}

function renderPanel(displayMode: "full" | "title", panelTasks: ApiTask[] = [task], tagFilter = "__all__") {
  return render(
    <TaskPanel
      createOpen={false}
      showCompletedTasks
      tags={tagOptions}
      taskCardDisplayMode={displayMode}
      tagMaintenanceOpen={false}
      taskTagFilter={tagFilter}
      tasks={panelTasks}
      viewMode="list"
      onChanged={vi.fn(async () => undefined)}
      onCreateOpenChange={vi.fn()}
      onTagMaintenanceOpenChange={vi.fn()}
    />
  );
}

function renderKanbanPanel(
  panelTasks: ApiTask[],
  showCompletedTasks = true,
  displayMode: "full" | "title" = "title",
  onChanged = vi.fn(async () => undefined),
  onPanelMessageChange = vi.fn()
) {
  return render(
    <TaskPanel
      createOpen={false}
      showCompletedTasks={showCompletedTasks}
      tags={tagOptions}
      taskCardDisplayMode={displayMode}
      tagMaintenanceOpen={false}
      taskTagFilter="tag-2"
      tasks={panelTasks}
      viewMode="kanban"
      onChanged={onChanged}
      onCreateOpenChange={vi.fn()}
      onPanelMessageChange={onPanelMessageChange}
      onTagMaintenanceOpenChange={vi.fn()}
    />
  );
}

async function dropKanbanTask(taskId: string, columnId: string | null) {
  const draggable = dndMock.draggables.get(taskId);
  const droppable = columnId ? dndMock.droppables.get(`kanban-column:${columnId}`) : null;
  const active = { id: taskId, data: { current: draggable?.data } };

  dndMock.handlers.onDragStart?.({ active });
  await dndMock.handlers.onDragEnd?.({
    active,
    over: droppable && columnId ? { id: `kanban-column:${columnId}`, data: { current: droppable.data } } : null
  });
}

async function startKanbanTaskDrag(taskId: string) {
  const draggable = dndMock.draggables.get(taskId);
  const active = { id: taskId, data: { current: draggable?.data } };

  await act(async () => {
    dndMock.handlers.onDragStart?.({ active });
  });
}

describe("TaskPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dndMock.draggables.clear();
    dndMock.droppables.clear();
    dndMock.handlers = {};
    apiMock.taskQuadrants.mockResolvedValue({ quadrants: emptyQuadrants() });
  });

  it("shows only title on cards and opens full content in a detail modal for title mode", () => {
    const { container } = renderPanel("title");

    expect(screen.getByRole("heading", { name: "准备周报" })).toBeInTheDocument();
    expect(container.querySelector(".task-notes")).not.toBeInTheDocument();
    expect(container.querySelector(".task-meta")).not.toBeInTheDocument();
    const completeButton = screen.getByRole("button", { name: "完成" });
    const deleteButton = screen.getByRole("button", { name: "删除" });
    expect(completeButton).toHaveClass("task-status-button");
    expect(deleteButton).toHaveClass("task-action-button");
    expect(completeButton).toHaveTextContent("");
    expect(deleteButton).toHaveTextContent("");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看准备周报详情" }));

    const dialog = screen.getByRole("dialog", { name: "待办详情" });
    expect(dialog).toHaveTextContent("整理本周项目进展和风险");
    expect(dialog).toHaveTextContent("重要且紧急");
    expect(dialog).toHaveTextContent("2 个番茄");
    expect(dialog).toHaveTextContent("#工作");
  });

  it("keeps normal card details in full mode", () => {
    const { container } = renderPanel("full");

    expect(container.querySelector(".task-notes")).toHaveTextContent("整理本周项目进展和风险");
    expect(container.querySelector(".task-meta")).toHaveTextContent("重要且紧急");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("defaults the create deadline to today at 23:59", () => {
    render(
      <TaskPanel
        createOpen
        showCompletedTasks
        tags={tagOptions}
        taskCardDisplayMode="full"
        tagMaintenanceOpen={false}
        taskTagFilter="__all__"
        tasks={[]}
        viewMode="list"
        onChanged={vi.fn(async () => undefined)}
        onCreateOpenChange={vi.fn()}
        onTagMaintenanceOpenChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText("截止时间")).toHaveValue(getTodayEndDatetimeLocal());
  });

  it("submits a selected tag id from the create dropdown", async () => {
    apiMock.createTask.mockResolvedValue({ task });
    const onChanged = vi.fn(async () => undefined);
    const onCreateOpenChange = vi.fn();
    render(
      <TaskPanel
        createOpen
        showCompletedTasks
        tags={tagOptions}
        taskCardDisplayMode="full"
        tagMaintenanceOpen={false}
        taskTagFilter="__all__"
        tasks={[]}
        viewMode="list"
        onChanged={onChanged}
        onCreateOpenChange={onCreateOpenChange}
        onTagMaintenanceOpenChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "整理计划" } });
    fireEvent.change(within(screen.getByRole("dialog", { name: "新建待办" })).getByLabelText("标签"), { target: { value: "tag-1" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "整理计划",
      tagId: "tag-1"
    })));
    await waitFor(() => expect(onCreateOpenChange).toHaveBeenCalledWith(false));
  });

  it("creates, renames, and deletes tags from the maintenance modal", async () => {
    apiMock.createTag.mockResolvedValue({ tag: { id: "tag-3", name: "私人" } });
    apiMock.updateTag.mockResolvedValue({ tag: { id: "tag-1", name: "办公" } });
    apiMock.deleteTag.mockResolvedValue(undefined);
    const onChanged = vi.fn(async () => undefined);
    render(
      <TaskPanel
        createOpen={false}
        showCompletedTasks
        tags={tagOptions}
        taskCardDisplayMode="full"
        tagMaintenanceOpen
        taskTagFilter="__all__"
        tasks={[]}
        viewMode="list"
        onChanged={onChanged}
        onCreateOpenChange={vi.fn()}
        onTagMaintenanceOpenChange={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("输入标签名称"), { target: { value: "私人" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "标签维护" })).getByRole("button", { name: "新增" }));

    await waitFor(() => expect(apiMock.createTag).toHaveBeenCalledWith({ name: "私人" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑工作" }));
    fireEvent.change(screen.getByDisplayValue("工作"), { target: { value: "办公" } });
    fireEvent.click(screen.getByRole("button", { name: "保存工作" }));

    await waitFor(() => expect(apiMock.updateTag).toHaveBeenCalledWith("tag-1", { name: "办公" }));

    fireEvent.click(screen.getByRole("button", { name: "删除生活" }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(apiMock.deleteTag).toHaveBeenCalledWith("tag-2"));
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("sorts list tasks with unfinished items first and created date ascending", () => {
    const completedOld = taskWith({
      id: "done-old",
      title: "早创建已完成",
      status: "COMPLETED",
      createdAt: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z"
    });
    const openNew = taskWith({
      id: "todo-new",
      title: "晚创建未完成",
      status: "TODO",
      createdAt: "2026-06-03T00:00:00.000Z"
    });
    const openOld = taskWith({
      id: "todo-old",
      title: "早创建未完成",
      status: "TODO",
      createdAt: "2026-06-02T00:00:00.000Z"
    });

    const { container } = renderPanel("full", [completedOld, openNew, openOld]);

    expect([...container.querySelectorAll(".task-item h3")].map((item) => item.textContent)).toEqual([
      "早创建未完成",
      "晚创建未完成",
      "早创建已完成"
    ]);
  });

  it("filters list tasks by selected tag", () => {
    const workTask = taskWith({ id: "work", title: "工作任务", tags: [{ id: "tag-1", name: "工作" }] });
    const lifeTask = taskWith({ id: "life", title: "生活任务", tags: [{ id: "tag-2", name: "生活" }] });

    renderPanel("full", [workTask, lifeTask], "tag-2");

    expect(screen.queryByText("工作任务")).not.toBeInTheDocument();
    expect(screen.getByText("生活任务")).toBeInTheDocument();
  });

  it("sorts quadrant tasks with the same display rule", async () => {
    const completedOld = taskWith({
      id: "done-old",
      title: "象限早创建已完成",
      status: "COMPLETED",
      createdAt: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z"
    });
    const openNew = taskWith({
      id: "todo-new",
      title: "象限晚创建未完成",
      status: "TODO",
      createdAt: "2026-06-03T00:00:00.000Z"
    });
    const openOld = taskWith({
      id: "todo-old",
      title: "象限早创建未完成",
      status: "TODO",
      createdAt: "2026-06-02T00:00:00.000Z"
    });

    apiMock.taskQuadrants.mockResolvedValue({
      quadrants: {
        ...emptyQuadrants(),
        IMPORTANT_URGENT: [completedOld, openNew, openOld]
      }
    });

    const { container } = render(
      <TaskPanel
        createOpen={false}
        showCompletedTasks
        tags={tagOptions}
        taskCardDisplayMode="full"
        tagMaintenanceOpen={false}
        taskTagFilter="__all__"
        tasks={[completedOld, openNew, openOld]}
        viewMode="quadrant"
        onChanged={vi.fn(async () => undefined)}
        onCreateOpenChange={vi.fn()}
        onTagMaintenanceOpenChange={vi.fn()}
      />
    );

    await waitFor(() => expect(apiMock.taskQuadrants).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelectorAll(".quadrant-task-list .task-item h3")).toHaveLength(3));

    expect([...container.querySelectorAll(".quadrant-task-list .task-item h3")].map((item) => item.textContent)).toEqual([
      "象限早创建未完成",
      "象限晚创建未完成",
      "象限早创建已完成"
    ]);
  });

  it("filters quadrant tasks by selected tag", async () => {
    const workTask = taskWith({ id: "work", title: "象限工作", tags: [{ id: "tag-1", name: "工作" }] });
    const lifeTask = taskWith({ id: "life", title: "象限生活", tags: [{ id: "tag-2", name: "生活" }] });
    apiMock.taskQuadrants.mockResolvedValue({
      quadrants: {
        ...emptyQuadrants(),
        IMPORTANT_URGENT: [workTask, lifeTask]
      }
    });

    render(
      <TaskPanel
        createOpen={false}
        showCompletedTasks
        tags={tagOptions}
        taskCardDisplayMode="full"
        tagMaintenanceOpen={false}
        taskTagFilter="tag-2"
        tasks={[workTask, lifeTask]}
        viewMode="quadrant"
        onChanged={vi.fn(async () => undefined)}
        onCreateOpenChange={vi.fn()}
        onTagMaintenanceOpenChange={vi.fn()}
      />
    );

    await waitFor(() => expect(apiMock.taskQuadrants).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("象限生活")).toBeInTheDocument());

    expect(screen.queryByText("象限工作")).not.toBeInTheDocument();
  });

  it("groups kanban tasks by untagged and tag columns with the shared display order", () => {
    const untaggedTask = taskWith({
      id: "kanban-untagged",
      title: "看板其它",
      tags: [],
      createdAt: "2026-06-01T00:00:00.000Z"
    });
    const workNew = taskWith({
      id: "kanban-work-new",
      title: "看板工作晚",
      tags: [{ id: "tag-1", name: "工作" }],
      createdAt: "2026-06-03T00:00:00.000Z"
    });
    const workOld = taskWith({
      id: "kanban-work-old",
      title: "看板工作早",
      tags: [{ id: "tag-1", name: "工作" }],
      createdAt: "2026-06-02T00:00:00.000Z"
    });
    const lifeTask = taskWith({
      id: "kanban-life",
      title: "看板生活",
      tags: [{ id: "tag-2", name: "生活" }, { id: "tag-1", name: "工作" }],
      createdAt: "2026-06-04T00:00:00.000Z"
    });

    const { container } = renderKanbanPanel([workNew, untaggedTask, lifeTask, workOld]);

    const columns = [...container.querySelectorAll<HTMLElement>(".kanban-column")];
    expect(columns.map((column) => column.querySelector("header h3")?.textContent)).toEqual(["其它", "工作", "生活"]);

    const otherColumn = screen.getByRole("region", { name: "其它看板列" });
    const workColumn = screen.getByRole("region", { name: "工作看板列" });
    const lifeColumn = screen.getByRole("region", { name: "生活看板列" });

    expect(within(otherColumn).getByText("1")).toBeInTheDocument();
    expect(within(workColumn).getByText("2")).toBeInTheDocument();
    expect(within(lifeColumn).getByText("1")).toBeInTheDocument();
    expect(within(otherColumn).getByText("看板其它")).toBeInTheDocument();
    expect([...workColumn.querySelectorAll(".task-item h3")].map((item) => item.textContent)).toEqual([
      "看板工作早",
      "看板工作晚"
    ]);
    expect(within(lifeColumn).getByText("看板生活")).toBeInTheDocument();
    expect(within(workColumn).queryByText("看板生活")).not.toBeInTheDocument();
  });

  it("hides completed tasks from kanban columns when completed items are disabled", () => {
    const completedTask = taskWith({
      id: "kanban-completed",
      title: "看板已完成",
      status: "COMPLETED",
      tags: [{ id: "tag-1", name: "工作" }],
      createdAt: "2026-06-01T00:00:00.000Z",
      completedAt: "2026-06-05T00:00:00.000Z"
    });
    const openTask = taskWith({
      id: "kanban-open",
      title: "看板未完成",
      status: "TODO",
      tags: [{ id: "tag-1", name: "工作" }],
      createdAt: "2026-06-02T00:00:00.000Z"
    });

    renderKanbanPanel([completedTask, openTask], false);

    const workColumn = screen.getByRole("region", { name: "工作看板列" });
    expect(within(workColumn).getByText("1")).toBeInTheDocument();
    expect(within(workColumn).getByText("看板未完成")).toBeInTheDocument();
    expect(within(workColumn).queryByText("看板已完成")).not.toBeInTheDocument();
  });

  it("updates a task tag when dropped into another kanban tag column", async () => {
    apiMock.updateTask.mockResolvedValue({ task: taskWith({ tags: [{ id: "tag-2", name: "生活" }] }) });
    const onChanged = vi.fn(async () => undefined);
    const workTask = taskWith({ id: "kanban-work", title: "看板工作", tags: [{ id: "tag-1", name: "工作" }] });

    renderKanbanPanel([workTask], true, "title", onChanged);

    await dropKanbanTask("kanban-work", "tag-2");

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("kanban-work", { tagId: "tag-2" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("clears a task tag when dropped into the untagged kanban column", async () => {
    apiMock.updateTask.mockResolvedValue({ task: taskWith({ tags: [] }) });
    const onChanged = vi.fn(async () => undefined);
    const workTask = taskWith({ id: "kanban-work", title: "看板工作", tags: [{ id: "tag-1", name: "工作" }] });

    renderKanbanPanel([workTask], true, "title", onChanged);

    await dropKanbanTask("kanban-work", "__untagged__");

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("kanban-work", { tagId: null }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("does not update a task tag when dropped into the same column or outside the kanban board", async () => {
    const workTask = taskWith({ id: "kanban-work", title: "看板工作", tags: [{ id: "tag-1", name: "工作" }] });

    renderKanbanPanel([workTask]);

    await dropKanbanTask("kanban-work", "tag-1");
    await dropKanbanTask("kanban-work", null);

    expect(apiMock.updateTask).not.toHaveBeenCalled();
  });

  it("reports kanban tag update failures to the parent message area instead of the kanban layout", async () => {
    apiMock.updateTask.mockRejectedValue(new Error("标签更新失败"));
    const onPanelMessageChange = vi.fn();
    const workTask = taskWith({ id: "kanban-work", title: "看板工作", tags: [{ id: "tag-1", name: "工作" }] });

    const { container } = renderKanbanPanel([workTask], true, "title", vi.fn(async () => undefined), onPanelMessageChange);

    await dropKanbanTask("kanban-work", "tag-2");

    await waitFor(() => expect(onPanelMessageChange).toHaveBeenCalledWith("标签更新失败"));
    expect(container.querySelector(".task-layout > .inline-alert")).not.toBeInTheDocument();
  });

  it("renders the dragged kanban card through the dnd overlay without transforming the source card", async () => {
    const { container } = renderKanbanPanel([task]);
    const sourceCard = container.querySelector<HTMLElement>("[data-kanban-task-id='task-1']");

    expect(sourceCard).not.toBeNull();
    expect(sourceCard!.style.transform).toBe("");

    await startKanbanTaskDrag("task-1");

    const overlay = screen.getByTestId("kanban-drag-overlay");
    expect(within(overlay).getByText("准备周报")).toBeInTheDocument();
    expect(sourceCard!.style.transform).toBe("");
  });

  it("keeps kanban card details, completion, and deletion available while cards are draggable", async () => {
    apiMock.updateTask.mockResolvedValue({ task: taskWith({ status: "COMPLETED" }) });
    apiMock.deleteTask.mockResolvedValue(undefined);
    const onChanged = vi.fn(async () => undefined);

    renderKanbanPanel([task], true, "title", onChanged);

    const workColumn = screen.getByRole("region", { name: "工作看板列" });
    fireEvent.click(within(workColumn).getByRole("button", { name: "查看准备周报详情" }));

    expect(screen.getByRole("dialog", { name: "待办详情" })).toHaveTextContent("整理本周项目进展和风险");

    fireEvent.click(within(workColumn).getByRole("button", { name: "完成" }));

    await waitFor(() => expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", { status: "COMPLETED" }));

    fireEvent.click(within(workColumn).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(apiMock.deleteTask).toHaveBeenCalledWith("task-1"));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("keeps vertical wheel movement independent from horizontal kanban scrolling", () => {
    const { container } = renderKanbanPanel([task]);
    const board = container.querySelector<HTMLElement>(".kanban-board");
    expect(board).not.toBeNull();

    Object.defineProperty(board, "scrollWidth", { configurable: true, value: 1200 });
    Object.defineProperty(board, "clientWidth", { configurable: true, value: 360 });
    board!.scrollLeft = 0;

    fireEvent.wheel(board!, { deltaX: 0, deltaY: 140 });

    expect(board!.scrollLeft).toBe(0);

    fireEvent.wheel(board!, { deltaX: 140, deltaY: 0 });

    expect(board!.scrollLeft).toBe(140);
  });

  it("preselects the column tag when creating a task from a kanban column", async () => {
    apiMock.createTask.mockResolvedValue({ task });
    const onChanged = vi.fn(async () => undefined);

    function KanbanCreateHarness() {
      const [createOpen, setCreateOpen] = useState(false);
      return (
        <TaskPanel
          createOpen={createOpen}
          showCompletedTasks
          tags={tagOptions}
          taskCardDisplayMode="title"
          tagMaintenanceOpen={false}
          taskTagFilter="__all__"
          tasks={[]}
          viewMode="kanban"
          onChanged={onChanged}
          onCreateOpenChange={setCreateOpen}
          onTagMaintenanceOpenChange={vi.fn()}
        />
      );
    }

    render(<KanbanCreateHarness />);

    fireEvent.click(within(screen.getByRole("region", { name: "工作看板列" })).getByRole("button", { name: "新建任务" }));
    expect(within(screen.getByRole("dialog", { name: "新建待办" })).getByLabelText("标签")).toHaveValue("tag-1");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "标签列任务" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "标签列任务",
      tagId: "tag-1"
    })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新建待办" })).not.toBeInTheDocument());

    fireEvent.click(within(screen.getByRole("region", { name: "其它看板列" })).getByRole("button", { name: "新建任务" }));
    expect(within(screen.getByRole("dialog", { name: "新建待办" })).getByLabelText("标签")).toHaveValue("__none__");
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "其它列任务" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiMock.createTask).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "其它列任务",
      tagId: null
    })));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});
