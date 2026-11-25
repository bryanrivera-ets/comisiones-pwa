import { describe, expect, it } from 'vitest';
import { deSerialExcel, esFechaISO, formatearFecha, hoyISO, parsearFecha } from '../../src/dominio/fechas';
import {
  claveTrimestre,
  etiquetaTrimestre,
  fechaEnTrimestre,
  parsearClaveTrimestre,
  rangoTrimestre,
  trimestreAnterior,
  trimestreDeFecha,
  trimestreSiguiente,
} from '../../src/dominio/trimestres';

describe('fechas', () => {
  it('esFechaISO valida fechas reales', () => {
    expect(esFechaISO('2026-07-15')).toBe(true);
    expect(esFechaISO('2024-02-29')).toBe(true);
    expect(esFechaISO('2026-02-29')).toBe(false);
    expect(esFechaISO('2026-13-01')).toBe(false);
    expect(esFechaISO('2026-7-15')).toBe(false);
    expect(esFechaISO(20260715)).toBe(false);
  });

  it('hoyISO usa la fecha local, sin zona horaria', () => {
    expect(hoyISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('deSerialExcel convierte números de serie de Excel', () => {
    expect(deSerialExcel(45658)).toBe('2025-01-01');
    expect(deSerialExcel(46218)).toBe('2026-07-15');
    expect(deSerialExcel(46218.75)).toBe('2026-07-15'); // con hora
    expect(deSerialExcel(0)).toBeNull();
    expect(deSerialExcel(-5)).toBeNull();
  });

  it.each<[unknown, string | null]>([
    [46218, '2026-07-15'],
    ['2026-07-15', '2026-07-15'],
    ['2026-07-15 14:30:00', '2026-07-15'],
    ['2026-7-5', '2026-07-05'],
    ['07/15/2026', '2026-07-15'], // MM/DD/AAAA
    ['03/04/2026', '2026-03-04'], // ambigua → MM/DD
    ['15/07/2026', '2026-07-15'], // primer número > 12 → DD/MM
    ['31/12/2026', '2026-12-31'],
    ['7/15/26', '2026-07-15'],
    ['07-15-2026', '2026-07-15'],
    ['46218', '2026-07-15'], // serie como texto (CSV)
    [new Date(2026, 6, 15), '2026-07-15'],
    ['02/30/2026', null],
    ['13/13/2026', null],
    ['ayer', null],
    ['', null],
    [null, null],
    [new Date('x'), null],
  ])('parsearFecha(%j) → %j', (entrada, esperado) => {
    expect(parsearFecha(entrada)).toBe(esperado);
  });

  it('formatearFecha', () => {
    expect(formatearFecha('2026-07-05')).toBe('05/07/2026');
  });
});

describe('trimestres', () => {
  it.each([
    ['2026-01-01', 1],
    ['2026-03-31', 1],
    ['2026-04-01', 2],
    ['2026-06-30', 2],
    ['2026-07-01', 3],
    ['2026-09-30', 3],
    ['2026-10-01', 4],
    ['2026-12-31', 4],
  ])('%s es T%i', (fecha, numero) => {
    expect(trimestreDeFecha(fecha)).toEqual({ anio: 2026, numero });
  });

  it('rangos y pertenencia', () => {
    expect(rangoTrimestre({ anio: 2026, numero: 2 })).toEqual({ desde: '2026-04-01', hasta: '2026-06-30' });
    expect(rangoTrimestre({ anio: 2026, numero: 4 })).toEqual({ desde: '2026-10-01', hasta: '2026-12-31' });
    expect(fechaEnTrimestre('2026-12-31', { anio: 2026, numero: 4 })).toBe(true);
    expect(fechaEnTrimestre('2027-01-01', { anio: 2026, numero: 4 })).toBe(false);
  });

  it('claves, etiquetas y navegación', () => {
    const t4 = { anio: 2026, numero: 4 } as const;
    expect(claveTrimestre(t4)).toBe('2026-T4');
    expect(parsearClaveTrimestre('2026-T4')).toEqual(t4);
    expect(parsearClaveTrimestre('2026-T5')).toBeNull();
    expect(etiquetaTrimestre(t4)).toBe('T4 2026 (oct–dic)');
    expect(trimestreSiguiente(t4)).toEqual({ anio: 2027, numero: 1 });
    expect(trimestreAnterior({ anio: 2027, numero: 1 })).toEqual(t4);
    expect(trimestreAnterior(t4)).toEqual({ anio: 2026, numero: 3 });
  });
});
