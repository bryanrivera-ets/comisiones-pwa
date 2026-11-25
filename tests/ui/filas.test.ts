import { describe, expect, it } from 'vitest';
import { construirFilas, filtrarFilas, FILTROS_INICIALES } from '../../src/ui/facturas/filas';
import type { Factura, Pago, Vendedor } from '../../src/dominio/tipos';

const ana: Vendedor = { id: 'ana', nombre: 'Ana', comision: 500, budgetTrimestral: null, alias: [] };
const f = (id: string, fecha: string, monto: number, cliente = 'Cliente'): Factura => ({
  id, numero: id.toUpperCase(), cliente, vendedorId: 'ana', fecha, montoSinImpuestos: monto, total: null, origen: 'manual',
});
const p = (facturaId: string, fecha: string, monto: number): Pago => ({
  id: `${facturaId}-${fecha}`, facturaId, fecha, monto, cobroPrevio: false, origen: 'manual',
});

describe('filas de facturas', () => {
  const filas = construirFilas({
    vendedores: [ana],
    facturas: [f('a', '2026-07-01', 1000), f('b', '2026-08-01', 500, 'José Núñez'), f('c', '2026-08-01', 300)],
    pagos: [p('a', '2026-09-01', 600), p('a', '2026-08-01', 400), p('b', '2026-08-02', 100)],
  });

  it('calcula pagado, balance y estado; ordena por fecha descendente', () => {
    expect(filas.map((x) => [x.factura.id, x.pagado, x.balance, x.estado])).toEqual([
      ['c', 0, 300, 'abierta'],
      ['b', 100, 400, 'abierta'],
      ['a', 1000, 0, 'pagada'],
    ]);
    expect(filas[2]!.pagos.map((x) => x.fecha)).toEqual(['2026-08-01', '2026-09-01']);
    expect(filas[0]!.vendedor).toBe(ana);
  });

  it('busca sin distinguir tildes', () => {
    expect(filtrarFilas(filas, { ...FILTROS_INICIALES, texto: 'jose nunez' }).map((x) => x.factura.id)).toEqual(['b']);
  });
});
