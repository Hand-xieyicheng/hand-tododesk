import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Input, Modal, Select } from "animal-island-ui";
import { Copy } from "lucide-react";
import type {
  ApiPrintShare,
  ApiTask,
  CreatePrintShareRequest,
  PrintMemoSource,
  PrintShareConfig,
  PrintTasksSource
} from "@todo/shared";
import { api } from "../api/client";
import { isRichContentEmpty, sanitizeRichHtml } from "../lib/memoRichText";

type PrintShareDialogProps =
  | { open: boolean; sourceType: "tasks"; source: PrintTasksSource; preview: { tasks: ApiTask[] }; onClose(): void }
  | { open: boolean; sourceType: "memo"; source: PrintMemoSource; preview: { title: string; contentHtml: string }; onClose(): void };

type PrintTemplateId = PrintShareConfig["templateId"];
type PrintPaperWidthMode = PrintShareConfig["paperWidthMode"];
type PrintFontSizeMode = PrintShareConfig["fontSizeMode"];
type PrintMarginMode = PrintShareConfig["marginMode"];

const templateOptions: Array<{ key: PrintTemplateId; label: string }> = [
  { key: "checklist", label: "标准样式" },
  { key: "memo", label: "便签样式" },
  { key: "compact", label: "紧凑样式" },
  { key: "decorated", label: "装饰样式" }
];

const paperOptions = [
  { key: "58", label: "58mm" },
  { key: "80", label: "80mm" },
  { key: "custom", label: "自定义" }
];

const fontSizeOptions: Array<{ key: PrintFontSizeMode; label: string }> = [
  { key: "small", label: "小字" },
  { key: "normal", label: "标准" },
  { key: "large", label: "大字" }
];

const marginOptions: Array<{ key: PrintMarginMode; label: string }> = [
  { key: "narrow", label: "窄边距" },
  { key: "normal", label: "标准" },
  { key: "wide", label: "宽边距" }
];

const expiryOptions = [
  { key: "1", label: "1 小时" },
  { key: "24", label: "24 小时" },
  { key: "72", label: "3 天" },
  { key: "168", label: "7 天" }
];

const previewTemplateClassNames: Record<PrintTemplateId, string> = {
  checklist: "print-template-checklist",
  compact: "print-template-compact",
  decorated: "print-template-decorated",
  memo: "print-template-memo"
};

function defaultTemplateFor(sourceType: PrintShareDialogProps["sourceType"]): PrintTemplateId {
  return sourceType === "memo" ? "memo" : "checklist";
}

function parseTemplateId(value: string): PrintTemplateId | null {
  switch (value) {
    case "checklist":
    case "memo":
    case "compact":
    case "decorated":
      return value;
    default:
      return null;
  }
}

function parseFontSizeMode(value: string): PrintFontSizeMode | null {
  switch (value) {
    case "small":
    case "normal":
    case "large":
      return value;
    default:
      return null;
  }
}

function parseMarginMode(value: string): PrintMarginMode | null {
  switch (value) {
    case "narrow":
    case "normal":
    case "wide":
      return value;
    default:
      return null;
  }
}

function parsePaperWidthMode(value: string): PrintPaperWidthMode | null {
  return value === "custom" ? "custom" : "preset";
}

function errorMessageFor(error: unknown) {
  return error instanceof Error ? error.message : "生成链接失败，请稍后重试";
}

