import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { calcularResumenTrimestre } from '../../dominio/comisiones';
import { formatearPorcentaje, formatearUSD, sumar } from '../../dominio/dinero';
import { formatearFecha, hoyISO } from '../../dominio/fechas';
import type { Reglas } from '../../dominio/tipos';
import {
  claveTrimestre,
  etiquetaTrimestre,
  parsearClaveTrimestre,
  trimestreAnterior,
  trimestreDeFecha,
  trimestreSiguiente,
  type Trimestre,
} from '../../dominio/trimestres';
import { csvResumenTrimestre, nombreArchivoCsv } from '../../exportacion/csvResumen';
import { Cargando } from '../componentes/comunes';
import { descargarCsv } from '../componentes/descargar';
import { useDatos } from '../datos';
import { TarjetaVendedor } from './TarjetaVendedor';

function textoReglas(reglas: Reglas): string {
  const budget = reglas.baseBudget === 'facturado' ? 'lo facturado' : 'lo cobrado';
  const decide = reglas.baseDescuento === 'trimestrePago' ? 'el trimestre de pago' : 'el trimestre de la factura';
  return `Descuento de ${formatearPorcentaje(reglas.descuento)} si no se alcanza el budget · budget medido con ${budget} · decide ${decide}.`;
}

export function PaginaResumen() {
  const datos = useDatos();
  const [parametros, setParametros] = useSearchParams();
  const actual = trimestreDeFecha(hoyISO());
  const trimestre = parsearClaveTrimestre(parametros.get('t') ?? '') ?? actual;
  const clave = claveTrimestre(trimestre);
  const claveActual = claveTrimestre(actual);
  const irA = (t: Trimestre) => setParametros({ t: claveTrimestre(t) }, { replace: true });

  const resumen = useMemo(
    () => (datos ? calcularResumenTrimestre(datos, parsearClaveTrimestre(clave)!) : []),
    [datos, clave],
  );

  // Trimestres con movimientos, para saltar directo a ellos.
  const opciones = useMemo(() => {
    const claves = new Set([claveActual, clave]);
    for (const f of datos?.facturas ?? []) claves.add(claveTrimestre(trimestreDeFecha(f.fecha)));
    for (const p of datos?.pagos ?? []) claves.add(claveTrimestre(trimestreDeFecha(p.fecha)));
    return [...claves].sort().reverse().map((c) => parsearClaveTrimestre(c)!);
  }, [datos, clave, claveActual]);

  if (!datos) return <Cargando />;

  const filas = resumen.flatMap((r) => r.detalle.map((d) => ({ r, d })));
  const totalNeto = sumar(resumen.map((r) => r.neto));

  return (
    <section>
      <div className="encabezado-pagina">
        <h1>Resumen del trimestre</h1>
        <button
          className="boton"
          onClick={() => void descargarCsv(nombreArchivoCsv(trimestre), csvResumenTrimestre(resumen, trimestre))}
          disabled={resumen.length === 0}
        >
          Exportar CSV
        </button>
      </div>

      <div className="selector-trimestre">
        <button className="boton boton-icono-texto" onClick={() => irA(trimestreAnterior(trimestre))} aria-label="Trimestre anterior">
          ‹
        </button>
        <select aria-label="Trimestre" value={clave} onChange={(e) => irA(parsearClaveTrimestre(e.target.value)!)}>
          {opciones.map((t) => (
            <option key={claveTrimestre(t)} value={claveTrimestre(t)}>
              {etiquetaTrimestre(t)}
              {claveTrimestre(t) === claveActual ? ' — actual' : ''}
            </option>
          ))}
        </select>
        <button className="boton boton-icono-texto" onClick={() => irA(trimestreSiguiente(trimestre))} aria-label="Trimestre siguiente">
          ›
        </button>
      </div>

      {resumen.length === 0 ? (
        <div className="tarjeta vacio">
          <p>Aún no hay vendedores.</p>
          <Link className="boton boton-primario" to="/vendedores">
            Agregar vendedores
          </Link>
        </div>
      ) : (
        <>
          <p className="texto-tenue total-trimestre">
            Total neto a pagar en {etiquetaTrimestre(trimestre)}: <strong>{formatearUSD(totalNeto)}</strong>
          </p>
          <div className="rejilla-resumen">
            {resumen.map((r) => (
              <TarjetaVendedor key={r.vendedor.id} r={r} reglas={datos.reglas} trimestre={trimestre} />
            ))}
          </div>
          <p className="nota">
            {textoReglas(datos.reglas)} <Link to="/vendedores">Cambiar reglas</Link>
          </p>

          <h2 className="titulo-seccion">Pagos que generan comisión</h2>
          {filas.length === 0 ? (
            <div className="tarjeta vacio">
              <p>No hay pagos que generen comisión en este trimestre.</p>
            </div>
          ) : (
            <div className="tabla-contenedor">
              <table className="tabla tabla-adaptable tabla-sin-clic" aria-label="Pagos que generan comisión">
                <thead>
                  <tr>
                    <th>Fecha de pago</th>
                    <th>Vendedor</th>
                    <th>Factura</th>
                    <th>Cliente</th>
                    <th className="cifra">Pagado</th>
                    <th className="cifra">Comisión</th>
                    <th className="cifra">Descuento</th>
                    <th className="cifra">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(({ r, d }) => (
                    <tr key={d.pago.id}>
                      <td data-etiqueta="Fecha de pago">{formatearFecha(d.pago.fecha)}</td>
                      <td data-etiqueta="Vendedor">{r.vendedor.nombre}</td>
                      <td data-etiqueta="Factura">
                        <span>
                          {d.factura.numero}
                          <span className="texto-tenue"> · {formatearFecha(d.factura.fecha)}</span>
                        </span>
                      </td>
                      <td data-etiqueta="Cliente">{d.factura.cliente || '—'}</td>
                      <td data-etiqueta="Pagado" className="cifra">{formatearUSD(d.pago.monto)}</td>
                      <td data-etiqueta="Comisión" className="cifra">{formatearUSD(d.comision)}</td>
                      <td data-etiqueta="Descuento" className="cifra">
                        {d.conDescuento ? `−${formatearUSD(d.descuento)}` : '—'}
                      </td>
                      <td data-etiqueta="Neto" className="cifra">{formatearUSD(d.comision - d.descuento)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total del trimestre</td>
                    <td data-etiqueta="Pagado" className="cifra">{formatearUSD(sumar(resumen.map((r) => r.cobrado)))}</td>
                    <td data-etiqueta="Comisión" className="cifra">{formatearUSD(sumar(resumen.map((r) => r.comisionCompleta)))}</td>
                    <td data-etiqueta="Descuento" className="cifra">−{formatearUSD(sumar(resumen.map((r) => r.descuento)))}</td>
                    <td data-etiqueta="Neto" className="cifra">{formatearUSD(totalNeto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
