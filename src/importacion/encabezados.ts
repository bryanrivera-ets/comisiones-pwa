import { normalizarNombre } from '../dominio/texto';
import type { Matriz } from './leerArchivo';

export const CAMPOS = [
  'numero',
  'cliente',
  'vendedor',
  'fecha',
  'montoSinImpuestos',
  'total',
  'adeudado',
  'fechaPago',
  'estadoPago',
] as const;

export type Campo = (typeof CAMPOS)[number];

/** Índice de columna de cada campo, o null si no se usa. */
export type Mapeo = Record<Campo, number | null>;

export const CAMPOS_OBLIGATORIOS: readonly Campo[] = ['numero', 'fecha', 'montoSinImpuestos'];

export const NOMBRE_CAMPO: Record<Campo, string> = {
  numero: 'Número',
  cliente: 'Cliente',
  vendedor: 'Vendedor',
  fecha: 'Fecha de factura',
  montoSinImpuestos: 'Base imponible (sin impuestos)',
  total: 'Total',
  adeudado: 'Importe adeudado',
  fechaPago: 'Fecha de pago',
  estadoPago: 'Estado de pago',
};

/**
 * Nombres con que Odoo (en español o inglés) y otras exportaciones titulan cada columna.
 * Se comparan normalizados: sin tildes, en minúsculas y sin signos.
 * Solo coincidencias exactas: "Fecha de vencimiento" no debe confundirse con "Fecha".
 */
const SINONIMOS: Record<Campo, string[]> = {
  numero: ['numero', 'number', 'numero de factura', 'n factura', 'no factura', 'factura', 'invoice', 'invoice number', 'nro', 'folio'],
  cliente: ['cliente', 'customer', 'partner', 'empresa', 'contacto', 'nombre del cliente', 'socio', 'invoice partner display name'],
  vendedor: ['vendedor', 'comercial', 'salesperson', 'sales person', 'agente', 'agente comercial', 'usuario', 'invoice user', 'vendedora'],
  fecha: ['fecha de factura', 'fecha factura', 'invoice date', 'fecha', 'date', 'fecha de emision', 'fecha emision', 'bill date'],
  montoSinImpuestos: [
    'base imponible', 'impuestos no incluidos', 'importe sin impuestos', 'monto sin impuestos', 'total sin impuestos',
    'subtotal', 'base', 'untaxed', 'untaxed amount', 'tax excluded', 'amount untaxed', 'sin impuestos',
  ],
  total: ['total', 'importe total', 'total con impuestos', 'monto total', 'amount total', 'total amount', 'total signed'],
  adeudado: [
    'importe adeudado', 'adeudado', 'amount due', 'saldo', 'saldo pendiente', 'importe pendiente', 'residual',
    'importe residual', 'pendiente', 'por cobrar', 'balance', 'due',
  ],
  fechaPago: ['fecha de pago', 'fecha pago', 'payment date', 'fecha de cobro', 'fecha cobro', 'paid date', 'fecha del pago'],
  estadoPago: ['estado de pago', 'estado del pago', 'payment status', 'payment state', 'estado pago'],
};

function normalizarEncabezado(valor: unknown): string {
  if (typeof valor !== 'string' && typeof valor !== 'number') return '';
  return normalizarNombre(String(valor))
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDICE_SINONIMOS = new Map<string, Campo>();
for (const campo of CAMPOS) for (const s of SINONIMOS[campo]) INDICE_SINONIMOS.set(s, campo);

export function mapeoVacio(): Mapeo {
  return Object.fromEntries(CAMPOS.map((c) => [c, null])) as Mapeo;
}

/** Adivina el mapeo de una fila de encabezados. Cada columna y cada campo se usan una sola vez. */
export function adivinarMapeo(encabezados: readonly unknown[]): Mapeo {
  const mapeo = mapeoVacio();
  encabezados.forEach((valor, columna) => {
    const campo = INDICE_SINONIMOS.get(normalizarEncabezado(valor));
    if (campo && mapeo[campo] === null) mapeo[campo] = columna;
  });
  return mapeo;
}

function puntaje(mapeo: Mapeo): number {
  return CAMPOS.filter((c) => mapeo[c] !== null).length + CAMPOS_OBLIGATORIOS.filter((c) => mapeo[c] !== null).length;
}

export interface Deteccion {
  /** Índice (desde 0) de la fila de encabezados en la matriz. */
  filaEncabezados: number;
  encabezados: string[];
  mapeo: Mapeo;
}

/**
 * Busca la fila de encabezados entre las primeras 30: la que reconoce más columnas
 * (las obligatorias pesan doble). Si ninguna reconoce al menos 2, usa la primera fila no vacía.
 */
export function detectarEncabezados(matriz: Matriz): Deteccion {
  let mejor: Deteccion | null = null;
  let mejorPuntaje = 0;
  const limite = Math.min(matriz.length, 30);
  for (let i = 0; i < limite; i++) {
    const fila = matriz[i] ?? [];
    const mapeo = adivinarMapeo(fila);
    const p = puntaje(mapeo);
    if (p > mejorPuntaje) {
      mejorPuntaje = p;
      mejor = { filaEncabezados: i, encabezados: fila.map((c) => (c == null ? '' : String(c))), mapeo };
    }
  }
  if (mejor && mejorPuntaje >= 2) return mejor;
  const primera = matriz.findIndex((f) => f.some((c) => c !== null && c !== ''));
  const fila = matriz[Math.max(primera, 0)] ?? [];
  return { filaEncabezados: Math.max(primera, 0), encabezados: fila.map((c) => (c == null ? '' : String(c))), mapeo: mapeoVacio() };
}

export function camposObligatoriosFaltantes(mapeo: Mapeo): Campo[] {
  return CAMPOS_OBLIGATORIOS.filter((c) => mapeo[c] === null);
}
