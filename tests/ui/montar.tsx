import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RepositorioMemoria } from '../../src/datos/RepositorioMemoria';
import { App } from '../../src/ui/App';
import { ProveedorRepositorio } from '../../src/ui/datos';

/** Monta la app completa en `ruta` con un repositorio en memoria. */
export function montar(ruta: string, repositorio = new RepositorioMemoria()) {
  render(
    <ProveedorRepositorio repositorio={repositorio}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
      </MemoryRouter>
    </ProveedorRepositorio>,
  );
  return repositorio;
}
