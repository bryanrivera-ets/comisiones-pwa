/** Días sin respaldo a partir de los cuales se avisa. */
export const DIAS_PARA_AVISAR = 7;

export function diasDesde(fechaHora: string, ahora: Date = new Date()): number {
  return Math.max(0, Math.floor((ahora.getTime() - new Date(fechaHora).getTime()) / 86_400_000));
}

/** Texto del aviso de respaldo, o null si no hace falta avisar. */
export function textoAvisoRespaldo(ultimo: string | null, hayDatos: boolean, ahora: Date = new Date()): string | null {
  if (!hayDatos) return null;
  if (ultimo === null) return 'Aún no has hecho ningún respaldo. Los datos solo viven en este navegador.';
  const dias = diasDesde(ultimo, ahora);
  if (dias < DIAS_PARA_AVISAR) return null;
  return `Tu último respaldo fue hace ${dias} días.`;
}

/** "hoy", "ayer" o "hace 5 días". */
export function haceCuanto(fechaHora: string, ahora: Date = new Date()): string {
  const dias = diasDesde(fechaHora, ahora);
  return dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
}
