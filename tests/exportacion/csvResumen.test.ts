import { describe, expect, it } from 'vitest';
import { calcularResumenTrimestre } from '../../src/dominio/comisiones';
import { usd } from '../../src/dominio/dinero';
import { csvResumenTrimestre, nombreArchivoCsv } from '../../src/exportacion/csvResumen';
import { datos, factura, pago, vendedor } from '../dominio/ayudantes';

const T4 = { anio: 2026, numero: 4 } as const;

function escenario() {
  const juan = vendedor({ nombre: 'Juan', budgetTrimestral: usd(2500) });
  const maria = vendedor({ nombre: 'María', budgetTrimestral: usd(4000) });
  const j1 = factura(juan, '2026-07-10', 2000, { numero: 'INV/0101', cliente: 'Ferretería López, S.A.' });
  const j2 = factura(juan, '2026-07-20', 1000, { numero: 'INV/0102', cliente: '=HYPERLINK("x")' });
  const m1 = factura(maria, '2026-10-05', 5000, { numero: 'INV/0201', cliente: 'Taller "Luna"' });
  const pagos = [pago(j1, '2026-10-15', 1000), pago(j1, '2026-12-10', 1000), pago(j2, '2026-10-20', 1000), pago(m1, '2026-12-15', 2500)];
  return calcularResumenTrimestre(datos([juan, maria], [j1, j2, m1], pagos), T4);
}

describe('CSV del resumen trimestral', () => {
  const lineas = csvResumenTrimestre(escenario(), T4).split('\r\n');

  it('detalle: un renglón por pago, con comillas y fórmulas neutralizadas', () => {
    expect(lineas[0]).toBe(
      'Trimestre,Vendedor,Fecha de pago,Factura,Cliente,Fecha de factura,Monto pagado (sin impuestos),% comisión,Comisión,Con descuento,Descuento,Neto',
    );
    expect(lineas.slice(1, 5)).toEqual([
      '2026-T4,Juan,2026-10-15,INV/0101,"Ferretería López, S.A.",2026-07-10,1000.00,5%,50.00,Sí,10.00,40.00',
      `2026-T4,Juan,2026-10-20,INV/0102,"'=HYPERLINK(""x"")",2026-07-20,1000.00,5%,50.00,Sí,10.00,40.00`,
      '2026-T4,Juan,2026-12-10,INV/0101,"Ferretería López, S.A.",2026-07-10,1000.00,5%,50.00,Sí,10.00,40.00',
      '2026-T4,María,2026-12-15,INV/0201,"Taller ""Luna""",2026-10-05,2500.00,5%,125.00,No,0.00,125.00',
    ]);
    expect(lineas[5]).toBe('');
  });

  it('resumen por vendedor con los totales oficiales', () => {
    expect(lineas.slice(6)).toEqual([
      'Trimestre,Vendedor,Cobrado en el trimestre,Comisión completa,Descuento por budget,Neto a pagar,Comisión pendiente,Budget trimestral,Avance del budget,Alcanzó el budget',
      '2026-T4,Juan,3000.00,150.00,30.00,120.00,0.00,2500.00,0.00,No',
      '2026-T4,María,2500.00,125.00,0.00,125.00,125.00,4000.00,5000.00,Sí',
      '2026-T4,TOTAL,5500.00,275.00,30.00,245.00,125.00,,,',
      '',
    ]);
  });

  it('vendedor sin budget', () => {
    const pedro = vendedor({ nombre: 'Pedro', budgetTrimestral: null });
    const [r] = calcularResumenTrimestre(datos([pedro], [], []), T4);
    expect(csvResumenTrimestre([r!], T4)).toContain('2026-T4,Pedro,0.00,0.00,0.00,0.00,0.00,Sin budget,0.00,No aplica');
  });

  it('nombre del archivo', () => {
    expect(nombreArchivoCsv(T4)).toBe('comisiones-2026-T4.csv');
  });
});
