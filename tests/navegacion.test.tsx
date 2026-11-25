// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { montar } from './ui/montar';

afterEach(cleanup);

describe('navegación', () => {
  it('muestra las cuatro secciones en español', () => {
    montar('/');
    for (const texto of ['Resumen', 'Facturas', 'Vendedores', 'Respaldo']) {
      expect(screen.getByRole('link', { name: new RegExp(texto) })).toBeTruthy();
    }
  });

  it.each([
    ['/', 'Resumen del trimestre'],
    ['/facturas', 'Facturas y pagos'],
    ['/vendedores', 'Vendedores y reglas'],
    ['/respaldo', 'Respaldo'],
  ])('la ruta %s abre "%s"', async (ruta, titulo) => {
    montar(ruta);
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(titulo);
  });

  it('una ruta desconocida regresa al resumen', async () => {
    montar('/no-existe');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Resumen del trimestre');
  });
});
