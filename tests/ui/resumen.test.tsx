// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { montar } from './montar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** El escenario del enunciado. */
async function escenario() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'juan', nombre: 'Juan', comision: 500, budgetTrimestral: 250000, alias: [] });
  await repo.guardarVendedor({ id: 'maria', nombre: 'María', comision: 500, budgetTrimestral: 400000, alias: [] });
  const F = (id: string, vendedorId: string, fecha: string, monto: number) => ({
    id, numero: id.toUpperCase(), cliente: `Cliente ${id}`, vendedorId, fecha, montoSinImpuestos: monto, total: null, origen: 'manual' as const,
  });
  await repo.guardarFactura(F('j1', 'juan', '2026-07-10', 200000));
  await repo.guardarFactura(F('j2', 'juan', '2026-07-20', 100000));
  await repo.guardarFactura(F('m1', 'maria', '2026-10-05', 500000));
  const P = (id: string, facturaId: string, fecha: string, monto: number) => ({
    id, facturaId, fecha, monto, cobroPrevio: false, origen: 'manual' as const,
  });
  await repo.agregarPago(P('p1', 'j1', '2026-10-15', 100000));
  await repo.agregarPago(P('p2', 'j1', '2026-12-10', 100000));
  await repo.agregarPago(P('p3', 'j2', '2026-10-20', 100000));
  await repo.agregarPago(P('p4', 'm1', '2026-12-15', 250000));
  return repo;
}

const tarjeta = async (nombre: string) => screen.findByRole('article', { name: nombre });

describe('pantalla Resumen del trimestre', () => {
  it('muestra las tarjetas del escenario en T4 2026', async () => {
    montar('/?t=2026-T4', await escenario());

    const juan = await tarjeta('Juan');
    expect(juan.textContent).toContain('Budget no alcanzado');
    expect(juan.textContent).toContain('Neto a pagar$120.00');
    expect(juan.textContent).toContain('Cobrado en el trimestre$3,000.00');
    expect(juan.textContent).toContain('Comisión completa (5%)$150.00');
    expect(juan.textContent).toContain('Descuento por budget (20%)−$30.00');
    expect(juan.textContent).toContain('Comisión pendiente$0.00');
    expect(juan.textContent).toContain('No alcanzó el budget de T4 2026.');
    expect(juan.textContent).toContain('$0.00 de $2,500.00 · 0%');

    const maria = await tarjeta('María');
    expect(maria.textContent).toContain('Budget alcanzado');
    expect(maria.textContent).toContain('Neto a pagar$125.00');
    expect(maria.textContent).toContain('Comisión pendiente$125.00');
    expect(maria.textContent).toContain('$5,000.00 de $4,000.00 · 125%');
    expect(within(maria).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');

    expect(screen.getByText(/Total neto a pagar en T4 2026/).textContent).toContain('$245.00');
  });

  it('lista cada pago que genera comisión, con totales', async () => {
    montar('/?t=2026-T4', await escenario());
    const tabla = await screen.findByRole('table', { name: 'Pagos que generan comisión' });
    const filas = within(tabla).getAllByRole('row');
    // encabezado + 4 pagos + total
    expect(filas).toHaveLength(6);
    expect(filas[1]!.textContent).toContain('15/10/2026');
    expect(filas[1]!.textContent).toContain('−$10.00');
    expect(filas[4]!.textContent).toContain('María');
    expect(filas[5]!.textContent).toBe('Total del trimestre$5,500.00$275.00−$30.00$245.00');
  });

  it('cambia de trimestre con las flechas y el selector', async () => {
    montar('/?t=2026-T4', await escenario());
    await tarjeta('Juan');
    fireEvent.click(screen.getByRole('button', { name: 'Trimestre anterior' }));
    await waitFor(() => expect((screen.getByLabelText('Trimestre') as HTMLSelectElement).value).toBe('2026-T3'));
    const juan = await tarjeta('Juan');
    expect(juan.textContent).toContain('Budget alcanzado');
    expect(juan.textContent).toContain('Neto a pagar$0.00');
    expect(screen.getByText('No hay pagos que generen comisión en este trimestre.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Trimestre'), { target: { value: '2026-T4' } });
    await waitFor(() => expect((screen.getByLabelText('Trimestre') as HTMLSelectElement).value).toBe('2026-T4'));
    expect((await tarjeta('Juan')).textContent).toContain('Neto a pagar$120.00');
  });

  it('sin parámetro abre el trimestre actual', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2027, 1, 15));
    montar('/', await escenario());
    await tarjeta('Juan');
    const selector = screen.getByLabelText('Trimestre') as HTMLSelectElement;
    expect(selector.value).toBe('2027-T1');
    expect(selector.selectedOptions[0]!.textContent).toBe('T1 2027 (ene–mar) — actual');
  });

  it('con la regla "trimestre de la factura" explica el descuento', async () => {
    const repo = await escenario();
    await repo.guardarReglas({ descuento: 2000, baseBudget: 'facturado', baseDescuento: 'trimestreFactura' });
    montar('/?t=2026-T4', repo);
    const juan = await tarjeta('Juan');
    expect(juan.textContent).toContain('Neto a pagar$150.00');
    expect(screen.getByText(/decide el trimestre de la factura/)).toBeTruthy();
  });

  it('exporta el CSV del trimestre', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:prueba';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('comisiones-2026-T4.csv');
    });

    montar('/?t=2026-T4', await escenario());
    await tarjeta('Juan');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(clic).toHaveBeenCalledOnce();
    // El archivo empieza con el BOM de UTF-8 (EF BB BF) para que Excel lea bien las tildes.
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = await blob!.text(); // text() descarta el BOM al decodificar
    expect(texto.startsWith('Trimestre,Vendedor,Fecha de pago')).toBe(true);
    expect(texto).toContain('2026-T4,María,2026-12-15');
    expect(texto).toContain('2026-T4,TOTAL,5500.00,275.00,30.00,245.00,125.00,,,');
  });

  it('sin vendedores invita a agregarlos', async () => {
    montar('/');
    expect(await screen.findByRole('link', { name: 'Agregar vendedores' })).toBeTruthy();
  });
});
