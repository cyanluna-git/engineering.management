import { readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import type { Guide } from "@/lib/guides-schema";

export interface StaticGuideDocument {
  title: string;
  summaryCss: string;
  summaryHtml: string;
  detailCss: string;
  detailHtml: string;
}

const STATIC_GUIDE_UPDATED_AT = "2026-03-31T00:00:00Z";
const STATIC_GUIDE_BASE_PATH = path.join(
  process.cwd(),
  "content",
  "static-guides",
  "type1-recovery",
);
const STATIC_GUIDE_ASSET_PREFIX = "/guides-assets/type1-recovery";

const STATIC_GUIDES: Guide[] = [
  {
    id: "type1-type2-recovery",
    title: "Type 1 / Type 2 Recovery",
    category: "General",
    content:
      "Type 1 / Type 2 PLC recovery guide with quick-reference summary first, followed by the full detailed technical procedure for ESP, Abatement, Flash Memory, J-Flash, and PuTTY recovery.",
    author: "engineering.systems",
    created_at: STATIC_GUIDE_UPDATED_AT,
    updated_at: STATIC_GUIDE_UPDATED_AT,
    format: "static-html",
    readonly: true,
  },
];

function cloneGuide(guide: Guide): Guide {
  return { ...guide };
}

function extractTagContents(html: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, "gi");
  return [...html.matchAll(pattern)].map((match) => match[1].trim()).filter(Boolean);
}

function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match?.[1] ?? html).trim();
}

function stripScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "");
}

function remapAssetPaths(html: string): string {
  return html
    .replace(/(src|href)=["']images\//gi, `$1="${STATIC_GUIDE_ASSET_PREFIX}/images/`)
    .replace(
      /(src|href)=["']images-hires\//gi,
      `$1="${STATIC_GUIDE_ASSET_PREFIX}/images-hires/`,
    );
}

function normalizeGuideHtml(html: string): string {
  return remapAssetPaths(stripScripts(html)).replace(
    /\bfade-in\b/g,
    "fade-in visible",
  );
}

function scopeSelector(selector: string, scopeClass: string): string | null {
  const trimmed = selector.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("::-webkit-scrollbar")) return null;
  if (trimmed.startsWith("::selection")) return `${scopeClass} ${trimmed}`;

  let normalized = trimmed.replace(/\b(html|body|:root)\b/g, " ").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return scopeClass;
  }

  if (normalized.startsWith("::")) {
    return null;
  }

  if (normalized.startsWith(":")) {
    return `${scopeClass}${normalized}`;
  }

  if (normalized.startsWith(">") || normalized.startsWith("+") || normalized.startsWith("~")) {
    normalized = `${scopeClass} ${normalized}`;
  } else {
    normalized = `${scopeClass} ${normalized}`;
  }

  return normalized;
}

function scopeCss(css: string, scopeClass: string): string {
  const root = postcss.parse(css);

  root.walkAtRules((rule) => {
    if (rule.name === "page") {
      rule.remove();
    }
  });

  root.walkRules((rule) => {
    if (
      rule.parent?.type === "atrule" &&
      ["keyframes", "-webkit-keyframes"].includes(rule.parent.name)
    ) {
      return;
    }

    const scopedSelectors = rule.selectors
      .map((selector) => scopeSelector(selector, scopeClass))
      .filter((selector): selector is string => Boolean(selector));

    if (scopedSelectors.length === 0) {
      rule.remove();
      return;
    }

    rule.selectors = scopedSelectors;
  });

  return root.toString();
}

async function loadGuideHtml(fileName: string) {
  const html = await readFile(path.join(STATIC_GUIDE_BASE_PATH, fileName), "utf8");
  const styles = extractTagContents(html, "style").join("\n\n");
  const body = extractBody(html);
  return { styles, body };
}

export function listStaticGuides(): Guide[] {
  return STATIC_GUIDES.map(cloneGuide);
}

export function getStaticGuide(id: string): Guide | undefined {
  const guide = STATIC_GUIDES.find((item) => item.id === id);
  return guide ? cloneGuide(guide) : undefined;
}

export function isStaticGuide(id: string): boolean {
  return STATIC_GUIDES.some((guide) => guide.id === id);
}

export async function getStaticGuideDocument(
  id: string,
): Promise<StaticGuideDocument | undefined> {
  const guide = getStaticGuide(id);
  if (!guide) return undefined;

  const [summary, detail] = await Promise.all([
    loadGuideHtml("summary.html"),
    loadGuideHtml("detail.html"),
  ]);

  return {
    title: guide.title,
    summaryCss: scopeCss(summary.styles, ".type1-recovery-summary"),
    summaryHtml: normalizeGuideHtml(summary.body),
    detailCss: scopeCss(detail.styles, ".type1-recovery-detail"),
    detailHtml: normalizeGuideHtml(detail.body),
  };
}
