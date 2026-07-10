import type { ApiAiActionItem } from "@todo/shared";
import { AiAnniversaryActionEditor } from "./AiAnniversaryActionEditor";
import { AiCheckInActionEditor } from "./AiCheckInActionEditor";
import { AiHabitActionEditor } from "./AiHabitActionEditor";
import { AiTaskActionEditor } from "./AiTaskActionEditor";

export interface AiActionEditorProps {
  action: ApiAiActionItem;
  disabled: boolean;
  onChange(action: ApiAiActionItem): void;
}

export function AiActionEditor(props: AiActionEditorProps) {
  switch (props.action.objectType) {
    case "TASK": return <AiTaskActionEditor {...props} />;
    case "ANNIVERSARY": return <AiAnniversaryActionEditor {...props} />;
    case "HABIT": return <AiHabitActionEditor {...props} />;
    case "HABIT_CHECKIN": return <AiCheckInActionEditor {...props} />;
  }
}
