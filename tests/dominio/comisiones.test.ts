import { describe, expect, it } from 'vitest';
import { calcularResumenTrimestre, type ResumenVendedor } from '../../src/dominio/comisiones';
import { usd } from '../../src/dominio/dinero';
import type { Trimestre } from '../../src/dominio/trimestres';
import { datos, factura, pago, vendedor } from './ayudantes';

const T3: Trimestre = { anio: 2026, numero: 3 };
const T4: Trimestre = { anio: 2026, numero: 4 };

/** Escenario del enunciado. */
function escenario() {
  const juan = vendedor({ nombre: 'Juan', comision: 500, budgetTrimestral: usd(2500) });
  const maria = vendedor({ nombre: 'María', comision: 500, budgetTrimestral: usd(4000) });

  const fJuan1 = factura(juan, '2026-07-10', 2000);
  const fJuan2 = factura(juan, '2026-07-20', 1000);
  const fMaria = factura(maria, '2026-10-05', 5000);

  const pagos = [
    pago(fJuan1, '2026-10-15', 1000),
    pago(fJuan1, '2026-12-10', 1000),
    pago(fJuan2, '2026-10-20', 1000),
    pago(fMaria, '2026-12-15', 2500),
  ];
  return { juan, maria, fJuan1, fJuan2, fMaria, vendedores: [juan, maria], facturas: [fJuan1, fJuan2, fMaria], pagos };
}

function de(resumen: ResumenVendedor[], nombre: string): ResumenVendedor {
  const r = resumen.find((x) => x.vendedor.nombre === nombre);
  if (!r) throw new Error(`No está ${nombre}`);
  return r;
}

describe('escenario del enunciado (reglas por defecto)', () => {
  const e = escenario();
  const resumen = calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos), T4);

  it('Juan en T4: no alcanza el budget (facturó $0) → completa $150, descuento $30, neto $120', () => {
    const juan = de(resumen, 'Juan');
    expect(juan.cobrado).toBe(usd(3000));
    expect(juan.comisionCompleta).toBe(usd(150));
    expect(juan.descuento).toBe(usd(30));
    expect(juan.neto).toBe(usd(120));
    expect(juan.pendiente).toBe(0);
    expect(juan.budget).toEqual({ meta: usd(2500), logrado: 0, alcanzado: false });
    expect(juan.detalle).toHaveLength(3);
  });

  it('María en T4: alcanza el budget → neto $125, pendiente $125', () => {
    const maria = de(resumen, 'María');
    expect(maria.cobrado).toBe(usd(2500));
    expect(maria.comisionCompleta).toBe(usd(125));
    expect(maria.descuento).toBe(0);
    expect(maria.neto).toBe(usd(125));
    expect(maria.pendiente).toBe(usd(125));
    expect(maria.budget).toEqual({ meta: usd(4000), logrado: usd(5000), alcanzado: true });
  });

  it('Juan en T3 facturó $3,000 pero no cobró nada: no hay comisión', () => {
    const juanT3 = de(calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos), T3), 'Juan');
    expect(juanT3.cobrado).toBe(0);
    expect(juanT3.neto).toBe(0);
    expect(juanT3.budget.logrado).toBe(usd(3000));
    expect(juanT3.budget.alcanzado).toBe(true);
  });

  it('el detalle va ordenado por fecha de pago y marca el descuento', () => {
    const juan = de(resumen, 'Juan');
    expect(juan.detalle.map((d) => d.pago.fecha)).toEqual(['2026-10-15', '2026-10-20', '2026-12-10']);
    expect(juan.detalle.every((d) => d.conDescuento)).toBe(true);
    expect(juan.detalle.map((d) => d.comision)).toEqual([usd(50), usd(50), usd(50)]);
    expect(juan.detalle.map((d) => d.descuento)).toEqual([usd(10), usd(10), usd(10)]);
  });
});

