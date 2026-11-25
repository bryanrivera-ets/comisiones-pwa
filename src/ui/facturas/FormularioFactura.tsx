import { useState, type FormEvent } from 'react';
import { nuevoId } from '../../datos/Repositorio';
import { centavosATexto, parsearDinero } from '../../dominio/dinero';
import { hoyISO } from '../../dominio/fechas';
import type { Factura, Vendedor } from '../../dominio/tipos';
import { Campo, EntradaDinero, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useRepositorio } from '../datos';

interface Props {
  factura?: Factura;
  vendedores: Vendedor[];
  alGuardar: (factura: Factura) => void;
  alCancelar: () => void;
}

export function FormularioFactura({ factura, vendedores, alGuardar, alCancelar }: Props) {
  const repositorio = useRepositorio();
  const { errores, setErrores, ocupado, ejecutar } = useAccion();
  const [numero, setNumero] = useState(factura?.numero ?? '');
  const [cliente, setCliente] = useState(factura?.cliente ?? '');
  const [vendedorId, setVendedorId] = useState(factura?.vendedorId ?? (vendedores.length === 1 ? vendedores[0]!.id : ''));
  const [fecha, setFecha] = useState(factura?.fecha ?? hoyISO());
  const [monto, setMonto] = useState(factura ? centavosATexto(factura.montoSinImpuestos) : '');
  const [total, setTotal] = useState(factura?.total != null ? centavosATexto(factura.total) : '');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const centavosMonto = parsearDinero(monto);
    const centavosTotal = total.trim() === '' ? null : parsearDinero(total);
    const problemas: string[] = [];
    if (centavosMonto === null) problemas.push('El monto sin impuestos no es un número válido.');
    if (total.trim() !== '' && centavosTotal === null) problemas.push('El total no es un número válido.');
    if (problemas.length > 0 || centavosMonto === null) {
      setErrores(problemas);
      return;
    }
    const datos: Factura = {
      id: factura?.id ?? nuevoId(),
      numero,
      cliente,
      vendedorId,
      fecha,
      montoSinImpuestos: centavosMonto,
      total: centavosTotal,
      origen: factura?.origen ?? 'manual',
    };
    if (await ejecutar(() => repositorio.guardarFactura(datos))) alGuardar(datos);
  }

  return (
    <form className="formulario" onSubmit={enviar} noValidate>
      <div className="fila-campos">
        <Campo etiqueta="Número de factura">
          <input value={numero} onChange={(e) => setNumero(e.target.value)} autoFocus placeholder="INV/2026/00001" />
        </Campo>
        <Campo etiqueta="Fecha de factura">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Cliente">
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} />
      </Campo>
      <Campo etiqueta="Vendedor">
        <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
          <option value="">Escoge…</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="fila-campos">
        <Campo etiqueta="Monto sin impuestos" ayuda="Base de la comisión.">
          <EntradaDinero value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        <Campo etiqueta="Total con impuestos" ayuda="Opcional.">
          <EntradaDinero value={total} onChange={(e) => setTotal(e.target.value)} />
        </Campo>
      </div>
      <ListaErrores errores={errores} />
      <div className="acciones">
        <button type="button" className="boton" onClick={alCancelar}>
          Cancelar
        </button>
        <button type="submit" className="boton boton-primario" disabled={ocupado}>
          Guardar factura
        </button>
      </div>
    </form>
  );
}
