import { useRegisterSW } from 'virtual:pwa-register/react';

/** Avisa cuando la app quedó lista sin conexión o cuando hay una versión nueva. */
export function AvisoActualizacion() {
  const {
    offlineReady: [listaSinConexion, setListaSinConexion],
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW();

  if (!listaSinConexion && !hayVersionNueva) return null;

  return (
    <div className="aviso-flotante" role="status">
      {hayVersionNueva ? (
        <>
          <span>Hay una versión nueva de la app.</span>
          <button className="boton boton-primario" onClick={() => updateServiceWorker(true)}>
            Actualizar
          </button>
          <button className="boton" onClick={() => setHayVersionNueva(false)}>
            Después
          </button>
        </>
      ) : (
        <>
          <span>La app ya funciona sin conexión.</span>
          <button className="boton" onClick={() => setListaSinConexion(false)}>
            Entendido
          </button>
        </>
      )}
    </div>
  );
}
