import { useState, type FormEvent } from 'react';
import { nuevoId } from '../../datos/Repositorio';
import { centavosATexto, formatearUSD, parsearDinero } from '../../dominio/dinero';
import { formatearFecha, hoyISO } from '../../dominio/fechas';
import type { Vendedor } from '../../dominio/tipos';
import { Campo, EntradaDinero, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useRepositorio } from '../datos';
import type { FilaFactura } from './filas';
import { FormularioFactura } from './FormularioFactura';

interface Props {
  fila: FilaFactura;
  vendedores: Vendedor[];
  alCerrar: () => void;
}

/** Contenido del diálogo de una factura: datos, pagos, registrar pago, editar y eliminar. */
export function DetalleFactura({ fila, vendedores, alCerrar }: Props) {
  const repositorio = useRepositorio();
  const { errores, ejecutar } = useAccion();
  const [editando, setEditando] = useState(false);
  const { factura } = fila;

  if (editando) {
    return (
      <FormularioFactura
        factura={factura}
        vendedores={vendedores}
        alGuardar={() => setEditando(false)}
        alCancelar={() => setEditando(false)}
      />
    );
  }

  function quitarPago(id: string, fecha: string, monto: number) {
    if (!window.confirm(`¿Quitar el pago de ${formatearUSD(monto)} del ${formatearFecha(fecha)}?`)) return;
    void ejecutar(() => repositorio.eliminarPago(id));
  }

  async function eliminarFactura() {
    const extra = fila.pagos.length > 0 ? ` y sus ${fila.pagos.length} pago(s)` : '';
    if (!window.confirm(`¿Eliminar la factura ${factura.numero}${extra}? No se puede deshacer.`)) return;
    if (await ejecutar(() => repositorio.eliminarFactura(factura.id))) alCerrar();
  }

  return (
    <div className="detalle-factura">
      <dl className="datos-clave">
        <div>
          <dt>Cliente</dt>
          <dd>{factura.cliente || '—'}</dd>
        </div>
        <div>
          <dt>Vendedor</dt>
          <dd>{fila.vendedor?.nombre ?? '—'}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatearFecha(factura.fecha)}</dd>
        </div>
        <div>
          <dt>Monto sin impuestos</dt>
          <dd>{formatearUSD(factura.montoSinImpuestos)}</dd>
        </div>
        {factura.total !== null && (
          <div>
            <dt>Total con impuestos</dt>
            <dd>{formatearUSD(factura.total)}</dd>
          </div>
        )}
        <div>
          <dt>Pagado</dt>
          <dd>{formatearUSD(fila.pagado)}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd className={fila.balance > 0 ? 'cifra-destacada' : undefined}>{formatearUSD(fila.balance)}</dd>
        </div>
      </dl>

      <h3>Pagos</h3>
      {fila.pagos.length === 0 ? (
        <p className="texto-tenue">Sin pagos registrados.</p>
      ) : (
        <ul className="lista-pagos" aria-label="Pagos">
          {fila.pagos.map((p) => (
            <li key={p.id}>
              <span>{formatearFecha(p.fecha)}</span>
              <span className="cifra">{formatearUSD(p.monto)}</span>
              <span>
                {p.cobroPrevio && <span className="etiqueta etiqueta-gris">Cobro previo</span>}
                {p.origen === 'importacion' && <span className="etiqueta etiqueta-gris">Importado</span>}
              </span>
              <button
                className="boton boton-texto boton-peligro"
                onClick={() => quitarPago(p.id, p.fecha, p.monto)}
                aria-label={`Quitar pago del ${formatearFecha(p.fecha)}`}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <ListaErrores errores={errores} />

      {fila.balance > 0 && (
        // La clave reinicia el formulario (fecha y balance) después de cada pago.
        <FormularioPago key={fila.pagos.length} fila={fila} />
      )}

      <div className="acciones acciones-separadas">
        <button className="boton boton-texto boton-peligro" onClick={eliminarFactura}>
          Eliminar factura
        </button>
        <button className="boton" onClick={() => setEditando(true)}>
          Editar factura
        </button>
      </div>
    </div>
  );
}

function FormularioPago({ fila }: { fila: FilaFactura }) {
  const repositorio = useRepositorio();
  const { errores, setErrores, ocupado, ejecutar } = useAccion();
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState(centavosATexto(fila.balance));
  const [cobroPrevio, setCobroPrevio] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const centavos = parsearDinero(monto);
    if (centavos === null) {
      setErrores(['El monto no es un número válido.']);
      return;
    }
    await ejecutar(() =>
      repositorio.agregarPago({
        id: nuevoId(),
        facturaId: fila.factura.id,
        fecha,
        monto: centavos,
        cobroPrevio,
        origen: 'manual',
      }),
    );
  }

  return (
    <form className="formulario tarjeta-interna" onSubmit={enviar} noValidate aria-label="Registrar pago">
      <h3>Registrar pago</h3>
      <div className="fila-campos">
        <Campo etiqueta="Fecha del pago">
          <input type="date" value={fecha} min={fila.factura.fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Monto del pago" ayuda={`Sin impuestos. Balance: ${formatearUSD(fila.balance)}`}>
          <EntradaDinero value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
      </div>
      <label className="opcion">
        <input type="checkbox" checked={cobroPrevio} onChange={(e) => setCobroPrevio(e.target.checked)} />
        <span>
          Cobro previo
          <small className="campo-ayuda">Se registra como cobrado pero no genera comisión (datos históricos).</small>
        </span>
      </label>
      <ListaErrores errores={errores} />
      <div className="acciones">
        <button type="submit" className="boton boton-primario" disabled={ocupado}>
          Registrar pago
        </button>
      </div>
    </form>
  );
}
