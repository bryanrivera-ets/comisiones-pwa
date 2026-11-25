import type { Centavos } from '../dominio/dinero';
import type { Factura, Pago, Reglas, Vendedor } from '../dominio/tipos';

/** Constancia de cada importación desde Odoo (auditoría). */
export interface RegistroImportacion {
  id: string;
  /** Fecha y hora ISO completa. */
  fechaHora: string;
  archivo: string;
  primeraCarga: boolean;
  resumen: {
    facturasNuevas: number;
    pagosNuevos: number;
    montoPagosNuevos: Centavos;
    sinCambios: number;
    omitidas: number;
    paraRevisar: number;
  };
}

/** Todos los datos de la app: lo que se respalda y restaura. */
export interface DatosCompletos {
  vendedores: Vendedor[];
  facturas: Factura[];
  pagos: Pago[];
  reglas: Reglas;
  importaciones: RegistroImportacion[];
}

/** Lo que una importación confirmada escribe, todo o nada. */
export interface CambiosImportacion {
  registro: RegistroImportacion;
  vendedoresNuevos: Vendedor[];
  /** Nombres de Odoo que se guardan como alias de un vendedor existente o nuevo. */
  aliasNuevos: { vendedorId: string; alias: string }[];
  facturasNuevas: Factura[];
  pagosNuevos: Pago[];
}

/**
 * Contrato de la capa de datos. La app solo habla con esta interfaz, así que
 * cambiar IndexedDB por un backend compartido o por Odoo es escribir otra implementación.
 *
 * Toda implementación debe:
 * - validar con las reglas del dominio y lanzar ErrorValidacion (mensajes en español) si algo no cuadra;
 * - hacer cada operación de forma atómica (todo o nada);
 * - devolver copias: modificar lo leído no cambia lo guardado;
 * - avisar a los suscriptores después de cada cambio.
 */
export interface Repositorio {
  obtenerTodo(): Promise<DatosCompletos>;
  listarVendedores(): Promise<Vendedor[]>;
  listarFacturas(): Promise<Factura[]>;
  listarPagos(): Promise<Pago[]>;
  obtenerReglas(): Promise<Reglas>;

  /** Crea o actualiza (por id). Normaliza nombre y alias. */
  guardarVendedor(vendedor: Vendedor): Promise<void>;
  /** Solo si no tiene facturas. */
  eliminarVendedor(id: string): Promise<void>;
  guardarReglas(reglas: Reglas): Promise<void>;

  /** Crea o actualiza (por id). Al editar, el monto no puede quedar por debajo de lo pagado. */
  guardarFactura(factura: Factura): Promise<void>;
  /** Elimina la factura y sus pagos. */
  eliminarFactura(id: string): Promise<void>;
  /** Valida fecha ≥ factura y monto ≤ balance. */
  agregarPago(pago: Pago): Promise<void>;
  eliminarPago(id: string): Promise<void>;

  aplicarImportacion(cambios: CambiosImportacion): Promise<void>;
  /** Restaura un respaldo: borra todo y escribe los datos dados. */
  reemplazarTodo(datos: DatosCompletos): Promise<void>;

  /** Fecha y hora ISO del último respaldo exportado, o null. */
  obtenerUltimoRespaldo(): Promise<string | null>;
  registrarRespaldo(fechaHora: string): Promise<void>;

  /** Llama a `oyente` después de cada cambio. Devuelve la función para dejar de escuchar. */
  suscribir(oyente: () => void): () => void;
}

export class ErrorValidacion extends Error {
  readonly errores: string[];
  constructor(errores: string[]) {
    super(errores.join(' '));
    this.name = 'ErrorValidacion';
    this.errores = errores;
  }
}

export function nuevoId(): string {
  return crypto.randomUUID();
}
