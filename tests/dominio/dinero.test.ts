import { describe, expect, it } from 'vitest';
import {
  aplicarPorcentajes,
  centavosATexto,
  formatearPorcentaje,
  formatearUSD,
  parsearDinero,
  parsearPorcentaje,
  porcentajeATexto,
} from '../../src/dominio/dinero';

describe('parsearDinero', () => {
  it.each<[unknown, number | null]>([
    [1234.56, 123456],
    [0.1, 10],
    [1.005, 101], // sin error de punto flotante
    [2000, 200000],
    [-50, -5000],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['$ 1,234.56', 123456],
    ['US$1,234', 123400],
    ['1,234', 123400], // coma seguida de 3 dígitos = miles
    ['1,234,567', 123456700],
    ['1.234.567', 123456700],
    ['1,5', 150], // coma decimal
    ['12.5', 1250],
    ['0.125', 13], // tercer decimal redondea
    ['(100.00)', -10000],
    ['-100', -10000],
    ['$-1,000.50', -100050],
    ['  42  ', 4200],
    ['', null],
    ['abc', null],
    ['1.2.3,4.5', null],
    ['12,34,56', null],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
  ])('%j → %j', (entrada, esperado) => {
    expect(parsearDinero(entrada)).toBe(esperado);
  });
});

describe('aplicarPorcentajes', () => {
  it('redondea la mitad hacia arriba una sola vez', () => {
    expect(aplicarPorcentajes(300000, 500)).toBe(15000);
    expect(aplicarPorcentajes(300000, 500, 2000)).toBe(3000);
    expect(aplicarPorcentajes(10, 500)).toBe(1); // 0.5 → 1
    expect(aplicarPorcentajes(9, 500)).toBe(0); // 0.45 → 0
    expect(aplicarPorcentajes(-10, 500)).toBe(-1);
  });

  it('no pierde precisión con montos grandes y dos porcentajes', () => {
    // $10,000,000,000.00 × 5% × 20% = $100,000,000.00
    expect(aplicarPorcentajes(1_000_000_000_000, 500, 2000)).toBe(10_000_000_000);
  });

  it('rechaza montos que no son enteros', () => {
    expect(() => aplicarPorcentajes(1.5, 500)).toThrow();
  });
});

describe('formato', () => {
  it('formatearUSD', () => {
    expect(formatearUSD(0)).toBe('$0.00');
    expect(formatearUSD(5)).toBe('$0.05');
    expect(formatearUSD(123456789)).toBe('$1,234,567.89');
    expect(formatearUSD(-3000)).toBe('-$30.00');
  });

  it('centavosATexto', () => {
    expect(centavosATexto(123456)).toBe('1234.56');
    expect(centavosATexto(5)).toBe('0.05');
    expect(centavosATexto(-150)).toBe('-1.50');
  });
});

describe('porcentajes', () => {
  it.each<[unknown, number | null]>([
    ['5', 500],
    ['2.5', 250],
    ['2,5', 250],
    [20, 2000],
    ['100', 10000],
    ['0', 0],
    ['101', null],
    ['-1', null],
    ['x', null],
  ])('parsearPorcentaje(%j) → %j', (entrada, esperado) => {
    expect(parsearPorcentaje(entrada)).toBe(esperado);
  });

  it('formato', () => {
    expect(formatearPorcentaje(500)).toBe('5%');
    expect(formatearPorcentaje(250)).toBe('2.5%');
    expect(formatearPorcentaje(1234)).toBe('12.34%');
    expect(porcentajeATexto(0)).toBe('0');
    expect(porcentajeATexto(2000)).toBe('20');
  });
});
