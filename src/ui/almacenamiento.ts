/**
 * Los datos viven en IndexedDB. Sin "almacenamiento persistente", el navegador puede borrarlos
 * si le falta espacio (o, en Safari, tras semanas sin abrir el sitio). Se pide al iniciar la app.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface EstadoAlmacenamiento {
  /** null si el navegador no lo informa. */
  persistente: boolean | null;
  /** Bytes usados por la app, si se conoce. */
  usado: number | null;
}

export async function consultarAlmacenamiento(): Promise<EstadoAlmacenamiento> {
  try {
    const persistente = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const estimado = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return { persistente, usado: estimado?.usage ?? null };
  } catch {
    return { persistente: null, usado: null };
  }
}

export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
