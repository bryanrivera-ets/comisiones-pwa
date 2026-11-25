import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { RepositorioDexie } from './datos/RepositorioDexie';
import { pedirAlmacenamientoPersistente } from './ui/almacenamiento';
import { escucharInstalacion } from './ui/instalacion';
import { App } from './ui/App';
import { AvisoActualizacion } from './ui/AvisoActualizacion';
import { ProveedorRepositorio } from './ui/datos';
import './ui/estilos.css';
import './ui/estilos-componentes.css';

// Para cambiar a un backend compartido u Odoo, basta con otra implementación de Repositorio aquí.
const repositorio = new RepositorioDexie('comisiones');

// Que el navegador no borre los datos por falta de espacio (mejor esfuerzo; no bloquea el inicio).
void pedirAlmacenamientoPersistente();

// El botón "Instalar app" necesita el aviso del navegador, que puede llegar antes de montar React.
escucharInstalacion();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProveedorRepositorio repositorio={repositorio}>
      <HashRouter>
        <App />
      </HashRouter>
    </ProveedorRepositorio>
    <AvisoActualizacion />
  </StrictMode>,
);