describe('regla 2: la comisión se calcula sin impuestos', () => {
  it('una factura de $1,000 + impuestos ($1,150) pagada completa genera $50, no $57.50', () => {
    const v = vendedor({ nombre: 'Ana' });
    const f = factura(v, '2026-10-01', 1000, { total: usd(1150) });
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2026-10-30', 1000)]), T4);
    expect(r!.comisionCompleta).toBe(usd(50));
  });
});

describe('regla 3: solo cuenta lo pagado dentro del trimestre', () => {
  it('cada pago parcial genera comisión en el trimestre de su fecha', () => {
    const v = vendedor({ nombre: 'Ana' });
    const f = factura(v, '2026-09-15', 1000);
    const pagos = [pago(f, '2026-09-30', 300), pago(f, '2026-10-01', 200), pago(f, '2027-01-01', 500)];
    const d = datos([v], [f], pagos);
    expect(calcularResumenTrimestre(d, T3)[0]!.cobrado).toBe(usd(300));
    expect(calcularResumenTrimestre(d, T4)[0]!.cobrado).toBe(usd(200));
    expect(calcularResumenTrimestre(d, { anio: 2027, numero: 1 })[0]!.cobrado).toBe(usd(500));
  });

  it('los pagos de facturas de otro vendedor no cuentan', () => {
    const ana = vendedor({ nombre: 'Ana' });
    const beto = vendedor({ nombre: 'Beto' });
    const f = factura(beto, '2026-10-01', 1000);
    const resumen = calcularResumenTrimestre(datos([ana, beto], [f], [pago(f, '2026-10-02', 1000)]), T4);
    expect(de(resumen, 'Ana').cobrado).toBe(0);
    expect(de(resumen, 'Beto').cobrado).toBe(usd(1000));
  });

  it('un vendedor sin movimientos aparece con todo en cero', () => {
    const v = vendedor({ nombre: 'Ana', budgetTrimestral: usd(1000) });
    const [r] = calcularResumenTrimestre(datos([v], [], []), T4);
    expect(r).toMatchObject({ cobrado: 0, comisionCompleta: 0, descuento: 0, neto: 0, pendiente: 0, detalle: [] });
  });
});

describe('regla 4: descuento por no alcanzar el budget', () => {
  it('el porcentaje de descuento es configurable (10%)', () => {
    const e = escenario();
    const juan = de(calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos, { descuento: 1000 }), T4), 'Juan');
    expect(juan.descuento).toBe(usd(15));
    expect(juan.neto).toBe(usd(135));
  });

  it('alcanzar exactamente el budget cuenta como alcanzado', () => {
    const v = vendedor({ nombre: 'Ana', budgetTrimestral: usd(2500) });
    const f = factura(v, '2026-10-01', 2500);
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2026-11-01', 2500)]), T4);
    expect(r!.budget.alcanzado).toBe(true);
    expect(r!.descuento).toBe(0);
  });

  it('quedarse un centavo por debajo sí lleva descuento', () => {
    const v = vendedor({ nombre: 'Ana', budgetTrimestral: usd(2500) });
    const f = factura(v, '2026-10-01', 2499.99);
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2026-11-01', 2499.99)]), T4);
    expect(r!.budget.alcanzado).toBe(false);
    expect(r!.comisionCompleta).toBe(usd(125)); // 2499.99 × 5% = 124.9995 → 125.00
    expect(r!.descuento).toBe(usd(25)); // 2499.99 × 5% × 20% = 24.9999 → 25.00
    expect(r!.neto).toBe(usd(100));
  });
});

