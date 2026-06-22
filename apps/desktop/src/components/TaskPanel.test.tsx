import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("TaskPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
