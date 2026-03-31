const rawBaseUrl = import.meta.env.BASE_URL || "/";

export const APP_BASE_PATH =
  rawBaseUrl === "/" ? "" : rawBaseUrl.replace(/\/$/, "");

export const ROUTER_BASENAME = APP_BASE_PATH || undefined;

export function withBasePath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}` || normalizedPath;
}
