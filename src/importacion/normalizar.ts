import { parsearDinero, proporcion, type Centavos } from '../dominio/dinero';
import { esFechaDiaPrimero, parsearFecha, type FechaISO, type OrdenFecha } from '../dominio/fechas';
import { normalizarNombre } from '../dominio/texto';
import type { Mapeo } from './encabezados';
import type { Matriz } from './leerArchivo';

/** Una fila del reporte de Odoo, ya interpretada. */
export interface FilaOdoo {
  /** Número de fila tal como lo muestra Excel (empieza en 1). */
  filaExcel: number;
  numero: string;
  cliente: string;
  vendedor: string;
  fecha: FechaISO | null;
  /** Texto original de la fecha, para explicar por qué no se pudo leer. */
  fechaOriginal: string;
  montoSinImpuestos: Centavos | null;
  total: Centavos | null;
  adeudado: Centavos | null;
  cobrado: Centavos | null;
  fechaPago: FechaISO | null;
  /** Había algo en la columna de fecha de pago, pero no se entiende. */
  fechaPagoIlegible: boolean;
  estadoPago: string;
  /** Lo pagado según Odoo, en la base SIN impuestos. null si el archivo no lo dice. */
  pagado: Centavos | null;
  /** Aclaración sobre cómo se calculó lo pagado, si aplica. */
  aviso: string | null;
}

const ESTADOS_PAGADO = new Set(['pagado', 'pagada', 'paid', 'en proceso de pago', 'in payment']);
const ESTADOS_PARCIAL = new Set(['parcialmente pagado', 'parcialmente pagada', 'partially paid', 'pago parcial']);

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\s+/g, ' ').trim();
}

function celda(fila: readonly unknown[], columna: number | null): unknown {
  return columna === null ? null : (fila[columna] ?? null);
}

function vacio(valor: unknown): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
}

/**
 * Lo pagado en la base sin impuestos:
 * - con columna Cobrado (sin impuestos, acumulado): ese monto;
 * - con columna de adeudado: base × (total − adeudado) / total; sin columna Total, base − adeudado;
 * - si no, con Estado de pago: "Pagado" (o "En proceso de pago") = todo; lo demás = nada;
 * - si no hay ninguna de las dos, null (no se sabe).
 * Diferencias de ±1 centavo por redondeo se ajustan a "todo" o "nada".
 */
export function calcularPagado(
  base: Centavos | null,
  total: Centavos | null,
  adeudado: Centavos | null,
  estadoPago: string,
  cobrado: Centavos | null = null,
): { pagado: Centavos | null; aviso: string | null } {
  if (base === null || base <= 0) return { pagado: null, aviso: null };
  let pagado: number | null = null;
  let aviso: string | null = null;

  if (cobrado !== null) {
    pagado = cobrado;
    if (cobrado > base + 1) aviso = 'Lo cobrado es mayor que el monto sin impuestos: se toma como pagada por completo.';
  } else if (adeudado !== null) {
    pagado = total !== null && total > 0 ? proporcion(base, total - adeudado, total) : base - adeudado;
  } else if (estadoPago !== '') {
    const estado = normalizarNombre(estadoPago);
    if (ESTADOS_PAGADO.has(estado)) pagado = base;
    else {
      pagado = 0;
      if (ESTADOS_PARCIAL.has(estado)) {
        aviso = 'Parcialmente pagada, pero el archivo no trae el importe adeudado: no se registra el pago parcial.';
      }
    }
  }
  if (pagado === null) return { pagado: null, aviso };

  pagado = Math.min(Math.max(pagado, 0), base);
  if (base - pagado <= 1) pagado = base;
  if (pagado <= 1) pagado = 0;
  return { pagado, aviso };
}

/**
 * Orden de día/mes de una columna de fechas en texto: si alguna fecha empieza con un número
 * mayor de 12, toda la columna es DD/MM/AAAA; si no, MM/DD/AAAA.
 * Así un reporte con días primero no confunde el 10/07 (10 de julio) con el 7 de octubre.
 */
export function detectarOrdenFechas(matriz: Matriz, desdeFila: number, columna: number | null): OrdenFecha {
  if (columna === null) return 'MD';
  for (let i = desdeFila; i < matriz.length; i++) {
    if (esFechaDiaPrimero(matriz[i]?.[columna])) return 'DM';
  }
  return 'MD';
}

/** Convierte las filas debajo de los encabezados en FilaOdoo. Ignora filas vacías. */
export function normalizarFilas(matriz: Matriz, filaEncabezados: number, mapeo: Mapeo): FilaOdoo[] {
  const columnasUsadas = Object.values(mapeo).filter((c): c is number => c !== null);
  const filas: FilaOdoo[] = [];
  const ordenFecha = detectarOrdenFechas(matriz, filaEncabezados + 1, mapeo.fecha);
  const ordenFechaPago = detectarOrdenFechas(matriz, filaEncabezados + 1, mapeo.fechaPago);

  for (let i = filaEncabezados + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? [];
    if (columnasUsadas.every((c) => vacio(fila[c]))) continue;

    const montoSinImpuestos = parsearDinero(celda(fila, mapeo.montoSinImpuestos));
    const total = parsearDinero(celda(fila, mapeo.total));
    const adeudado = parsearDinero(celda(fila, mapeo.adeudado));
    const cobrado = parsearDinero(celda(fila, mapeo.cobrado));
    const estadoPago = texto(celda(fila, mapeo.estadoPago));
    const valorFechaPago = celda(fila, mapeo.fechaPago);
    const fechaPago = vacio(valorFechaPago) ? null : parsearFecha(valorFechaPago, ordenFechaPago);
    const { pagado, aviso } = calcularPagado(montoSinImpuestos, total, adeudado, estadoPago, cobrado);

    filas.push({
      filaExcel: i + 1,
      numero: texto(celda(fila, mapeo.numero)),
      cliente: texto(celda(fila, mapeo.cliente)),
      vendedor: texto(celda(fila, mapeo.vendedor)),
      fecha: parsearFecha(celda(fila, mapeo.fecha), ordenFecha),
      fechaOriginal: texto(celda(fila, mapeo.fecha)),
      montoSinImpuestos,
      total,
      adeudado,
      cobrado,
      fechaPago,
      fechaPagoIlegible: !vacio(valorFechaPago) && fechaPago === null,
      estadoPago,
      pagado,
      aviso,
    });
  }
  return filas;
}
