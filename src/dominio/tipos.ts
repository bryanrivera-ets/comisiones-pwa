import type { Centavos, PuntosBasicos } from './dinero';
import type { FechaISO } from './fechas';

export type Origen = 'manual' | 'importacion';

export interface Vendedor {
  id: string;
  nombre: string;
  /** null = sin budget asignado: nunca recibe descuento. */
  budgetTrimestral: Centavos | null;
  /** Porcentaje de comisión en puntos básicos (5% = 500). */
  comision: PuntosBasicos;
  /** Nombres con que aparece en Odoo (además de su nombre). */
  alias: string[];
}

export interface Factura {
  id: string;
  /** Identifica la factura al reimportar; único. */
  numero: string;
  cliente: string;
  vendedorId: string;
  fecha: FechaISO;
  /** Base de la comisión: monto SIN impuestos. */
  montoSinImpuestos: Centavos;
  /** Total con impuestos, si se conoce (viene de Odoo). */
  total: Centavos | null;
  origen: Origen;
}

export interface Pago {
  id: string;
  facturaId: string;
  fecha: FechaISO;
  /** Siempre en la base SIN impuestos. */
  monto: Centavos;
  /** Cobro previo: cuenta como cobrado pero no genera comisión (carga histórica). */
  cobroPrevio: boolean;
  origen: Origen;
  importacionId?: string;
}

export type BaseBudget = 'facturado' | 'cobrado';
export type BaseDescuento = 'trimestrePago' | 'trimestreFactura';

export interface Reglas {
  /** Descuento sobre la comisión si no se alcanza el budget (20% = 2000). */
  descuento: PuntosBasicos;
  /** Con qué se mide el avance del budget en un trimestre. */
  baseBudget: BaseBudget;
  /** El budget de qué trimestre decide el descuento de un pago. */
  baseDescuento: BaseDescuento;
}

export const REGLAS_POR_DEFECTO: Reglas = {
  descuento: 2000,
  baseBudget: 'facturado',
  baseDescuento: 'trimestrePago',
};
