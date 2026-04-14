export type GatewayMode = "direct" | "gateway" | "gateway_only";

const DEFAULT_GATEWAY_MODE: GatewayMode = "direct";
const VALID_GATEWAY_MODES = new Set<GatewayMode>([
  "direct",
  "gateway",
  "gateway_only",
]);

const GATEWAY_ENV_NAMES = {
  eob: "GATEWAY_MODE_EOB",
  oqc: "GATEWAY_MODE_OQC",
  jarvis: "GATEWAY_MODE_JARVIS",
} as const;

export type GatewayTarget = keyof typeof GATEWAY_ENV_NAMES;

function readGatewayMode(name: string): GatewayMode {
  const raw = process.env[name]?.trim();
  if (!raw || !VALID_GATEWAY_MODES.has(raw as GatewayMode)) {
    return DEFAULT_GATEWAY_MODE;
  }
  return raw as GatewayMode;
}

export function getGatewayMode(target: GatewayTarget): GatewayMode {
  return readGatewayMode(GATEWAY_ENV_NAMES[target]);
}

export function isGatewayEnabled(target: GatewayTarget): boolean {
  return getGatewayMode(target) !== "direct";
}

export function getGatewaySigningKey(): string {
  return process.env.PORTAL_HANDOFF_SIGNING_KEY?.trim() || "";
}

export function getGatewayTokenTtlSeconds(): number {
  const raw = Number(process.env.PORTAL_HANDOFF_TOKEN_EXPIRE_SECONDS || 120);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 120;
  }
  return Math.floor(raw);
}

export function getGatewayHealth() {
  const modes = {
    eob: getGatewayMode("eob"),
    oqc: getGatewayMode("oqc"),
    jarvis: getGatewayMode("jarvis"),
  };

  const enabledServices = Object.entries(modes)
    .filter(([, mode]) => mode !== "direct")
    .map(([target]) => target);
  const disabledServices = Object.entries(modes)
    .filter(([, mode]) => mode === "direct")
    .map(([target]) => target);

  return {
    signingKeyConfigured: getGatewaySigningKey().length >= 32,
    tokenTtlSeconds: getGatewayTokenTtlSeconds(),
    modes,
    enabledServices,
    disabledServices,
  };
}
