/**
 * Dinero en centavos enteros y porcentajes en puntos básicos enteros.
 * Nunca se hacen cuentas de dinero con decimales de punto flotante.
 */

/** Cantidad de dinero en centavos (entero). $12.34 = 1234. */
export type Centavos = number;

/** Porcentaje en puntos básicos (entero). 5% = 500, 20% = 2000, 100% = 10000. */
export type PuntosBasicos = number;

export const CIEN_POR_CIENTO: PuntosBasicos = 10_000;

export function esCentavos(valor: unknown): valor is Centavos {
  return typeof valor === 'number' && Number.isSafeInteger(valor);
}

/** Divide redondeando la mitad hacia arriba (lejos de cero), con enteros exactos. */
function dividirRedondeando(numerador: bigint, denominador: bigint): bigint {
  const negativo = numerador < 0n;
  const absoluto = negativo ? -numerador : numerador;
  const cociente = (absoluto * 2n + denominador) / (2n * denominador);
  return negativo ? -cociente : cociente;
}

/**
 * Aplica uno o más porcentajes a un monto y redondea a centavos UNA sola vez.
 * aplicarPorcentajes(300000, 500) → 15000  ($3,000 × 5% = $150)
 * aplicarPorcentajes(300000, 500, 2000) → 3000  ($3,000 × 5% × 20% = $30)
 */
export function aplicarPorcentajes(monto: Centavos, ...porcentajes: PuntosBasicos[]): Centavos {
  if (!esCentavos(monto)) throw new Error(`Monto inválido: ${monto}`);
  let numerador = BigInt(monto);
  let denominador = 1n;
  for (const p of porcentajes) {
    if (!Number.isSafeInteger(p)) throw new Error(`Porcentaje inválido: ${p}`);
    numerador *= BigInt(p);
    denominador *= BigInt(CIEN_POR_CIENTO);
  }
  return Number(dividirRedondeando(numerador, denominador));
}

/**
 * monto × numerador / denominador, redondeado a centavos una sola vez, con enteros exactos.
 * proporcion(100000, 57500, 115000) → 50000  ($1,000 × 575/1150 = $500)
 */
export function proporcion(monto: Centavos, numerador: number, denominador: number): Centavos {
  if (!esCentavos(monto) || !Number.isSafeInteger(numerador) || !Number.isSafeInteger(denominador) || denominador === 0) {
    throw new Error('Proporción inválida');
  }
  const signo = denominador < 0 ? -1n : 1n;
  return Number(dividirRedondeando(BigInt(monto) * BigInt(numerador) * signo, BigInt(denominador) * signo));
}

/** Suma de centavos. */
export function sumar(montos: Iterable<Centavos>): Centavos {
  let total = 0;
  for (const m of montos) total += m;
  return total;
}

/** Convierte dólares (número exacto en el código, p. ej. pruebas) a centavos. */
export function usd(dolares: number): Centavos {
  const centavos = parsearDinero(dolares);
  if (centavos === null) throw new Error(`Monto inválido: ${dolares}`);
  return centavos;
}

/**
 * Convierte un valor leído de un formulario, Excel o CSV a centavos.
 * Acepta números y textos como "1,234.56", "1.234,56", "$ 1,234", "(100.00)" o "-100".
 * Si hay un solo separador: la coma es de miles cuando le siguen grupos de 3 dígitos
 * ("1,234" = 1234), si no es decimal ("1,5" = 1.50); el punto es decimal salvo que
 * haya varios grupos de miles ("1.234.567").
 * Devuelve null si el valor no se puede interpretar.
 */
export function parsearDinero(valor: unknown): Centavos | null {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null;
    const texto = String(valor);
    // Notación exponencial (valores enormes o diminutos): redondeo directo.
    if (/e/i.test(texto)) return Math.round(valor * 100);
    return parsearDinero(texto);
  }
  if (typeof valor !== 'string') return null;

  let s = valor.replace(/US\$|USD|\$|\s/gi, '');
  if (s === '') return null;

  let negativo = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  let decimal: ',' | '.' | null;
  if (ultimaComa >= 0 && ultimoPunto >= 0) decimal = ultimaComa > ultimoPunto ? ',' : '.';
  else if (ultimaComa >= 0) decimal = /^\d{1,3}(,\d{3})+$/.test(s) ? null : ',';
  else if (ultimoPunto >= 0) decimal = /^\d{1,3}(\.\d{3}){2,}$/.test(s) ? null : '.';
  else decimal = null;

  let entero: string;
  let fraccion = '';
  if (decimal === null) {
    if (!/^\d{1,3}([.,]\d{3})*$/.test(s) && !/^\d+$/.test(s)) return null;
    entero = s.replace(/[.,]/g, '');
  } else {
    const miles = decimal === ',' ? '.' : ',';
    const i = s.lastIndexOf(decimal);
    const parteEntera = s.slice(0, i);
    fraccion = s.slice(i + 1);
    if (parteEntera.includes(decimal) || !/^\d*$/.test(fraccion)) return null;
    if (parteEntera.includes(miles) && !new RegExp(`^\\d{1,3}(\\${miles}\\d{3})+$`).test(parteEntera)) {
      return null;
    }
    entero = parteEntera.split(miles).join('') || '0';
  }

  const dosDecimales = Number((fraccion + '00').slice(0, 2));
  const redondeo = (fraccion[2] ?? '0') >= '5' ? 1 : 0;
  const centavos = Number(entero) * 100 + dosDecimales + redondeo;
  if (!Number.isSafeInteger(centavos)) return null;
  return negativo && centavos !== 0 ? -centavos : centavos;
}

/** $1,234.56  /  -$50.00 */
export function formatearUSD(centavos: Centavos): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  const dolares = Math.floor(absoluto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const resto = (absoluto % 100).toString().padStart(2, '0');
  return `${negativo ? '-' : ''}$${dolares}.${resto}`;
}

/** Centavos como texto para un campo de formulario o CSV: 123456 → "1234.56". */
export function centavosATexto(centavos: Centavos): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  return `${negativo ? '-' : ''}${Math.floor(absoluto / 100)}.${(absoluto % 100).toString().padStart(2, '0')}`;
}

/** "5" → 500, "2.5" → 250, "2,5" → 250. Hasta 2 decimales. null si no es válido o está fuera de 0–100. */
export function parsearPorcentaje(valor: unknown): PuntosBasicos | null {
  // Un porcentaje con 2 decimales en puntos básicos equivale a "centavos" del número.
  const pb = parsearDinero(valor);
  if (pb === null || pb < 0 || pb > CIEN_POR_CIENTO) return null;
  return pb;
}

/** 500 → "5%", 250 → "2.5%", 1234 → "12.34%". */
export function formatearPorcentaje(pb: PuntosBasicos): string {
  return `${porcentajeATexto(pb)}%`;
}

/** 500 → "5", 250 → "2.5" (para campos de formulario). */
export function porcentajeATexto(pb: PuntosBasicos): string {
  return centavosATexto(pb).replace(/\.?0+$/, '') || '0';
}
