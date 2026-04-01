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

export type StaticGuideLocale = "en" | "ko";

export interface StaticGuideChrome {
  locale: StaticGuideLocale;
  backToGuides: string;
  openAdmin: string;
  staticHtmlGuide: string;
  summaryIntro: string;
  jumpToDetail: string;
  languageLabel: string;
  languageOptions: Record<StaticGuideLocale, string>;
}

const STATIC_GUIDE_UPDATED_AT = "2026-03-31T00:00:00Z";
const STATIC_GUIDE_BASE_PATH = path.join(
  process.cwd(),
  "content",
  "static-guides",
  "type1-recovery",
);
const STATIC_GUIDE_ASSET_PREFIX = "/guides-assets/type1-recovery";
const STATIC_GUIDE_LOCALES: StaticGuideLocale[] = ["en", "ko"];

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

function getSummaryTypographyOverrides(scopeClass: string): string {
  return `
${scopeClass} {
  font-size: 17px;
  line-height: 1.8;
}

${scopeClass} .hero-header h1 {
  font-size: clamp(2.25rem, 3.2vw, 2.9rem);
}

${scopeClass} .hero-header .subtitle {
  font-size: 1.05rem;
  line-height: 1.75;
}

${scopeClass} .hero-meta .meta-value {
  font-size: 0.98rem;
}

${scopeClass} .card h2 {
  font-size: 1.38rem;
}

${scopeClass} .card p,
${scopeClass} .card ul,
${scopeClass} .card li {
  font-size: 1rem;
  line-height: 1.85;
}

${scopeClass} .card code,
${scopeClass} .equip-box ul,
${scopeClass} .equip-box table,
${scopeClass} .flow-step-card .step-desc,
${scopeClass} .warning-box p,
${scopeClass} .warning-box ul,
${scopeClass} .info-box,
${scopeClass} .timeline-label {
  font-size: 0.95rem;
}

${scopeClass} .equip-box h4,
${scopeClass} .equip-box th,
${scopeClass} .timeline-sub,
${scopeClass} .doc-footer {
  font-size: 0.78rem;
}

${scopeClass} .flow-step-card {
  max-width: 560px;
}

${scopeClass} .flow-step-card .step-title {
  font-size: 1.08rem;
}

${scopeClass} .branch-tag {
  font-size: 0.8rem;
}

@media (max-width: 600px) {
  ${scopeClass} {
    font-size: 16px;
  }

  ${scopeClass} .card p,
  ${scopeClass} .card ul,
  ${scopeClass} .card li {
    font-size: 0.98rem;
  }
}
`;
}

function getDetailTypographyOverrides(scopeClass: string): string {
  return `
${scopeClass} {
  font-size: 18px;
  line-height: 1.9;
}

${scopeClass} .toc-sidebar {
  width: 250px;
}

${scopeClass} .toc-sidebar nav a {
  font-size: 0.92rem;
  line-height: 1.65;
}

${scopeClass} .toc-sidebar nav a.sub {
  font-size: 0.84rem;
}

${scopeClass} .toc-title,
${scopeClass} .toc-sidebar .label,
${scopeClass} .toc-sidebar h4 {
  font-size: 0.88rem;
}

${scopeClass} .hero-title {
  font-size: clamp(3rem, 4vw, 3.6rem);
}

${scopeClass} .hero-subtitle {
  font-size: 1.18rem;
  line-height: 1.8;
}

${scopeClass} .meta-value,
${scopeClass} .stat-label {
  font-size: 0.95rem;
}

${scopeClass} .section-heading {
  font-size: 1.72rem;
}

${scopeClass} .section-card p,
${scopeClass} .section-card ul,
${scopeClass} .section-card ol,
${scopeClass} .section-card li,
${scopeClass} .step-content,
${scopeClass} .decision-ok,
${scopeClass} .decision-nok,
${scopeClass} .warning-box p,
${scopeClass} .warning-box ul,
${scopeClass} .info-box,
${scopeClass} .tip-box {
  font-size: 1.08rem;
  line-height: 1.92;
}

${scopeClass} .section-card code,
${scopeClass} .section-card table,
${scopeClass} .section-card td,
${scopeClass} .section-card th,
${scopeClass} .figure-caption {
  font-size: 0.98rem;
}

${scopeClass} .figure-wrapper {
  max-width: 760px;
  margin: 28px auto;
}

${scopeClass} .figure-wrapper img {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

${scopeClass} .proc-step {
  gap: 16px;
}

@media (max-width: 1100px) {
  ${scopeClass} .figure-wrapper,
  ${scopeClass} .figure-wrapper img {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  ${scopeClass} {
    font-size: 16px;
  }

  ${scopeClass} .hero-title {
    font-size: 2.35rem;
  }

  ${scopeClass} .toc-sidebar {
    width: 100%;
  }

  ${scopeClass} .hero-subtitle,
  ${scopeClass} .section-card p,
  ${scopeClass} .section-card ul,
  ${scopeClass} .section-card ol,
  ${scopeClass} .section-card li,
  ${scopeClass} .step-content {
    font-size: 1rem;
  }
}
`;
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

export function normalizeStaticGuideLocale(
  value: string | undefined,
): StaticGuideLocale {
  return value === "ko" ? "ko" : "en";
}

export function getStaticGuideLocales(): readonly StaticGuideLocale[] {
  return STATIC_GUIDE_LOCALES;
}

export function getStaticGuideChrome(locale: StaticGuideLocale): StaticGuideChrome {
  if (locale === "ko") {
    return {
      locale,
      backToGuides: "가이드 목록으로",
      openAdmin: "관리 CMS 열기",
      staticHtmlGuide: "정적 HTML 가이드",
      summaryIntro:
        "상단에는 요약본을 먼저 보여주고, 아래로 스크롤하면 원본 HTML 기반의 상세 복구 절차를 이어서 확인할 수 있습니다.",
      jumpToDetail: "상세 절차로 이동",
      languageLabel: "언어",
      languageOptions: {
        en: "English",
        ko: "한국어",
      },
    };
  }

  return {
    locale,
    backToGuides: "Back to Guides",
    openAdmin: "Open Admin CMS",
    staticHtmlGuide: "Static HTML Guide",
    summaryIntro:
      "Summary comes first. Scroll down for the full technical recovery procedure rendered from the original HTML source.",
    jumpToDetail: "Jump to Detailed Procedure",
    languageLabel: "Language",
    languageOptions: {
      en: "English",
      ko: "한국어",
    },
  };
}

export async function getStaticGuideDocument(
  id: string,
  locale: StaticGuideLocale = "en",
): Promise<StaticGuideDocument | undefined> {
  const guide = getStaticGuide(id);
  if (!guide) return undefined;

  const [summary, detail] = await Promise.all([
    loadGuideHtml(locale === "ko" ? "summary.ko.html" : "summary.html"),
    loadGuideHtml(locale === "ko" ? "detail.ko.html" : "detail.html"),
  ]);

  return {
    title: guide.title,
    summaryCss: `${scopeCss(summary.styles, ".type1-recovery-summary")}\n${getSummaryTypographyOverrides(".type1-recovery-summary")}`,
    summaryHtml: normalizeGuideHtml(summary.body),
    detailCss: `${scopeCss(detail.styles, ".type1-recovery-detail")}\n${getDetailTypographyOverrides(".type1-recovery-detail")}`,
    detailHtml: normalizeGuideHtml(detail.body),
  };
}
