import {
  updateAiProposalRequestSchema,
  type ApiAiActionItem,
  type ApiAiProposal,
  type UpdateAiProposalRequest
} from "@todo/shared";

const editableSnapshotFields = {
  TASK: [
    "title",
    "notes",
    "startAt",
    "dueAt",
    "priority",
    "status",
    "tagId",
    "recurrenceRule"
  ],
  ANNIVERSARY: [
    "title",
    "notes",
    "category",
    "date",
    "repeat",
    "direction",
    "cardStyle",
    "calendarType",
    "lunarMonth",
    "lunarDay",
    "solarTerm"
  ],
  HABIT: [
    "title",
    "notes",
    "icon",
    "color",
    "frequency",
    "interval",
    "weekDays",
    "monthDays",
    "startDate",
    "endDate"
  ]
} as const;

function editableSnapshotInput(action: ApiAiActionItem) {
  if (action.actionType !== "UPDATE" || !action.targetSnapshot) {
    return null;
  }
  const fields = action.objectType === "HABIT_CHECKIN"
    ? []
    : editableSnapshotFields[action.objectType];
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in action.targetSnapshot) {
      input[field] = action.targetSnapshot[field];
    }
  }
  if (action.objectType === "TASK" && input.tagId === undefined) {
    const firstTag = Array.isArray(action.targetSnapshot.tags)
      ? action.targetSnapshot.tags[0]
      : null;
    input.tagId = firstTag && typeof firstTag === "object" && "id" in firstTag
      ? firstTag.id
      : null;
  }
  return input;
}

export function toEditableProposal(proposal: ApiAiProposal): ApiAiProposal {
  return {
    ...proposal,
    items: proposal.items.map((action) => {
      const snapshotInput = editableSnapshotInput(action);
      return snapshotInput
        ? {
          ...action,
          input: {
            ...snapshotInput,
            ...action.input
          } as ApiAiActionItem["input"]
        }
        : action;
    })
  };
}

export function replaceAction(
  proposal: ApiAiProposal,
  actionId: string,
  update: (action: ApiAiActionItem) => ApiAiActionItem
): ApiAiProposal {
  return {
    ...proposal,
    items: proposal.items.map((action) => (
      action.id === actionId ? update({ ...action, input: { ...action.input } }) : action
    ))
  };
}

export function removeAction(
  proposal: ApiAiProposal,
  actionId: string
): ApiAiProposal {
  return {
    ...proposal,
    items: proposal.items
      .filter((action) => action.id !== actionId)
      .map((action, position) => ({ ...action, position }))
  };
}

export function toUpdateAiProposalRequest(
  proposal: ApiAiProposal
): UpdateAiProposalRequest {
  return updateAiProposalRequestSchema.parse({
    version: proposal.version,
    actions: proposal.items.map((action) => ({
      clientId: action.id,
      objectType: action.objectType,
      actionType: action.actionType,
      targetId: action.targetId,
      input: action.input
    }))
  });
}
