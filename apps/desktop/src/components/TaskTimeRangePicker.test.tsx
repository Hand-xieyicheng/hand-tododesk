import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskTimeRangePicker, type TaskTimeRangeValue } from "./TaskTimeRangePicker";

vi.mock("antd/es/date-picker", async () => {
  const React = await import("react");
  const dayjs = await import("dayjs");

  function DatePickerMock(props: any) {
    const label = props["aria-label"] ?? props.placeholder ?? "日期";
    return React.createElement(
      "div",
      { className: props.className },
      React.createElement("input", {
        "aria-label": label,
        id: props.id,
        placeholder: props.placeholder,
        value: props.value ? props.value.format("YYYY/MM/DD HH:mm") : "",
        onBlur: props.onBlur,
        onChange: () => undefined
      }),
      React.createElement(
        "button",
        {
          "aria-label": `${label}选择2026/07/01 08:30`,
          type: "button",
          onClick: () => props.onChange?.(dayjs.default("2026-07-01T08:30:00"))
        },
        "选择"
      ),
      React.createElement(
        "button",
        {
          "aria-label": `${label}清空`,
          type: "button",
          onClick: () => props.onChange?.(null)
        },
        "清空"
      )
    );
  }

  return { default: DatePickerMock };
});

function ControlledTaskTimeRangePicker() {
  const [value, setValue] = useState<TaskTimeRangeValue>({
    startAt: "",
    dueAt: "2026-07-01T23:59"
  });

  return <TaskTimeRangePicker value={value} onChange={setValue} />;
}

describe("TaskTimeRangePicker", () => {
  it("keeps a picked start time when the underlying input emits a trailing empty change", () => {
    render(<ControlledTaskTimeRangePicker />);

    fireEvent.click(screen.getByRole("button", { name: "其它时间" }));
    fireEvent.click(screen.getByRole("button", { name: "开始时间选择2026/07/01 08:30" }));

    const startInput = screen.getByLabelText("开始时间");
    expect(startInput).toHaveValue("2026/07/01 08:30");

    fireEvent.change(startInput, { target: { value: "" } });

    expect(startInput).toHaveValue("2026/07/01 08:30");
  });
});