export function PrintShareDialog(props: PrintShareDialogProps) {
  const fieldIdPrefix = useId();
  const requestIdRef = useRef(0);
  const [templateId, setTemplateId] = useState<PrintTemplateId>(() => defaultTemplateFor(props.sourceType));
  const [paperWidthMode, setPaperWidthMode] = useState<PrintPaperWidthMode>("preset");
  const [paperWidthMm, setPaperWidthMm] = useState(58);
  const [fontSizeMode, setFontSizeMode] = useState<PrintFontSizeMode>("normal");
  const [marginMode, setMarginMode] = useState<PrintMarginMode>("normal");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [printShare, setPrintShare] = useState<ApiPrintShare | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const sourceKey = props.sourceType === "tasks"
    ? `tasks:${props.source.tagFilter}:${props.source.showCompletedTasks}:${props.source.viewMode}`
    : `memo:${props.source.memoId}`;

  useEffect(() => {
    requestIdRef.current += 1;
    setTemplateId(defaultTemplateFor(props.sourceType));
    setGenerating(false);
    setPaperWidthMode("preset");
    setPaperWidthMm(58);
    setFontSizeMode("normal");
    setMarginMode("normal");
    setExpiresInHours(24);
    setPrintShare(null);
    setError("");
    setCopyMessage("");

    return () => {
      requestIdRef.current += 1;
    };
  }, [props.open, props.sourceType, sourceKey]);

  const config = useMemo<PrintShareConfig>(() => ({
    templateId,
    paperWidthMode,
    paperWidthMm,
    fontSizeMode,
    marginMode,
    expiresInHours
  }), [expiresInHours, fontSizeMode, marginMode, paperWidthMm, paperWidthMode, templateId]);
  const previewWidth = `${paperWidthMm}mm`;
  const previewClassName = [
    "print-share-preview-paper",
    previewTemplateClassNames[templateId],
    `is-font-${fontSizeMode}`,
    `is-margin-${marginMode}`
  ].join(" ");
  const previewTitle = props.sourceType === "memo" ? "备忘录预览" : "待办预览";
  const previewTasks = props.sourceType === "tasks"
    ? props.preview.tasks.filter((task) => task.status !== "COMPLETED")
    : [];
  const memoPreviewTitle = props.sourceType === "memo" ? props.preview.title.trim() || "未命名备忘录" : "";
  const memoPreviewHtml = props.sourceType === "memo" ? props.preview.contentHtml : "";
  const sanitizedMemoPreviewHtml = useMemo(() => sanitizeRichHtml(memoPreviewHtml), [memoPreviewHtml]);
  const memoPreviewEmpty = props.sourceType === "memo" && isRichContentEmpty(sanitizedMemoPreviewHtml);

  async function generateLink() {
    let input: CreatePrintShareRequest;
    if (props.sourceType === "tasks") {
      input = {
        sourceType: "tasks",
        source: {
          ...props.source,
          showCompletedTasks: false
        },
        config
      };
    } else {
      input = {
        sourceType: "memo",
        source: props.source,
        config
      };
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setGenerating(true);
    setError("");
    setCopyMessage("");
    try {
      const response = await api.createPrintShare(input);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setPrintShare(response.printShare);
    } catch (caught) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setPrintShare(null);
      setError(errorMessageFor(caught));
    } finally {
      if (requestIdRef.current === requestId) {
        setGenerating(false);
      }
    }
  }

  async function copyLink() {
    if (!printShare?.url) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyMessage("当前环境不支持自动复制，请手动复制");
      return;
    }

    try {
      await navigator.clipboard.writeText(printShare.url);
      setCopyMessage("已复制");
    } catch {
      setCopyMessage("复制失败，请手动复制");
    }
  }

  function invalidateGeneratedResult() {
    requestIdRef.current += 1;
    setGenerating(false);
    setPrintShare(null);
    setError("");
    setCopyMessage("");
  }

  function handleTemplateChange(value: string) {
    const nextTemplate = parseTemplateId(value);
    if (nextTemplate) {
      setTemplateId(nextTemplate);
      invalidateGeneratedResult();
    }
  }

  function handlePaperChange(value: string) {
    const nextMode = parsePaperWidthMode(value);
    if (!nextMode) {
      return;
    }
    setPaperWidthMode(nextMode);
    if (nextMode === "custom") {
      invalidateGeneratedResult();
      return;
    }
    const nextWidth = Number(value);
    if (Number.isInteger(nextWidth)) {
      setPaperWidthMm(nextWidth);
      invalidateGeneratedResult();
    }
  }

  function handleCustomPaperWidthChange(event: ChangeEvent<HTMLInputElement>) {
    const nextWidth = Number(event.target.value);
    if (Number.isInteger(nextWidth)) {
      setPaperWidthMm(nextWidth);
      invalidateGeneratedResult();
    }
  }

  function handleFontSizeChange(value: string) {
    const nextMode = parseFontSizeMode(value);
    if (nextMode) {
      setFontSizeMode(nextMode);
      invalidateGeneratedResult();
    }
  }

  function handleMarginChange(value: string) {
    const nextMode = parseMarginMode(value);
    if (nextMode) {
      setMarginMode(nextMode);
      invalidateGeneratedResult();
    }
  }

  function handleExpiryChange(value: string) {
    const nextExpiry = Number(value);
    if (Number.isInteger(nextExpiry)) {
      setExpiresInHours(nextExpiry);
      invalidateGeneratedResult();
    }
  }

  return (
    <Modal
      className="print-share-modal"
      footer={null}
      open={props.open}
      title="打印分享"
      typewriter={false}
      width={760}
      onClose={props.onClose}
    >
      <div className="print-share-dialog">
        <section className="print-share-config" aria-label="打印配置">
          <label>
            样式模版
            <Select
              aria-label="样式模版"
              options={templateOptions}
              value={templateId}
              onChange={handleTemplateChange}
            />
          </label>
          <label>
            纸宽
            <Select
              aria-label="纸宽"
              options={paperOptions}
              value={paperWidthMode === "custom" ? "custom" : String(paperWidthMm)}
              onChange={handlePaperChange}
            />
          </label>
          {paperWidthMode === "custom" ? (
            <label htmlFor={`${fieldIdPrefix}-custom-paper`}>
              自定义纸宽
              <Input
                id={`${fieldIdPrefix}-custom-paper`}
                min={40}
                max={120}
                step={1}
                type="number"
                value={String(paperWidthMm)}
                onChange={handleCustomPaperWidthChange}
              />
            </label>
          ) : null}
          <label>
            字号
            <Select
              aria-label="字号"
              options={fontSizeOptions}
              value={fontSizeMode}
              onChange={handleFontSizeChange}
            />
          </label>
          <label>
            边距
            <Select
              aria-label="边距"
              options={marginOptions}
              value={marginMode}
              onChange={handleMarginChange}
            />
          </label>
          <label>
            有效期
            <Select
              aria-label="有效期"
              options={expiryOptions}
              value={String(expiresInHours)}
              onChange={handleExpiryChange}
            />
          </label>
          <Button type="primary" loading={generating} disabled={generating} onClick={generateLink}>
            生成链接
          </Button>
        </section>

        <section className="print-share-result" aria-label="打印预览">
          {error ? <p className="print-share-error" role="alert">{error}</p> : null}
          <div className="print-share-preview">
            <h3 className="print-share-preview-title">预览模版</h3>
            <div className={previewClassName} style={{ width: previewWidth }}>
              <div className="print-share-paper-width-ruler">
                <span aria-label="当前预览纸宽">{paperWidthMm}mm</span>
              </div>
              <h3>{previewTitle}</h3>
              <div className="print-share-preview-scroll">
                {props.sourceType === "tasks" ? (
                  previewTasks.length > 0 ? (
                    <ul className="print-share-preview-task-list">
                      {previewTasks.map((task) => (
                        <li key={task.id} className={task.status === "COMPLETED" ? "is-completed" : undefined}>
                          <span className="box" />
                          <span className="print-share-preview-task-copy">
                            <span>{task.title}</span>
                            {task.notes ? <small>{task.notes}</small> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="print-share-preview-empty">暂无待办</p>
                  )
                ) : (
                  <>
                    <h4 className="print-share-preview-memo-title">{memoPreviewTitle}</h4>
                    {memoPreviewEmpty ? (
                      <p className="print-share-preview-empty">暂无内容</p>
                    ) : (
                      <div
                        className="print-share-preview-memo-content"
                        dangerouslySetInnerHTML={{ __html: sanitizedMemoPreviewHtml }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          {printShare ? (
            <div className="print-share-generated">
              <label>
                链接
                <span className="print-share-link-field">
                  <Input aria-label="生成的打印分享链接" readOnly value={printShare.url} />
                  {copyMessage ? <span className="print-share-copy-message" role="status">{copyMessage}</span> : null}
                  <Button
                    aria-label="复制链接"
                    className="print-share-link-copy-button"
                    icon={<Copy size={15} />}
                    size="small"
                    title="复制链接"
                    type="text"
                    onClick={copyLink}
                  />
                </span>
              </label>
            </div>
          ) : (
            <p className="inline-muted">生成链接后会显示在预览下方。</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
