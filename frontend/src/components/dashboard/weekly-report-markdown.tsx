import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, Maximize2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const markdownContentClassName =
  "space-y-3 text-sm leading-7 text-slate-700 [&_a]:text-blue-600 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-slate-200 [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:text-base [&_h4]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:text-slate-700 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100";

const COMPACT_MAX_H = 224; // 14rem = max-h-56

export function WeeklyReportMarkdown({
  value,
  emptyMessage,
  compact = false,
}: {
  value: string;
  emptyMessage: string;
  compact?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (compact && contentRef.current) {
      setIsOverflowing(contentRef.current.scrollHeight > COMPACT_MAX_H);
    }
  }, [compact, value]);

  if (!value.trim()) {
    return <div className="text-sm text-slate-500">{emptyMessage}</div>;
  }

  // Fullscreen overlay
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        <div className="flex items-center justify-end border-b border-slate-200 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)} className="gap-1.5">
            <X className="h-4 w-4" />
            닫기
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-16 lg:px-24">
          <div className={markdownContentClassName}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  if (!compact) {
    return (
      <div className={markdownContentClassName}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={contentRef}
        className={`${markdownContentClassName} overflow-hidden transition-[max-height] duration-300`}
        style={{ maxHeight: isExpanded ? contentRef.current?.scrollHeight : COMPACT_MAX_H }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      </div>
      {isOverflowing && (
        <div className={`flex items-center justify-center gap-3 pt-2 ${!isExpanded ? '-mt-6 relative bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-8' : ''}`}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 gap-1 text-xs text-slate-500"
          >
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {isExpanded ? '접기' : '더보기'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(true)}
            className="h-7 gap-1 text-xs text-slate-500"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            전체화면
          </Button>
        </div>
      )}
    </div>
  );
}

const TOOLBAR_ACTIONS = [
  { key: "h3", label: "H3" },
  { key: "h4", label: "H4" },
  { key: "ordered", label: "1." },
  { key: "bullet", label: "•" },
] as const;

type ToolbarAction = (typeof TOOLBAR_ACTIONS)[number]["key"];

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
  const prefixMap = {
    h3: "### ",
    h4: "#### ",
    bullet: "- ",
  } as const;

  if (selectionStart === selectionEnd) {
    const prefix = action === "ordered" ? "1. " : prefixMap[action];
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

    const prefix = prefixMap[action];
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

export function WeeklyReportEditorToolbar({
  onAction,
}: {
  onAction: (action: ToolbarAction) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      {TOOLBAR_ACTIONS.map((item) => (
        <Button
          key={item.key}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-10 px-2 text-xs font-semibold"
          onClick={() => onAction(item.key)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
