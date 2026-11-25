/**
 * Fechas como texto 'YYYY-MM-DD' (sin hora ni zona horaria).
 * Como el formato es fijo, comparar textos equivale a comparar fechas.
 */
export type FechaISO = string;

const RE_ISO_ESTRICTO = /^(\d{4})-(\d{2})-(\d{2})$/;

function dosDigitos(n: number): string {
  return n.toString().padStart(2, '0');
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function construir(anio: number, mes: number, dia: number): FechaISO | null {
  if (!Number.isInteger(anio) || anio < 1900 || anio > 9999) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  if (!Number.isInteger(dia) || dia < 1 || dia > diasDelMes(anio, mes)) return null;
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/** true si es una fecha 'YYYY-MM-DD' real (rechaza 2026-02-30). */
export function esFechaISO(valor: unknown): valor is FechaISO {
  if (typeof valor !== 'string') return false;
  const m = RE_ISO_ESTRICTO.exec(valor);
  return m !== null && construir(Number(m[1]), Number(m[2]), Number(m[3])) === valor;
}

/** Fecha de hoy en la zona horaria del dispositivo. */
export function hoyISO(ahora: Date = new Date()): FechaISO {
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

/**
 * Número de serie de Excel → fecha. Excel cuenta días desde 1899-12-30
 * (contando el 29/02/1900 inexistente, por eso el origen no es 1900-01-01).
 * La parte decimal (la hora) se descarta.
 */
export function deSerialExcel(serial: number): FechaISO | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2_958_466) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  const d = new Date(ms);
  return construir(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const RE_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/;
const RE_BARRAS = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:[ T].*)?$/;

/** Orden de día y mes en fechas con barras cuando ambos números son ≤ 12. */
export type OrdenFecha = 'MD' | 'DM';

/** true si es una fecha con barras cuyo primer número es mayor de 12 (solo puede ser DD/MM). */
export function esFechaDiaPrimero(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  const m = RE_BARRAS.exec(valor.trim());
  return m !== null && Number(m[1]) > 12;
}

/**
 * Interpreta una fecha venida de Excel, CSV o un formulario.
 * - número: serie de Excel
 * - Date: se toman año/mes/día locales
 * - 'AAAA-MM-DD' (con o sin hora)
 * - 'MM/DD/AAAA'; si el primer número es mayor de 12, 'DD/MM/AAAA'.
 *   Con orden 'DM', las ambiguas se leen como 'DD/MM/AAAA'.
 * Devuelve null si no se puede interpretar.
 */
export function parsearFecha(valor: unknown, orden: OrdenFecha = 'MD'): FechaISO | null {
  if (typeof valor === 'number') return deSerialExcel(valor);
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return construir(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  }
  if (typeof valor !== 'string') return null;
  const s = valor.trim();
  if (s === '') return null;

  let m = RE_ISO.exec(s);
  if (m) return construir(Number(m[1]), Number(m[2]), Number(m[3]));

  m = RE_BARRAS.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let anio = Number(m[3]);
    if (m[3]!.length === 2) anio += 2000;
    return a > 12 || orden === 'DM' ? construir(anio, b, a) : construir(anio, a, b);
  }

  // Serie de Excel guardada como texto (p. ej. en un CSV).
  if (/^\d{4,6}(\.\d+)?$/.test(s)) return deSerialExcel(Number(s));
  return null;
}

/** 2026-07-15 → "15/07/2026" para mostrar. */
export function formatearFecha(fecha: FechaISO): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}
