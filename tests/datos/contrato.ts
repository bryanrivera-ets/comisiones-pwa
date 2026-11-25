/**
 * Batería de pruebas del contrato Repositorio. Se corre contra cada implementación:
 * cualquier implementación futura (backend, Odoo) debe pasarla igual.
 */
import { describe, expect, it, vi } from 'vitest';
import { calcularResumenTrimestre } from '../../src/dominio/comisiones';
import { usd } from '../../src/dominio/dinero';
import { REGLAS_POR_DEFECTO, type Factura, type Pago, type Vendedor } from '../../src/dominio/tipos';
import {
  ErrorValidacion,
  nuevoId,
  type CambiosImportacion,
  type DatosCompletos,
  type Repositorio,
} from '../../src/datos/Repositorio';
import { crearRespaldo, leerRespaldo, serializarRespaldo } from '../../src/datos/respaldo';

function vendedor(datos: Partial<Vendedor> & { nombre: string }): Vendedor {
  return { id: nuevoId(), budgetTrimestral: null, comision: 500, alias: [], ...datos };
}
function factura(v: Vendedor, numero: string, fecha: string, dolares: number, datos: Partial<Factura> = {}): Factura {
  return {
    id: nuevoId(),
    numero,
    cliente: 'Cliente',
    vendedorId: v.id,
    fecha,
    montoSinImpuestos: usd(dolares),
    total: null,
    origen: 'manual',
    ...datos,
  };
}
function pago(f: Factura, fecha: string, dolares: number, datos: Partial<Pago> = {}): Pago {
  return { id: nuevoId(), facturaId: f.id, fecha, monto: usd(dolares), cobroPrevio: false, origen: 'manual', ...datos };
}

const porId = <T extends { id: string }>(lista: T[]) => [...lista].sort((a, b) => a.id.localeCompare(b.id));

/** Error de validación con los mensajes esperados (subcadenas). */
async function esperarError(promesa: Promise<unknown>, ...mensajes: string[]) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ErrorValidacion);
  for (const m of mensajes) expect((error as ErrorValidacion).errores.join('\n')).toContain(m);
}

