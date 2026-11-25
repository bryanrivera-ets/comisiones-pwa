import * as XLSX from 'xlsx';
import type { DatosCompletos } from '../datos/Repositorio';
import type { Centavos } from '../dominio/dinero';
import type { FechaISO } from '../dominio/fechas';

/**
 * Títulos de la hoja "Ventas". El importador los reconoce solo (ver SINONIMOS en encabezados.ts).
 * No cambiar sin actualizar las pruebas de la plantilla.
 */
export const ENCABEZADOS_PLANTILLA = [
  'Número de factura',
  'Cliente',
  'Vendedor',
  'Fecha de factura',
  'Monto sin impuestos',
  'Total con impuestos',
  'Cobrado sin impuestos',
  'Fecha de cobro',
] as const;

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface FilaPlantilla {
  numero: string;
  cliente: string;
  vendedor: string;
  fecha: FechaISO;
  montoSinImpuestos: Centavos;
  total: Centavos | null;
  /** Cobrado acumulado, sin impuestos. */
  cobrado: Centavos;
}

/** Fecha como número de serie de Excel con formato de fecha: sin zonas horarias. */
function celdaFecha(fecha: FechaISO): XLSX.CellObject {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return { t: 'n', v: (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000, z: 'yyyy-mm-dd' };
}

function celdaDinero(centavos: Centavos): XLSX.CellObject {
  return { t: 'n', v: centavos / 100, z: '#,##0.00' };
}

/** Facturas con balance pendiente, listas para anotar sus cobros en la plantilla. */
export function filasAbiertas(datos: Pick<DatosCompletos, 'vendedores' | 'facturas' | 'pagos'>): FilaPlantilla[] {
  const nombres = new Map(datos.vendedores.map((v) => [v.id, v.nombre]));
  const cobrado = new Map<string, Centavos>();
  for (const p of datos.pagos) cobrado.set(p.facturaId, (cobrado.get(p.facturaId) ?? 0) + p.monto);
  return datos.facturas
    .filter((f) => (cobrado.get(f.id) ?? 0) < f.montoSinImpuestos)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero))
    .map((f) => ({
      numero: f.numero,
      cliente: f.cliente,
      vendedor: nombres.get(f.vendedorId) ?? '',
      fecha: f.fecha,
      montoSinImpuestos: f.montoSinImpuestos,
      total: f.total,
      cobrado: cobrado.get(f.id) ?? 0,
    }));
}

function instrucciones(vendedores: readonly string[]): string[][] {
  const lista = vendedores.length > 0 ? vendedores.join(', ') : '(todavía no hay vendedores registrados en la app)';
  return [
    ['CÓMO LLENAR LA PLANTILLA DE VENTAS'],
    [],
    ['Llena la hoja «Ventas»: una fila por factura. No cambies los títulos de la primera fila ni el orden de las hojas.'],
    ['Cuando termines, en la app ve a Facturas → Importar Excel de Odoo y sube este archivo.'],
    [],
    ['Columna', 'Qué escribir'],
    ['Número de factura', 'Obligatorio. Identifica la factura: si la vuelves a subir, la app actualiza sus cobros en vez de duplicarla.'],
    ['Cliente', 'Opcional.'],
    ['Vendedor', `Nombre del vendedor tal como está en la app, o uno de sus alias. Vendedores registrados: ${lista}.`],
    ['Fecha de factura', 'Obligatorio. Escríbela como fecha de Excel o como AAAA-MM-DD (por ejemplo 2026-07-15).'],
    ['Monto sin impuestos', 'Obligatorio. Es la base de la comisión.'],
    ['Total con impuestos', 'Opcional, solo informativo.'],
    ['Cobrado sin impuestos', 'Lo que el cliente ha pagado de esa factura HASTA HOY, en total (acumulado) y sin impuestos. Vacío si no ha pagado nada.'],
    ['Fecha de cobro', 'Fecha del último cobro. Si la dejas vacía, se usa la fecha que escojas al importar.'],
    [],
    ['IMPORTANTE'],
    ['• «Cobrado» es el acumulado, no el pago nuevo. La app compara con lo que ya tiene registrado y añade solo la diferencia, con la fecha de cobro.'],
    ['• Si escribes un cobrado menor a lo ya registrado, esa fila queda «para revisar» y no se cambia nada.'],
    ['• La comisión de cada cobro cuenta en el trimestre de su fecha de cobro.'],
    ['• Se omiten las filas con monto cero o negativo (notas de crédito) y las facturas repetidas dentro del archivo.'],
    [],
    ['EJEMPLO'],
    ['1. La factura F-001 de $1,000.00 recibe $400.00 el 15 de agosto: Cobrado sin impuestos = 400, Fecha de cobro = 2026-08-15. Subes el archivo.'],
    ['2. El 10 de octubre el cliente paga $600.00 más: cambias Cobrado a 1000 y Fecha de cobro a 2026-10-10, y vuelves a subir el archivo.'],
    ['   La app registra un pago nuevo de $600.00 con fecha 10/10/2026 (cuenta en T4).'],
  ];
}

/**
 * Crea la plantilla de ventas (.xlsx): hoja «Ventas» (la que se importa) e «Instrucciones».
 * Con `filas`, la hoja Ventas sale prellenada (p. ej. las facturas abiertas, para anotar cobros).
 */
export function crearPlantilla(nombresVendedores: readonly string[], filas: readonly FilaPlantilla[] = []): ArrayBuffer {
  const ventas = XLSX.utils.aoa_to_sheet([
    [...ENCABEZADOS_PLANTILLA],
    ...filas.map((f) => [
      f.numero,
      f.cliente,
      f.vendedor,
      celdaFecha(f.fecha),
      celdaDinero(f.montoSinImpuestos),
      f.total === null ? null : celdaDinero(f.total),
      celdaDinero(f.cobrado),
      null,
    ]),
  ]);
  ventas['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 16 }];

  const hojaInstrucciones = XLSX.utils.aoa_to_sheet(instrucciones(nombresVendedores));
  hojaInstrucciones['!cols'] = [{ wch: 24 }, { wch: 110 }];

  const libro = XLSX.utils.book_new();
  // «Ventas» va primero: el importador lee la primera hoja.
  XLSX.utils.book_append_sheet(libro, ventas, 'Ventas');
  XLSX.utils.book_append_sheet(libro, hojaInstrucciones, 'Instrucciones');
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** "plantilla-ventas-2026-11-25.xlsx" */
export function nombrePlantilla(hoy: FechaISO): string {
  return `plantilla-ventas-${hoy}.xlsx`;
}
