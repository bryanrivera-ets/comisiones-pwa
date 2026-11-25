import { REGLAS_POR_DEFECTO, type Factura, type Pago, type Reglas, type Vendedor } from '../dominio/tipos';
import { validarFactura, validarPago, validarReglas, validarVendedor } from '../dominio/validaciones';
import {
  aplicarAlias,
  exigir,
  normalizarFactura,
  normalizarVendedor,
  verificarDatosCompletos,
  verificarEdicionFactura,
  verificarImportacion,
} from './integridad';
import { ErrorValidacion, type CambiosImportacion, type DatosCompletos, type Repositorio } from './Repositorio';

interface Estado extends DatosCompletos {
  ultimoRespaldo: string | null;
}

function estadoVacio(): Estado {
  return { vendedores: [], facturas: [], pagos: [], reglas: { ...REGLAS_POR_DEFECTO }, importaciones: [], ultimoRespaldo: null };
}

/**
 * Repositorio en memoria: para pruebas y como referencia de cómo implementar el contrato
 * (por ejemplo, para un backend compartido). Cada cambio trabaja sobre una copia y
 * solo la confirma si todo salió bien, así que es atómico.
 */
export class RepositorioMemoria implements Repositorio {
  #estado: Estado = estadoVacio();
  #oyentes = new Set<() => void>();

  #leer<T>(f: (e: Estado) => T): Promise<T> {
    return Promise.resolve(structuredClone(f(this.#estado)));
  }

  async #cambiar(f: (copia: Estado) => void): Promise<void> {
    const copia = structuredClone(this.#estado);
    f(copia);
    this.#estado = copia;
    for (const oyente of this.#oyentes) oyente();
  }

  obtenerTodo(): Promise<DatosCompletos> {
    return this.#leer(({ ultimoRespaldo: _, ...datos }) => datos);
  }
  listarVendedores(): Promise<Vendedor[]> {
    return this.#leer((e) => e.vendedores);
  }
  listarFacturas(): Promise<Factura[]> {
    return this.#leer((e) => e.facturas);
  }
  listarPagos(): Promise<Pago[]> {
    return this.#leer((e) => e.pagos);
  }
  obtenerReglas(): Promise<Reglas> {
    return this.#leer((e) => e.reglas);
  }

  guardarVendedor(vendedor: Vendedor): Promise<void> {
    return this.#cambiar((e) => {
      const v = normalizarVendedor(vendedor);
      exigir(validarVendedor(v, e.vendedores));
      e.vendedores = [...e.vendedores.filter((x) => x.id !== v.id), v];
    });
  }

  eliminarVendedor(id: string): Promise<void> {
    return this.#cambiar((e) => {
      const n = e.facturas.filter((f) => f.vendedorId === id).length;
      if (n > 0) throw new ErrorValidacion([`No se puede eliminar: tiene ${n} factura(s).`]);
      e.vendedores = e.vendedores.filter((v) => v.id !== id);
    });
  }

  guardarReglas(reglas: Reglas): Promise<void> {
    return this.#cambiar((e) => {
      exigir(validarReglas(reglas));
      e.reglas = { ...reglas };
    });
  }

  guardarFactura(factura: Factura): Promise<void> {
    return this.#cambiar((e) => {
      const f = normalizarFactura(factura);
      exigir(validarFactura(f, e.facturas, e.vendedores));
      exigir(verificarEdicionFactura(f, e.pagos.filter((p) => p.facturaId === f.id)));
      e.facturas = [...e.facturas.filter((x) => x.id !== f.id), f];
    });
  }

  eliminarFactura(id: string): Promise<void> {
    return this.#cambiar((e) => {
      e.facturas = e.facturas.filter((f) => f.id !== id);
      e.pagos = e.pagos.filter((p) => p.facturaId !== id);
    });
  }

  agregarPago(pago: Pago): Promise<void> {
    return this.#cambiar((e) => {
      const factura = e.facturas.find((f) => f.id === pago.facturaId);
      if (!factura) throw new ErrorValidacion(['La factura no existe.']);
      if (e.pagos.some((p) => p.id === pago.id)) throw new ErrorValidacion(['El pago ya existe.']);
      exigir(validarPago(pago, factura, e.pagos.filter((p) => p.facturaId === factura.id)));
      e.pagos.push({ ...pago });
    });
  }

  eliminarPago(id: string): Promise<void> {
    return this.#cambiar((e) => {
      e.pagos = e.pagos.filter((p) => p.id !== id);
    });
  }

  aplicarImportacion(cambios: CambiosImportacion): Promise<void> {
    return this.#cambiar((e) => {
      exigir(verificarImportacion(cambios, e));
      e.vendedores = aplicarAlias([...e.vendedores, ...cambios.vendedoresNuevos.map(normalizarVendedor)], cambios.aliasNuevos);
      e.facturas.push(...cambios.facturasNuevas.map(normalizarFactura));
      e.pagos.push(...cambios.pagosNuevos);
      e.importaciones.push(cambios.registro);
    });
  }

  reemplazarTodo(datos: DatosCompletos): Promise<void> {
    return this.#cambiar((e) => {
      exigir(verificarDatosCompletos(datos));
      const copia = structuredClone(datos);
      e.vendedores = copia.vendedores.map(normalizarVendedor);
      e.facturas = copia.facturas.map(normalizarFactura);
      e.pagos = copia.pagos;
      e.importaciones = copia.importaciones;
      e.reglas = copia.reglas;
    });
  }

  obtenerUltimoRespaldo(): Promise<string | null> {
    return this.#leer((e) => e.ultimoRespaldo);
  }

  registrarRespaldo(fechaHora: string): Promise<void> {
    return this.#cambiar((e) => {
      e.ultimoRespaldo = fechaHora;
    });
  }

  suscribir(oyente: () => void): () => void {
    this.#oyentes.add(oyente);
    return () => this.#oyentes.delete(oyente);
  }
}
