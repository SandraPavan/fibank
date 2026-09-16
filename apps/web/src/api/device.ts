const DEVICE_ID_STORAGE_KEY = 'finbank:device-id';

/**
 * Identificador de dispositivo estável por navegador, exigido por
 * `CreatePixIntentRequest.deviceId` (packages/contracts). Persistido em
 * `localStorage` para que o mesmo dispositivo mantenha o mesmo id entre
 * visitas — o sinal `NEW_DEVICE` do antifraude (dev/03-dominio-e-api.md)
 * depende disso, mesmo que a avaliação de risco em si não seja
 * implementada nesta história.
 */
export function getDeviceId(): string {
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) return stored;
    const generated = `DEV-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    // localStorage indisponível (ex.: navegação privada): id efêmero.
    return `DEV-${crypto.randomUUID()}`;
  }
}
