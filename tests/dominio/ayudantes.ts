import { usd } from '../../src/dominio/dinero';
import { REGLAS_POR_DEFECTO, type Factura, type Pago, type Reglas, type Vendedor } from '../../src/dominio/tipos';
import type { DatosComisiones } from '../../src/dominio/comisiones';

let siguienteId = 1;
const nuevoId = (prefijo: string) => `${prefijo}-${siguienteId++}`;

export function vendedor(datos: Partial<Vendedor> & { nombre: string }): Vendedor {
  return { id: nuevoId('v'), budgetTrimestral: null, comision: 500, alias: [], ...datos };
}

export function factura(v: Vendedor, fecha: string, dolares: number, datos: Partial<Factura> = {}): Factura {
  const id = nuevoId('f');
  return {
    id,
    numero: `INV/${id}`,
    cliente: 'Cliente',
    vendedorId: v.id,
    fecha,
    montoSinImpuestos: usd(dolares),
    total: null,
    origen: 'manual',
    ...datos,
  };
}

export function pago(f: Factura, fecha: string, dolares: number, datos: Partial<Pago> = {}): Pago {
  return { id: nuevoId('p'), facturaId: f.id, fecha, monto: usd(dolares), cobroPrevio: false, origen: 'manual', ...datos };
}

export function datos(
  vendedores: Vendedor[],
  facturas: Factura[],
  pagos: Pago[],
  reglas: Partial<Reglas> = {},
): DatosComisiones {
  return { vendedores, facturas, pagos, reglas: { ...REGLAS_POR_DEFECTO, ...reglas } };
}
