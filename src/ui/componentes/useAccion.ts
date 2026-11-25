import { useCallback, useState } from 'react';
import { ErrorValidacion } from '../../datos/Repositorio';

/** Ejecuta una operación asíncrona y guarda sus errores (en español) para mostrarlos. */
export function useAccion() {
  const [errores, setErrores] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  const ejecutar = useCallback(async (operacion: () => Promise<void>): Promise<boolean> => {
    setOcupado(true);
    setErrores([]);
    try {
      await operacion();
      return true;
    } catch (e) {
      setErrores(
        e instanceof ErrorValidacion
          ? e.errores
          : [`Ocurrió un error inesperado: ${e instanceof Error ? e.message : String(e)}`],
      );
      return false;
    } finally {
      setOcupado(false);
    }
  }, []);

  return { errores, setErrores, ocupado, ejecutar };
}
