import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearUSD, sumar } from '../../dominio/dinero';
import { formatearFecha } from '../../dominio/fechas';
import { Cargando, Dialogo } from '../componentes/comunes';
import { useDatos } from '../datos';
import { DetalleFactura } from './DetalleFactura';
import { construirFilas, filtrarFilas, FILTROS_INICIALES, type FiltroEstado, type Filtros } from './filas';
import { FormularioFactura } from './FormularioFactura';

export function PaginaFacturas() {
  const datos = useDatos();
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [creando, setCreando] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(null);

  const filas = useMemo(() => (datos ? construirFilas(datos) : []), [datos]);
  const visibles = useMemo(() => filtrarFilas(filas, filtros), [filas, filtros]);

  if (!datos) return <Cargando />;

  const vendedores = [...datos.vendedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const abierta = abiertaId ? filas.find((f) => f.factura.id === abiertaId) : undefined;
  const cambiarFiltro = (cambio: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...cambio }));

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Facturas y pagos</h1>
        <div className="acciones">
          <Link className="boton" to="/facturas/importar">
            Importar Excel de Odoo
          </Link>
          <button className="boton boton-primario" onClick={() => setCreando(true)} disabled={vendedores.length === 0}>
            + Nueva factura
          </button>
        </div>
      </div>

      {vendedores.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Antes de registrar facturas, agrega al menos un vendedor.</p>
          <Link className="boton boton-primario" to="/vendedores">
            Ir a Vendedores
          </Link>
        </div>
      ) : (
        <>
          <div className="filtros" role="search">
            <label className="campo">
              <span className="campo-etiqueta">Vendedor</span>
              <select value={filtros.vendedorId} onChange={(e) => cambiarFiltro({ vendedorId: e.target.value })}>
                <option value="">Todos</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="campo">
              <span className="campo-etiqueta" id="etiqueta-estado">
                Estado
              </span>
              <div className="segmentado" role="radiogroup" aria-labelledby="etiqueta-estado">
                {(['todas', 'abiertas', 'pagadas'] as FiltroEstado[]).map((estado) => (
                  <button
                    key={estado}
                    type="button"
                    role="radio"
                    aria-checked={filtros.estado === estado}
                    className={filtros.estado === estado ? 'activo' : undefined}
                    onClick={() => cambiarFiltro({ estado })}
                  >
                    {estado[0]!.toUpperCase() + estado.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="campo campo-busqueda">
              <span className="campo-etiqueta">Buscar</span>
              <input
                type="search"
                placeholder="Número o cliente"
                value={filtros.texto}
                onChange={(e) => cambiarFiltro({ texto: e.target.value })}
              />
            </label>
          </div>

          <p className="texto-tenue" aria-live="polite">
            {visibles.length} factura(s) · Balance abierto {formatearUSD(sumar(visibles.map((f) => f.balance)))}
          </p>

          {visibles.length === 0 ? (
            <div className="tarjeta vacio">
              <p>{filas.length === 0 ? 'Aún no hay facturas.' : 'Ninguna factura coincide con los filtros.'}</p>
            </div>
          ) : (
            <div className="tabla-contenedor">
            <table className="tabla tabla-adaptable">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th className="cifra">Monto</th>
                  <th className="cifra">Pagado</th>
                  <th className="cifra">Balance</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.factura.id} onClick={() => setAbiertaId(f.factura.id)}>
                    <td data-etiqueta="Número">
                      <button className="enlace" onClick={() => setAbiertaId(f.factura.id)}>
                        {f.factura.numero}
                      </button>
                    </td>
                    <td data-etiqueta="Cliente">{f.factura.cliente || '—'}</td>
                    <td data-etiqueta="Vendedor">{f.vendedor?.nombre ?? '—'}</td>
                    <td data-etiqueta="Fecha">{formatearFecha(f.factura.fecha)}</td>
                    <td data-etiqueta="Monto" className="cifra">
                      {formatearUSD(f.factura.montoSinImpuestos)}
                    </td>
                    <td data-etiqueta="Pagado" className="cifra">
                      {formatearUSD(f.pagado)}
                    </td>
                    <td data-etiqueta="Balance" className="cifra">
                      {formatearUSD(f.balance)}
                    </td>
                    <td data-etiqueta="Estado">
                      <span className={`etiqueta ${f.estado === 'pagada' ? 'etiqueta-verde' : 'etiqueta-ambar'}`}>
                        {f.estado === 'pagada' ? 'Pagada' : 'Abierta'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </>
      )}

      {creando && (
        <Dialogo titulo="Nueva factura" alCerrar={() => setCreando(false)}>
          <FormularioFactura
            vendedores={vendedores}
            alGuardar={(f) => {
              setCreando(false);
              setAbiertaId(f.id); // abre la factura recién creada para registrar pagos
            }}
            alCancelar={() => setCreando(false)}
          />
        </Dialogo>
      )}

      {abierta && (
        <Dialogo titulo={`Factura ${abierta.factura.numero}`} alCerrar={() => setAbiertaId(null)}>
          <DetalleFactura fila={abierta} vendedores={vendedores} alCerrar={() => setAbiertaId(null)} />
        </Dialogo>
      )}
    </section>
  );
}
