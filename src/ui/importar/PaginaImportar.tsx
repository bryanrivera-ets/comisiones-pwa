import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatearUSD, parsearDinero, parsearPorcentaje } from '../../dominio/dinero';
import { formatearFecha, hoyISO } from '../../dominio/fechas';
import type { Vendedor } from '../../dominio/tipos';
import {
  adivinarMapeo,
  CAMPOS,
  CAMPOS_OBLIGATORIOS,
  camposObligatoriosFaltantes,
  detectarEncabezados,
  NOMBRE_CAMPO,
  type Campo,
  type Mapeo,
} from '../../importacion/encabezados';
import { EXTENSIONES_ACEPTADAS, leerArchivo, type Matriz } from '../../importacion/leerArchivo';
import { normalizarFilas } from '../../importacion/normalizar';
import { planificarImportacion, type PlanImportacion, type ResolucionVendedor } from '../../importacion/planificar';
import { crearPlantilla, filasAbiertas, nombrePlantilla, TIPO_XLSX } from '../../importacion/plantilla';
import { guardarArchivo } from '../componentes/descargar';
import type { RegistroImportacion } from '../../datos/Repositorio';
import { Campo as CampoFormulario, Cargando, EntradaDinero, ListaErrores } from '../componentes/comunes';
import { useAccion } from '../componentes/useAccion';
import { useDatos, useRepositorio } from '../datos';
import { InformeImportacion, TarjetasResumen } from './InformeImportacion';

interface ArchivoLeido {
  nombre: string;
  matriz: Matriz;
}

interface EstadoResolucion {
  tipo: 'existente' | 'nuevo' | '';
  vendedorId: string;
  comision: string;
  budget: string;
}

const RESOLUCION_VACIA: EstadoResolucion = { tipo: '', vendedorId: '', comision: '', budget: '' };

/** Convierte lo que el usuario llenó en una resolución válida, o null si falta algo. */
function aResolucion(e: EstadoResolucion, vendedores: Vendedor[]): ResolucionVendedor | null {
  if (e.tipo === 'existente') return vendedores.some((v) => v.id === e.vendedorId) ? { tipo: 'existente', vendedorId: e.vendedorId } : null;
  if (e.tipo === 'nuevo') {
    const comision = parsearPorcentaje(e.comision);
    const budget = e.budget.trim() === '' ? null : parsearDinero(e.budget);
    if (comision === null || (e.budget.trim() !== '' && (budget === null || budget < 0))) return null;
    return { tipo: 'nuevo', comision, budgetTrimestral: budget };
  }
  return null;
}

function nombreColumna(encabezados: readonly unknown[], indice: number): string {
  const letra = indice < 26 ? String.fromCharCode(65 + indice) : `#${indice + 1}`;
  const titulo = encabezados[indice];
  return titulo == null || titulo === '' ? `Columna ${letra}` : `${letra}: ${String(titulo)}`;
}

