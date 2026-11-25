import { nuevoId as idAleatorio, type CambiosImportacion, type DatosCompletos } from '../datos/Repositorio';
import { formatearUSD, sumar, type Centavos, type PuntosBasicos } from '../dominio/dinero';
import { formatearFecha, type FechaISO } from '../dominio/fechas';
import { normalizarNombre, normalizarNumeroFactura } from '../dominio/texto';
import type { Factura, Pago, Vendedor } from '../dominio/tipos';
import { buscarVendedorPorNombre } from '../dominio/vendedores';
import type { FilaOdoo } from './normalizar';

/** Qué hacer con un nombre de vendedor que no se reconoce. */
export type ResolucionVendedor =
  | { tipo: 'existente'; vendedorId: string }
  | { tipo: 'nuevo'; comision: PuntosBasicos; budgetTrimestral: Centavos | null };

export interface OpcionesImportacion {
  archivo: string;
  /** Fecha para los pagos que no traen fecha en el archivo. */
  fechaPagoPorDefecto: FechaISO;
  /** Los pagos importados quedan como cobro previo (no generan comisión). */
  primeraCarga: boolean;
  /** Vendedor para las filas sin vendedor; null = omitirlas. */
  vendedorPorDefectoId: string | null;
  /** Por nombre normalizado (normalizarNombre) del vendedor tal como viene en el archivo. */
  resoluciones: Record<string, ResolucionVendedor>;
  ahora?: Date;
  nuevoId?: () => string;
}

/** Una fila en una de las listas del resumen. */
export interface FilaInforme {
  filaExcel: number;
  numero: string;
  detalle: string;
}

export interface FacturaNuevaPlan {
  filaExcel: number;
  factura: Factura;
  vendedor: string;
  pago: Pago | null;
}

export interface PagoNuevoPlan {
  filaExcel: number;
  factura: Factura;
  pago: Pago;
  pagadoAntes: Centavos;
}

export interface VendedorDesconocido {
  /** Como aparece en el archivo (primera vez). */
  nombre: string;
  /** Clave para `resoluciones`. */
  clave: string;
  filas: number;
}

export interface PlanImportacion {
  facturasNuevas: FacturaNuevaPlan[];
  pagosNuevos: PagoNuevoPlan[];
  sinCambios: FilaInforme[];
  omitidas: FilaInforme[];
  paraRevisar: FilaInforme[];
  avisos: FilaInforme[];
  /** Todos los nombres de vendedor no reconocidos (resueltos o no). */
  vendedoresDesconocidos: VendedorDesconocido[];
  /** Los que aún no tienen resolución: mientras haya alguno, no se puede guardar. */
  pendientesDeResolver: VendedorDesconocido[];
  resumen: CambiosImportacion['registro']['resumen'];
  /** Lo que se escribiría; null mientras falte resolver vendedores. */
  cambios: CambiosImportacion | null;
}

const TOLERANCIA: Centavos = 1;
const RE_NOTA_CREDITO = /^(RINV|NC|N\/C|NCR)[/\-\s]/i;

export function esNotaDeCredito(fila: Pick<FilaOdoo, 'numero' | 'montoSinImpuestos'>): boolean {
  return RE_NOTA_CREDITO.test(fila.numero) || (fila.montoSinImpuestos !== null && fila.montoSinImpuestos <= 0);
}

/**
 * Compara las filas del reporte de Odoo con lo ya registrado y decide qué hacer con cada una.
 * Es puro: no escribe nada. `cambios` es lo que se guardaría con Repositorio.aplicarImportacion.
 */
