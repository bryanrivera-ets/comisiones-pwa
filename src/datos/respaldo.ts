import { z } from 'zod';
import { esFechaISO } from '../dominio/fechas';
import { verificarDatosCompletos } from './integridad';
import { ErrorValidacion, type DatosCompletos } from './Repositorio';

z.config(z.locales.es());

export const IDENTIFICADOR_APP = 'comisiones-pwa';
export const VERSION_RESPALDO = 1;

const entero = () => z.number().int('Debe ser un número entero');
const centavos = entero();
const fecha = z.string().refine(esFechaISO, 'Fecha inválida (se espera AAAA-MM-DD)');
const origen = z.enum(['manual', 'importacion']);

const esquemaDatos = z.object({
  vendedores: z.array(
    z.object({
      id: z.string().min(1),
      nombre: z.string(),
      budgetTrimestral: centavos.nullable(),
      comision: entero(),
      alias: z.array(z.string()),
    }),
  ),
  facturas: z.array(
    z.object({
      id: z.string().min(1),
      numero: z.string(),
      cliente: z.string(),
      vendedorId: z.string(),
      fecha,
      montoSinImpuestos: centavos,
      total: centavos.nullable(),
      origen,
    }),
  ),
  pagos: z.array(
    z.object({
      id: z.string().min(1),
      facturaId: z.string(),
      fecha,
      monto: centavos,
      cobroPrevio: z.boolean(),
      origen,
      importacionId: z.string().optional(),
    }),
  ),
  reglas: z.object({
    descuento: entero(),
    baseBudget: z.enum(['facturado', 'cobrado']),
    baseDescuento: z.enum(['trimestrePago', 'trimestreFactura']),
  }),
  importaciones: z.array(
    z.object({
      id: z.string().min(1),
      fechaHora: z.string(),
      archivo: z.string(),
      primeraCarga: z.boolean(),
      resumen: z.object({
        facturasNuevas: entero(),
        pagosNuevos: entero(),
        montoPagosNuevos: centavos,
        sinCambios: entero(),
        omitidas: entero(),
        paraRevisar: entero(),
      }),
    }),
  ),
});

const esquemaArchivo = z.object({
  app: z.literal(IDENTIFICADOR_APP),
  version: entero(),
  exportado: z.string(),
  datos: esquemaDatos,
});

export interface ArchivoRespaldo {
  app: typeof IDENTIFICADOR_APP;
  version: number;
  exportado: string;
  datos: DatosCompletos;
}

export function crearRespaldo(datos: DatosCompletos, ahora: Date = new Date()): ArchivoRespaldo {
  return { app: IDENTIFICADOR_APP, version: VERSION_RESPALDO, exportado: ahora.toISOString(), datos };
}

/** "comisiones-respaldo-2026-11-24.json" */
export function nombreArchivoRespaldo(ahora: Date = new Date()): string {
  const d = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  return `comisiones-respaldo-${d}.json`;
}

export function serializarRespaldo(archivo: ArchivoRespaldo): string {
  return JSON.stringify(archivo, null, 2);
}

const MAX_ERRORES = 10;

/**
 * Lee y valida el texto de un archivo de respaldo.
 * Lanza ErrorValidacion con mensajes en español si el archivo no sirve.
 */
export function leerRespaldo(texto: string): ArchivoRespaldo {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    throw new ErrorValidacion(['El archivo no es un JSON válido.']);
  }

  if (typeof crudo !== 'object' || crudo === null || (crudo as { app?: unknown }).app !== IDENTIFICADOR_APP) {
    throw new ErrorValidacion(['El archivo no es un respaldo de esta app.']);
  }
  const version = (crudo as { version?: unknown }).version;
  if (typeof version === 'number' && version > VERSION_RESPALDO) {
    throw new ErrorValidacion(['El respaldo es de una versión más nueva de la app. Actualiza la app e inténtalo de nuevo.']);
  }

  const resultado = esquemaArchivo.safeParse(crudo);
  if (!resultado.success) {
    const errores = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ErrorValidacion(recortar(errores));
  }

  const errores = verificarDatosCompletos(resultado.data.datos);
  if (errores.length > 0) throw new ErrorValidacion(recortar(errores));
  return resultado.data;
}

function recortar(errores: string[]): string[] {
  return errores.length <= MAX_ERRORES ? errores : [...errores.slice(0, MAX_ERRORES), `…y ${errores.length - MAX_ERRORES} error(es) más.`];
}
