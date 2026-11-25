import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { calcularResumenTrimestre } from '../../src/dominio/comisiones';
import { usd } from '../../src/dominio/dinero';
import { detectarEncabezados } from '../../src/importacion/encabezados';
import { leerArchivo } from '../../src/importacion/leerArchivo';
import { calcularPagado, normalizarFilas } from '../../src/importacion/normalizar';
import { planificarImportacion, type OpcionesImportacion } from '../../src/importacion/planificar';
import { crearPlantilla, filasAbiertas, nombrePlantilla } from '../../src/importacion/plantilla';

/** Simula a alguien que abre la plantilla en Excel, escribe filas en «Ventas» y guarda. */
function llenar(plantilla: ArrayBuffer, filas: unknown[][]): ArrayBuffer {
  const libro = XLSX.read(plantilla, { type: 'array' });
  XLSX.utils.sheet_add_aoa(libro.Sheets['Ventas']!, filas, { origin: -1 });
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function leer(archivo: ArrayBuffer) {
  const matriz = leerArchivo(archivo, 'plantilla.xlsx');
  const deteccion = detectarEncabezados(matriz);
  return { deteccion, filas: normalizarFilas(matriz, deteccion.filaEncabezados, deteccion.mapeo) };
}

async function repoInicial() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'juan', nombre: 'Juan Pérez', comision: 500, budgetTrimestral: null, alias: [] });
  await repo.guardarVendedor({ id: 'maria', nombre: 'María González', comision: 500, budgetTrimestral: null, alias: [] });
  return repo;
}

async function importar(repo: RepositorioMemoria, archivo: ArrayBuffer, opciones: Partial<OpcionesImportacion> = {}) {
  const plan = planificarImportacion(leer(archivo).filas, await repo.obtenerTodo(), {
    archivo: 'plantilla.xlsx',
    fechaPagoPorDefecto: '2026-11-25',
    primeraCarga: false,
    vendedorPorDefectoId: null,
    resoluciones: {},
    ...opciones,
  });
  if (plan.cambios) await repo.aplicarImportacion(plan.cambios);
  return plan;
}

