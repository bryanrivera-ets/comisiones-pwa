import type { ResumenVendedor } from '../../dominio/comisiones';
import { formatearPorcentaje, formatearUSD } from '../../dominio/dinero';
import type { Reglas } from '../../dominio/tipos';
import type { Trimestre } from '../../dominio/trimestres';

interface Props {
  r: ResumenVendedor;
  reglas: Reglas;
  trimestre: Trimestre;
}

/** Porcentaje de avance, sin redondear hacia arriba (99.99% no se muestra como 100%). */
function porcentajeAvance(logrado: number, meta: number): number {
  if (meta <= 0) return 100;
  return Math.floor((logrado * 100) / meta);
}

export function TarjetaVendedor({ r, reglas, trimestre }: Props) {
  const { budget } = r;
  const idTitulo = `vendedor-${r.vendedor.id}`;
  const pct = budget.meta === null ? null : porcentajeAvance(budget.logrado, budget.meta);
  const medida = reglas.baseBudget === 'facturado' ? 'facturado' : 'cobrado';

  let motivoDescuento: string | null = null;
  if (r.descuento > 0) {
    motivoDescuento =
      reglas.baseDescuento === 'trimestrePago'
        ? `No alcanzó el budget de T${trimestre.numero} ${trimestre.anio}.`
        : `Pagos de facturas de trimestres en que no alcanzó el budget (${r.detalle.filter((d) => d.conDescuento).length} de ${r.detalle.length}).`;
  }

  return (
    <article className="tarjeta tarjeta-resumen" aria-labelledby={idTitulo}>
      <header className="tarjeta-resumen-encabezado">
        <h2 id={idTitulo}>{r.vendedor.nombre}</h2>
        {budget.alcanzado === null ? (
          <span className="etiqueta etiqueta-gris">Sin budget</span>
        ) : budget.alcanzado ? (
          <span className="etiqueta etiqueta-verde">Budget alcanzado</span>
        ) : (
          <span className="etiqueta etiqueta-ambar">Budget no alcanzado</span>
        )}
      </header>

      <div className="neto">
        <span className="texto-tenue">Neto a pagar</span>
        <strong>{formatearUSD(r.neto)}</strong>
      </div>

      <dl className="desglose">
        <div>
          <dt>Cobrado en el trimestre</dt>
          <dd>{formatearUSD(r.cobrado)}</dd>
        </div>
        <div>
          <dt>Comisión completa ({formatearPorcentaje(r.vendedor.comision)})</dt>
          <dd>{formatearUSD(r.comisionCompleta)}</dd>
        </div>
        <div>
          <dt>Descuento por budget ({formatearPorcentaje(reglas.descuento)})</dt>
          <dd className={r.descuento > 0 ? 'texto-peligro' : undefined}>
            {r.descuento > 0 ? `−${formatearUSD(r.descuento)}` : formatearUSD(0)}
          </dd>
        </div>
        <div>
          <dt>Comisión pendiente</dt>
          <dd>{formatearUSD(r.pendiente)}</dd>
        </div>
      </dl>
      {motivoDescuento && <p className="nota">{motivoDescuento}</p>}

      <div className="avance">
        <div className="avance-texto">
          <span>Avance del budget ({medida})</span>
          {budget.meta === null ? (
            <span className="texto-tenue">No aplica</span>
          ) : (
            <span>
              {formatearUSD(budget.logrado)} de {formatearUSD(budget.meta)} · <strong>{pct}%</strong>
            </span>
          )}
        </div>
        {budget.meta !== null && pct !== null && (
          <div
            className="barra-avance"
            role="progressbar"
            aria-label={`Avance del budget de ${r.vendedor.nombre}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(pct, 100)}
          >
            <div className={budget.alcanzado ? 'relleno relleno-ok' : 'relleno'} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}
