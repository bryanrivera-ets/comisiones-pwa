import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DatosCompletos, Repositorio } from '../datos/Repositorio';

const ContextoRepositorio = createContext<Repositorio | null>(null);

export function ProveedorRepositorio({ repositorio, children }: { repositorio: Repositorio; children: ReactNode }) {
  return <ContextoRepositorio.Provider value={repositorio}>{children}</ContextoRepositorio.Provider>;
}

export function useRepositorio(): Repositorio {
  const repositorio = useContext(ContextoRepositorio);
  if (!repositorio) throw new Error('Falta <ProveedorRepositorio>.');
  return repositorio;
}

/** Fecha y hora ISO del último respaldo (null si nunca); undefined mientras carga. */
export function useUltimoRespaldo(): string | null | undefined {
  const repositorio = useRepositorio();
  const [ultimo, setUltimo] = useState<string | null>();
  useEffect(() => {
    let vigente = true;
    const cargar = () => void repositorio.obtenerUltimoRespaldo().then((u) => vigente && setUltimo(u));
    cargar();
    const dejarDeEscuchar = repositorio.suscribir(cargar);
    return () => {
      vigente = false;
      dejarDeEscuchar();
    };
  }, [repositorio]);
  return ultimo;
}

/** Todos los datos; se recargan solos tras cada cambio. undefined mientras cargan. */
export function useDatos(): DatosCompletos | undefined {
  const repositorio = useRepositorio();
  const [datos, setDatos] = useState<DatosCompletos>();

  useEffect(() => {
    let vigente = true;
    let ultimaCarga = 0;
    const cargar = () => {
      const esta = ++ultimaCarga;
      void repositorio.obtenerTodo().then((d) => {
        // Si hubo cambios seguidos, solo vale la carga más reciente.
        if (vigente && esta === ultimaCarga) setDatos(d);
      });
    };
    cargar();
    const dejarDeEscuchar = repositorio.suscribir(cargar);
    return () => {
      vigente = false;
      dejarDeEscuchar();
    };
  }, [repositorio]);

  return datos;
}
