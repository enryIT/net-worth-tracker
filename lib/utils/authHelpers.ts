/**
 * Provider-neutral authentication timing helpers.
 *
 * These helpers keep the registration flow resilient without importing a
 * client authentication SDK from shared utility code.
 */

type RefreshableSessionUser = {
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSessionReady(
  user: RefreshableSessionUser
): Promise<void> {
  const maxRetries = 5;
  const initialDelayMs = 100;
  const backoffFactor = 2;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const token = await user.getIdToken(true);
      if (token) {
        return;
      }
    } catch {
      // Retry below with exponential backoff.
    }

    if (attempt < maxRetries - 1) {
      const delayMs = initialDelayMs * Math.pow(backoffFactor, attempt);
      await delay(delayMs);
    }
  }

  throw new Error(
    'Impossibile completare la sincronizzazione della sessione. Riprova.'
  );
}

export async function retryPermissionSensitiveOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  const initialDelayMs = 200;
  const backoffFactor = 2;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error: any) {
      const isPermissionDenied =
        error?.code === 'permission-denied' ||
        error?.message?.includes('PERMISSION_DENIED') ||
        error?.message?.includes('Missing or insufficient permissions');

      if (!isPermissionDenied) {
        throw error;
      }

      if (attempt >= maxRetries - 1) {
        throw new Error(
          'Impossibile completare la registrazione. Riprova o contatta il supporto se il problema persiste.'
        );
      }

      const delayMs = initialDelayMs * Math.pow(backoffFactor, attempt);
      await delay(delayMs);
    }
  }

  throw new Error('Unexpected error in retryPermissionSensitiveOperation');
}
