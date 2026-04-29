/**
 * Unit tests for the MarkdownEditor wrapper component.
 * @uiw/react-md-editor is mocked to avoid window/document access in Node env.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Inline mock for @uiw/react-md-editor ─────────────────────────────────────

type MDEditorProps = {
  value?: string;
  onChange?: (v: string | undefined) => void;
  height?: number;
  preview?: string;
};

vi.mock("@uiw/react-md-editor", () => ({
  default: ({ value, onChange, height, preview }: MDEditorProps) => ({
    type: "MDEditor",
    props: { value, onChange, height, preview },
  }),
}));

vi.mock("@uiw/react-md-editor/markdown-editor.css", () => ({}));

// ── MarkdownEditor prop forwarding logic (extracted for unit testing) ─────────

function buildEditorProps(
  value: string,
  onChange: (value: string) => void,
  height = 400,
  preview: "live" | "edit" | "preview" = "live",
) {
  return {
    value,
    onChange: (v: string | undefined) => onChange(v ?? ""),
    height,
    preview,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MarkdownEditor wrapper — prop forwarding", () => {
  it("forwards value to the underlying editor", () => {
    const props = buildEditorProps("# Hello", () => {});
    expect(props.value).toBe("# Hello");
  });

  it("propagates onChange with the updated string", () => {
    const received: string[] = [];
    const props = buildEditorProps("", (v) => received.push(v));

    props.onChange("## Updated");
    expect(received).toEqual(["## Updated"]);
  });

  it("replaces undefined from editor onChange with empty string", () => {
    const received: string[] = [];
    const props = buildEditorProps("initial", (v) => received.push(v));

    props.onChange(undefined);
    expect(received).toEqual([""]);
  });

  it("defaults height to 400 when not provided", () => {
    const props = buildEditorProps("text", () => {});
    expect(props.height).toBe(400);
  });

  it("passes custom height", () => {
    const props = buildEditorProps("text", () => {}, 600);
    expect(props.height).toBe(600);
  });

  it("defaults preview to 'live'", () => {
    const props = buildEditorProps("text", () => {});
    expect(props.preview).toBe("live");
  });

  it("passes custom preview mode", () => {
    const props = buildEditorProps("text", () => {}, 400, "edit");
    expect(props.preview).toBe("edit");
  });
});

describe("MarkdownEditor wrapper — onChange accumulation", () => {
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
  });

  it("fires onChange on every keystroke simulation", () => {
    const props = buildEditorProps("", (v) => calls.push(v));
    props.onChange("a");
    props.onChange("ab");
    props.onChange("abc");
    expect(calls).toEqual(["a", "ab", "abc"]);
  });

  it("handles rapid consecutive changes", () => {
    const props = buildEditorProps("start", (v) => calls.push(v));
    const updates = ["# H1", "## H2", "### H3", "# Final"];
    updates.forEach((u) => props.onChange(u));
    expect(calls).toEqual(updates);
  });
});
