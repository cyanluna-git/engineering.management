// Minimal mock for next/headers in test environments.
export function cookies() {
  return {
    get: () => undefined,
    set: () => {},
    delete: () => {},
  };
}

export function headers() {
  return new Map<string, string>();
}
