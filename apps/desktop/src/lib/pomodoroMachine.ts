export interface PomodoroState {
  mode: "idle" | "running" | "paused" | "finished";
  durationSeconds: number;
  remainingSeconds: number;
}

export function createPomodoroState(durationMinutes = 25): PomodoroState {
  const durationSeconds = durationMinutes * 60;
  return {
    mode: "idle",
    durationSeconds,
    remainingSeconds: durationSeconds
  };
}

export function startPomodoro(state: PomodoroState): PomodoroState {
  return { ...state, mode: "running" };
}

export function pausePomodoro(state: PomodoroState): PomodoroState {
  return state.mode === "running" ? { ...state, mode: "paused" } : state;
}

export function resetPomodoro(durationMinutes = 25): PomodoroState {
  return createPomodoroState(durationMinutes);
}

export function tickPomodoro(state: PomodoroState): PomodoroState {
  if (state.mode !== "running") {
    return state;
  }

  const remainingSeconds = Math.max(0, state.remainingSeconds - 1);
  return {
    ...state,
    remainingSeconds,
    mode: remainingSeconds === 0 ? "finished" : "running"
  };
}

export function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

