/**
 * Reglas de integridad que toda implementación de Repositorio aplica antes de escribir.
 * Están aquí (y no en cada implementación) para que todas se comporten igual.
 */
import { sumar, formatearUSD } from '../dominio/dinero';
import { formatearFecha } from '../dominio/fechas';
import { normalizarNombre, normalizarNumeroFactura } from '../dominio/texto';
import type { Factura, Pago, Vendedor } from '../dominio/tipos';
import { validarFactura, validarPago, validarReglas, validarVendedor, type Errores } from '../dominio/validaciones';
import { ErrorValidacion, type CambiosImportacion, type DatosCompletos } from './Repositorio';

export function exigir(errores: Errores): void {
  if (errores.length > 0) throw new ErrorValidacion(errores);
}

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Recorta espacios y quita alias vacíos, repetidos o iguales al nombre. */
export function normalizarVendedor(vendedor: Vendedor): Vendedor {
  const nombre = limpiar(vendedor.nombre);
  const vistos = new Set([normalizarNombre(nombre)]);
  const alias: string[] = [];
  for (const a of vendedor.alias) {
    const limpio = limpiar(a);
    const clave = normalizarNombre(limpio);
    if (clave !== '' && !vistos.has(clave)) {
      vistos.add(clave);
      alias.push(limpio);
    }
  }
  return { ...vendedor, nombre, alias };
}

/** El número se guarda normalizado (mayúsculas, sin espacios extra): es la clave al reimportar. */
export function normalizarFactura(factura: Factura): Factura {
  return { ...factura, numero: normalizarNumeroFactura(factura.numero), cliente: limpiar(factura.cliente) };
}

/** Al editar una factura con pagos: no dejar el monto por debajo de lo pagado ni la fecha después de un pago. */
export function verificarEdicionFactura(factura: Factura, pagosDeLaFactura: readonly Pago[]): Errores {
  const errores: Errores = [];
  const pagado = sumar(pagosDeLaFactura.map((p) => p.monto));
  if (factura.montoSinImpuestos < pagado) {
    errores.push(`El monto no puede ser menor que lo ya pagado (${formatearUSD(pagado)}).`);
  }
  const primerPago = pagosDeLaFactura.map((p) => p.fecha).sort()[0];
  if (primerPago !== undefined && factura.fecha > primerPago) {
    errores.push(`La fecha no puede ser posterior al primer pago (${formatearFecha(primerPago)}).`);
  }
  return errores;
}

/** Aplica los alias nuevos a una lista de vendedores (sin mutarla). */
export function aplicarAlias(vendedores: readonly Vendedor[], aliasNuevos: CambiosImportacion['aliasNuevos']): Vendedor[] {
  return vendedores.map((v) => {
    const suyos = aliasNuevos.filter((a) => a.vendedorId === v.id).map((a) => a.alias);
    return suyos.length === 0 ? v : normalizarVendedor({ ...v, alias: [...v.alias, ...suyos] });
  });
}

function pagosPorFactura(pagos: readonly Pago[]): Map<string, Pago[]> {
  const mapa = new Map<string, Pago[]>();
  for (const p of pagos) mapa.set(p.facturaId, [...(mapa.get(p.facturaId) ?? []), p]);
  return mapa;
}

/**
 * Verifica que una importación, aplicada sobre el estado actual, deje los datos consistentes.
 * El planificador del importador ya evita estos casos; esto es la red de seguridad.
 */
export function verificarImportacion(
  cambios: CambiosImportacion,
  actual: Pick<DatosCompletos, 'vendedores' | 'facturas' | 'pagos'>,
): Errores {
  const errores: Errores = [];
  const vendedores = aplicarAlias([...actual.vendedores, ...cambios.vendedoresNuevos.map(normalizarVendedor)], cambios.aliasNuevos);

  for (const { vendedorId } of cambios.aliasNuevos) {
    if (!vendedores.some((v) => v.id === vendedorId)) errores.push('Alias para un vendedor que no existe.');
  }
  for (const v of vendedores) errores.push(...validarVendedor(v, vendedores));

  const facturas = [...actual.facturas];
  for (const f of cambios.facturasNuevas.map(normalizarFactura)) {
    if (facturas.some((x) => x.id === f.id)) errores.push(`La factura ${f.numero} ya existe.`);
    errores.push(...validarFactura(f, facturas, vendedores).map((e) => `${f.numero}: ${e}`));
    facturas.push(f);
  }

  const porFactura = pagosPorFactura(actual.pagos);
  for (const p of cambios.pagosNuevos) {
    const factura = facturas.find((f) => f.id === p.facturaId);
    if (!factura) {
      errores.push('Pago para una factura que no existe.');
      continue;
    }
    const previos = porFactura.get(p.facturaId) ?? [];
    errores.push(...validarPago(p, factura, previos).map((e) => `${factura.numero}: ${e}`));
    porFactura.set(p.facturaId, [...previos, p]);
  }
  return [...new Set(errores)];
}

/** Verifica un conjunto completo de datos (p. ej. un respaldo) antes de reemplazar todo. */
export function verificarDatosCompletos(datos: DatosCompletos): Errores {
  const errores: Errores = [];
  const idsRepetidos = (lista: { id: string }[], que: string) => {
    const ids = new Set<string>();
    for (const x of lista) {
      if (ids.has(x.id)) errores.push(`Hay ${que} con el id repetido ${x.id}.`);
      ids.add(x.id);
    }
  };
  idsRepetidos(datos.vendedores, 'vendedores');
  idsRepetidos(datos.facturas, 'facturas');
  idsRepetidos(datos.pagos, 'pagos');

  errores.push(...validarReglas(datos.reglas));
  for (const v of datos.vendedores) errores.push(...validarVendedor(v, datos.vendedores).map((e) => `${v.nombre}: ${e}`));
  for (const f of datos.facturas) errores.push(...validarFactura(f, datos.facturas, datos.vendedores).map((e) => `${f.numero}: ${e}`));

  const porFactura = pagosPorFactura(datos.pagos);
  for (const [facturaId, pagos] of porFactura) {
    const factura = datos.facturas.find((f) => f.id === facturaId);
    if (!factura) {
      errores.push(`Hay ${pagos.length} pago(s) de una factura que no existe.`);
      continue;
    }
    const acumulados: Pago[] = [];
    for (const p of pagos) {
      errores.push(...validarPago(p, factura, acumulados).map((e) => `${factura.numero}: ${e}`));
      acumulados.push(p);
    }
  }
  return [...new Set(errores)];
}
