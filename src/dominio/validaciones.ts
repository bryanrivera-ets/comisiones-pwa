import { balanceFactura } from './comisiones';
import { CIEN_POR_CIENTO, esCentavos, formatearUSD } from './dinero';
import { esFechaISO, formatearFecha } from './fechas';
import { normalizarNombre, normalizarNumeroFactura } from './texto';
import type { Factura, Pago, Reglas, Vendedor } from './tipos';
import { nombresNormalizados } from './vendedores';

/** Lista de errores en español; vacía si todo está bien. */
export type Errores = string[];

function porcentajeValido(pb: unknown): boolean {
  return typeof pb === 'number' && Number.isInteger(pb) && pb >= 0 && pb <= CIEN_POR_CIENTO;
}

export function validarVendedor(vendedor: Vendedor, todos: readonly Vendedor[]): Errores {
  const errores: Errores = [];
  if (vendedor.nombre.trim() === '') errores.push('El nombre es obligatorio.');
  if (!porcentajeValido(vendedor.comision)) errores.push('El porcentaje de comisión debe estar entre 0% y 100%.');
  if (vendedor.budgetTrimestral !== null && !(esCentavos(vendedor.budgetTrimestral) && vendedor.budgetTrimestral >= 0)) {
    errores.push('El budget trimestral no puede ser negativo.');
  }

  // Un nombre o alias no puede pertenecer a dos vendedores: el importador no sabría a quién asignar.
  const propios = new Set(nombresNormalizados(vendedor));
  for (const otro of todos) {
    if (otro.id === vendedor.id) continue;
    for (const nombre of [otro.nombre, ...otro.alias]) {
      if (propios.has(normalizarNombre(nombre))) {
        errores.push(`"${nombre}" ya pertenece a ${otro.nombre}.`);
      }
    }
  }
  return errores;
}

export function validarReglas(reglas: Reglas): Errores {
  const errores: Errores = [];
  if (!porcentajeValido(reglas.descuento)) errores.push('El descuento debe estar entre 0% y 100%.');
  if (reglas.baseBudget !== 'facturado' && reglas.baseBudget !== 'cobrado') errores.push('Base del budget inválida.');
  if (reglas.baseDescuento !== 'trimestrePago' && reglas.baseDescuento !== 'trimestreFactura') {
    errores.push('Base del descuento inválida.');
  }
  return errores;
}

export function validarFactura(factura: Factura, todas: readonly Factura[], vendedores: readonly Vendedor[]): Errores {
  const errores: Errores = [];
  const numero = normalizarNumeroFactura(factura.numero);
  if (numero === '') errores.push('El número de factura es obligatorio.');
  else if (todas.some((f) => f.id !== factura.id && normalizarNumeroFactura(f.numero) === numero)) {
    errores.push(`Ya existe la factura ${factura.numero.trim()}.`);
  }
  if (!esFechaISO(factura.fecha)) errores.push('La fecha de la factura no es válida.');
  if (!esCentavos(factura.montoSinImpuestos) || factura.montoSinImpuestos <= 0) {
    errores.push('El monto sin impuestos debe ser mayor que cero.');
  }
  if (factura.total !== null) {
    if (!esCentavos(factura.total) || factura.total <= 0) errores.push('El total debe ser mayor que cero.');
    else if (factura.total < factura.montoSinImpuestos) errores.push('El total no puede ser menor que el monto sin impuestos.');
  }
  if (!vendedores.some((v) => v.id === factura.vendedorId)) errores.push('Escoge un vendedor.');
  return errores;
}

/**
 * Valida un pago nuevo o editado contra su factura.
 * `pagosDeLaFactura` son los pagos ya registrados (si incluye el mismo pago, se ignora).
 */
export function validarPago(pago: Pago, factura: Factura, pagosDeLaFactura: readonly Pago[]): Errores {
  const errores: Errores = [];
  if (!esCentavos(pago.monto) || pago.monto <= 0) errores.push('El monto del pago debe ser mayor que cero.');
  if (!esFechaISO(pago.fecha)) errores.push('La fecha del pago no es válida.');
  else if (pago.fecha < factura.fecha) {
    errores.push(`El pago no puede ser anterior a la factura (${formatearFecha(factura.fecha)}).`);
  }
  const balance = balanceFactura(
    factura,
    pagosDeLaFactura.filter((p) => p.id !== pago.id),
  );
  if (esCentavos(pago.monto) && pago.monto > balance) {
    errores.push(`El pago (${formatearUSD(pago.monto)}) es mayor que el balance de la factura (${formatearUSD(balance)}).`);
  }
  return errores;
}
