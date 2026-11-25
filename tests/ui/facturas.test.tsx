// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { montar } from './montar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const escribir = (campo: HTMLElement, valor: string) => fireEvent.change(campo, { target: { value: valor } });

async function repoConVendedora() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'ana', nombre: 'Ana', comision: 500, budgetTrimestral: null, alias: [] });
  return repo;
}

async function crearFactura(numero: string, fecha: string, monto: string) {
  fireEvent.click(await screen.findByRole('button', { name: '+ Nueva factura' }));
  const dialogo = screen.getByRole('dialog', { name: 'Nueva factura' });
  escribir(within(dialogo).getByLabelText('Número de factura'), numero);
  escribir(within(dialogo).getByLabelText('Cliente'), 'Ferretería López');
  escribir(within(dialogo).getByLabelText('Fecha de factura'), fecha);
  escribir(within(dialogo).getByLabelText(/^Monto sin impuestos/), monto);
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar factura' }));
}

describe('pantalla Facturas y pagos', () => {
  it('sin vendedores, pide crear uno primero', async () => {
    montar('/facturas');
    expect(await screen.findByText('Antes de registrar facturas, agrega al menos un vendedor.')).toBeTruthy();
  });

  it('crea una factura, valida y registra pagos parciales hasta pagarla', async () => {
    const repo = await repoConVendedora();
    montar('/facturas', repo);
    await crearFactura('inv/2026/0001', '2026-07-10', '1,000');

    // Al guardar se abre la factura nueva (con el número normalizado).
    const dialogo = await screen.findByRole('dialog', { name: 'Factura INV/2026/0001' });
    const formulario = within(dialogo).getByRole('form', { name: 'Registrar pago' });
    const fecha = within(formulario).getByLabelText('Fecha del pago');
    const monto = within(formulario).getByLabelText(/^Monto del pago/) as HTMLInputElement;
    expect(monto.value).toBe('1000.00'); // propone el balance
    const registrar = () => fireEvent.click(within(formulario).getByRole('button', { name: 'Registrar pago' }));

    escribir(fecha, '2026-07-09');
    registrar();
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(
      'El pago no puede ser anterior a la factura (10/07/2026).',
    );

    escribir(fecha, '2026-08-01');
    escribir(monto, '1200');
    registrar();
    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toBe(
        'El pago ($1,200.00) es mayor que el balance de la factura ($1,000.00).',
      ),
    );

    escribir(monto, '400');
    registrar();
    const pagos = await within(dialogo).findByRole('list', { name: 'Pagos' });
    expect(pagos.textContent).toContain('01/08/2026');
    expect(pagos.textContent).toContain('$400.00');
    // El formulario se reinicia con el nuevo balance.
    await waitFor(() => expect((within(dialogo).getByLabelText(/^Monto del pago/) as HTMLInputElement).value).toBe('600.00'));

    fireEvent.click(within(dialogo).getByLabelText(/^Cobro previo/));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(within(dialogo).queryByRole('form', { name: 'Registrar pago' })).toBeNull());
    expect(within(dialogo).getByText('Cobro previo')).toBeTruthy();

    const guardados = await repo.listarPagos();
    expect(guardados.map((p) => [p.fecha, p.monto, p.cobroPrevio])).toEqual([
      ['2026-08-01', 40000, false],
      [expect.any(String), 60000, true],
    ]);

    // En la lista aparece pagada.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    const fila = screen.getByRole('button', { name: 'INV/2026/0001' }).closest('tr')!;
    expect(fila.textContent).toContain('Pagada');
  });

  it('filtra por estado, vendedor y texto', async () => {
    const repo = await repoConVendedora();
    await repo.guardarVendedor({ id: 'beto', nombre: 'Beto', comision: 500, budgetTrimestral: null, alias: [] });
    const factura = (id: string, numero: string, vendedorId: string, cliente: string) => ({
      id, numero, cliente, vendedorId, fecha: '2026-07-01', montoSinImpuestos: 10000, total: null, origen: 'manual' as const,
    });
    await repo.guardarFactura(factura('f1', 'A-1', 'ana', 'Panadería Sol'));
    await repo.guardarFactura(factura('f2', 'A-2', 'ana', 'Taller Luna'));
    await repo.guardarFactura(factura('f3', 'B-1', 'beto', 'Panadería Sol'));
    await repo.agregarPago({ id: 'p1', facturaId: 'f2', fecha: '2026-07-02', monto: 10000, cobroPrevio: false, origen: 'manual' });
    montar('/facturas', repo);

    const numeros = () => screen.queryAllByRole('button', { name: /^[AB]-\d$/ }).map((b) => b.textContent);
    await waitFor(() => expect(numeros()).toHaveLength(3));

    fireEvent.click(screen.getByRole('radio', { name: 'Pagadas' }));
    expect(numeros()).toEqual(['A-2']);
    fireEvent.click(screen.getByRole('radio', { name: 'Abiertas' }));
    expect(numeros().sort()).toEqual(['A-1', 'B-1']);
    fireEvent.change(screen.getByLabelText('Vendedor'), { target: { value: 'beto' } });
    expect(numeros()).toEqual(['B-1']);
    fireEvent.click(screen.getByRole('radio', { name: 'Todas' }));
    fireEvent.change(screen.getByLabelText('Vendedor'), { target: { value: '' } });
    escribir(screen.getByLabelText('Buscar'), 'panaderia');
    expect(numeros().sort()).toEqual(['A-1', 'B-1']);
    expect(screen.getByText(/2 factura\(s\) · Balance abierto \$200\.00/)).toBeTruthy();
  });

  it('quita un pago y elimina la factura tras confirmar', async () => {
    const repo = await repoConVendedora();
    await repo.guardarFactura({
      id: 'f1', numero: 'F-1', cliente: 'X', vendedorId: 'ana', fecha: '2026-07-01', montoSinImpuestos: 10000, total: null, origen: 'manual',
    });
    await repo.agregarPago({ id: 'p1', facturaId: 'f1', fecha: '2026-07-05', monto: 3000, cobroPrevio: false, origen: 'manual' });
    montar('/facturas', repo);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);

    fireEvent.click(await screen.findByRole('button', { name: 'F-1' }));
    const dialogo = screen.getByRole('dialog', { name: 'Factura F-1' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar pago del 05/07/2026' }));
    expect(confirmar).toHaveBeenLastCalledWith('¿Quitar el pago de $30.00 del 05/07/2026?');
    expect(await within(dialogo).findByText('Sin pagos registrados.')).toBeTruthy();

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar factura' }));
    expect(confirmar).toHaveBeenLastCalledWith('¿Eliminar la factura F-1? No se puede deshacer.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Aún no hay facturas.')).toBeTruthy();
    expect(await repo.listarFacturas()).toEqual([]);
  });

  it('editar una factura no permite bajar el monto de lo pagado', async () => {
    const repo = await repoConVendedora();
    await repo.guardarFactura({
      id: 'f1', numero: 'F-1', cliente: 'X', vendedorId: 'ana', fecha: '2026-07-01', montoSinImpuestos: 10000, total: null, origen: 'manual',
    });
    await repo.agregarPago({ id: 'p1', facturaId: 'f1', fecha: '2026-07-05', monto: 6000, cobroPrevio: false, origen: 'manual' });
    montar('/facturas', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'F-1' }));
    const dialogo = screen.getByRole('dialog', { name: 'Factura F-1' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Editar factura' }));
    escribir(within(dialogo).getByLabelText(/^Monto sin impuestos/), '50');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar factura' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe('El monto no puede ser menor que lo ya pagado ($60.00).');
  });
});
