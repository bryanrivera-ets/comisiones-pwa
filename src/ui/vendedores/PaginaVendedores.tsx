import { useState } from 'react';
import { formatearPorcentaje, formatearUSD } from '../../dominio/dinero';
import type { Vendedor } from '../../dominio/tipos';
import { Cargando, Dialogo, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useDatos, useRepositorio } from '../datos';
import { FormularioReglas } from './FormularioReglas';
import { FormularioVendedor } from './FormularioVendedor';

export function PaginaVendedores() {
  const datos = useDatos();
  const repositorio = useRepositorio();
  const { errores, ejecutar } = useAccion();
  const [editando, setEditando] = useState<Vendedor | 'nuevo' | null>(null);

  if (!datos) return <Cargando />;

  const vendedores = [...datos.vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const facturasDe = (id: string) => datos.facturas.filter((f) => f.vendedorId === id).length;

  function eliminar(v: Vendedor) {
    if (!window.confirm(`¿Eliminar a ${v.nombre}?`)) return;
    void ejecutar(() => repositorio.eliminarVendedor(v.id));
  }

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Vendedores y reglas</h1>
        <button className="boton boton-primario" onClick={() => setEditando('nuevo')}>
          + Nuevo vendedor
        </button>
      </div>

      <ListaErrores errores={errores} />

      {vendedores.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Aún no hay vendedores.</p>
          <p className="texto-tenue">Agrega a cada vendedor con su porcentaje de comisión y su budget trimestral.</p>
        </div>
      ) : (
        <ul className="rejilla-tarjetas" aria-label="Vendedores">
          {vendedores.map((v) => {
            const n = facturasDe(v.id);
            return (
              <li key={v.id} className="tarjeta tarjeta-vendedor">
                <h3>{v.nombre}</h3>
                <dl className="datos-clave">
                  <div>
                    <dt>Comisión</dt>
                    <dd>{formatearPorcentaje(v.comision)}</dd>
                  </div>
                  <div>
                    <dt>Budget trimestral</dt>
                    <dd>{v.budgetTrimestral === null ? <span className="texto-tenue">Sin budget</span> : formatearUSD(v.budgetTrimestral)}</dd>
                  </div>
                  <div>
                    <dt>Facturas</dt>
                    <dd>{n}</dd>
                  </div>
                </dl>
                <div className="alias">
                  <span className="texto-tenue">Alias en Odoo:</span>{' '}
                  {v.alias.length === 0 ? (
                    <span className="texto-tenue">ninguno</span>
                  ) : (
                    <ul className="chips chips-en-linea">
                      {v.alias.map((a) => (
                        <li key={a} className="chip">
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="acciones">
                  <button
                    className="boton boton-texto boton-peligro"
                    onClick={() => eliminar(v)}
                    disabled={n > 0}
                    title={n > 0 ? 'No se puede eliminar un vendedor con facturas' : undefined}
                  >
                    Eliminar
                  </button>
                  <button className="boton" onClick={() => setEditando(v)} aria-label={`Editar a ${v.nombre}`}>
                    Editar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="titulo-seccion">Reglas de comisión</h2>
      <FormularioReglas reglas={datos.reglas} />

      {editando && (
        <Dialogo titulo={editando === 'nuevo' ? 'Nuevo vendedor' : `Editar a ${editando.nombre}`} alCerrar={() => setEditando(null)}>
          <FormularioVendedor
            vendedor={editando === 'nuevo' ? undefined : editando}
            alGuardar={() => setEditando(null)}
            alCancelar={() => setEditando(null)}
          />
        </Dialogo>
      )}
    </section>
  );
}
