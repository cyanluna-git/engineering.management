// Minimal mock for next/navigation in test environments.
export function redirect(url: string): never {
  throw new Error(`redirect:${url}`);
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
  };
}

export function usePathname() {
  return "/";
}
