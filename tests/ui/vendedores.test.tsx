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

async function abrirNuevoVendedor() {
  fireEvent.click(await screen.findByRole('button', { name: '+ Nuevo vendedor' }));
  return screen.getByRole('dialog', { name: 'Nuevo vendedor' });
}

describe('pantalla Vendedores y reglas', () => {
  it('crea un vendedor con porcentaje, budget y alias', async () => {
    const repo = montar('/vendedores');
    const dialogo = await abrirNuevoVendedor();
    escribir(within(dialogo).getByLabelText('Nombre'), 'Juan Pérez');
    escribir(within(dialogo).getByLabelText(/^Comisión/), '5');
    escribir(within(dialogo).getByLabelText(/^Budget trimestral/), '2,500');
    const alias = within(dialogo).getByLabelText('Nuevo alias');
    escribir(alias, 'JUAN P');
    fireEvent.keyDown(alias, { key: 'Enter' });
    escribir(alias, 'jperez'); // escrito pero sin pulsar Agregar: también se guarda
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const tarjeta = screen.getByRole('heading', { name: 'Juan Pérez' }).closest('li')!;
    expect(tarjeta.textContent).toContain('5%');
    expect(tarjeta.textContent).toContain('$2,500.00');
    expect(within(tarjeta).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['JUAN P', 'jperez']);
    expect((await repo.listarVendedores())[0]).toMatchObject({ comision: 500, budgetTrimestral: 250000 });
  });

  it('un vendedor sin budget muestra "Sin budget"', async () => {
    montar('/vendedores');
    const dialogo = await abrirNuevoVendedor();
    escribir(within(dialogo).getByLabelText('Nombre'), 'Pedro');
    escribir(within(dialogo).getByLabelText(/^Comisión/), '2.5');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    const tarjeta = (await screen.findByRole('heading', { name: 'Pedro' })).closest('li')!;
    expect(tarjeta.textContent).toContain('2.5%');
    expect(tarjeta.textContent).toContain('Sin budget');
  });

  it('muestra los errores y no cierra el diálogo', async () => {
    const repo = new RepositorioMemoria();
    await repo.guardarVendedor({ id: 'v1', nombre: 'Juan', comision: 500, budgetTrimestral: null, alias: ['JP'] });
    montar('/vendedores', repo);
    const dialogo = await abrirNuevoVendedor();
    escribir(within(dialogo).getByLabelText('Nombre'), 'Juana');
    escribir(within(dialogo).getByLabelText(/^Comisión/), 'cinco');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toContain('entre 0 y 100');

    escribir(within(dialogo).getByLabelText(/^Comisión/), '5');
    escribir(within(dialogo).getByLabelText('Nuevo alias'), 'jp');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(within(dialogo).getByRole('alert').textContent).toBe('"JP" ya pertenece a Juan.'));
    expect(await repo.listarVendedores()).toHaveLength(1);
  });

  it('edita un vendedor existente', async () => {
    const repo = new RepositorioMemoria();
    await repo.guardarVendedor({ id: 'v1', nombre: 'Juan', comision: 500, budgetTrimestral: 250000, alias: ['JP'] });
    montar('/vendedores', repo);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar a Juan' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar a Juan' });
    expect((within(dialogo).getByLabelText(/^Budget trimestral/) as HTMLInputElement).value).toBe('2500.00');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar alias JP' }));
    escribir(within(dialogo).getByLabelText(/^Budget trimestral/), '');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await repo.listarVendedores()).toEqual([{ id: 'v1', nombre: 'Juan', comision: 500, budgetTrimestral: null, alias: [] }]);
  });

  it('elimina un vendedor sin facturas tras confirmar', async () => {
    const repo = new RepositorioMemoria();
    await repo.guardarVendedor({ id: 'v1', nombre: 'Juan', comision: 500, budgetTrimestral: null, alias: [] });
    montar('/vendedores', repo);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    expect(confirmar).toHaveBeenCalledWith('¿Eliminar a Juan?');
    expect(await screen.findByText('Aún no hay vendedores.')).toBeTruthy();
  });

  it('guarda las reglas configurables', async () => {
    const repo = montar('/vendedores');
    escribir(await screen.findByLabelText(/^Descuento si no alcanza/), '10');
    fireEvent.click(screen.getByLabelText(/Lo cobrado en el trimestre/));
    fireEvent.click(screen.getByLabelText(/El trimestre en que se emitió la factura/));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas' }));
    expect(await screen.findByText('✓ Reglas guardadas')).toBeTruthy();
    expect(await repo.obtenerReglas()).toEqual({ descuento: 1000, baseBudget: 'cobrado', baseDescuento: 'trimestreFactura' });
  });
});
