import { useEffect, useState, type ChangeEvent } from 'react';
import { ErrorValidacion } from '../../datos/Repositorio';
import { crearRespaldo, leerRespaldo, nombreArchivoRespaldo, serializarRespaldo, type ArchivoRespaldo } from '../../datos/respaldo';
import { formatearUSD } from '../../dominio/dinero';
import { consultarAlmacenamiento, formatearBytes, pedirAlmacenamientoPersistente, type EstadoAlmacenamiento } from '../almacenamiento';
import { Cargando, ListaErrores } from '../componentes/comunes';
import { guardarArchivo } from '../componentes/descargar';
import { useAccion } from '../componentes/useAccion';
import { useDatos, useRepositorio, useUltimoRespaldo } from '../datos';
import { haceCuanto } from './aviso';

function fechaHoraLegible(iso: string): string {
  const d = new Date(iso);
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

function conteo(datos: ArchivoRespaldo['datos']): string {
  return `${datos.vendedores.length} vendedor(es), ${datos.facturas.length} factura(s) y ${datos.pagos.length} pago(s)`;
}

export function PaginaRespaldo() {
  const datos = useDatos();
  const ultimo = useUltimoRespaldo();
  const repositorio = useRepositorio();
  const { errores, setErrores, ocupado, ejecutar } = useAccion();
  const [almacenamiento, setAlmacenamiento] = useState<EstadoAlmacenamiento | null>(null);
  const [porRestaurar, setPorRestaurar] = useState<{ nombre: string; archivo: ArchivoRespaldo } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    void consultarAlmacenamiento().then(setAlmacenamiento);
  }, [datos]);

  if (!datos || ultimo === undefined) return <Cargando />;

  function exportar() {
    if (!datos) return;
    setMensaje(null);
    const ahora = new Date();
    // Sin esperas antes de guardar: en iPhone, compartir debe ocurrir dentro del mismo clic.
    void guardarArchivo(nombreArchivoRespaldo(ahora), serializarRespaldo(crearRespaldo(datos, ahora)), 'application/json').then(
      async (resultado) => {
        if (resultado === 'cancelado') return;
        await repositorio.registrarRespaldo(ahora.toISOString());
        setMensaje(`Respaldo listo: ${nombreArchivoRespaldo(ahora)}. Guárdalo fuera de este dispositivo (correo, Drive, OneDrive…).`);
      },
    );
  }

  async function alEscogerArchivo(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = '';
    setMensaje(null);
    setErrores([]);
    setPorRestaurar(null);
    if (!elegido) return;
    try {
      setPorRestaurar({ nombre: elegido.name, archivo: leerRespaldo(await elegido.text()) });
    } catch (error) {
      setErrores(error instanceof ErrorValidacion ? error.errores : [`No se pudo leer el archivo: ${String(error)}`]);
    }
  }

  async function restaurar() {
    if (!porRestaurar) return;
    const { archivo } = porRestaurar;
    if (
      !window.confirm(
        `Se borrarán los datos actuales (${conteo(datos!)}) y se reemplazarán por los del respaldo (${conteo(archivo.datos)}). ¿Continuar?`,
      )
    ) {
      return;
    }
    const listo = await ejecutar(async () => {
      await repositorio.reemplazarTodo(archivo.datos);
      // Los datos ahora son exactamente los de ese respaldo.
      await repositorio.registrarRespaldo(archivo.exportado);
    });
    if (listo) {
      setPorRestaurar(null);
      setMensaje(`Datos restaurados del respaldo del ${fechaHoraLegible(archivo.exportado)}.`);
    }
  }

  async function pedirPersistencia() {
    await pedirAlmacenamientoPersistente();
    setAlmacenamiento(await consultarAlmacenamiento());
  }

  const importaciones = [...datos.importaciones].sort((a, b) => b.fechaHora.localeCompare(a.fechaHora));

  return (
    <section className="respaldo">
      <h1>Respaldo</h1>

      <div className="tarjeta formulario">
        <h2>Tus datos</h2>
        <p>
          Los datos viven <strong>solo en este navegador y en este dispositivo</strong>. Si se borran los datos del navegador o se
          pierde el equipo, se pierden. La computadora y el celular tienen datos separados: usa el respaldo para pasarlos de uno a
          otro.
        </p>
        <dl className="datos-clave">
          <div>
            <dt>Contenido</dt>
            <dd>{conteo(datos)}</dd>
          </div>
          <div>
            <dt>Último respaldo</dt>
            <dd>{ultimo === null ? <span className="texto-peligro">Nunca</span> : `${fechaHoraLegible(ultimo)} (${haceCuanto(ultimo)})`}</dd>
          </div>
          <div>
            <dt>Almacenamiento</dt>
            <dd>
              {almacenamiento?.persistente === true && 'Persistente ✓'}
              {almacenamiento?.persistente === false && (
                <>
                  <span className="texto-peligro">No persistente</span>{' '}
                  <button className="boton boton-texto enlace" onClick={pedirPersistencia}>
                    Pedir
                  </button>
                </>
              )}
              {almacenamiento?.persistente == null && <span className="texto-tenue">Desconocido</span>}
              {almacenamiento?.usado != null && <span className="texto-tenue"> · {formatearBytes(almacenamiento.usado)} usados</span>}
            </dd>
          </div>
        </dl>
      </div>

      {mensaje && (
        <div className="alerta alerta-exito" role="status">
          {mensaje}
        </div>
      )}

      <div className="tarjeta formulario">
        <h2>Exportar respaldo</h2>
        <p className="campo-ayuda">
          Descarga un archivo JSON con todo: vendedores, reglas, facturas, pagos e historial de importaciones. Hazlo al menos una
          vez por semana y después de cada importación.
        </p>
        <div className="acciones acciones-izquierda">
          <button className="boton boton-primario" onClick={exportar}>
            Exportar respaldo
          </button>
        </div>
      </div>

      <div className="tarjeta formulario">
        <h2>Restaurar desde un respaldo</h2>
        <p className="campo-ayuda">Reemplaza todos los datos de este navegador por los del archivo. Antes de restaurar, se revisa que el archivo sea válido.</p>
        <label className="selector-archivo">
          <input type="file" accept=".json,application/json" onChange={alEscogerArchivo} aria-label="Archivo de respaldo" />
          <span className="boton">Escoger archivo de respaldo</span>
        </label>
        <ListaErrores errores={errores} />
        {porRestaurar && (
          <div className="tarjeta-interna formulario">
            <p>
              <strong>{porRestaurar.nombre}</strong>: respaldo del {fechaHoraLegible(porRestaurar.archivo.exportado)} con{' '}
              {conteo(porRestaurar.archivo.datos)}.
            </p>
            <div className="acciones">
              <button className="boton" onClick={() => setPorRestaurar(null)}>
                Cancelar
              </button>
              <button className="boton boton-peligro-solido" onClick={restaurar} disabled={ocupado}>
                Reemplazar todos los datos
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="tarjeta formulario">
        <h2>Historial de importaciones</h2>
        {importaciones.length === 0 ? (
          <p className="texto-tenue">Aún no se ha importado ningún archivo de Odoo.</p>
        ) : (
          <ul className="lista-informe lista-importaciones">
            {importaciones.map((i) => (
              <li key={i.id}>
                <span className="texto-tenue">{fechaHoraLegible(i.fechaHora)}</span>
                <strong>{i.archivo}</strong>
                <span>
                  {i.resumen.facturasNuevas} factura(s) nueva(s), {i.resumen.pagosNuevos} pago(s) por {formatearUSD(i.resumen.montoPagosNuevos)}
                  {i.resumen.paraRevisar > 0 && `, ${i.resumen.paraRevisar} para revisar`}
                  {i.primeraCarga && ' · primera carga'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
