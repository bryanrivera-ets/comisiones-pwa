/**
 * Importación de punta a punta con los Excel de ejemplo (tests/fixtures, ver scripts/generar-ejemplos-odoo.mjs):
 * leer → detectar encabezados → normalizar → planificar → guardar, y una segunda importación.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { calcularResumenTrimestre } from '../../src/dominio/comisiones';
import { usd } from '../../src/dominio/dinero';
import { detectarEncabezados } from '../../src/importacion/encabezados';
import { leerArchivo } from '../../src/importacion/leerArchivo';
import { normalizarFilas } from '../../src/importacion/normalizar';
import { planificarImportacion, type OpcionesImportacion } from '../../src/importacion/planificar';

function leer(nombre: string) {
  const buffer = readFileSync(new URL(`../fixtures/${nombre}`, import.meta.url));
  const datos = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const matriz = leerArchivo(datos, nombre);
  const deteccion = detectarEncabezados(matriz);
  return { deteccion, filas: normalizarFilas(matriz, deteccion.filaEncabezados, deteccion.mapeo) };
}

async function repoInicial() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'juan', nombre: 'Juan Pérez', comision: 500, budgetTrimestral: usd(2500), alias: [] });
  await repo.guardarVendedor({ id: 'maria', nombre: 'María González', comision: 500, budgetTrimestral: usd(4000), alias: [] });
  return repo;
}

async function planificar(repo: RepositorioMemoria, archivo: string, opciones: Partial<OpcionesImportacion>) {
  const { filas } = leer(archivo);
  return planificarImportacion(filas, await repo.obtenerTodo(), {
    archivo,
    fechaPagoPorDefecto: '2026-10-01',
    primeraCarga: false,
    vendedorPorDefectoId: null,
    resoluciones: {},
    ...opciones,
  });
}

const RESOLUCIONES_1 = {
  'maria g.': { tipo: 'existente', vendedorId: 'maria' },
  'pedro ramos': { tipo: 'nuevo', comision: 500, budgetTrimestral: null },
} as const;

describe('lectura del reporte de Odoo', () => {
  it.each(['odoo-facturas-1.xlsx', 'odoo-facturas-1.xls', 'odoo-facturas-1.csv'])('%s: detecta encabezados y lee las 6 filas igual', (archivo) => {
    const { deteccion, filas } = leer(archivo);
    expect(deteccion.filaEncabezados).toBe(2); // debajo de 2 filas de título
    expect(deteccion.mapeo).toMatchObject({ numero: 0, cliente: 1, vendedor: 2, fecha: 3, montoSinImpuestos: 5, total: 6, adeudado: 7, estadoPago: 8 });
    expect(filas.map((f) => [f.numero, f.vendedor, f.fecha, f.montoSinImpuestos, f.pagado])).toEqual([
      ['INV/2026/00001', 'Juan Pérez', '2026-07-10', usd(2000), usd(2000)],
      ['INV/2026/00002', 'Juan Pérez', '2026-07-20', usd(1000), usd(500)], // pago parcial: adeuda la mitad
      ['INV/2026/00003', 'María G.', '2026-10-05', usd(5000), 0],
      ['RINV/2026/00001', 'Juan Pérez', '2026-08-01', usd(-500), null],
      ['INV/2026/00004', '', '2026-09-15', usd(300), usd(300)],
      ['INV/2026/00005', 'Pedro Ramos', '2026-09-15', usd(800), 0],
    ]);
  });
});

describe('primera importación (primera carga)', () => {
  it('pide resolver los vendedores desconocidos antes de guardar', async () => {
    const plan = await planificar(await repoInicial(), 'odoo-facturas-1.xlsx', { primeraCarga: true });
    expect(plan.pendientesDeResolver.map((d) => d.nombre)).toEqual(['María G.', 'Pedro Ramos']);
    expect(plan.cambios).toBeNull();
  });

  it('crea facturas y pagos como cobro previo; omite la nota de crédito y la fila sin vendedor', async () => {
    const repo = await repoInicial();
    const plan = await planificar(repo, 'odoo-facturas-1.xlsx', { primeraCarga: true, resoluciones: RESOLUCIONES_1 });

    expect(plan.resumen).toEqual({ facturasNuevas: 4, pagosNuevos: 2, montoPagosNuevos: usd(2500), sinCambios: 0, omitidas: 2, paraRevisar: 0 });
    expect(plan.omitidas.map((o) => [o.numero, o.detalle])).toEqual([
      ['RINV/2026/00001', 'Nota de crédito o monto menor o igual a cero.'],
      ['INV/2026/00004', 'Sin vendedor.'],
    ]);
    expect(plan.facturasNuevas.map((f) => [f.factura.numero, f.vendedor, f.pago?.monto ?? null, f.pago?.cobroPrevio ?? null])).toEqual([
      ['INV/2026/00001', 'Juan Pérez', usd(2000), true],
      ['INV/2026/00002', 'Juan Pérez', usd(500), true],
      ['INV/2026/00003', 'María González', null, null],
      ['INV/2026/00005', 'Pedro Ramos', null, null],
    ]);

    await repo.aplicarImportacion(plan.cambios!);
    const datos = await repo.obtenerTodo();
    expect(datos.facturas).toHaveLength(4);
    expect(datos.pagos.every((p) => p.cobroPrevio && p.fecha === '2026-10-01')).toBe(true);
    expect(datos.vendedores.find((v) => v.id === 'maria')!.alias).toEqual(['María G.']);
    expect(datos.vendedores.map((v) => v.nombre).sort()).toEqual(['Juan Pérez', 'María González', 'Pedro Ramos']);
    expect(datos.importaciones).toHaveLength(1);

    // Los cobros previos no generan comisión.
    const t4 = calcularResumenTrimestre(datos, { anio: 2026, numero: 4 });
    expect(t4.every((r) => r.comisionCompleta === 0)).toBe(true);
  });

  it('subir el mismo archivo otra vez no cambia nada', async () => {
    const repo = await repoInicial();
    await repo.aplicarImportacion((await planificar(repo, 'odoo-facturas-1.xlsx', { primeraCarga: true, resoluciones: RESOLUCIONES_1 })).cambios!);
    const otraVez = await planificar(repo, 'odoo-facturas-1.xlsx', {});
    expect(otraVez.pendientesDeResolver).toEqual([]); // ya conoce "María G." y a Pedro
    expect(otraVez.resumen).toEqual({ facturasNuevas: 0, pagosNuevos: 0, montoPagosNuevos: 0, sinCambios: 4, omitidas: 2, paraRevisar: 0 });
  });
});

describe('segunda importación con pagos nuevos', () => {
  it('añade las diferencias pagadas, crea lo nuevo y marca para revisión el monto distinto', async () => {
    const repo = await repoInicial();
    await repo.aplicarImportacion((await planificar(repo, 'odoo-facturas-1.xlsx', { primeraCarga: true, resoluciones: RESOLUCIONES_1 })).cambios!);

    const plan = await planificar(repo, 'odoo-facturas-2.xlsx', { fechaPagoPorDefecto: '2026-12-15', vendedorPorDefectoId: 'juan' });
    expect(plan.pendientesDeResolver).toEqual([]);
    expect(plan.sinCambios.map((s) => s.numero)).toEqual(['INV/2026/00001']);
    expect(plan.pagosNuevos.map((p) => [p.factura.numero, p.pagadoAntes, p.pago.monto])).toEqual([
      ['INV/2026/00002', usd(500), usd(500)], // "Juan Perez" sin tilde sigue siendo Juan
      ['INV/2026/00003', 0, usd(2500)],
    ]);
    expect(plan.facturasNuevas.map((f) => [f.factura.numero, f.vendedor, f.pago!.monto])).toEqual([
      ['INV/2026/00004', 'Juan Pérez', usd(300)], // sin vendedor → vendedor por defecto
      ['INV/2026/00006', 'Juan Pérez', usd(1200)],
    ]);
    expect(plan.paraRevisar.map((r) => [r.numero, r.detalle])).toEqual([
      ['INV/2026/00005', 'Monto distinto: Odoo $850.00, registrado $800.00.'],
    ]);
    expect(plan.omitidas.map((o) => o.numero)).toEqual(['RINV/2026/00001']);
    expect(plan.resumen).toEqual({ facturasNuevas: 2, pagosNuevos: 4, montoPagosNuevos: usd(4500), sinCambios: 1, omitidas: 1, paraRevisar: 1 });

    await repo.aplicarImportacion(plan.cambios!);
    const datos = await repo.obtenerTodo();
    expect(datos.pagos.filter((p) => !p.cobroPrevio).every((p) => p.fecha === '2026-12-15')).toBe(true);
    expect(datos.facturas.find((f) => f.numero === 'INV/2026/00005')!.montoSinImpuestos).toBe(usd(800)); // no se tocó

    // Comisiones de T4 con lo importado: solo los pagos nuevos (no los cobros previos).
    const t4 = calcularResumenTrimestre(datos, { anio: 2026, numero: 4 });
    const juan = t4.find((r) => r.vendedor.id === 'juan')!;
    expect(juan.cobrado).toBe(usd(2000)); // 500 + 300 + 1200
    expect(juan.budget.logrado).toBe(usd(1200)); // facturado en T4: solo la 00006
    expect(juan.neto).toBe(usd(80)); // 100 − 20% de descuento
    const maria = t4.find((r) => r.vendedor.id === 'maria')!;
    expect(maria.neto).toBe(usd(125)); // 2500 × 5%, facturó 5000 ≥ 4000
    expect(maria.pendiente).toBe(usd(125));
  });
});