/** Excel guarda las fechas como número de serie. */
const fechaExcel = (a: number, m: number, d: number) => ({ t: 'n', v: (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000, z: 'yyyy-mm-dd' });

describe('lo cobrado (columna de la plantilla)', () => {
  it('tiene prioridad sobre adeudado y estado', () => {
    expect(calcularPagado(usd(1000), usd(1150), usd(1150), 'No pagado', usd(400)).pagado).toBe(usd(400));
  });

  it('si supera el monto, cuenta como pagada por completo y avisa', () => {
    const r = calcularPagado(usd(1000), null, null, '', usd(1200));
    expect(r.pagado).toBe(usd(1000));
    expect(r.aviso).toContain('mayor que el monto');
  });
});

describe('plantilla de ventas', () => {
  it('el importador reconoce todas sus columnas, en la primera hoja', () => {
    const { deteccion, filas } = leer(crearPlantilla(['Juan Pérez']));
    expect(deteccion.filaEncabezados).toBe(0);
    expect(deteccion.mapeo).toEqual({
      numero: 0, cliente: 1, vendedor: 2, fecha: 3, montoSinImpuestos: 4, total: 5, adeudado: null, cobrado: 6, fechaPago: 7, estadoPago: null,
    });
    expect(filas).toEqual([]);
  });

  it('trae la hoja de instrucciones con los vendedores registrados', () => {
    const libro = XLSX.read(crearPlantilla(['Juan Pérez', 'María González']), { type: 'array' });
    expect(libro.SheetNames).toEqual(['Ventas', 'Instrucciones']);
    const texto = XLSX.utils.sheet_to_csv(libro.Sheets['Instrucciones']!);
    expect(texto).toContain('Vendedores registrados: Juan Pérez, María González.');
    expect(texto).toContain('acumulado');
  });

  it('nombre del archivo', () => {
    expect(nombrePlantilla('2026-11-25')).toBe('plantilla-ventas-2026-11-25.xlsx');
  });

  it('llenada a mano: crea facturas y cobros; al volver a subirla con más cobros, añade solo la diferencia', async () => {
    const repo = await repoInicial();
    const vacia = crearPlantilla(['Juan Pérez', 'María González']);

    // Primera vez.
    const primera = llenar(vacia, [
      ['F-001', 'Ferretería López', 'Juan Pérez', '2026-07-15', 1000, 1150, 400, '2026-08-15'],
      ['F-002', 'Panadería Sol', 'maria gonzalez', fechaExcel(2026, 10, 1), '2,000.00', null, null, null],
      ['F-003', 'Devolución', 'Juan Pérez', '2026-08-01', -100, null, null, null],
    ]);
    const plan1 = await importar(repo, primera);
    expect(plan1.resumen).toMatchObject({ facturasNuevas: 2, pagosNuevos: 1, montoPagosNuevos: usd(400), omitidas: 1 });
    expect(plan1.facturasNuevas.map((f) => [f.factura.numero, f.vendedor, f.factura.fecha, f.pago?.monto ?? null, f.pago?.fecha ?? null])).toEqual([
      ['F-001', 'Juan Pérez', '2026-07-15', usd(400), '2026-08-15'],
      ['F-002', 'María González', '2026-10-01', null, null],
    ]);

    // Llegan más cobros: se actualiza el acumulado y la fecha del último cobro.
    const segunda = llenar(vacia, [
      ['F-001', 'Ferretería López', 'Juan Pérez', '2026-07-15', 1000, 1150, 1000, '2026-10-10'],
      ['F-002', 'Panadería Sol', 'María González', '2026-10-01', 2000, null, 500, null],
    ]);
    const plan2 = await importar(repo, segunda);
    expect(plan2.pagosNuevos.map((p) => [p.factura.numero, p.pagadoAntes, p.pago.monto, p.pago.fecha])).toEqual([
      ['F-001', usd(400), usd(600), '2026-10-10'],
      ['F-002', 0, usd(500), '2026-11-25'], // sin fecha de cobro → la fecha escogida al importar
    ]);

    // Si alguien escribe solo el pago nuevo (menor que lo acumulado), no se cambia nada.
    const equivocada = llenar(vacia, [['F-001', 'Ferretería López', 'Juan Pérez', '2026-07-15', 1000, 1150, 600, '2026-11-01']]);
    const plan3 = await importar(repo, equivocada);
    expect(plan3.paraRevisar.map((r) => r.detalle)).toEqual(['El archivo muestra menos pagado ($600.00) que lo registrado ($1,000.00).']);
    expect(plan3.resumen.pagosNuevos).toBe(0);

    // Las comisiones salen en el trimestre de cada cobro.
    const datos = await repo.obtenerTodo();
    const t3 = calcularResumenTrimestre(datos, { anio: 2026, numero: 3 });
    const t4 = calcularResumenTrimestre(datos, { anio: 2026, numero: 4 });
    expect(t3.find((r) => r.vendedor.id === 'juan')!.cobrado).toBe(usd(400));
    expect(t4.find((r) => r.vendedor.id === 'juan')!.cobrado).toBe(usd(600));
    expect(t4.find((r) => r.vendedor.id === 'maria')!.cobrado).toBe(usd(500));
  });

  it('con las facturas abiertas prellenadas: subirla sin cambios no cambia nada; anotar un cobro lo registra', async () => {
    const repo = await repoInicial();
    await importar(
      repo,
      llenar(crearPlantilla([]), [
        ['A-1', 'Cliente', 'Juan Pérez', '2026-10-01', 1000, null, 250, '2026-10-05'],
        ['A-2', 'Cliente', 'Juan Pérez', '2026-10-02', 500, null, 500, '2026-10-06'], // pagada: no aparece
      ]),
    );

    const abiertas = filasAbiertas(await repo.obtenerTodo());
    expect(abiertas.map((f) => [f.numero, f.vendedor, f.cobrado])).toEqual([['A-1', 'Juan Pérez', usd(250)]]);

    const prellenada = crearPlantilla(['Juan Pérez'], abiertas);
    const sinCambios = await importar(repo, prellenada);
    expect(sinCambios.resumen).toMatchObject({ facturasNuevas: 0, pagosNuevos: 0, sinCambios: 1, paraRevisar: 0 });

    // El contable abre la plantilla y cambia Cobrado (columna G) a 700 con fecha.
    const libro = XLSX.read(prellenada, { type: 'array' });
    XLSX.utils.sheet_add_aoa(libro.Sheets['Ventas']!, [[700, '2026-11-20']], { origin: 'G2' });
    const conCobro = await importar(repo, XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(conCobro.pagosNuevos.map((p) => [p.pago.monto, p.pago.fecha])).toEqual([[usd(450), '2026-11-20']]);
  });
});