export function probarContratoRepositorio(nombre: string, crear: () => Promise<Repositorio> | Repositorio) {
  describe(`Repositorio: ${nombre}`, () => {
    it('empieza vacío y con las reglas por defecto', async () => {
      const repo = await crear();
      expect(await repo.obtenerTodo()).toEqual({
        vendedores: [],
        facturas: [],
        pagos: [],
        reglas: REGLAS_POR_DEFECTO,
        importaciones: [],
      });
      expect(await repo.obtenerUltimoRespaldo()).toBeNull();
    });

    describe('vendedores', () => {
      it('guarda normalizando nombre y alias', async () => {
        const repo = await crear();
        const v = vendedor({ nombre: '  Juan   Pérez ', alias: ['JUAN P', ' juan p ', 'Juan Perez', '', 'jperez'] });
        await repo.guardarVendedor(v);
        const [guardado] = await repo.listarVendedores();
        expect(guardado).toEqual({ ...v, nombre: 'Juan Pérez', alias: ['JUAN P', 'jperez'] });
      });

      it('devuelve copias: modificar lo leído no cambia lo guardado', async () => {
        const repo = await crear();
        await repo.guardarVendedor(vendedor({ nombre: 'Ana', alias: ['A'] }));
        const [leido] = await repo.listarVendedores();
        leido!.alias.push('cambiado');
        leido!.nombre = 'Otro';
        const [otraVez] = await repo.listarVendedores();
        expect(otraVez!.nombre).toBe('Ana');
        expect(otraVez!.alias).toEqual(['A']);
      });

      it('actualiza por id', async () => {
        const repo = await crear();
        const v = vendedor({ nombre: 'Ana' });
        await repo.guardarVendedor(v);
        await repo.guardarVendedor({ ...v, budgetTrimestral: usd(1000) });
        expect(await repo.listarVendedores()).toEqual([{ ...v, budgetTrimestral: usd(1000) }]);
      });

      it('rechaza un alias que pertenece a otro vendedor', async () => {
        const repo = await crear();
        await repo.guardarVendedor(vendedor({ nombre: 'Juan', alias: ['JP'] }));
        await esperarError(repo.guardarVendedor(vendedor({ nombre: 'Juana', alias: ['jp'] })), 'ya pertenece a Juan');
        expect(await repo.listarVendedores()).toHaveLength(1);
      });

      it('solo se elimina si no tiene facturas', async () => {
        const repo = await crear();
        const ana = vendedor({ nombre: 'Ana' });
        const beto = vendedor({ nombre: 'Beto' });
        await repo.guardarVendedor(ana);
        await repo.guardarVendedor(beto);
        await repo.guardarFactura(factura(ana, 'F1', '2026-07-01', 100));
        await esperarError(repo.eliminarVendedor(ana.id), 'tiene 1 factura');
        await repo.eliminarVendedor(beto.id);
        expect((await repo.listarVendedores()).map((v) => v.nombre)).toEqual(['Ana']);
      });
    });

    describe('reglas', () => {
      it('se guardan y se leen; las inválidas se rechazan', async () => {
        const repo = await crear();
        const reglas = { descuento: 1500, baseBudget: 'cobrado', baseDescuento: 'trimestreFactura' } as const;
        await repo.guardarReglas(reglas);
        expect(await repo.obtenerReglas()).toEqual(reglas);
        await esperarError(repo.guardarReglas({ ...reglas, descuento: 20000 }), 'descuento');
        expect(await repo.obtenerReglas()).toEqual(reglas);
      });
    });

    describe('facturas', () => {
      async function conVendedor() {
        const repo = await crear();
        const v = vendedor({ nombre: 'Ana' });
        await repo.guardarVendedor(v);
        return { repo, v };
      }

      it('guarda el número normalizado y no permite repetirlo', async () => {
        const { repo, v } = await conVendedor();
        await repo.guardarFactura(factura(v, ' inv/2026/0001 ', '2026-07-01', 100));
        expect((await repo.listarFacturas())[0]!.numero).toBe('INV/2026/0001');
        await esperarError(repo.guardarFactura(factura(v, 'INV/2026/0001', '2026-07-02', 50)), 'Ya existe la factura');
        expect(await repo.listarFacturas()).toHaveLength(1);
      });

      it('exige un vendedor existente', async () => {
        const { repo } = await conVendedor();
        await esperarError(repo.guardarFactura(factura(vendedor({ nombre: 'Fantasma' }), 'F1', '2026-07-01', 100)), 'Escoge un vendedor');
      });

      it('al editar, el monto no baja de lo pagado ni la fecha pasa del primer pago', async () => {
        const { repo, v } = await conVendedor();
        const f = factura(v, 'F1', '2026-07-01', 1000);
        await repo.guardarFactura(f);
        await repo.agregarPago(pago(f, '2026-07-10', 600));
        await esperarError(repo.guardarFactura({ ...f, montoSinImpuestos: usd(500) }), 'menor que lo ya pagado ($600.00)');
        await esperarError(repo.guardarFactura({ ...f, fecha: '2026-07-11' }), 'posterior al primer pago (10/07/2026)');
        await repo.guardarFactura({ ...f, montoSinImpuestos: usd(600), cliente: 'Nuevo' });
        expect((await repo.listarFacturas())[0]).toMatchObject({ montoSinImpuestos: usd(600), cliente: 'Nuevo' });
      });

      it('eliminar una factura elimina sus pagos (y no los de otras)', async () => {
        const { repo, v } = await conVendedor();
        const f1 = factura(v, 'F1', '2026-07-01', 1000);
        const f2 = factura(v, 'F2', '2026-07-01', 1000);
        await repo.guardarFactura(f1);
        await repo.guardarFactura(f2);
        await repo.agregarPago(pago(f1, '2026-07-02', 100));
        await repo.agregarPago(pago(f1, '2026-07-03', 100));
        const p2 = pago(f2, '2026-07-02', 100);
        await repo.agregarPago(p2);
        await repo.eliminarFactura(f1.id);
        expect((await repo.listarFacturas()).map((f) => f.numero)).toEqual(['F2']);
        expect(await repo.listarPagos()).toEqual([p2]);
      });
    });

    describe('pagos', () => {
      async function conFactura() {
        const repo = await crear();
        const v = vendedor({ nombre: 'Ana' });
        const f = factura(v, 'F1', '2026-07-10', 1000);
        await repo.guardarVendedor(v);
        await repo.guardarFactura(f);
        return { repo, f };
      }

      it('registra pagos parciales hasta completar el balance', async () => {
        const { repo, f } = await conFactura();
        await repo.agregarPago(pago(f, '2026-08-01', 400));
        await repo.agregarPago(pago(f, '2026-09-01', 600));
        await esperarError(repo.agregarPago(pago(f, '2026-09-02', 0.01)), 'mayor que el balance de la factura ($0.00)');
        expect(await repo.listarPagos()).toHaveLength(2);
      });

      it('rechaza pagos anteriores a la factura, de facturas inexistentes o repetidos', async () => {
        const { repo, f } = await conFactura();
        await esperarError(repo.agregarPago(pago(f, '2026-07-09', 100)), 'anterior a la factura');
        await esperarError(repo.agregarPago(pago({ ...f, id: 'no-existe' }, '2026-08-01', 100)), 'La factura no existe');
        const p = pago(f, '2026-08-01', 100);
        await repo.agregarPago(p);
        await esperarError(repo.agregarPago(p), 'El pago ya existe');
      });

      it('se pueden quitar', async () => {
        const { repo, f } = await conFactura();
        const p = pago(f, '2026-08-01', 100);
        await repo.agregarPago(p);
        await repo.eliminarPago(p.id);
        expect(await repo.listarPagos()).toEqual([]);
      });
    });

    describe('importación', () => {
      async function base() {
        const repo = await crear();
        const juan = vendedor({ nombre: 'Juan' });
        const existente = factura(juan, 'INV/1', '2026-07-01', 1000);
        await repo.guardarVendedor(juan);
        await repo.guardarFactura(existente);
        return { repo, juan, existente };
      }

      function cambios(parcial: Partial<CambiosImportacion>): CambiosImportacion {
        return {
          registro: {
            id: nuevoId(),
            fechaHora: '2026-11-24T10:00:00.000Z',
            archivo: 'odoo.xlsx',
            primeraCarga: false,
            resumen: { facturasNuevas: 0, pagosNuevos: 0, montoPagosNuevos: 0, sinCambios: 0, omitidas: 0, paraRevisar: 0 },
          },
          vendedoresNuevos: [],
          aliasNuevos: [],
          facturasNuevas: [],
          pagosNuevos: [],
          ...parcial,
        };
      }

      it('aplica vendedores, alias, facturas, pagos y el registro de una vez', async () => {
        const { repo, juan, existente } = await base();
        const maria = vendedor({ nombre: 'María' });
        const nueva = factura(maria, 'inv/2', '2026-10-01', 500);
        await repo.aplicarImportacion(
          cambios({
            vendedoresNuevos: [maria],
            aliasNuevos: [
              { vendedorId: juan.id, alias: 'JUAN ODOO' },
              { vendedorId: maria.id, alias: 'Maria G' },
            ],
            facturasNuevas: [nueva],
            pagosNuevos: [pago(existente, '2026-10-05', 1000), pago(nueva, '2026-10-06', 200, { origen: 'importacion' })],
          }),
        );
        const datos = await repo.obtenerTodo();
        expect(datos.vendedores.find((v) => v.id === juan.id)!.alias).toEqual(['JUAN ODOO']);
        expect(datos.vendedores.find((v) => v.id === maria.id)!.alias).toEqual(['Maria G']);
        expect(datos.facturas.map((f) => f.numero).sort()).toEqual(['INV/1', 'INV/2']);
        expect(datos.pagos).toHaveLength(2);
        expect(datos.importaciones).toHaveLength(1);
      });

      it('es todo o nada: si un pago no es válido, no se guarda nada', async () => {
        const { repo, existente } = await base();
        const antes = await repo.obtenerTodo();
        const maria = vendedor({ nombre: 'María' });
        await esperarError(
          repo.aplicarImportacion(
            cambios({
              vendedoresNuevos: [maria],
              facturasNuevas: [factura(maria, 'INV/2', '2026-10-01', 500)],
              pagosNuevos: [pago(existente, '2026-10-05', 600), pago(existente, '2026-10-06', 600)],
            }),
          ),
          'INV/1: El pago ($600.00) es mayor que el balance de la factura ($400.00).',
        );
        expect(await repo.obtenerTodo()).toEqual(antes);
      });

      it('rechaza facturas ya existentes y alias que pertenecen a otro', async () => {
        const { repo, juan } = await base();
        const ana = vendedor({ nombre: 'Ana' });
        await esperarError(
          repo.aplicarImportacion(
            cambios({
              vendedoresNuevos: [ana],
              aliasNuevos: [{ vendedorId: ana.id, alias: 'juan' }],
              facturasNuevas: [factura(juan, 'inv/1', '2026-07-02', 10)],
            }),
          ),
          'ya pertenece a',
          'Ya existe la factura',
        );
      });
    });

    describe('respaldo y restauración', () => {
      it('exportar y restaurar en otro repositorio deja los mismos datos', async () => {
        const origen = await crear();
        const juan = vendedor({ nombre: 'Juan', budgetTrimestral: usd(2500), alias: ['JP'] });
        const f = factura(juan, 'INV/1', '2026-07-10', 2000, { total: usd(2300) });
        await origen.guardarVendedor(juan);
        await origen.guardarFactura(f);
        await origen.agregarPago(pago(f, '2026-10-15', 1000, { cobroPrevio: true }));
        await origen.guardarReglas({ ...REGLAS_POR_DEFECTO, descuento: 1000 });

        const texto = serializarRespaldo(crearRespaldo(await origen.obtenerTodo()));
        const destino = await crear();
        await destino.reemplazarTodo(leerRespaldo(texto).datos);

        const a = await origen.obtenerTodo();
        const b = await destino.obtenerTodo();
        expect(porId(b.vendedores)).toEqual(porId(a.vendedores));
        expect(porId(b.facturas)).toEqual(porId(a.facturas));
        expect(porId(b.pagos)).toEqual(porId(a.pagos));
        expect(b.reglas).toEqual(a.reglas);
      });

      it('restaurar reemplaza lo que había', async () => {
        const repo = await crear();
        await repo.guardarVendedor(vendedor({ nombre: 'Viejo' }));
        const nuevo = vendedor({ nombre: 'Nuevo' });
        await repo.reemplazarTodo({ vendedores: [nuevo], facturas: [], pagos: [], reglas: REGLAS_POR_DEFECTO, importaciones: [] });
        expect(await repo.listarVendedores()).toEqual([nuevo]);
      });

      it('datos inconsistentes se rechazan y no se toca nada', async () => {
        const repo = await crear();
        const ana = vendedor({ nombre: 'Ana' });
        await repo.guardarVendedor(ana);
        const f = factura(ana, 'F1', '2026-07-01', 100);
        const malos: DatosCompletos = {
          vendedores: [ana],
          facturas: [f],
          pagos: [pago(f, '2026-07-02', 150)],
          reglas: REGLAS_POR_DEFECTO,
          importaciones: [],
        };
        await esperarError(repo.reemplazarTodo(malos), 'mayor que el balance');
        expect(await repo.listarFacturas()).toEqual([]);
        expect(await repo.listarVendedores()).toEqual([ana]);
      });

      it('recuerda la fecha del último respaldo', async () => {
        const repo = await crear();
        await repo.registrarRespaldo('2026-11-24T15:00:00.000Z');
        expect(await repo.obtenerUltimoRespaldo()).toBe('2026-11-24T15:00:00.000Z');
      });
    });

    it('avisa a los suscriptores tras cada cambio, no tras un error, y deja de avisar al desuscribirse', async () => {
      const repo = await crear();
      const oyente = vi.fn();
      const desuscribir = repo.suscribir(oyente);
      await repo.guardarVendedor(vendedor({ nombre: 'Ana' }));
      expect(oyente).toHaveBeenCalledTimes(1);
      await repo.guardarVendedor(vendedor({ nombre: '' })).catch(() => {});
      expect(oyente).toHaveBeenCalledTimes(1);
      desuscribir();
      await repo.guardarVendedor(vendedor({ nombre: 'Beto' }));
      expect(oyente).toHaveBeenCalledTimes(1);
    });

    it('el escenario del enunciado, guardado y leído, da los mismos números', async () => {
      const repo = await crear();
      const juan = vendedor({ nombre: 'Juan', budgetTrimestral: usd(2500) });
      const maria = vendedor({ nombre: 'María', budgetTrimestral: usd(4000) });
      const f1 = factura(juan, 'J1', '2026-07-10', 2000);
      const f2 = factura(juan, 'J2', '2026-07-20', 1000);
      const f3 = factura(maria, 'M1', '2026-10-05', 5000);
      for (const v of [juan, maria]) await repo.guardarVendedor(v);
      for (const f of [f1, f2, f3]) await repo.guardarFactura(f);
      await repo.agregarPago(pago(f1, '2026-10-15', 1000));
      await repo.agregarPago(pago(f1, '2026-12-10', 1000));
      await repo.agregarPago(pago(f2, '2026-10-20', 1000));
      await repo.agregarPago(pago(f3, '2026-12-15', 2500));

      const resumen = calcularResumenTrimestre(await repo.obtenerTodo(), { anio: 2026, numero: 4 });
      expect(resumen.map((r) => [r.vendedor.nombre, r.neto, r.pendiente])).toEqual([
        ['Juan', usd(120), 0],
        ['María', usd(125), usd(125)],
      ]);
    });
  });
}
