import { Link, useLocation } from 'react-router-dom';
import { useDatos, useUltimoRespaldo } from '../datos';
import { textoAvisoRespaldo } from './aviso';

/** Franja que recuerda hacer respaldo (no se muestra en la propia pantalla de Respaldo). */
export function AvisoRespaldo() {
  const datos = useDatos();
  const ultimo = useUltimoRespaldo();
  const { pathname } = useLocation();
  if (!datos || ultimo === undefined || pathname === '/respaldo') return null;
  const texto = textoAvisoRespaldo(ultimo, datos.facturas.length > 0 || datos.vendedores.length > 0);
  if (!texto) return null;
  return (
    <div className="aviso-respaldo" role="status">
      <span>💾 {texto}</span>
      <Link to="/respaldo">Hacer respaldo</Link>
    </div>
  );
}
