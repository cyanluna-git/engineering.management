export type ToolbarAction = "h3" | "h4" | "ordered" | "bullet";

const TOOLBAR_PREFIX_MAP = {
  h3: "### ",
  h4: "#### ",
  bullet: "- ",
} as const;

export function applyMarkdownBlockAction({
  value,
  selectionStart,
  selectionEnd,
  action,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  action: ToolbarAction;
}) {
  if (selectionStart === selectionEnd) {
    const prefix = action === "ordered" ? "1. " : TOOLBAR_PREFIX_MAP[action];
    const nextValue = `${value.slice(0, selectionStart)}${prefix}${value.slice(selectionEnd)}`;
    const nextCursor = selectionStart + prefix.length;
    return { nextValue, nextSelectionStart: nextCursor, nextSelectionEnd: nextCursor };
  }

  const selectedText = value.slice(selectionStart, selectionEnd);
  const lines = selectedText.split("\n");
  const updatedLines = lines.map((line, index) => {
    if (action === "ordered") {
      const clean = line.replace(/^\s*\d+\.\s*/, "");
      return `${index + 1}. ${clean}`;
    }

    const prefix = TOOLBAR_PREFIX_MAP[action];
    const clean = line.replace(/^\s*(#{3,4}\s+|-\s+)/, "");
    return `${prefix}${clean}`;
  });
  const replacement = updatedLines.join("\n");
  const nextValue = `${value.slice(0, selectionStart)}${replacement}${value.slice(selectionEnd)}`;
  return {
    nextValue,
    nextSelectionStart: selectionStart,
    nextSelectionEnd: selectionStart + replacement.length,
  };
}
