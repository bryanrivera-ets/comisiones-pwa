import { describe, expect, it } from 'vitest';
import { usd } from '../../src/dominio/dinero';
import type { Factura, Pago, Vendedor } from '../../src/dominio/tipos';
import type { FilaOdoo } from '../../src/importacion/normalizar';
import { planificarImportacion, type OpcionesImportacion } from '../../src/importacion/planificar';

const ana: Vendedor = { id: 'ana', nombre: 'Ana López', comision: 500, budgetTrimestral: null, alias: ['ANA L'] };

let n = 0;
function fila(datos: Partial<FilaOdoo>): FilaOdoo {
  n++;
  return {
    filaExcel: n + 1,
    numero: `INV/${n}`,
    cliente: 'Cliente',
    vendedor: 'Ana López',
    fecha: '2026-07-10',
    fechaOriginal: '',
    montoSinImpuestos: usd(1000),
    total: usd(1150),
    adeudado: null,
    cobrado: null,
    fechaPago: null,
    fechaPagoIlegible: false,
    estadoPago: '',
    pagado: 0,
    aviso: null,
    ...datos,
  };
}

const opciones = (o: Partial<OpcionesImportacion> = {}): OpcionesImportacion => ({
  archivo: 'odoo.xlsx',
  fechaPagoPorDefecto: '2026-11-24',
  primeraCarga: false,
  vendedorPorDefectoId: null,
  resoluciones: {},
  ahora: new Date('2026-11-24T12:00:00Z'),
  ...o,
});

const existente: Factura = {
  id: 'f1', numero: 'INV/EXISTE', cliente: 'X', vendedorId: 'ana', fecha: '2026-07-01', montoSinImpuestos: usd(1000), total: null, origen: 'importacion',
};
const pagoPrevio: Pago = { id: 'p1', facturaId: 'f1', fecha: '2026-08-01', monto: usd(400), cobroPrevio: false, origen: 'importacion' };
const actual = { vendedores: [ana], facturas: [existente], pagos: [pagoPrevio] };

describe('planificar: filas omitidas', () => {
  it('explica cada motivo', () => {
    const plan = planificarImportacion(
      [
        fila({ numero: '' }),
        fila({ numero: 'INV/DOBLE' }),
        fila({ numero: 'inv/doble ' }),
        fila({ numero: 'RINV/2026/0001' }),
        fila({ montoSinImpuestos: usd(-50) }),
        fila({ montoSinImpuestos: 0 }),
        fila({ montoSinImpuestos: null }),
        fila({ fecha: null, fechaOriginal: '31/31/2026' }),
        fila({ vendedor: '' }),
      ],
      actual,
      opciones(),
    );
    expect(plan.omitidas.map((o) => o.detalle)).toEqual([
      'Sin número de factura.',
      `Número repetido en el archivo (filas ${plan.omitidas[1]!.filaExcel}, ${plan.omitidas[2]!.filaExcel}).`,
      `Número repetido en el archivo (filas ${plan.omitidas[1]!.filaExcel}, ${plan.omitidas[2]!.filaExcel}).`,
      'Nota de crédito o monto menor o igual a cero.',
      'Nota de crédito o monto menor o igual a cero.',
      'Nota de crédito o monto menor o igual a cero.',
      'Monto sin impuestos vacío o ilegible.',
      'Fecha de factura ilegible ("31/31/2026").',
      'Sin vendedor.',
    ]);
    expect(plan.resumen.omitidas).toBe(9);
    expect(plan.cambios!.facturasNuevas).toEqual([]);
  });

  it('las filas sin vendedor se asignan al vendedor por defecto, si se escoge', () => {
    const plan = planificarImportacion([fila({ vendedor: '' })], actual, opciones({ vendedorPorDefectoId: 'ana' }));
    expect(plan.facturasNuevas[0]!.factura.vendedorId).toBe('ana');
  });
});

describe('planificar: facturas nuevas', () => {
  it('crea la factura y su pago con la fecha por defecto; reconoce al vendedor por alias', () => {
    const plan = planificarImportacion(
      [fila({ numero: 'inv/2026/1', vendedor: 'ana l', pagado: usd(500), total: usd(1150) })],
      actual,
      opciones({ nuevoId: (() => { let i = 0; return () => `id${++i}`; })() }),
    );
    expect(plan.facturasNuevas).toHaveLength(1);
    const { factura, pago } = plan.facturasNuevas[0]!;
    expect(factura).toMatchObject({ numero: 'INV/2026/1', vendedorId: 'ana', montoSinImpuestos: usd(1000), total: usd(1150), origen: 'importacion' });
    expect(pago).toMatchObject({ facturaId: factura.id, fecha: '2026-11-24', monto: usd(500), cobroPrevio: false, importacionId: 'id1' });
    expect(plan.resumen).toEqual({ facturasNuevas: 1, pagosNuevos: 1, montoPagosNuevos: usd(500), sinCambios: 0, omitidas: 0, paraRevisar: 0 });
  });

  it('usa la fecha de pago del archivo y marca cobro previo en la primera carga', () => {
    const plan = planificarImportacion([fila({ pagado: usd(1000), fechaPago: '2026-08-15' })], actual, opciones({ primeraCarga: true }));
    expect(plan.facturasNuevas[0]!.pago).toMatchObject({ fecha: '2026-08-15', cobroPrevio: true });
  });

  it('un pago anterior a la factura o con fecha ilegible manda la fila a revisión', () => {
    const plan = planificarImportacion(
      [fila({ pagado: usd(100), fechaPago: '2026-07-01' }), fila({ pagado: usd(100), fechaPagoIlegible: true })],
      actual,
      opciones(),
    );
    expect(plan.facturasNuevas).toEqual([]);
    expect(plan.paraRevisar.map((r) => r.detalle)).toEqual([
      'Factura nueva no importada: la fecha del pago (01/07/2026) es anterior a la factura (10/07/2026).',
      'Factura nueva no importada: fecha de pago ilegible.',
    ]);
  });

  it('ignora un Total menor que la base (no es coherente)', () => {
    const plan = planificarImportacion([fila({ total: usd(10) })], actual, opciones());
    expect(plan.facturasNuevas[0]!.factura.total).toBeNull();
  });
});

