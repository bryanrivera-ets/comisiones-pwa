import Dexie, { type EntityTable } from 'dexie';
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
import {
  ErrorValidacion,
  type CambiosImportacion,
  type DatosCompletos,
  type RegistroImportacion,
  type Repositorio,
} from './Repositorio';

type FilaConfig = { clave: 'reglas'; valor: Reglas } | { clave: 'ultimoRespaldo'; valor: string };

type BaseDatos = Dexie & {
  vendedores: EntityTable<Vendedor, 'id'>;
  facturas: EntityTable<Factura, 'id'>;
  pagos: EntityTable<Pago, 'id'>;
  importaciones: EntityTable<RegistroImportacion, 'id'>;
  config: EntityTable<FilaConfig, 'clave'>;
};

function abrirBaseDatos(nombre: string): BaseDatos {
  const db = new Dexie(nombre) as BaseDatos;
  db.version(1).stores({
    vendedores: 'id',
    // El número (normalizado) es único: es la clave al reimportar desde Odoo.
    facturas: 'id, &numero, vendedorId, fecha',
    pagos: 'id, facturaId, fecha',
    importaciones: 'id, fechaHora',
    config: 'clave',
  });
  return db;
}

/** Repositorio sobre IndexedDB (los datos viven en este navegador). */
export class RepositorioDexie implements Repositorio {
  readonly #db: BaseDatos;
  #oyentes = new Set<() => void>();

  constructor(nombreBaseDatos = 'comisiones') {
    this.#db = abrirBaseDatos(nombreBaseDatos);
  }

  /** Ejecuta `f` en una transacción de escritura sobre todas las tablas y avisa al terminar. */
  async #cambiar(f: (db: BaseDatos) => Promise<void>): Promise<void> {
    const db = this.#db;
    await db.transaction('rw', [db.vendedores, db.facturas, db.pagos, db.importaciones, db.config], () => f(db));
    for (const oyente of this.#oyentes) oyente();
  }

  async obtenerTodo(): Promise<DatosCompletos> {
    const db = this.#db;
    return db.transaction('r', [db.vendedores, db.facturas, db.pagos, db.importaciones, db.config], async () => ({
      vendedores: await db.vendedores.toArray(),
      facturas: await db.facturas.toArray(),
      pagos: await db.pagos.toArray(),
      reglas: await this.obtenerReglas(),
      importaciones: await db.importaciones.orderBy('fechaHora').toArray(),
    }));
  }
  listarVendedores(): Promise<Vendedor[]> {
    return this.#db.vendedores.toArray();
  }
  listarFacturas(): Promise<Factura[]> {
    return this.#db.facturas.toArray();
  }
  listarPagos(): Promise<Pago[]> {
    return this.#db.pagos.toArray();
  }
  async obtenerReglas(): Promise<Reglas> {
    const fila = await this.#db.config.get('reglas');
    return fila?.clave === 'reglas' ? { ...REGLAS_POR_DEFECTO, ...fila.valor } : { ...REGLAS_POR_DEFECTO };
  }

  guardarVendedor(vendedor: Vendedor): Promise<void> {
    return this.#cambiar(async (db) => {
      const v = normalizarVendedor(vendedor);
      exigir(validarVendedor(v, await db.vendedores.toArray()));
      await db.vendedores.put(v);
    });
  }

  eliminarVendedor(id: string): Promise<void> {
    return this.#cambiar(async (db) => {
      const n = await db.facturas.where('vendedorId').equals(id).count();
      if (n > 0) throw new ErrorValidacion([`No se puede eliminar: tiene ${n} factura(s).`]);
      await db.vendedores.delete(id);
    });
  }

  guardarReglas(reglas: Reglas): Promise<void> {
    return this.#cambiar(async (db) => {
      exigir(validarReglas(reglas));
      await db.config.put({ clave: 'reglas', valor: { ...reglas } });
    });
  }

  guardarFactura(factura: Factura): Promise<void> {
    return this.#cambiar(async (db) => {
      const f = normalizarFactura(factura);
      exigir(validarFactura(f, await db.facturas.toArray(), await db.vendedores.toArray()));
      exigir(verificarEdicionFactura(f, await db.pagos.where('facturaId').equals(f.id).toArray()));
      await db.facturas.put(f);
    });
  }

  eliminarFactura(id: string): Promise<void> {
    return this.#cambiar(async (db) => {
      await db.pagos.where('facturaId').equals(id).delete();
      await db.facturas.delete(id);
    });
  }

  agregarPago(pago: Pago): Promise<void> {
    return this.#cambiar(async (db) => {
      const factura = await db.facturas.get(pago.facturaId);
      if (!factura) throw new ErrorValidacion(['La factura no existe.']);
      if (await db.pagos.get(pago.id)) throw new ErrorValidacion(['El pago ya existe.']);
      exigir(validarPago(pago, factura, await db.pagos.where('facturaId').equals(factura.id).toArray()));
      await db.pagos.add(pago);
    });
  }

  eliminarPago(id: string): Promise<void> {
    return this.#cambiar(async (db) => {
      await db.pagos.delete(id);
    });
  }

  aplicarImportacion(cambios: CambiosImportacion): Promise<void> {
    return this.#cambiar(async (db) => {
      const actual = {
        vendedores: await db.vendedores.toArray(),
        facturas: await db.facturas.toArray(),
        pagos: await db.pagos.toArray(),
      };
      exigir(verificarImportacion(cambios, actual));
      const vendedores = aplicarAlias(
        [...actual.vendedores, ...cambios.vendedoresNuevos.map(normalizarVendedor)],
        cambios.aliasNuevos,
      );
      await db.vendedores.bulkPut(vendedores);
      await db.facturas.bulkAdd(cambios.facturasNuevas.map(normalizarFactura));
      await db.pagos.bulkAdd(cambios.pagosNuevos);
      await db.importaciones.add(cambios.registro);
    });
  }

  reemplazarTodo(datos: DatosCompletos): Promise<void> {
    return this.#cambiar(async (db) => {
      exigir(verificarDatosCompletos(datos));
      await Promise.all([db.vendedores.clear(), db.facturas.clear(), db.pagos.clear(), db.importaciones.clear()]);
      await db.vendedores.bulkAdd(datos.vendedores.map(normalizarVendedor));
      await db.facturas.bulkAdd(datos.facturas.map(normalizarFactura));
      await db.pagos.bulkAdd(datos.pagos);
      await db.importaciones.bulkAdd(datos.importaciones);
      await db.config.put({ clave: 'reglas', valor: { ...datos.reglas } });
    });
  }

  async obtenerUltimoRespaldo(): Promise<string | null> {
    const fila = await this.#db.config.get('ultimoRespaldo');
    return fila?.clave === 'ultimoRespaldo' ? fila.valor : null;
  }

  registrarRespaldo(fechaHora: string): Promise<void> {
    return this.#cambiar(async (db) => {
      await db.config.put({ clave: 'ultimoRespaldo', valor: fechaHora });
    });
  }

  suscribir(oyente: () => void): () => void {
    this.#oyentes.add(oyente);
    return () => this.#oyentes.delete(oyente);
  }

  /** Cierra la conexión (pruebas). */
  cerrar(): void {
    this.#db.close();
  }
}
