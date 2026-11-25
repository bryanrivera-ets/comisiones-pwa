import { describe, expect, it } from 'vitest';
import { usd } from '../../src/dominio/dinero';
import { REGLAS_POR_DEFECTO } from '../../src/dominio/tipos';
import { validarFactura, validarPago, validarReglas, validarVendedor } from '../../src/dominio/validaciones';
import { buscarVendedorPorNombre } from '../../src/dominio/vendedores';
import { factura, pago, vendedor } from './ayudantes';

describe('vendedores', () => {
  const juan = vendedor({ nombre: 'Juan Pérez', alias: ['JUAN P', 'jperez'] });
  const maria = vendedor({ nombre: 'María', budgetTrimestral: usd(4000) });

  it('un vendedor correcto no tiene errores', () => {
    expect(validarVendedor(maria, [juan, maria])).toEqual([]);
  });

  it('exige nombre, porcentaje 0–100% y budget no negativo', () => {
    const malo = { ...maria, nombre: '  ', comision: 10001, budgetTrimestral: -1 };
    expect(validarVendedor(malo, [])).toHaveLength(3);
  });

  it('un nombre o alias no puede pertenecer a dos vendedores', () => {
    const nuevo = vendedor({ nombre: 'Juan', alias: ['Jperez'] });
    expect(validarVendedor(nuevo, [juan])).toEqual(['"jperez" ya pertenece a Juan Pérez.']);
  });

  it('busca por nombre o alias sin distinguir tildes ni mayúsculas', () => {
    expect(buscarVendedorPorNombre('juan perez', [juan, maria])).toBe(juan);
    expect(buscarVendedorPorNombre('  Juan   P ', [juan, maria])).toBe(juan);
    expect(buscarVendedorPorNombre('MARIA', [juan, maria])).toBe(maria);
    expect(buscarVendedorPorNombre('Pedro', [juan, maria])).toBeUndefined();
    expect(buscarVendedorPorNombre('', [juan, maria])).toBeUndefined();
  });
});

describe('reglas', () => {
  it('valida el porcentaje de descuento', () => {
    expect(validarReglas(REGLAS_POR_DEFECTO)).toEqual([]);
    expect(validarReglas({ ...REGLAS_POR_DEFECTO, descuento: -1 })).toHaveLength(1);
  });
});

describe('facturas', () => {
  const v = vendedor({ nombre: 'Ana' });
  const existente = factura(v, '2026-07-01', 1000, { numero: 'INV/2026/0001' });

  it('una factura correcta no tiene errores', () => {
    expect(validarFactura(factura(v, '2026-07-02', 500, { total: usd(575) }), [existente], [v])).toEqual([]);
  });

  it('el número no se puede repetir (sin distinguir mayúsculas ni espacios)', () => {
    const repetida = factura(v, '2026-07-02', 500, { numero: ' inv/2026/0001 ' });
    expect(validarFactura(repetida, [existente], [v])).toEqual(['Ya existe la factura inv/2026/0001.']);
  });

  it('al editar, no choca consigo misma', () => {
    expect(validarFactura({ ...existente, cliente: 'Otro' }, [existente], [v])).toEqual([]);
  });

  it('exige número, fecha válida, monto > 0, total coherente y vendedor', () => {
    const mala = { ...factura(v, '2026-02-30', 0, { numero: '' }), total: usd(-1), vendedorId: 'nadie' };
    expect(validarFactura(mala, [], [v])).toHaveLength(5);
    const totalMenor = factura(v, '2026-07-02', 500, { total: usd(400) });
    expect(validarFactura(totalMenor, [], [v])).toEqual(['El total no puede ser menor que el monto sin impuestos.']);
  });
});

describe('pagos', () => {
  const v = vendedor({ nombre: 'Ana' });
  const f = factura(v, '2026-07-10', 1000);
  const previo = pago(f, '2026-08-01', 600);

  it('un pago correcto no tiene errores', () => {
    expect(validarPago(pago(f, '2026-07-10', 400), f, [previo])).toEqual([]);
  });

  it('no puede ser anterior a la factura', () => {
    expect(validarPago(pago(f, '2026-07-09', 100), f, [])).toEqual(['El pago no puede ser anterior a la factura (10/07/2026).']);
  });

  it('no puede ser mayor que el balance', () => {
    expect(validarPago(pago(f, '2026-09-01', 400.01), f, [previo])).toEqual([
      'El pago ($400.01) es mayor que el balance de la factura ($400.00).',
    ]);
  });

  it('al editar un pago, su propio monto no cuenta contra el balance', () => {
    expect(validarPago({ ...previo, monto: usd(1000) }, f, [previo])).toEqual([]);
  });

  it('exige monto > 0 y fecha válida', () => {
    expect(validarPago({ ...pago(f, 'mañana', 0) }, f, [])).toHaveLength(2);
  });
});