describe('regla 5: base del budget', () => {
  it('con "cobrado", Juan cobró $3,000 en T4 y alcanza su budget → neto $150', () => {
    const e = escenario();
    const resumen = calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos, { baseBudget: 'cobrado' }), T4);
    const juan = de(resumen, 'Juan');
    expect(juan.budget).toEqual({ meta: usd(2500), logrado: usd(3000), alcanzado: true });
    expect(juan.neto).toBe(usd(150));
  });

  it('con "cobrado", María cobró $2,500 de $4,000 → descuento $25, neto $100', () => {
    const e = escenario();
    const maria = de(calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos, { baseBudget: 'cobrado' }), T4), 'María');
    expect(maria.budget.alcanzado).toBe(false);
    expect(maria.descuento).toBe(usd(25));
    expect(maria.neto).toBe(usd(100));
  });
});

describe('regla 6: el budget de qué trimestre decide el descuento', () => {
  it('con "trimestre de la factura", las facturas de Juan son de T3 (alcanzó) → neto $150', () => {
    const e = escenario();
    const juan = de(
      calcularResumenTrimestre(datos(e.vendedores, e.facturas, e.pagos, { baseDescuento: 'trimestreFactura' }), T4),
      'Juan',
    );
    expect(juan.descuento).toBe(0);
    expect(juan.neto).toBe(usd(150));
    // El avance que se muestra sigue siendo el del trimestre consultado.
    expect(juan.budget.alcanzado).toBe(false);
  });

  it('con "trimestre de la factura", solo se descuentan los pagos de facturas de trimestres no alcanzados', () => {
    const e = escenario();
    const fT4 = factura(e.juan, '2026-11-01', 500); // en T4 Juan solo factura $500 → no alcanza
    const pagos = [...e.pagos, pago(fT4, '2026-11-15', 500)];
    const juan = de(
      calcularResumenTrimestre(datos(e.vendedores, [...e.facturas, fT4], pagos, { baseDescuento: 'trimestreFactura' }), T4),
      'Juan',
    );
    expect(juan.cobrado).toBe(usd(3500));
    expect(juan.comisionCompleta).toBe(usd(175));
    expect(juan.descuento).toBe(usd(5)); // solo sobre los $500 de la factura de T4
    expect(juan.neto).toBe(usd(170));
    expect(juan.detalle.filter((d) => d.conDescuento).map((d) => d.factura.id)).toEqual([fT4.id]);
  });

  it('combinado con base "cobrado": decide lo cobrado en el trimestre de la factura', () => {
    const v = vendedor({ nombre: 'Ana', budgetTrimestral: usd(1000) });
    const f = factura(v, '2026-09-01', 2000); // en T3 no cobró nada → T3 no alcanzado
    const [r] = calcularResumenTrimestre(
      datos([v], [f], [pago(f, '2026-10-01', 2000)], { baseBudget: 'cobrado', baseDescuento: 'trimestreFactura' }),
      T4,
    );
    expect(r!.descuento).toBe(usd(20));
    expect(r!.budget.alcanzado).toBe(true); // T4 sí alcanzado por cobrado, pero no es el que decide
  });
});

describe('regla 7: sin budget no hay descuento', () => {
  it('aunque no facture nada en el trimestre', () => {
    const v = vendedor({ nombre: 'Pedro', budgetTrimestral: null });
    const f = factura(v, '2026-07-01', 1000);
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2026-10-01', 1000)]), T4);
    expect(r!.budget).toEqual({ meta: null, logrado: 0, alcanzado: null });
    expect(r!.descuento).toBe(0);
    expect(r!.neto).toBe(usd(50));
  });

  it('tampoco con la regla del trimestre de la factura', () => {
    const v = vendedor({ nombre: 'Pedro', budgetTrimestral: null });
    const f = factura(v, '2026-07-01', 1000);
    const [r] = calcularResumenTrimestre(
      datos([v], [f], [pago(f, '2026-10-01', 1000)], { baseDescuento: 'trimestreFactura' }),
      T4,
    );
    expect(r!.descuento).toBe(0);
  });
});

