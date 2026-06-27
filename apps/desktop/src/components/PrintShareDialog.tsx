import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "animal-island-ui";
import type {
  ApiPrintShare,
  CreatePrintShareRequest,
  PrintMemoSource,
  PrintShareConfig,
  PrintTasksSource
} from "@todo/shared";
import { api } from "../api/client";

type PrintShareDialogProps =
  | { open: boolean; sourceType: "tasks"; source: PrintTasksSource; onClose(): void }
  | { open: boolean; sourceType: "memo"; source: PrintMemoSource; onClose(): void };

type PrintTemplateId = PrintShareConfig["templateId"];
type PrintFontSizeMode = PrintShareConfig["fontSizeMode"];
type PrintMarginMode = PrintShareConfig["marginMode"];

const templateOptions: Array<{ key: string; value: PrintTemplateId; label: string }> = [
  { key: "checklist", value: "checklist", label: "清单模板" },
  { key: "memo", value: "memo", label: "备忘录模板" },
  { key: "compact", value: "compact", label: "紧凑模板" },
  { key: "decorated", value: "decorated", label: "装饰模板" }
];

const paperOptions = [
  { key: "58", value: "58", label: "58mm" },
  { key: "80", value: "80", label: "80mm" }
];

const fontSizeOptions: Array<{ key: string; value: PrintFontSizeMode; label: string }> = [
  { key: "small", value: "small", label: "小字" },
  { key: "normal", value: "normal", label: "标准" },
  { key: "large", value: "large", label: "大字" }
];

const marginOptions: Array<{ key: string; value: PrintMarginMode; label: string }> = [
  { key: "narrow", value: "narrow", label: "窄边距" },
  { key: "normal", value: "normal", label: "标准" },
  { key: "wide", value: "wide", label: "宽边距" }
];

const expiryOptions = [
  { key: "1", value: "1", label: "1 小时" },
  { key: "24", value: "24", label: "24 小时" },
  { key: "72", value: "72", label: "3 天" },
  { key: "168", value: "168", label: "7 天" }
];

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

function errorMessageFor(error: unknown) {
  return error instanceof Error ? error.message : "生成链接失败，请稍后重试";
}

export function PrintShareDialog(props: PrintShareDialogProps) {
  const [templateId, setTemplateId] = useState<PrintTemplateId>(() => defaultTemplateFor(props.sourceType));
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
    if (!props.open) {
      return;
    }

    setTemplateId(defaultTemplateFor(props.sourceType));
    setPaperWidthMm(58);
    setFontSizeMode("normal");
    setMarginMode("normal");
    setExpiresInHours(24);
    setPrintShare(null);
    setError("");
    setCopyMessage("");
  }, [props.open, props.sourceType, sourceKey]);

  const config = useMemo<PrintShareConfig>(() => ({
    templateId,
    paperWidthMode: "preset",
    paperWidthMm,
    fontSizeMode,
    marginMode,
    expiresInHours
  }), [expiresInHours, fontSizeMode, marginMode, paperWidthMm, templateId]);

  async function generateLink() {
    let input: CreatePrintShareRequest;
    if (props.sourceType === "tasks") {
      input = {
        sourceType: "tasks",
        source: props.source,
        config
      };
    } else {
      input = {
        sourceType: "memo",
        source: props.source,
        config
      };
    }

    setGenerating(true);
    setError("");
    setCopyMessage("");
    try {
      const response = await api.createPrintShare(input);
      setPrintShare(response.printShare);
    } catch (caught) {
      setPrintShare(null);
      setError(errorMessageFor(caught));
    } finally {
      setGenerating(false);
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

  function handleTemplateChange(value: string) {
    const nextTemplate = parseTemplateId(value);
    if (nextTemplate) {
      setTemplateId(nextTemplate);
      setPrintShare(null);
    }
  }

  function handlePaperChange(value: string) {
    const nextWidth = Number(value);
    if (Number.isInteger(nextWidth)) {
      setPaperWidthMm(nextWidth);
      setPrintShare(null);
    }
  }

  function handleFontSizeChange(value: string) {
    const nextMode = parseFontSizeMode(value);
    if (nextMode) {
      setFontSizeMode(nextMode);
      setPrintShare(null);
    }
  }

  function handleMarginChange(value: string) {
    const nextMode = parseMarginMode(value);
    if (nextMode) {
      setMarginMode(nextMode);
      setPrintShare(null);
    }
  }

  function handleExpiryChange(value: string) {
    const nextExpiry = Number(value);
    if (Number.isInteger(nextExpiry)) {
      setExpiresInHours(nextExpiry);
      setPrintShare(null);
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
            模板
            <Select value={templateId} options={templateOptions} onChange={handleTemplateChange} />
          </label>
          <label>
            纸宽
            <Select value={String(paperWidthMm)} options={paperOptions} onChange={handlePaperChange} />
          </label>
          <label>
            字号
            <Select value={fontSizeMode} options={fontSizeOptions} onChange={handleFontSizeChange} />
          </label>
          <label>
            边距
            <Select value={marginMode} options={marginOptions} onChange={handleMarginChange} />
          </label>
          <label>
            有效期
            <Select value={String(expiresInHours)} options={expiryOptions} onChange={handleExpiryChange} />
          </label>
          <Button type="primary" loading={generating} disabled={generating} onClick={generateLink}>
            生成链接
          </Button>
        </section>

        <section className="print-share-result" aria-label="分享结果">
          {error ? <p className="print-share-error" role="alert">{error}</p> : null}
          {printShare ? (
            <>
              <label>
                链接
                <Input aria-label="生成的打印分享链接" readOnly value={printShare.url} />
              </label>
              <Button type="default" onClick={copyLink}>
                复制链接
              </Button>
              {copyMessage ? <p className="print-share-copy-message">{copyMessage}</p> : null}
            </>
          ) : (
            <p className="inline-muted">生成后可复制链接到咕咕机或浏览器打印。</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
