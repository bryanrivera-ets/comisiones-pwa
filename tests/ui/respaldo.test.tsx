// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { crearRespaldo, serializarRespaldo } from '../../src/datos/respaldo';
import { REGLAS_POR_DEFECTO } from '../../src/dominio/tipos';
import { haceCuanto, textoAvisoRespaldo } from '../../src/ui/respaldo/aviso';
import { montar } from './montar';

let descargado: { nombre: string; blob: Blob } | null;

beforeEach(() => {
  descargado = null;
  let ultimoBlob: Blob | undefined;
  URL.createObjectURL = vi.fn((b: Blob) => {
    ultimoBlob = b;
    return 'blob:prueba';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    descargado = { nombre: this.download, blob: ultimoBlob! };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function repoConDatos() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'juan', nombre: 'Juan', comision: 500, budgetTrimestral: 250000, alias: ['JP'] });
  await repo.guardarFactura({
    id: 'f1', numero: 'INV/1', cliente: 'X', vendedorId: 'juan', fecha: '2026-07-10', montoSinImpuestos: 200000, total: null, origen: 'manual',
  });
  await repo.agregarPago({ id: 'p1', facturaId: 'f1', fecha: '2026-10-15', monto: 100000, cobroPrevio: false, origen: 'manual' });
  return repo;
}

describe('aviso de respaldo', () => {
  const ahora = new Date('2026-11-25T12:00:00Z');
  it('avisa si nunca hubo respaldo o si pasaron 7 días o más', () => {
    expect(textoAvisoRespaldo(null, false, ahora)).toBeNull();
    expect(textoAvisoRespaldo(null, true, ahora)).toContain('Aún no has hecho ningún respaldo');
    expect(textoAvisoRespaldo('2026-11-20T12:00:00Z', true, ahora)).toBeNull();
    expect(textoAvisoRespaldo('2026-11-18T12:00:00Z', true, ahora)).toBe('Tu último respaldo fue hace 7 días.');
  });

  it('haceCuanto', () => {
    expect(haceCuanto('2026-11-25T08:00:00Z', ahora)).toBe('hoy');
    expect(haceCuanto('2026-11-24T08:00:00Z', ahora)).toBe('ayer');
    expect(haceCuanto('2026-11-01T08:00:00Z', ahora)).toBe('hace 24 días');
  });

  it('aparece en las demás pantallas y desaparece al exportar', async () => {
    const repo = await repoConDatos();
    montar('/facturas', repo);
    expect((await screen.findByText(/Aún no has hecho ningún respaldo/)).closest('[role=status]')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Hacer respaldo' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar respaldo' }));
    await screen.findByText(/Respaldo listo/);
    fireEvent.click(screen.getByRole('link', { name: /Facturas/ }));
    await screen.findByRole('heading', { name: 'Facturas y pagos' });
    expect(screen.queryByText(/Aún no has hecho ningún respaldo/)).toBeNull();
  });
});

describe('pantalla Respaldo', () => {
  it('exporta un JSON válido con todos los datos y anota la fecha', async () => {
    const repo = await repoConDatos();
    montar('/respaldo', repo);
    expect((await screen.findByText('Nunca')).textContent).toBe('Nunca');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar respaldo' }));
    await screen.findByText(/Respaldo listo: comisiones-respaldo-\d{4}-\d{2}-\d{2}\.json/);

    expect(descargado!.nombre).toMatch(/^comisiones-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(await descargado!.blob.text());
    expect(json).toMatchObject({ app: 'comisiones-pwa', version: 1 });
    expect(json.datos.vendedores[0].alias).toEqual(['JP']);
    expect(json.datos.pagos).toHaveLength(1);
    expect(await repo.obtenerUltimoRespaldo()).not.toBeNull();
    await waitFor(() => expect(screen.getByText(/\(hoy\)/)).toBeTruthy());
  });

  it('restaura un respaldo tras confirmar y reemplaza todo', async () => {
    const origen = await repoConDatos();
    const texto = serializarRespaldo(crearRespaldo(await origen.obtenerTodo(), new Date('2026-11-20T15:30:00Z')));

    const destino = new RepositorioMemoria();
    await destino.guardarVendedor({ id: 'otro', nombre: 'Otro', comision: 100, budgetTrimestral: null, alias: [] });
    montar('/respaldo', destino);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.change(await screen.findByLabelText('Archivo de respaldo'), {
      target: { files: [new File([texto], 'respaldo.json', { type: 'application/json' })] },
    });
    expect((await screen.findByText(/respaldo del/)).textContent).toContain('1 vendedor(es), 1 factura(s) y 1 pago(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazar todos los datos' }));
    expect(confirmar.mock.calls[0]![0]).toContain('Se borrarán los datos actuales (1 vendedor(es), 0 factura(s) y 0 pago(s))');

    await screen.findByText(/Datos restaurados del respaldo/);
    const datos = await destino.obtenerTodo();
    expect(datos.vendedores.map((v) => v.nombre)).toEqual(['Juan']);
    expect(datos.facturas).toHaveLength(1);
    expect(await destino.obtenerUltimoRespaldo()).toBe('2026-11-20T15:30:00.000Z');
  });

  it('si no se confirma, no cambia nada', async () => {
    const origen = await repoConDatos();
    const texto = serializarRespaldo(crearRespaldo(await origen.obtenerTodo()));
    const destino = new RepositorioMemoria();
    montar('/respaldo', destino);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.change(await screen.findByLabelText('Archivo de respaldo'), { target: { files: [new File([texto], 'r.json')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Reemplazar todos los datos' }));
    expect(await destino.listarVendedores()).toEqual([]);
  });

  it('un archivo inválido muestra los errores y no se puede restaurar', async () => {
    montar('/respaldo', new RepositorioMemoria());
    const malo = JSON.stringify({
      app: 'comisiones-pwa', version: 1, exportado: 'x',
      datos: { vendedores: [], facturas: [], pagos: [{ id: 'p', facturaId: 'nada', fecha: '2026-01-01', monto: 5, cobroPrevio: false, origen: 'manual' }], reglas: REGLAS_POR_DEFECTO, importaciones: [] },
    });
    fireEvent.change(await screen.findByLabelText('Archivo de respaldo'), { target: { files: [new File([malo], 'malo.json')] } });
    expect((await screen.findByRole('alert')).textContent).toBe('Hay 1 pago(s) de una factura que no existe.');
    expect(screen.queryByRole('button', { name: 'Reemplazar todos los datos' })).toBeNull();
  });

  it('muestra el historial de importaciones', async () => {
    const repo = await repoConDatos();
    await repo.aplicarImportacion({
      registro: {
        id: 'imp1', fechaHora: '2026-11-24T14:05:00.000Z', archivo: 'odoo-noviembre.xlsx', primeraCarga: true,
        resumen: { facturasNuevas: 3, pagosNuevos: 2, montoPagosNuevos: 250000, sinCambios: 0, omitidas: 1, paraRevisar: 1 },
      },
      vendedoresNuevos: [], aliasNuevos: [], facturasNuevas: [], pagosNuevos: [],
    });
    montar('/respaldo', repo);
    const fila = (await screen.findByText('odoo-noviembre.xlsx')).closest('li')!;
    expect(fila.textContent).toContain('3 factura(s) nueva(s), 2 pago(s) por $2,500.00, 1 para revisar · primera carga');
  });
});
