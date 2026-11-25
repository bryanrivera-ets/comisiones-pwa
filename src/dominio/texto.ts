/** Para comparar nombres: sin tildes, sin mayúsculas y con espacios simples. "  José  PÉREZ " → "jose perez". */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Número de factura para identificarla: " inv/2026/ 0001 " → "INV/2026/ 0001" (sin espacios extremos, en mayúsculas). */
export function normalizarNumeroFactura(numero: string): string {
  return numero.replace(/\s+/g, ' ').trim().toUpperCase();
}
