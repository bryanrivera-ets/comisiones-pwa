import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from './componentes/comunes';
import { Layout } from './Layout';
import { PaginaResumen } from './resumen/PaginaResumen';
import { PaginaFacturas } from './facturas/PaginaFacturas';
import { PaginaVendedores } from './vendedores/PaginaVendedores';

// Pantallas con librerías pesadas (SheetJS, zod): se cargan al abrirlas.
// Igual quedan en la caché del service worker para usarse sin conexión.
const PaginaImportar = lazy(() => import('./importar/PaginaImportar').then((m) => ({ default: m.PaginaImportar })));
const PaginaRespaldo = lazy(() => import('./respaldo/PaginaRespaldo').then((m) => ({ default: m.PaginaRespaldo })));

const diferida = (pagina: ReactNode) => <Suspense fallback={<Cargando />}>{pagina}</Suspense>;

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PaginaResumen />} />
        <Route path="facturas" element={<PaginaFacturas />} />
        <Route path="facturas/importar" element={diferida(<PaginaImportar />)} />
        <Route path="vendedores" element={<PaginaVendedores />} />
        <Route path="respaldo" element={diferida(<PaginaRespaldo />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