export function planificarImportacion(
  filas: readonly FilaOdoo[],
  actual: Pick<DatosCompletos, 'vendedores' | 'facturas' | 'pagos'>,
  opciones: OpcionesImportacion,
): PlanImportacion {
  const nuevoId = opciones.nuevoId ?? idAleatorio;
  const importacionId = nuevoId();

  const plan: PlanImportacion = {
    facturasNuevas: [],
    pagosNuevos: [],
    sinCambios: [],
    omitidas: [],
    paraRevisar: [],
    avisos: [],
    vendedoresDesconocidos: [],
    pendientesDeResolver: [],
    resumen: { facturasNuevas: 0, pagosNuevos: 0, montoPagosNuevos: 0, sinCambios: 0, omitidas: 0, paraRevisar: 0 },
    cambios: null,
  };

  const facturasPorNumero = new Map(actual.facturas.map((f) => [normalizarNumeroFactura(f.numero), f]));
  const vendedoresPorId = new Map(actual.vendedores.map((v) => [v.id, v]));
  const pagadoPorFactura = new Map<string, Centavos>();
  for (const p of actual.pagos) pagadoPorFactura.set(p.facturaId, (pagadoPorFactura.get(p.facturaId) ?? 0) + p.monto);

  // Números repetidos dentro del mismo archivo.
  const filasPorNumero = new Map<string, number[]>();
  for (const f of filas) {
    if (f.numero === '') continue;
    const clave = normalizarNumeroFactura(f.numero);
    filasPorNumero.set(clave, [...(filasPorNumero.get(clave) ?? []), f.filaExcel]);
  }

  // Vendedores: reconocidos, resueltos por el usuario o desconocidos.
  const vendedoresNuevos = new Map<string, Vendedor>();
  const aliasNuevos = new Map<string, { vendedorId: string; alias: string }>();
  const desconocidos = new Map<string, VendedorDesconocido>();

  function resolverVendedor(nombre: string): { id: string; nombre: string } | 'pendiente' {
    const existente = buscarVendedorPorNombre(nombre, actual.vendedores);
    if (existente) return { id: existente.id, nombre: existente.nombre };

    const clave = normalizarNombre(nombre);
    const d = desconocidos.get(clave);
    if (d) d.filas++;
    else desconocidos.set(clave, { nombre, clave, filas: 1 });

    const resolucion = opciones.resoluciones[clave];
    if (resolucion?.tipo === 'existente') {
      const v = vendedoresPorId.get(resolucion.vendedorId);
      if (!v) return 'pendiente';
      aliasNuevos.set(`${v.id}|${clave}`, { vendedorId: v.id, alias: nombre });
      return { id: v.id, nombre: v.nombre };
    }
    if (resolucion?.tipo === 'nuevo') {
      let v = vendedoresNuevos.get(clave);
      if (!v) {
        v = { id: nuevoId(), nombre, comision: resolucion.comision, budgetTrimestral: resolucion.budgetTrimestral, alias: [] };
        vendedoresNuevos.set(clave, v);
      }
      return { id: v.id, nombre: v.nombre };
    }
    return 'pendiente';
  }

  const informe = (f: FilaOdoo, detalle: string): FilaInforme => ({ filaExcel: f.filaExcel, numero: f.numero, detalle });

  for (const fila of filas) {
    // 1. Filas que se omiten.
    if (fila.numero === '') {
      plan.omitidas.push(informe(fila, 'Sin número de factura.'));
      continue;
    }
    const repetidas = filasPorNumero.get(normalizarNumeroFactura(fila.numero)) ?? [];
    if (repetidas.length > 1) {
      plan.omitidas.push(informe(fila, `Número repetido en el archivo (filas ${repetidas.join(', ')}).`));
      continue;
    }
    if (fila.montoSinImpuestos === null) {
      plan.omitidas.push(informe(fila, 'Monto sin impuestos vacío o ilegible.'));
      continue;
    }
    if (esNotaDeCredito(fila)) {
      plan.omitidas.push(informe(fila, 'Nota de crédito o monto menor o igual a cero.'));
      continue;
    }
    if (fila.fecha === null) {
      plan.omitidas.push(
        informe(fila, fila.fechaOriginal ? `Fecha de factura ilegible ("${fila.fechaOriginal}").` : 'Sin fecha de factura.'),
      );
      continue;
    }

    // 2. Vendedor.
    let vendedor: { id: string; nombre: string };
    if (fila.vendedor === '') {
      const porDefecto = opciones.vendedorPorDefectoId ? vendedoresPorId.get(opciones.vendedorPorDefectoId) : undefined;
      if (!porDefecto) {
        plan.omitidas.push(informe(fila, 'Sin vendedor.'));
        continue;
      }
      vendedor = { id: porDefecto.id, nombre: porDefecto.nombre };
    } else {
      const r = resolverVendedor(fila.vendedor);
      if (r === 'pendiente') continue; // se clasifica cuando el usuario diga quién es
      vendedor = r;
    }

    if (fila.aviso) plan.avisos.push(informe(fila, fila.aviso));
    const fechaPago = fila.fechaPago ?? opciones.fechaPagoPorDefecto;
    const nuevoPago = (factura: Factura, monto: Centavos): Pago => ({
      id: nuevoId(),
      facturaId: factura.id,
      fecha: fechaPago,
      monto,
      cobroPrevio: opciones.primeraCarga,
      origen: 'importacion',
      importacionId,
    });
    const problemaFechaPago = (factura: Factura): string | null => {
      if (fila.fechaPagoIlegible) return 'Fecha de pago ilegible.';
      if (fechaPago < factura.fecha) {
        return `La fecha del pago (${formatearFecha(fechaPago)}) es anterior a la factura (${formatearFecha(factura.fecha)}).`;
      }
      return null;
    };

    // 3. Factura que ya existe: comparar.
    const existente = facturasPorNumero.get(normalizarNumeroFactura(fila.numero));
    if (existente) {
      if (Math.abs(fila.montoSinImpuestos - existente.montoSinImpuestos) > TOLERANCIA) {
        plan.paraRevisar.push(
          informe(
            fila,
            `Monto distinto: Odoo ${formatearUSD(fila.montoSinImpuestos)}, registrado ${formatearUSD(existente.montoSinImpuestos)}.`,
          ),
        );
        continue;
      }
      if (fila.vendedor !== '' && vendedor.id !== existente.vendedorId) {
        const registrado = vendedoresPorId.get(existente.vendedorId)?.nombre ?? '—';
        plan.paraRevisar.push(informe(fila, `Vendedor distinto: Odoo "${fila.vendedor}", registrado "${registrado}".`));
        continue;
      }
      if (fila.pagado === null) {
        plan.sinCambios.push(informe(fila, 'El archivo no indica lo pagado.'));
        continue;
      }
      const registrado = pagadoPorFactura.get(existente.id) ?? 0;
      const diferencia = fila.pagado - registrado;
      if (diferencia < -TOLERANCIA) {
        plan.paraRevisar.push(
          informe(fila, `Odoo muestra menos pagado (${formatearUSD(fila.pagado)}) que lo registrado (${formatearUSD(registrado)}).`),
        );
        continue;
      }
      if (diferencia <= TOLERANCIA) {
        plan.sinCambios.push(informe(fila, `Pagado ${formatearUSD(registrado)}.`));
        continue;
      }
      const problema = problemaFechaPago(existente);
      if (problema) {
        plan.paraRevisar.push(informe(fila, problema));
        continue;
      }
      // Nunca más que el balance (por si Odoo difiere en un centavo).
      const monto = Math.min(diferencia, existente.montoSinImpuestos - registrado);
      plan.pagosNuevos.push({ filaExcel: fila.filaExcel, factura: existente, pago: nuevoPago(existente, monto), pagadoAntes: registrado });
      continue;
    }

    // 4. Factura nueva.
    const factura: Factura = {
      id: nuevoId(),
      numero: normalizarNumeroFactura(fila.numero),
      cliente: fila.cliente,
      vendedorId: vendedor.id,
      fecha: fila.fecha,
      montoSinImpuestos: fila.montoSinImpuestos,
      total: fila.total !== null && fila.total >= fila.montoSinImpuestos ? fila.total : null,
      origen: 'importacion',
    };
    let pago: Pago | null = null;
    if (fila.pagado !== null && fila.pagado > 0) {
      const problema = problemaFechaPago(factura);
      if (problema) {
        plan.paraRevisar.push(informe(fila, `Factura nueva no importada: ${problema.charAt(0).toLowerCase()}${problema.slice(1)}`));
        continue;
      }
      pago = nuevoPago(factura, fila.pagado);
    }
    plan.facturasNuevas.push({ filaExcel: fila.filaExcel, factura, vendedor: vendedor.nombre, pago });
  }

  plan.vendedoresDesconocidos = [...desconocidos.values()];
  plan.pendientesDeResolver = plan.vendedoresDesconocidos.filter((d) => {
    const r = opciones.resoluciones[d.clave];
    return !r || (r.tipo === 'existente' && !vendedoresPorId.has(r.vendedorId));
  });

  const pagos = [...plan.facturasNuevas.flatMap((f) => (f.pago ? [f.pago] : [])), ...plan.pagosNuevos.map((p) => p.pago)];
  plan.resumen = {
    facturasNuevas: plan.facturasNuevas.length,
    pagosNuevos: pagos.length,
    montoPagosNuevos: sumar(pagos.map((p) => p.monto)),
    sinCambios: plan.sinCambios.length,
    omitidas: plan.omitidas.length,
    paraRevisar: plan.paraRevisar.length,
  };

  if (plan.pendientesDeResolver.length === 0) {
    plan.cambios = {
      registro: {
        id: importacionId,
        fechaHora: (opciones.ahora ?? new Date()).toISOString(),
        archivo: opciones.archivo,
        primeraCarga: opciones.primeraCarga,
        resumen: plan.resumen,
      },
      vendedoresNuevos: [...vendedoresNuevos.values()],
      aliasNuevos: [...aliasNuevos.values()],
      facturasNuevas: plan.facturasNuevas.map((f) => f.factura),
      pagosNuevos: pagos,
    };
  }
  return plan;
}
