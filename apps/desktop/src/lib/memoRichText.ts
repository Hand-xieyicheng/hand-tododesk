const allowedRichTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

const allowedRichAttributes: Record<string, string[]> = {
  a: ["href", "rel", "target", "title"],
  img: ["alt", "height", "src", "title", "width"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"]
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

function isSafeRichUrl(value: string, tagName: string) {
  try {
    const url = new URL(value, window.location.href);
    if (tagName === "img") {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function sanitizeRichHtml(html: string) {
  const documentFragment = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");

  function sanitizeElement(element: Element) {
    for (const child of Array.from(element.children)) {
      sanitizeElement(child);
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName !== "body" && tagName !== "div" && !allowedRichTags.has(tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }

    const allowedAttributes = allowedRichAttributes[tagName] ?? [];
    for (const attribute of Array.from(element.attributes)) {
      const attrName = attribute.name.toLowerCase();
      if (!allowedAttributes.includes(attrName)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if ((attrName === "href" || attrName === "src") && !isSafeRichUrl(attribute.value, tagName)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (tagName === "a" && element.getAttribute("href")) {
      element.setAttribute("rel", "noreferrer");
      element.setAttribute("target", "_blank");
    }
  }

  sanitizeElement(documentFragment.body);
  return documentFragment.body.firstElementChild?.innerHTML ?? "";
}

export function isRichContentEmpty(html: string) {
  const hasImage = /<img[\s>]/i.test(html);
  if (hasImage) {
    return false;
  }
  return html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length === 0;
}