export function PaginaImportar() {
  const datos = useDatos();
  const repositorio = useRepositorio();
  const { errores, ocupado, ejecutar } = useAccion();

  const [archivo, setArchivo] = useState<ArchivoLeido | null>(null);
  const [errorLectura, setErrorLectura] = useState<string | null>(null);
  const [filaEncabezados, setFilaEncabezados] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo | null>(null);
  const [fechaPagoPorDefecto, setFechaPagoPorDefecto] = useState(hoyISO());
  const [primeraCarga, setPrimeraCarga] = useState(false);
  const [vendedorPorDefectoId, setVendedorPorDefectoId] = useState('');
  const [resoluciones, setResoluciones] = useState<Record<string, EstadoResolucion>>({});
  const [guardado, setGuardado] = useState<RegistroImportacion | null>(null);
  const [incluirAbiertas, setIncluirAbiertas] = useState(false);

  const facturasAbiertas = useMemo(() => (datos ? filasAbiertas(datos) : []), [datos]);

  const vendedores = useMemo(
    () => [...(datos?.vendedores ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [datos],
  );

  const faltantes = mapeo ? camposObligatoriosFaltantes(mapeo) : [...CAMPOS_OBLIGATORIOS];

  const filas = useMemo(
    () =>
      archivo && mapeo && camposObligatoriosFaltantes(mapeo).length === 0
        ? normalizarFilas(archivo.matriz, filaEncabezados, mapeo)
        : null,
    [archivo, filaEncabezados, mapeo],
  );

  const plan: PlanImportacion | null = useMemo(() => {
    if (!filas || !datos) return null;
    const resueltas: Record<string, ResolucionVendedor> = {};
    for (const [clave, estado] of Object.entries(resoluciones)) {
      const r = aResolucion(estado, vendedores);
      if (r) resueltas[clave] = r;
    }
    return planificarImportacion(filas, datos, {
      archivo: archivo?.nombre ?? '',
      fechaPagoPorDefecto,
      primeraCarga,
      vendedorPorDefectoId: vendedorPorDefectoId || null,
      resoluciones: resueltas,
    });
  }, [filas, datos, resoluciones, vendedores, archivo, fechaPagoPorDefecto, primeraCarga, vendedorPorDefectoId]);

  if (!datos) return <Cargando />;

  async function alEscogerArchivo(e: ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    e.target.value = ''; // permite volver a escoger el mismo archivo
    if (!elegido) return;
    setErrorLectura(null);
    setGuardado(null);
    try {
      const matriz = leerArchivo(await elegido.arrayBuffer(), elegido.name);
      if (matriz.length === 0) throw new Error('El archivo está vacío.');
      const deteccion = detectarEncabezados(matriz);
      setArchivo({ nombre: elegido.name, matriz });
      setFilaEncabezados(deteccion.filaEncabezados);
      setMapeo(deteccion.mapeo);
      setResoluciones({});
    } catch (error) {
      setArchivo(null);
      setMapeo(null);
      setErrorLectura(error instanceof Error ? error.message : String(error));
    }
  }

  function descargarPlantilla() {
    // Sin esperas: en iPhone, compartir el archivo debe ocurrir dentro del mismo clic.
    const contenido = crearPlantilla(
      vendedores.map((v) => v.nombre),
      incluirAbiertas ? facturasAbiertas : [],
    );
    void guardarArchivo(nombrePlantilla(hoyISO()), contenido, TIPO_XLSX);
  }

  function cambiarFilaEncabezados(numeroFila: number) {
    if (!archivo) return;
    const indice = Math.min(Math.max(numeroFila - 1, 0), archivo.matriz.length - 1);
    setFilaEncabezados(indice);
    setMapeo(adivinarMapeo(archivo.matriz[indice] ?? []));
  }

  function cambiarResolucion(clave: string, cambio: Partial<EstadoResolucion>) {
    setResoluciones((r) => ({ ...r, [clave]: { ...(r[clave] ?? RESOLUCION_VACIA), ...cambio } }));
  }

  async function guardar() {
    if (!plan?.cambios) return;
    const cambios = plan.cambios;
    if (await ejecutar(() => repositorio.aplicarImportacion(cambios))) {
      setGuardado(cambios.registro);
      setArchivo(null);
      setMapeo(null);
      // Las opciones no se arrastran a la siguiente importación: sobre todo "Primera carga",
      // que dejaría los pagos nuevos sin comisión.
      setPrimeraCarga(false);
      setVendedorPorDefectoId('');
      setFechaPagoPorDefecto(hoyISO());
      setResoluciones({});
    }
  }

  if (guardado) {
    return (
      <section>
        <h1>Importación guardada</h1>
        <div className="tarjeta formulario">
          <p>
            Se importó <strong>{guardado.archivo}</strong>
            {guardado.primeraCarga && ' como primera carga (los pagos quedaron como cobro previo)'}.
          </p>
          <TarjetasResumen resumen={guardado.resumen} />
          <div className="acciones acciones-izquierda">
            <Link className="boton boton-primario" to="/">
              Ver resumen del trimestre
            </Link>
            <Link className="boton" to="/facturas">
              Ver facturas
            </Link>
            <button className="boton" onClick={() => setGuardado(null)}>
              Importar otro archivo
            </button>
          </div>
        </div>
      </section>
    );
  }

  const encabezados = archivo?.matriz[filaEncabezados] ?? [];
  const numColumnas = archivo ? Math.max(...archivo.matriz.slice(filaEncabezados, filaEncabezados + 50).map((f) => f.length), 0) : 0;
  const hayCambios =
    plan?.cambios != null &&
    (plan.cambios.facturasNuevas.length > 0 ||
      plan.cambios.pagosNuevos.length > 0 ||
      plan.cambios.vendedoresNuevos.length > 0 ||
      plan.cambios.aliasNuevos.length > 0);

  return (
    <section className="importar">
      <div className="encabezado-pagina">
        <h1>Importar facturas de Odoo</h1>
        <Link className="boton" to="/facturas">
          Volver a facturas
        </Link>
      </div>

      <div className="tarjeta formulario">
        <h2>1. Archivo</h2>
        <p className="campo-ayuda">
          En Odoo, abre la lista de facturas de cliente, selecciónalas y usa <em>Exportar</em> (o el botón de descarga a Excel).
          Se aceptan {EXTENSIONES_ACEPTADAS.join(', ')}. Puedes subir el mismo reporte varias veces: las facturas se identifican por su número.
        </p>
        <label className="selector-archivo">
          <input type="file" accept={EXTENSIONES_ACEPTADAS.join(',')} onChange={alEscogerArchivo} aria-label="Archivo de Odoo" />
          <span className="boton boton-primario">{archivo ? 'Escoger otro archivo' : 'Escoger archivo'}</span>
          {archivo && (
            <span>
              <strong>{archivo.nombre}</strong> <span className="texto-tenue">· {archivo.matriz.length} filas</span>
            </span>
          )}
        </label>
        {errorLectura && <ListaErrores errores={[errorLectura]} />}

        <div className="plantilla">
          <h3>¿Ventas fuera de Odoo o prefieres llenarlas a mano?</h3>
          <p className="campo-ayuda">
            Descarga la plantilla de Excel, llénala (trae una hoja de instrucciones) y súbela aquí mismo. En «Cobrado» va lo pagado
            hasta hoy, acumulado: puedes volver a subir el mismo archivo cuando lleguen más cobros.
          </p>
          <label className="opcion">
            <input type="checkbox" checked={incluirAbiertas} onChange={(e) => setIncluirAbiertas(e.target.checked)} />
            <span>
              Incluir las facturas abiertas ({facturasAbiertas.length})
              <small className="campo-ayuda">Para anotar sus cobros sin volver a escribirlas.</small>
            </span>
          </label>
          <div className="acciones acciones-izquierda">
            <button className="boton" onClick={descargarPlantilla}>
              Descargar plantilla
            </button>
          </div>
        </div>
      </div>

      {archivo && mapeo && (
        <>
          <div className="tarjeta formulario">
            <h2>2. Columnas</h2>
            <p className="campo-ayuda">
              Revisa que cada dato salga de la columna correcta. Obligatorias: número, fecha de factura y base imponible.
              Lo pagado sale de «Cobrado» (plantilla); si no hay, de Total e Importe adeudado; si tampoco, de Estado de pago.
            </p>
            <CampoFormulario etiqueta="Fila de encabezados">
              <input
                type="number"
                min={1}
                max={archivo.matriz.length}
                value={filaEncabezados + 1}
                onChange={(e) => cambiarFilaEncabezados(Number(e.target.value))}
                className="entrada-numero"
              />
            </CampoFormulario>
            <div className="rejilla-mapeo">
              {CAMPOS.map((campo: Campo) => (
                <label key={campo} className="campo">
                  <span className="campo-etiqueta">
                    {NOMBRE_CAMPO[campo]}
                    {CAMPOS_OBLIGATORIOS.includes(campo) && <span className="obligatorio"> *</span>}
                  </span>
                  <select
                    value={mapeo[campo] ?? ''}
                    onChange={(e) => setMapeo({ ...mapeo, [campo]: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">— No usar —</option>
                    {Array.from({ length: numColumnas }, (_, i) => (
                      <option key={i} value={i}>
                        {nombreColumna(encabezados, i)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {CAMPOS.every((c) => mapeo[c] === null) ? (
              <ListaErrores
                errores={[
                  'No se reconoció ninguna columna. ¿Es el reporte de facturas de cliente de Odoo? Revisa la fila de encabezados o escoge las columnas a mano.',
                ]}
              />
            ) : (
              faltantes.length > 0 && (
                <ListaErrores errores={[`Falta escoger: ${faltantes.map((c) => NOMBRE_CAMPO[c]).join(', ')}.`]} />
              )
            )}
            {filas && filas.length > 0 && (
              <details>
                <summary>Vista previa de las primeras filas</summary>
                <div className="tabla-desplazable">
                  <table className="tabla tabla-compacta">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Número</th>
                        <th>Fecha</th>
                        <th>Vendedor</th>
                        <th className="cifra">Sin impuestos</th>
                        <th className="cifra">Pagado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, 5).map((f) => (
                        <tr key={f.filaExcel}>
                          <td>{f.filaExcel}</td>
                          <td>{f.numero || '—'}</td>
                          <td>{f.fecha ? formatearFecha(f.fecha) : <span className="texto-peligro">{f.fechaOriginal || '—'}</span>}</td>
                          <td>{f.vendedor || '—'}</td>
                          <td className="cifra">{f.montoSinImpuestos === null ? '—' : formatearUSD(f.montoSinImpuestos)}</td>
                          <td className="cifra">{f.pagado === null ? '—' : formatearUSD(f.pagado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>

          {filas && (
            <div className="tarjeta formulario">
              <h2>3. Opciones</h2>
              <div className="fila-campos">
                <CampoFormulario etiqueta="Fecha para pagos sin fecha" ayuda="Se usa cuando el archivo no trae la fecha del pago.">
                  <input type="date" value={fechaPagoPorDefecto} onChange={(e) => setFechaPagoPorDefecto(e.target.value)} />
                </CampoFormulario>
                <CampoFormulario etiqueta="Filas sin vendedor" ayuda="Se omiten, o se asignan al vendedor que escojas.">
                  <select value={vendedorPorDefectoId} onChange={(e) => setVendedorPorDefectoId(e.target.value)}>
                    <option value="">Omitirlas</option>
                    {vendedores.map((v) => (
                      <option key={v.id} value={v.id}>
                        Asignarlas a {v.nombre}
                      </option>
                    ))}
                  </select>
                </CampoFormulario>
              </div>
              <label className="opcion">
                <input type="checkbox" checked={primeraCarga} onChange={(e) => setPrimeraCarga(e.target.checked)} />
                <span>
                  Primera carga
                  <small className="campo-ayuda">
                    Los pagos importados quedan como <strong>cobro previo</strong>: se registran pero no generan comisión. Úsalo para
                    cargar el historial la primera vez.
                  </small>
                </span>
              </label>
            </div>
          )}

          {plan && plan.vendedoresDesconocidos.length > 0 && (
            <div className="tarjeta formulario">
              <h2>4. Vendedores que no se reconocen</h2>
              <p className="campo-ayuda">
                Indica si cada nombre es un vendedor que ya existe (el nombre se guardará como su alias) o uno nuevo.
              </p>
              {plan.vendedoresDesconocidos.map((d) => {
                const estado = resoluciones[d.clave] ?? RESOLUCION_VACIA;
                const pendiente = plan.pendientesDeResolver.some((p) => p.clave === d.clave);
                return (
                  <fieldset key={d.clave} className={`grupo vendedor-desconocido${pendiente ? ' pendiente' : ''}`}>
                    <legend>
                      “{d.nombre}” <span className="texto-tenue">· {d.filas} fila(s)</span>
                    </legend>
                    <label className="opcion">
                      <input
                        type="radio"
                        name={`res-${d.clave}`}
                        checked={estado.tipo === 'existente'}
                        onChange={() => cambiarResolucion(d.clave, { tipo: 'existente' })}
                      />
                      <span>Es un vendedor existente</span>
                    </label>
                    {estado.tipo === 'existente' && (
                      <select
                        aria-label={`Vendedor existente para ${d.nombre}`}
                        value={estado.vendedorId}
                        onChange={(e) => cambiarResolucion(d.clave, { vendedorId: e.target.value })}
                        className="sangria"
                      >
                        <option value="">Escoge…</option>
                        {vendedores.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nombre}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="opcion">
                      <input
                        type="radio"
                        name={`res-${d.clave}`}
                        checked={estado.tipo === 'nuevo'}
                        onChange={() => cambiarResolucion(d.clave, { tipo: 'nuevo' })}
                      />
                      <span>Crear vendedor nuevo</span>
                    </label>
                    {estado.tipo === 'nuevo' && (
                      <div className="fila-campos sangria">
                        <CampoFormulario etiqueta={`Comisión (%) de ${d.nombre}`}>
                          <input
                            value={estado.comision}
                            inputMode="decimal"
                            placeholder="5"
                            onChange={(e) => cambiarResolucion(d.clave, { comision: e.target.value })}
                          />
                        </CampoFormulario>
                        <CampoFormulario etiqueta={`Budget trimestral de ${d.nombre}`} ayuda="Vacío = sin budget.">
                          <EntradaDinero value={estado.budget} onChange={(e) => cambiarResolucion(d.clave, { budget: e.target.value })} />
                        </CampoFormulario>
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
          )}

          {plan && (
            <div className="tarjeta formulario">
              <h2>{plan.vendedoresDesconocidos.length > 0 ? '5' : '4'}. Resumen antes de guardar</h2>
              <InformeImportacion plan={plan} />
              {plan.pendientesDeResolver.length > 0 && (
                <ListaErrores
                  errores={[
                    `Falta indicar quién es: ${plan.pendientesDeResolver.map((p) => `“${p.nombre}”`).join(', ')}. Esas filas aún no aparecen en el resumen.`,
                  ]}
                />
              )}
              <ListaErrores errores={errores} />
              <div className="acciones">
                {!hayCambios && plan.pendientesDeResolver.length === 0 && (
                  <span className="texto-tenue">No hay nada nuevo que guardar.</span>
                )}
                <button className="boton boton-primario" onClick={guardar} disabled={!hayCambios || ocupado}>
                  Guardar importación
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
