import { useState, type FormEvent } from 'react';
import { parsearPorcentaje, porcentajeATexto } from '../../dominio/dinero';
import type { BaseBudget, BaseDescuento, Reglas } from '../../dominio/tipos';
import { Campo, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useRepositorio } from '../datos';

const OPCIONES_BUDGET: { valor: BaseBudget; texto: string; ayuda: string }[] = [
  { valor: 'facturado', texto: 'Lo facturado en el trimestre', ayuda: 'Suma de las facturas emitidas en el trimestre (sin impuestos).' },
  { valor: 'cobrado', texto: 'Lo cobrado en el trimestre', ayuda: 'Suma de los pagos recibidos en el trimestre, incluidos los cobros previos.' },
];

const OPCIONES_DESCUENTO: { valor: BaseDescuento; texto: string; ayuda: string }[] = [
  {
    valor: 'trimestrePago',
    texto: 'El trimestre en que se le paga al vendedor',
    ayuda: 'Si no alcanza el budget del trimestre, toda la comisión de ese trimestre lleva descuento.',
  },
  {
    valor: 'trimestreFactura',
    texto: 'El trimestre en que se emitió la factura',
    ayuda: 'Cada pago lleva descuento solo si no alcanzó el budget del trimestre de su factura.',
  },
];

export function FormularioReglas({ reglas }: { reglas: Reglas }) {
  const repositorio = useRepositorio();
  const { errores, setErrores, ocupado, ejecutar } = useAccion();
  const [descuento, setDescuento] = useState(porcentajeATexto(reglas.descuento));
  const [baseBudget, setBaseBudget] = useState(reglas.baseBudget);
  const [baseDescuento, setBaseDescuento] = useState(reglas.baseDescuento);
  const [guardado, setGuardado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardado(false);
    const pb = parsearPorcentaje(descuento);
    if (pb === null) {
      setErrores(['El descuento debe ser un número entre 0 y 100.']);
      return;
    }
    if (await ejecutar(() => repositorio.guardarReglas({ descuento: pb, baseBudget, baseDescuento }))) setGuardado(true);
  }

  return (
    <form className="tarjeta formulario" onSubmit={enviar} noValidate>
      <Campo etiqueta="Descuento si no alcanza el budget (%)" ayuda="Se resta de la comisión del trimestre. Por defecto 20%.">
        <span className="entrada-con-sufijo entrada-corta">
          <input value={descuento} onChange={(e) => { setDescuento(e.target.value); setGuardado(false); }} inputMode="decimal" />
          <span aria-hidden="true">%</span>
        </span>
      </Campo>

      <fieldset className="grupo">
        <legend>El budget se mide con</legend>
        {OPCIONES_BUDGET.map((o) => (
          <label key={o.valor} className="opcion">
            <input
              type="radio"
              name="baseBudget"
              checked={baseBudget === o.valor}
              onChange={() => { setBaseBudget(o.valor); setGuardado(false); }}
            />
            <span>
              {o.texto}
              {o.valor === 'facturado' && <span className="etiqueta-suave">por defecto</span>}
              <small className="campo-ayuda">{o.ayuda}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="grupo">
        <legend>El descuento depende del budget de</legend>
        {OPCIONES_DESCUENTO.map((o) => (
          <label key={o.valor} className="opcion">
            <input
              type="radio"
              name="baseDescuento"
              checked={baseDescuento === o.valor}
              onChange={() => { setBaseDescuento(o.valor); setGuardado(false); }}
            />
            <span>
              {o.texto}
              {o.valor === 'trimestrePago' && <span className="etiqueta-suave">por defecto</span>}
              <small className="campo-ayuda">{o.ayuda}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <ListaErrores errores={errores} />
      <div className="acciones">
        {guardado && <span className="texto-exito" role="status">✓ Reglas guardadas</span>}
        <button type="submit" className="boton boton-primario" disabled={ocupado}>
          Guardar reglas
        </button>
      </div>
    </form>
  );
}
