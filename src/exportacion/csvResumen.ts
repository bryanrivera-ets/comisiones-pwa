import type { ResumenVendedor } from '../dominio/comisiones';
import { centavosATexto, formatearPorcentaje, sumar } from '../dominio/dinero';
import { claveTrimestre, type Trimestre } from '../dominio/trimestres';

type Celda = string | number;

/** Comillas solo cuando hacen falta; neutraliza fórmulas (=, +, -, @) en celdas de texto. */
function celda(valor: Celda, esTexto = false): string {
  let s = String(valor);
  if (esTexto && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fila(celdas: (Celda | { texto: string })[]): string {
  return celdas.map((c) => (typeof c === 'object' ? celda(c.texto, true) : celda(c))).join(',');
}

const texto = (t: string) => ({ texto: t });
const dinero = centavosATexto;

/**
 * CSV del trimestre: primero el detalle (un renglón por pago que genera comisión),
 * luego una línea vacía y el resumen por vendedor con los totales oficiales.
 * Montos sin signo $ y con punto decimal, fechas AAAA-MM-DD: Excel los reconoce como números y fechas.
 */
export function csvResumenTrimestre(resumen: readonly ResumenVendedor[], trimestre: Trimestre): string {
  const lineas: string[] = [];
  const t = claveTrimestre(trimestre);

  lineas.push(
    fila([
      'Trimestre', 'Vendedor', 'Fecha de pago', 'Factura', 'Cliente', 'Fecha de factura',
      'Monto pagado (sin impuestos)', '% comisión', 'Comisión', 'Con descuento', 'Descuento', 'Neto',
    ]),
  );
  for (const r of resumen) {
    for (const d of r.detalle) {
      lineas.push(
        fila([
          t,
          texto(r.vendedor.nombre),
          d.pago.fecha,
          texto(d.factura.numero),
          texto(d.factura.cliente),
          d.factura.fecha,
          dinero(d.pago.monto),
          formatearPorcentaje(r.vendedor.comision),
          dinero(d.comision),
          d.conDescuento ? 'Sí' : 'No',
          dinero(d.descuento),
          dinero(d.comision - d.descuento),
        ]),
      );
    }
  }

  lineas.push('');
  lineas.push(
    fila([
      'Trimestre', 'Vendedor', 'Cobrado en el trimestre', 'Comisión completa', 'Descuento por budget',
      'Neto a pagar', 'Comisión pendiente', 'Budget trimestral', 'Avance del budget', 'Alcanzó el budget',
    ]),
  );
  for (const r of resumen) {
    lineas.push(
      fila([
        t,
        texto(r.vendedor.nombre),
        dinero(r.cobrado),
        dinero(r.comisionCompleta),
        dinero(r.descuento),
        dinero(r.neto),
        dinero(r.pendiente),
        r.budget.meta === null ? 'Sin budget' : dinero(r.budget.meta),
        dinero(r.budget.logrado),
        r.budget.alcanzado === null ? 'No aplica' : r.budget.alcanzado ? 'Sí' : 'No',
      ]),
    );
  }
  const total = (f: (r: ResumenVendedor) => number) => dinero(sumar(resumen.map(f)));
  lineas.push(
    fila([
      t, 'TOTAL', total((r) => r.cobrado), total((r) => r.comisionCompleta), total((r) => r.descuento),
      total((r) => r.neto), total((r) => r.pendiente), '', '', '',
    ]),
  );

  return lineas.join('\r\n') + '\r\n';
}

/** "comisiones-2026-T4.csv" */
export function nombreArchivoCsv(trimestre: Trimestre): string {
  return `comisiones-${claveTrimestre(trimestre)}.csv`;
}
