// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { montar } from './montar';

afterEach(cleanup);

function archivo(nombre: string): File {
  // Vitest corre desde la raíz del proyecto (en jsdom, import.meta.url no es una ruta de archivo).
  return new File([readFileSync(`tests/fixtures/${nombre}`)], nombre);
}

async function repoInicial() {
  const repo = new RepositorioMemoria();
  await repo.guardarVendedor({ id: 'juan', nombre: 'Juan Pérez', comision: 500, budgetTrimestral: 250000, alias: [] });
  await repo.guardarVendedor({ id: 'maria', nombre: 'María González', comision: 500, budgetTrimestral: 400000, alias: [] });
  return repo;
}

async function subir(nombre: string) {
  fireEvent.change(await screen.findByLabelText('Archivo de Odoo'), { target: { files: [archivo(nombre)] } });
  await screen.findByText(nombre);
}

const cifra = (titulo: string) =>
  within(screen.getByRole('list', { name: 'Resumen de la importación' }))
    .getByText(titulo)
    .closest('li')!
    .querySelector('strong')!.textContent;

describe('pantalla de importación', () => {
  it('se llega desde Facturas', async () => {
    montar('/facturas', await repoInicial());
    fireEvent.click(await screen.findByRole('link', { name: 'Importar Excel de Odoo' }));
    expect(await screen.findByRole('heading', { name: 'Importar facturas de Odoo' })).toBeTruthy();
  });

  it('primera carga: detecta columnas, resuelve vendedores, resume y guarda', async () => {
    const repo = await repoInicial();
    montar('/facturas/importar', repo);
    await subir('odoo-facturas-1.xlsx');

    // Columnas detectadas y fila de encabezados (debajo de 2 títulos).
    expect((screen.getByLabelText('Fila de encabezados') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText(/^Base imponible/) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe('F: Impuestos no incluidos');

    // Mientras haya vendedores sin resolver, no se puede guardar.
    const guardar = screen.getByRole('button', { name: 'Guardar importación' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(screen.getByText(/Falta indicar quién es: “María G.”, “Pedro Ramos”/)).toBeTruthy();

    const maria = screen.getByRole('group', { name: /María G\./ });
    fireEvent.click(within(maria).getByLabelText('Es un vendedor existente'));
    fireEvent.change(within(maria).getByLabelText('Vendedor existente para María G.'), { target: { value: 'maria' } });
    const pedro = screen.getByRole('group', { name: /Pedro Ramos/ });
    fireEvent.click(within(pedro).getByLabelText('Crear vendedor nuevo'));
    fireEvent.change(within(pedro).getByLabelText('Comisión (%) de Pedro Ramos'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText(/^Primera carga/));

    await waitFor(() => expect(guardar.disabled).toBe(false));
    expect(cifra('Facturas nuevas')).toBe('4');
    expect(cifra('Pagos nuevos')).toBe('2');
    expect(cifra('Omitidas')).toBe('2');
    expect(screen.getByText('$2,500.00')).toBeTruthy();
    expect(screen.getByText('Nota de crédito o monto menor o igual a cero.')).toBeTruthy();
    expect(screen.getByText('Sin vendedor.')).toBeTruthy();

    fireEvent.click(guardar);
    expect(await screen.findByRole('heading', { name: 'Importación guardada' })).toBeTruthy();
    expect(screen.getByText(/como primera carga/)).toBeTruthy();

    const datos = await repo.obtenerTodo();
    expect(datos.facturas).toHaveLength(4);
    expect(datos.pagos.every((p) => p.cobroPrevio)).toBe(true);
    expect(datos.vendedores.find((v) => v.nombre === 'Pedro Ramos')!.comision).toBe(400);
    expect(datos.vendedores.find((v) => v.id === 'maria')!.alias).toEqual(['María G.']);
  });

  it('segunda importación: pagos nuevos, vendedor por defecto y filas para revisar', async () => {
    const repo = await repoInicial();
    montar('/facturas/importar', repo);
    await subir('odoo-facturas-1.xlsx');
    const maria = screen.getByRole('group', { name: /María G\./ });
    fireEvent.click(within(maria).getByLabelText('Es un vendedor existente'));
    fireEvent.change(within(maria).getByLabelText('Vendedor existente para María G.'), { target: { value: 'maria' } });
    const pedro = screen.getByRole('group', { name: /Pedro Ramos/ });
    fireEvent.click(within(pedro).getByLabelText('Crear vendedor nuevo'));
    fireEvent.change(within(pedro).getByLabelText('Comisión (%) de Pedro Ramos'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText(/^Primera carga/));
    const guardar = () => screen.getByRole('button', { name: 'Guardar importación' }) as HTMLButtonElement;
    await waitFor(() => expect(guardar().disabled).toBe(false));
    fireEvent.click(guardar());
    fireEvent.click(await screen.findByRole('button', { name: 'Importar otro archivo' }));

    await subir('odoo-facturas-2.xlsx');
    expect(screen.queryByRole('heading', { name: /Vendedores que no se reconocen/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Fecha para pagos sin fecha/), { target: { value: '2026-12-15' } });
    fireEvent.change(screen.getByLabelText(/^Filas sin vendedor/), { target: { value: 'juan' } });

    await waitFor(() => expect(cifra('Pagos nuevos')).toBe('4'));
    expect(cifra('Facturas nuevas')).toBe('2');
    expect(cifra('Sin cambios')).toBe('1');
    expect(cifra('Para revisar')).toBe('1');
    expect(screen.getByText('Monto distinto: Odoo $850.00, registrado $800.00.')).toBeTruthy();

    fireEvent.click(guardar());
    await screen.findByRole('heading', { name: 'Importación guardada' });
    const pagos = await repo.listarPagos();
    expect(pagos.filter((p) => !p.cobroPrevio).map((p) => p.fecha)).toEqual(['2026-12-15', '2026-12-15', '2026-12-15', '2026-12-15']);
  });

  it('subir lo mismo otra vez: no hay nada que guardar', async () => {
    const repo = await repoInicial();
    await repo.guardarVendedor({ id: 'pedro', nombre: 'Pedro Ramos', comision: 500, budgetTrimestral: null, alias: [] });
    await repo.guardarVendedor({ id: 'maria', nombre: 'María González', comision: 500, budgetTrimestral: 400000, alias: ['María G.'] });
    montar('/facturas/importar', repo);
    await subir('odoo-facturas-1.csv');
    await waitFor(() => expect(cifra('Facturas nuevas')).toBe('4'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar importación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Importar otro archivo' }));
    await subir('odoo-facturas-1.csv');
    await waitFor(() => expect(cifra('Sin cambios')).toBe('4'));
    expect(screen.getByText('No hay nada nuevo que guardar.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Guardar importación' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('un archivo que no es el reporte de Odoo lo dice claramente', async () => {
    montar('/facturas/importar', await repoInicial());
    fireEvent.change(await screen.findByLabelText('Archivo de Odoo'), {
      target: { files: [new File([new Uint8Array([0, 159, 146, 150, 0, 1, 2])], 'foto.xlsx')] },
    });
    expect(await screen.findByText(/No se reconoció ninguna columna/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar importación' })).toBeNull();
  });
});
