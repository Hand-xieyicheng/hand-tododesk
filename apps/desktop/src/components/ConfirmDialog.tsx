import type { ReactNode } from "react";
import { Button, Modal } from "animal-island-ui";

interface ConfirmDialogProps {
  cancelText?: string;
  className?: string;
  confirmText?: string;
  danger?: boolean;
  description?: ReactNode;
  loading?: boolean;
  open: boolean;
  title: string;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDialog({
  cancelText = "取消",
  className,
  confirmText = "确认",
  danger = false,
  description,
  loading = false,
  open,
  title,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const closeDialog = () => {
    if (!loading) {
      onCancel();
    }
  };

  return (
    <Modal
      className={["confirm-dialog", className].filter(Boolean).join(" ")}
      open={open}
      title={title}
      width={420}
      footer={null}
      maskClosable={!loading}
      typewriter={false}
      onClose={closeDialog}
    >
      <div className="confirm-dialog-content">
        {description ? <div className="confirm-dialog-description">{description}</div> : null}
        <div className="confirm-dialog-actions">
          <Button disabled={loading} type="default" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button danger={danger} disabled={loading} loading={loading} type={danger ? "primary" : "default"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
