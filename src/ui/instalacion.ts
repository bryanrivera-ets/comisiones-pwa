import { useSyncExternalStore } from 'react';

/** Evento de Chrome/Edge que permite mostrar el diálogo de instalación cuando el usuario quiera. */
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface EstadoInstalacion {
  /** El navegador permite instalar ahora (hay un evento guardado). */
  disponible: boolean;
  /** Ya corre como app instalada (ventana propia). */
  instalada: boolean;
}

let evento: EventoInstalacion | null = null;
let estado: EstadoInstalacion = { disponible: false, instalada: corriendoComoApp() };
const oyentes = new Set<() => void>();

function corriendoComoApp(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function cambiar(nuevo: Partial<EstadoInstalacion>) {
  estado = { ...estado, ...nuevo };
  for (const o of oyentes) o();
}

/**
 * Escucha el aviso de "se puede instalar" del navegador. Se llama una vez al iniciar,
 * antes de montar React: el navegador puede avisar muy pronto y no hay que perderse el evento.
 */
export function escucharInstalacion(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // en lugar de la mini barra del navegador, mostramos nuestro botón
    evento = e as EventoInstalacion;
    cambiar({ disponible: true });
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    cambiar({ disponible: false, instalada: true });
  });
}

/** Abre el diálogo de instalación del navegador. Debe llamarse desde un clic. */
export async function instalar(): Promise<boolean> {
  if (!evento) return false;
  const actual = evento;
  evento = null;
  cambiar({ disponible: false });
  await actual.prompt();
  const { outcome } = await actual.userChoice;
  if (outcome === 'accepted') cambiar({ instalada: true });
  return outcome === 'accepted';
}

export function useInstalacion(): EstadoInstalacion {
  return useSyncExternalStore(
    (oyente) => {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    () => estado,
    () => estado,
  );
}