describe('planificar: facturas que ya existen', () => {
  it('Odoo muestra más pagado: añade la diferencia como pago nuevo', () => {
    const plan = planificarImportacion([fila({ numero: 'inv/existe', pagado: usd(700) })], actual, opciones());
    expect(plan.pagosNuevos).toHaveLength(1);
    expect(plan.pagosNuevos[0]).toMatchObject({ pagadoAntes: usd(400), pago: { facturaId: 'f1', monto: usd(300) } });
  });

  it('igual de pagado (±1 centavo): sin cambios', () => {
    const plan = planificarImportacion([fila({ numero: 'INV/EXISTE', pagado: usd(400) + 1 })], actual, opciones());
    expect(plan.sinCambios.map((s) => s.detalle)).toEqual(['Pagado $400.00.']);
  });

  it('Odoo muestra menos pagado: a revisión, sin cambiar nada', () => {
    const plan = planificarImportacion([fila({ numero: 'INV/EXISTE', pagado: usd(300) })], actual, opciones());
    expect(plan.paraRevisar.map((r) => r.detalle)).toEqual(['El archivo muestra menos pagado ($300.00) que lo registrado ($400.00).']);
    expect(plan.cambios!.pagosNuevos).toEqual([]);
  });

  it('monto distinto: a revisión', () => {
    const plan = planificarImportacion([fila({ numero: 'INV/EXISTE', montoSinImpuestos: usd(900), pagado: usd(900) })], actual, opciones());
    expect(plan.paraRevisar.map((r) => r.detalle)).toEqual(['Monto distinto: archivo $900.00, registrado $1,000.00.']);
  });

  it('vendedor distinto: a revisión', () => {
    const beto: Vendedor = { id: 'beto', nombre: 'Beto', comision: 500, budgetTrimestral: null, alias: [] };
    const plan = planificarImportacion(
      [fila({ numero: 'INV/EXISTE', vendedor: 'Beto', pagado: usd(400) })],
      { ...actual, vendedores: [ana, beto] },
      opciones(),
    );
    expect(plan.paraRevisar.map((r) => r.detalle)).toEqual(['Vendedor distinto: archivo "Beto", registrado "Ana López".']);
  });

  it('el archivo no dice lo pagado: sin cambios', () => {
    const plan = planificarImportacion([fila({ numero: 'INV/EXISTE', pagado: null })], actual, opciones());
    expect(plan.sinCambios.map((s) => s.detalle)).toEqual(['El archivo no indica lo pagado.']);
  });
});

describe('planificar: vendedores desconocidos', () => {
  const filas = [fila({ vendedor: 'Pedro Ramos' }), fila({ vendedor: 'PEDRO  RAMOS' }), fila({ vendedor: 'A. López' })];

  it('sin resolver no se puede guardar', () => {
    const plan = planificarImportacion(filas, actual, opciones());
    expect(plan.pendientesDeResolver.map((d) => [d.nombre, d.filas])).toEqual([['Pedro Ramos', 2], ['A. López', 1]]);
    expect(plan.cambios).toBeNull();
    expect(plan.facturasNuevas).toEqual([]);
  });

  it('se crea un vendedor nuevo o se guarda el nombre como alias de uno existente', () => {
    const plan = planificarImportacion(
      filas,
      actual,
      opciones({
        resoluciones: {
          'pedro ramos': { tipo: 'nuevo', comision: 400, budgetTrimestral: usd(3000) },
          'a. lopez': { tipo: 'existente', vendedorId: 'ana' },
        },
      }),
    );
    expect(plan.pendientesDeResolver).toEqual([]);
    expect(plan.cambios!.vendedoresNuevos).toEqual([
      { id: expect.any(String), nombre: 'Pedro Ramos', comision: 400, budgetTrimestral: usd(3000), alias: [] },
    ]);
    expect(plan.cambios!.aliasNuevos).toEqual([{ vendedorId: 'ana', alias: 'A. López' }]);
    const pedroId = plan.cambios!.vendedoresNuevos[0]!.id;
    expect(plan.facturasNuevas.map((f) => f.factura.vendedorId)).toEqual([pedroId, pedroId, 'ana']);
  });
});
