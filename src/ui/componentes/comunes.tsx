import { useEffect, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ListaErrores({ errores }: { errores: string[] }) {
  if (errores.length === 0) return null;
  return (
    <div className="alerta alerta-error" role="alert">
      {errores.length === 1 ? (
        errores[0]
      ) : (
        <ul>
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PropsCampo {
  etiqueta: string;
  ayuda?: ReactNode;
  children: ReactNode;
}

/** Etiqueta + control + ayuda. El <label> envuelve al control, así queda asociado. */
export function Campo({ etiqueta, ayuda, children }: PropsCampo) {
  return (
    <label className="campo">
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <small className="campo-ayuda">{ayuda}</small>}
    </label>
  );
}

/** Contenedor de un campo de dinero con el signo $ delante. */
export function EntradaDinero(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className="entrada-con-prefijo">
      <span aria-hidden="true">$</span>
      <input type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} />
    </span>
  );
}

export function Cargando() {
  return <p className="texto-tenue">Cargando…</p>;
}

interface PropsDialogo {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
}

export function Dialogo({ titulo, alCerrar, children }: PropsDialogo) {
  const idTitulo = useId();

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    const desbordeAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = desbordeAnterior;
    };
  }, [alCerrar]);

  return createPortal(
    <div className="fondo-dialogo">
      <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <header className="dialogo-encabezado">
          <h2 id={idTitulo}>{titulo}</h2>
          <button type="button" className="boton-icono" aria-label="Cerrar" onClick={alCerrar}>
            ✕
          </button>
        </header>
        <div className="dialogo-cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
