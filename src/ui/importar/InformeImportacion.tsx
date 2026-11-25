import type { RegistroImportacion } from '../../datos/Repositorio';
import { formatearUSD } from '../../dominio/dinero';
import { formatearFecha } from '../../dominio/fechas';
import type { FilaInforme, PlanImportacion } from '../../importacion/planificar';

export function TarjetasResumen({ resumen }: { resumen: RegistroImportacion['resumen'] }) {
  const tarjetas = [
    { titulo: 'Facturas nuevas', valor: String(resumen.facturasNuevas) },
    { titulo: 'Pagos nuevos', valor: String(resumen.pagosNuevos), nota: formatearUSD(resumen.montoPagosNuevos) },
    { titulo: 'Sin cambios', valor: String(resumen.sinCambios) },
    { titulo: 'Omitidas', valor: String(resumen.omitidas), tono: resumen.omitidas > 0 ? 'aviso' : undefined },
    { titulo: 'Para revisar', valor: String(resumen.paraRevisar), tono: resumen.paraRevisar > 0 ? 'aviso' : undefined },
  ];
  return (
    <ul className="cifras-importacion" aria-label="Resumen de la importación">
      {tarjetas.map((t) => (
        <li key={t.titulo} className={t.tono === 'aviso' ? 'con-aviso' : undefined}>
          <span className="texto-tenue">{t.titulo}</span>
          <strong>{t.valor}</strong>
          {t.nota && <span className="texto-tenue">{t.nota}</span>}
        </li>
      ))}
    </ul>
  );
}

function ListaFilas({ filas }: { filas: FilaInforme[] }) {
  return (
    <ul className="lista-informe">
      {filas.map((f, i) => (
        <li key={`${f.filaExcel}-${i}`}>
          <span className="texto-tenue">Fila {f.filaExcel}</span>
          <strong>{f.numero || '—'}</strong>
          <span>{f.detalle}</span>
        </li>
      ))}
    </ul>
  );
}

/** Resumen previo a guardar: cifras y el detalle de cada grupo de filas. */
export function InformeImportacion({ plan }: { plan: PlanImportacion }) {
  const { facturasNuevas, pagosNuevos, sinCambios, omitidas, paraRevisar, avisos } = plan;
  return (
    <div className="informe">
      <TarjetasResumen resumen={plan.resumen} />

      {paraRevisar.length > 0 && (
        <details open>
          <summary>Para revisar ({paraRevisar.length}) — no se cambiará nada en estas filas</summary>
          <ListaFilas filas={paraRevisar} />
        </details>
      )}
      {omitidas.length > 0 && (
        <details open>
          <summary>Omitidas ({omitidas.length})</summary>
          <ListaFilas filas={omitidas} />
        </details>
      )}
      {avisos.length > 0 && (
        <details open>
          <summary>Avisos ({avisos.length})</summary>
          <ListaFilas filas={avisos} />
        </details>
      )}
      {facturasNuevas.length > 0 && (
        <details>
          <summary>Facturas nuevas ({facturasNuevas.length})</summary>
          <ul className="lista-informe">
            {facturasNuevas.map((f) => (
              <li key={f.factura.id}>
                <span className="texto-tenue">Fila {f.filaExcel}</span>
                <strong>{f.factura.numero}</strong>
                <span>
                  {f.vendedor} · {formatearFecha(f.factura.fecha)} · {formatearUSD(f.factura.montoSinImpuestos)}
                  {f.pago
                    ? ` · pagado ${formatearUSD(f.pago.monto)} el ${formatearFecha(f.pago.fecha)}${f.pago.cobroPrevio ? ' (cobro previo)' : ''}`
                    : ' · sin pagos'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {pagosNuevos.length > 0 && (
        <details>
          <summary>Pagos nuevos en facturas existentes ({pagosNuevos.length})</summary>
          <ul className="lista-informe">
            {pagosNuevos.map((p) => (
              <li key={p.pago.id}>
                <span className="texto-tenue">Fila {p.filaExcel}</span>
                <strong>{p.factura.numero}</strong>
                <span>
                  + {formatearUSD(p.pago.monto)} el {formatearFecha(p.pago.fecha)}
                  {p.pago.cobroPrevio ? ' (cobro previo)' : ''} · antes pagado {formatearUSD(p.pagadoAntes)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {sinCambios.length > 0 && (
        <details>
          <summary>Sin cambios ({sinCambios.length})</summary>
          <ListaFilas filas={sinCambios} />
        </details>
      )}
    </div>
  );
}