describe('regla 8: comisión pendiente', () => {
  it('es el balance abierto × porcentaje, sin descuento, aunque no alcance el budget', () => {
    const v = vendedor({ nombre: 'Ana', comision: 500, budgetTrimestral: usd(100_000) });
    const f1 = factura(v, '2026-10-01', 1000);
    const f2 = factura(v, '2026-05-01', 3000);
    const [r] = calcularResumenTrimestre(datos([v], [f1, f2], [pago(f1, '2026-10-10', 400)]), T4);
    expect(r!.budget.alcanzado).toBe(false);
    expect(r!.pendiente).toBe(usd(180)); // (600 + 3000) × 5%
  });

  it('cuenta los pagos posteriores al trimestre consultado (es el balance de hoy)', () => {
    const v = vendedor({ nombre: 'Ana' });
    const f = factura(v, '2026-07-01', 1000);
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2027-02-01', 1000)]), T3);
    expect(r!.pendiente).toBe(0);
  });
});

describe('regla 9: cobro previo', () => {
  it('no genera comisión pero reduce el pendiente', () => {
    const e = escenario();
    const pagos = e.pagos.map((p) => (p.facturaId === e.fJuan2.id ? { ...p, cobroPrevio: true } : p));
    const juan = de(calcularResumenTrimestre(datos(e.vendedores, e.facturas, pagos), T4), 'Juan');
    expect(juan.cobrado).toBe(usd(2000));
    expect(juan.comisionCompleta).toBe(usd(100));
    expect(juan.descuento).toBe(usd(20));
    expect(juan.neto).toBe(usd(80));
    expect(juan.pendiente).toBe(0);
    expect(juan.detalle).toHaveLength(2);
  });

  it('sí cuenta para el budget cuando la base es "cobrado"', () => {
    const e = escenario();
    const pagos = e.pagos.map((p) => (p.facturaId === e.fJuan2.id ? { ...p, cobroPrevio: true } : p));
    const juan = de(calcularResumenTrimestre(datos(e.vendedores, e.facturas, pagos, { baseBudget: 'cobrado' }), T4), 'Juan');
    expect(juan.budget.logrado).toBe(usd(3000));
    expect(juan.budget.alcanzado).toBe(true);
    expect(juan.neto).toBe(usd(100));
  });
});

describe('regla 10: redondeo', () => {
  it('los totales se redondean una sola vez sobre la suma, no pago por pago', () => {
    const v = vendedor({ nombre: 'Ana', comision: 500 });
    const f = factura(v, '2026-10-01', 1);
    const pagos = [pago(f, '2026-10-02', 0.1), pago(f, '2026-10-03', 0.1), pago(f, '2026-10-04', 0.1)];
    const [r] = calcularResumenTrimestre(datos([v], [f], pagos), T4);
    // Cada pago: 10¢ × 5% = 0.5¢ → 1¢ en el detalle; el total: 30¢ × 5% = 1.5¢ → 2¢.
    expect(r!.detalle.map((d) => d.comision)).toEqual([1, 1, 1]);
    expect(r!.comisionCompleta).toBe(2);
  });

  it('admite porcentajes con decimales (2.5%)', () => {
    const v = vendedor({ nombre: 'Ana', comision: 250 });
    const f = factura(v, '2026-10-01', 1234.56);
    const [r] = calcularResumenTrimestre(datos([v], [f], [pago(f, '2026-10-02', 1234.56)]), T4);
    expect(r!.comisionCompleta).toBe(3086); // 1234.56 × 2.5% = 30.864 → $30.86
  });

  it('los pagos en el primer y último día del trimestre cuentan', () => {
    const v = vendedor({ nombre: 'Ana' });
    const f = factura(v, '2026-09-01', 1000);
    const pagos = [pago(f, '2026-09-30', 100), pago(f, '2026-10-01', 200), pago(f, '2026-12-31', 300), pago(f, '2027-01-01', 400)];
    const [r] = calcularResumenTrimestre(datos([v], [f], pagos), T4);
    expect(r!.cobrado).toBe(usd(500));
  });
});
