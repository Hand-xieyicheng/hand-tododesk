import {
  updateAiProposalRequestSchema,
  type ApiAiActionItem,
  type ApiAiProposal,
  type UpdateAiProposalRequest
} from "@todo/shared";

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
