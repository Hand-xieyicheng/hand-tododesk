import { describe, expect, it } from "vitest";
import { createPomodoroState, formatSeconds, startPomodoro, tickPomodoro } from "./pomodoroMachine";

describe("pomodoroMachine", () => {
  it("ticks only while running", () => {
    const idle = createPomodoroState(1);
    expect(tickPomodoro(idle).remainingSeconds).toBe(60);

    const running = startPomodoro(idle);
    expect(tickPomodoro(running).remainingSeconds).toBe(59);
  });

  it("finishes when time reaches zero", () => {
    const state = startPomodoro({ mode: "idle", durationSeconds: 1, remainingSeconds: 1 });
    expect(tickPomodoro(state)).toEqual({
      mode: "finished",
      durationSeconds: 1,
      remainingSeconds: 0
    });
  });

  it("formats remaining seconds", () => {
    expect(formatSeconds(125)).toBe("02:05");
  });
});

