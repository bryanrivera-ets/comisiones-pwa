import { describe, expect, it } from 'vitest';
import { adivinarMapeo, camposObligatoriosFaltantes, detectarEncabezados } from '../../src/importacion/encabezados';

describe('detección de encabezados', () => {
  it('reconoce los nombres de Odoo en español', () => {
    const mapeo = adivinarMapeo([
      'Número', 'Cliente', 'Vendedor', 'Fecha de factura', 'Fecha de vencimiento',
      'Base imponible', 'Total', 'Importe adeudado', 'Fecha de pago', 'Estado de pago',
    ]);
    expect(mapeo).toEqual({
      numero: 0, cliente: 1, vendedor: 2, fecha: 3, montoSinImpuestos: 5, total: 6, adeudado: 7, cobrado: null, fechaPago: 8, estadoPago: 9,
    });
  });

  it('reconoce los nombres de Odoo en inglés, sin importar mayúsculas ni signos', () => {
    const mapeo = adivinarMapeo(['NUMBER', 'Customer', 'Salesperson', 'Invoice Date', 'Tax Excluded', 'Total', 'Amount Due', 'Payment Status']);
    expect(mapeo).toMatchObject({ numero: 0, cliente: 1, vendedor: 2, fecha: 3, montoSinImpuestos: 4, total: 5, adeudado: 6, estadoPago: 7 });
    expect(adivinarMapeo(['N° Factura', 'Impuestos no incluidos']).montoSinImpuestos).toBe(1);
  });

  it('no confunde "Fecha de vencimiento" con la fecha de factura', () => {
    expect(adivinarMapeo(['Fecha de vencimiento', 'Número']).fecha).toBeNull();
  });

  it('encuentra la fila de encabezados debajo de títulos', () => {
    const d = detectarEncabezados([
      ['Facturas de cliente'],
      [],
      ['Reporte generado el 2026-11-24', null, 'Total general'],
      ['Número', 'Fecha de factura', 'Base imponible', 'Vendedor'],
      ['INV/1', 46218, 1000, 'Ana'],
    ]);
    expect(d.filaEncabezados).toBe(3);
    expect(d.encabezados).toEqual(['Número', 'Fecha de factura', 'Base imponible', 'Vendedor']);
    expect(camposObligatoriosFaltantes(d.mapeo)).toEqual([]);
  });

  it('si no reconoce nada, propone la primera fila no vacía y deja el mapeo para el usuario', () => {
    const d = detectarEncabezados([[], ['Col A', 'Col B'], ['x', 'y']]);
    expect(d.filaEncabezados).toBe(1);
    expect(camposObligatoriosFaltantes(d.mapeo)).toEqual(['numero', 'fecha', 'montoSinImpuestos']);
  });
});
