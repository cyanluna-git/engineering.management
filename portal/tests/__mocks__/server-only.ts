// Mock for Next.js "server-only" package in test environments.
// In production Next.js throws if this is imported in a client component;
// in vitest we just let it pass through.
export default {};
