import { NavLink, Outlet } from 'react-router-dom';
import { AvisoRespaldo } from './respaldo/AvisoRespaldo';
import { useEnLinea } from './useEnLinea';

const SECCIONES = [
  { a: '/', texto: 'Resumen', icono: '📊' },
  { a: '/facturas', texto: 'Facturas', icono: '🧾' },
  { a: '/vendedores', texto: 'Vendedores', icono: '👥' },
  { a: '/respaldo', texto: 'Respaldo', icono: '💾' },
] as const;

export function Layout() {
  const enLinea = useEnLinea();
  return (
    <div className="marco">
      <header className="barra-superior">
        <img src="/logo.svg" alt="" width={28} height={28} />
        <span className="titulo-app">Comisiones</span>
        {!enLinea && <span className="etiqueta-sin-conexion">Sin conexión</span>}
      </header>
      <nav className="navegacion" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <NavLink key={s.a} to={s.a} end={s.a === '/'} className="enlace-nav">
            <span aria-hidden="true">{s.icono}</span>
            <span>{s.texto}</span>
          </NavLink>
        ))}
      </nav>
      <main className="contenido">
        <AvisoRespaldo />
        <Outlet />
      </main>
    </div>
  );
}
