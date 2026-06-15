import { fontFamilyValues, type FontFamily } from "@todo/shared";

export interface FontDefinition {
  id: FontFamily;
  label: string;
  stack: string;
}

const systemFontStack = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";

export const fontRegistry: Record<FontFamily, FontDefinition> = {
  system: {
    id: "system",
    label: "系统字体",
    stack: systemFontStack
  },
  "lemi-chunxu-wanxing": {
    id: "lemi-chunxu-wanxing",
    label: "乐米春序晚星体",
    stack: "\"Lemi Chunxu Wanxing\", " + systemFontStack
  },
  "lemi-muhe-yuanti": {
    id: "lemi-muhe-yuanti",
    label: "乐米沐和圆体",
    stack: "\"Lemi Muhe Yuanti\", " + systemFontStack
  },
  "lemi-zhixia-qianfeng": {
    id: "lemi-zhixia-qianfeng",
    label: "乐米栀夏浅风体",
    stack: "\"Lemi Zhixia Qianfeng\", " + systemFontStack
  },
  "nanxi-xin-yuanti": {
    id: "nanxi-xin-yuanti",
    label: "南西新圆体",
    stack: "\"Nanxi Xin Yuanti\", " + systemFontStack
  },
  "lemi-xiaonaipao": {
    id: "lemi-xiaonaipao",
    label: "乐米小奶泡体",
    stack: "\"Lemi Xiaonaipao\", " + systemFontStack
  },
  "baiwuchang-keke": {
    id: "baiwuchang-keke",
    label: "白无常可可体",
    stack: "\"Baiwuchang Keke\", " + systemFontStack
  }
};

export function normalizeFontFamily(value: string | null | undefined): FontFamily {
  return fontFamilyValues.includes(value as FontFamily) ? value as FontFamily : "system";
}

export function applyFontFamily(value: string | null | undefined) {
  const fontFamily = normalizeFontFamily(value);
  const stack = fontRegistry[fontFamily].stack;
  const root = document.documentElement;
  root.dataset.fontFamily = fontFamily;
  root.style.setProperty("--app-font-family", stack);
  root.style.setProperty("--animal-font-family", stack, "important");
  return fontFamily;
}
