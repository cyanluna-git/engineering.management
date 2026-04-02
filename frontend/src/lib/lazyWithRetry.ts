const CHUNK_RETRY_PREFIX = 'lazy-retry:';

function isChunkLoadFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('chunkloaderror') ||
    message.includes('loading chunk')
  );
}

export function lazyWithRetry<TModule>(
  importer: () => Promise<TModule>,
  key: string,
): Promise<TModule> {
  return importer()
    .then((module) => {
      sessionStorage.removeItem(`${CHUNK_RETRY_PREFIX}${key}`);
      return module;
    })
    .catch((error: unknown) => {
      if (!isChunkLoadFailure(error)) {
        throw error;
      }

      const retryKey = `${CHUNK_RETRY_PREFIX}${key}`;
      if (sessionStorage.getItem(retryKey) === '1') {
        sessionStorage.removeItem(retryKey);
        throw error;
      }

      sessionStorage.setItem(retryKey, '1');
      window.location.reload();

      return new Promise<TModule>(() => {
        // Intentionally unresolved. The page is reloading.
      });
    });
}
