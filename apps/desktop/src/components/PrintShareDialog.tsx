import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Input, Modal } from "animal-island-ui";
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

const templateOptions: Array<{ value: PrintTemplateId; label: string }> = [
  { value: "checklist", label: "清单模板" },
  { value: "memo", label: "备忘录模板" },
  { value: "compact", label: "紧凑模板" },
  { value: "decorated", label: "装饰模板" }
];

const paperOptions = [
  { value: "58", label: "58mm" },
  { value: "80", label: "80mm" }
];

const fontSizeOptions: Array<{ value: PrintFontSizeMode; label: string }> = [
  { value: "small", label: "小字" },
  { value: "normal", label: "标准" },
  { value: "large", label: "大字" }
];

const marginOptions: Array<{ value: PrintMarginMode; label: string }> = [
  { value: "narrow", label: "窄边距" },
  { value: "normal", label: "标准" },
  { value: "wide", label: "宽边距" }
];

const expiryOptions = [
  { value: "1", label: "1 小时" },
  { value: "24", label: "24 小时" },
  { value: "72", label: "3 天" },
  { value: "168", label: "7 天" }
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
  const fieldIdPrefix = useId();
  const requestIdRef = useRef(0);
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
    requestIdRef.current += 1;
    setTemplateId(defaultTemplateFor(props.sourceType));
    setGenerating(false);
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
    const nextWidth = Number(value);
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
          <label htmlFor={`${fieldIdPrefix}-template`}>
            模板
            <select
              className="print-share-native-select"
              id={`${fieldIdPrefix}-template`}
              value={templateId}
              onChange={(event) => handleTemplateChange(event.target.value)}
            >
              {templateOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor={`${fieldIdPrefix}-paper`}>
            纸宽
            <select
              className="print-share-native-select"
              id={`${fieldIdPrefix}-paper`}
              value={String(paperWidthMm)}
              onChange={(event) => handlePaperChange(event.target.value)}
            >
              {paperOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor={`${fieldIdPrefix}-font-size`}>
            字号
            <select
              className="print-share-native-select"
              id={`${fieldIdPrefix}-font-size`}
              value={fontSizeMode}
              onChange={(event) => handleFontSizeChange(event.target.value)}
            >
              {fontSizeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor={`${fieldIdPrefix}-margin`}>
            边距
            <select
              className="print-share-native-select"
              id={`${fieldIdPrefix}-margin`}
              value={marginMode}
              onChange={(event) => handleMarginChange(event.target.value)}
            >
              {marginOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label htmlFor={`${fieldIdPrefix}-expiry`}>
            有效期
            <select
              className="print-share-native-select"
              id={`${fieldIdPrefix}-expiry`}
              value={String(expiresInHours)}
              onChange={(event) => handleExpiryChange(event.target.value)}
            >
              {expiryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
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
