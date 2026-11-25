import { describe, expect, it } from 'vitest';
import { usd } from '../../src/dominio/dinero';
import { parsearFecha } from '../../src/dominio/fechas';
import { adivinarMapeo } from '../../src/importacion/encabezados';
import { calcularPagado, detectarOrdenFechas, normalizarFilas } from '../../src/importacion/normalizar';

describe('lo pagado según Odoo (base sin impuestos)', () => {
  it('base × (total − adeudado) / total', () => {
    // $1,000 + impuestos = $1,150; adeuda $575 → pagó la mitad → $500 de base
    expect(calcularPagado(usd(1000), usd(1150), usd(575), '').pagado).toBe(usd(500));
    expect(calcularPagado(usd(2000), usd(2300), 0, 'Pagado').pagado).toBe(usd(2000));
    expect(calcularPagado(usd(2000), usd(2300), usd(2300), 'No pagado').pagado).toBe(0);
  });

  it('sin columna Total usa la base: base − adeudado', () => {
    expect(calcularPagado(usd(1000), null, usd(300), '').pagado).toBe(usd(700));
  });

  it('sin columna de adeudado usa el Estado de pago', () => {
    expect(calcularPagado(usd(1000), null, null, 'Pagado').pagado).toBe(usd(1000));
    expect(calcularPagado(usd(1000), null, null, 'Paid').pagado).toBe(usd(1000));
    expect(calcularPagado(usd(1000), null, null, 'En proceso de pago').pagado).toBe(usd(1000));
    expect(calcularPagado(usd(1000), null, null, 'No pagado').pagado).toBe(0);
    const parcial = calcularPagado(usd(1000), null, null, 'Parcialmente pagado');
    expect(parcial.pagado).toBe(0);
    expect(parcial.aviso).toContain('no trae el importe adeudado');
  });

  it('sin adeudado ni estado no se sabe (null)', () => {
    expect(calcularPagado(usd(1000), usd(1150), null, '').pagado).toBeNull();
  });

  it('ajusta diferencias de un centavo por redondeo y nunca sale de 0..base', () => {
    // 100.01 × (115.01 − 0.01) / 115.01 = 99.999… → se redondea y queda pagado completo
    expect(calcularPagado(10001, 11501, 1, '').pagado).toBe(10001);
    expect(calcularPagado(usd(1000), usd(1150), usd(2000), '').pagado).toBe(0);
    expect(calcularPagado(usd(1000), usd(1150), usd(-50), '').pagado).toBe(usd(1000));
  });
});

describe('fechas en texto por columna', () => {
  it('si alguna fecha de la columna empieza con más de 12, toda la columna es DD/MM', () => {
    const matriz = [['Fecha'], ['10/07/2026'], ['20/07/2026']];
    expect(detectarOrdenFechas(matriz, 1, 0)).toBe('DM');
    expect(parsearFecha('10/07/2026', 'DM')).toBe('2026-07-10');
  });

  it('si ninguna lo aclara, MM/DD como dice la regla', () => {
    expect(detectarOrdenFechas([['Fecha'], ['10/07/2026'], [46218]], 1, 0)).toBe('MD');
    expect(parsearFecha('10/07/2026')).toBe('2026-10-07');
  });
});

describe('normalizarFilas', () => {
  const encabezados = ['Número', 'Cliente', 'Vendedor', 'Fecha', 'Base imponible', 'Total', 'Importe adeudado', 'Fecha de pago'];
  const mapeo = adivinarMapeo(encabezados);

  it('interpreta cada fila y salta las vacías', () => {
    const filas = normalizarFilas(
      [
        encabezados,
        ['INV/1', ' Panadería  Sol ', 'Ana', 46218, '1,000.00', '1,150.00', '575', '08/15/2026'],
        [null, null, null, null, null, null, null, null],
        [1234, null, null, 'mañana', 'x', null, null, 'ayer'],
      ],
      0,
      mapeo,
    );
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({
      filaExcel: 2,
      numero: 'INV/1',
      cliente: 'Panadería Sol',
      vendedor: 'Ana',
      fecha: '2026-07-15',
      montoSinImpuestos: usd(1000),
      total: usd(1150),
      adeudado: usd(575),
      pagado: usd(500),
      fechaPago: '2026-08-15',
      fechaPagoIlegible: false,
    });
    expect(filas[1]).toMatchObject({
      filaExcel: 4,
      numero: '1234',
      fecha: null,
      fechaOriginal: 'mañana',
      montoSinImpuestos: null,
      pagado: null,
      fechaPagoIlegible: true,
    });
  });
});
