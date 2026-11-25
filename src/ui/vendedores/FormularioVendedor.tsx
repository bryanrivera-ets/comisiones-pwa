import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { nuevoId } from '../../datos/Repositorio';
import { centavosATexto, parsearDinero, parsearPorcentaje, porcentajeATexto } from '../../dominio/dinero';
import type { Vendedor } from '../../dominio/tipos';
import { Campo, EntradaDinero, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useRepositorio } from '../datos';

interface Props {
  vendedor?: Vendedor;
  alGuardar: () => void;
  alCancelar: () => void;
}

export function FormularioVendedor({ vendedor, alGuardar, alCancelar }: Props) {
  const repositorio = useRepositorio();
  const { errores, setErrores, ocupado, ejecutar } = useAccion();
  const [nombre, setNombre] = useState(vendedor?.nombre ?? '');
  const [comision, setComision] = useState(vendedor ? porcentajeATexto(vendedor.comision) : '');
  const [budget, setBudget] = useState(
    vendedor?.budgetTrimestral != null ? centavosATexto(vendedor.budgetTrimestral) : '',
  );
  const [alias, setAlias] = useState<string[]>(vendedor?.alias ?? []);
  const [aliasNuevo, setAliasNuevo] = useState('');

  function agregarAlias() {
    const a = aliasNuevo.trim();
    if (a !== '' && !alias.includes(a)) setAlias([...alias, a]);
    setAliasNuevo('');
  }

  function alTeclearAlias(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarAlias();
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const pb = parsearPorcentaje(comision);
    const centavosBudget = budget.trim() === '' ? null : parsearDinero(budget);
    const problemas: string[] = [];
    if (pb === null) problemas.push('El porcentaje de comisión debe ser un número entre 0 y 100.');
    if (budget.trim() !== '' && (centavosBudget === null || centavosBudget < 0)) {
      problemas.push('El budget no es un monto válido.');
    }
    if (problemas.length > 0 || pb === null) {
      setErrores(problemas);
      return;
    }
    // Si dejó un alias escrito sin pulsar "Agregar", también se guarda.
    const todosLosAlias = aliasNuevo.trim() ? [...alias, aliasNuevo.trim()] : alias;
    const listo = await ejecutar(() =>
      repositorio.guardarVendedor({
        id: vendedor?.id ?? nuevoId(),
        nombre,
        comision: pb,
        budgetTrimestral: centavosBudget,
        alias: todosLosAlias,
      }),
    );
    if (listo) alGuardar();
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <Campo etiqueta="Nombre">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </Campo>
      <div className="fila-campos">
        <Campo etiqueta="Comisión (%)" ayuda="Ejemplo: 5 o 2.5">
          <span className="entrada-con-sufijo">
            <input value={comision} onChange={(e) => setComision(e.target.value)} inputMode="decimal" placeholder="5" />
            <span aria-hidden="true">%</span>
          </span>
        </Campo>
        <Campo etiqueta="Budget trimestral" ayuda="Déjalo vacío si no tiene budget (nunca lleva descuento).">
          <EntradaDinero value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Campo>
      </div>

      <fieldset className="grupo">
        <legend>Alias en Odoo</legend>
        <p className="campo-ayuda">
          Otros nombres con que aparece en los reportes de Odoo. El importador los usa para reconocerlo.
        </p>
        {alias.length > 0 && (
          <ul className="chips">
            {alias.map((a) => (
              <li key={a} className="chip">
                {a}
                <button
                  type="button"
                  className="chip-quitar"
                  aria-label={`Quitar alias ${a}`}
                  onClick={() => setAlias(alias.filter((x) => x !== a))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="fila-en-linea">
          <input
            aria-label="Nuevo alias"
            placeholder="Nombre como aparece en Odoo"
            value={aliasNuevo}
            onChange={(e) => setAliasNuevo(e.target.value)}
            onKeyDown={alTeclearAlias}
          />
          <button type="button" className="boton" onClick={agregarAlias}>
            Agregar
          </button>
        </div>
      </fieldset>

      <ListaErrores errores={errores} />
      <div className="acciones">
        <button type="button" className="boton" onClick={alCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={ocupado}>
          Guardar
        </button>
      </div>
    </form>
  );
}
