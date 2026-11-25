import { describe, expect, it } from 'vitest';
import { ErrorValidacion } from '../../src/datos/Repositorio';
import { crearRespaldo, leerRespaldo, nombreArchivoRespaldo, serializarRespaldo } from '../../src/datos/respaldo';
import { REGLAS_POR_DEFECTO } from '../../src/dominio/tipos';

function errores(texto: string): string[] {
  try {
    leerRespaldo(texto);
  } catch (e) {
    if (e instanceof ErrorValidacion) return e.errores;
    throw e;
  }
  throw new Error('Se esperaba un error');
}

const vacio = () => ({ vendedores: [], facturas: [], pagos: [], reglas: REGLAS_POR_DEFECTO, importaciones: [] });

describe('archivo de respaldo', () => {
  it('ida y vuelta', () => {
    const archivo = crearRespaldo(vacio(), new Date('2026-11-24T15:00:00Z'));
    expect(leerRespaldo(serializarRespaldo(archivo))).toEqual(archivo);
    expect(archivo).toMatchObject({ app: 'comisiones-pwa', version: 1, exportado: '2026-11-24T15:00:00.000Z' });
  });

  it('nombre del archivo con la fecha local', () => {
    expect(nombreArchivoRespaldo(new Date(2026, 10, 24, 23, 0))).toBe('comisiones-respaldo-2026-11-24.json');
  });

  it('rechaza lo que no es JSON o no es de esta app', () => {
    expect(errores('esto no es json')).toEqual(['El archivo no es un JSON válido.']);
    expect(errores('{"hola": 1}')).toEqual(['El archivo no es un respaldo de esta app.']);
  });

  it('rechaza respaldos de una versión más nueva', () => {
    const texto = JSON.stringify({ ...crearRespaldo(vacio()), version: 99 });
    expect(errores(texto)[0]).toContain('versión más nueva');
  });

  it('explica en español los campos inválidos', () => {
    const archivo = crearRespaldo(vacio()) as unknown as { datos: Record<string, unknown> };
    archivo.datos.vendedores = [{ id: 'v1', nombre: 'Ana', budgetTrimestral: '100', comision: 500, alias: [] }];
    archivo.datos.facturas = [
      { id: 'f1', numero: 'F1', cliente: '', vendedorId: 'v1', fecha: '15/07/2026', montoSinImpuestos: 10.5, total: null, origen: 'manual' },
    ];
    const msgs = errores(JSON.stringify(archivo));
    expect(msgs).toContain('datos.vendedores.0.budgetTrimestral: Entrada inválida: se esperaba número, recibido texto');
    expect(msgs.some((m) => m.startsWith('datos.facturas.0.fecha: Fecha inválida'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('datos.facturas.0.montoSinImpuestos:'))).toBe(true);
  });

  it('detecta referencias rotas', () => {
    const archivo = crearRespaldo({
      ...vacio(),
      pagos: [{ id: 'p1', facturaId: 'nada', fecha: '2026-07-01', monto: 100, cobroPrevio: false, origen: 'manual' }],
    });
    expect(errores(serializarRespaldo(archivo))).toEqual(['Hay 1 pago(s) de una factura que no existe.']);
  });
});
