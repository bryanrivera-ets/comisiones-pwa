import { aplicarPorcentajes, sumar, type Centavos } from './dinero';
import { claveTrimestre, fechaEnTrimestre, trimestreDeFecha, type Trimestre } from './trimestres';
import type { Factura, Pago, Reglas, Vendedor } from './tipos';

export interface DatosComisiones {
  vendedores: readonly Vendedor[];
  facturas: readonly Factura[];
  pagos: readonly Pago[];
  reglas: Reglas;
}

export interface AvanceBudget {
  /** null si el vendedor no tiene budget. */
  meta: Centavos | null;
  /** Lo facturado o cobrado en el trimestre, según la regla. */
  logrado: Centavos;
  /** null si no tiene budget (nunca hay descuento). Alcanzar = logrado ≥ meta. */
  alcanzado: boolean | null;
}

export interface DetallePago {
  pago: Pago;
  factura: Factura;
  /** Comisión de este pago, redondeada (informativa). */
  comision: Centavos;
  /** Descuento de este pago, redondeado (informativo). */
  descuento: Centavos;
  /** Si a este pago se le aplica el descuento por budget. */
  conDescuento: boolean;
}

export interface ResumenVendedor {
  vendedor: Vendedor;
  /** Cobrado en el trimestre que genera comisión (sin cobros previos). */
  cobrado: Centavos;
  comisionCompleta: Centavos;
  descuento: Centavos;
  neto: Centavos;
  /** Balance abierto actual de sus facturas × su porcentaje, sin descuento. */
  pendiente: Centavos;
  budget: AvanceBudget;
  detalle: DetallePago[];
}

/** Lo que falta por cobrar de una factura (nunca negativo). */
export function balanceFactura(factura: Factura, pagosDeLaFactura: readonly Pago[]): Centavos {
  const pagado = sumar(pagosDeLaFactura.filter((p) => p.facturaId === factura.id).map((p) => p.monto));
  return Math.max(0, factura.montoSinImpuestos - pagado);
}

function agruparPagosPorFactura(pagos: readonly Pago[]): Map<string, Pago[]> {
  const mapa = new Map<string, Pago[]>();
  for (const p of pagos) {
    const lista = mapa.get(p.facturaId);
    if (lista) lista.push(p);
    else mapa.set(p.facturaId, [p]);
  }
  return mapa;
}

/**
 * Motor de comisiones. Puro: no lee ni escribe nada.
 *
 * Redondeo: los totales (comisión completa y descuento) se calculan sobre la suma
 * de los pagos y se redondean una sola vez. El detalle por pago se redondea por
 * separado y es informativo; si difiere del total por un centavo, manda el total.
 */
export function calcularResumenTrimestre(datos: DatosComisiones, trimestre: Trimestre): ResumenVendedor[] {
  const { vendedores, facturas, pagos, reglas } = datos;
  const facturasPorId = new Map(facturas.map((f) => [f.id, f]));
  const pagosPorFactura = agruparPagosPorFactura(pagos);

  const facturasDe = (vendedorId: string) => facturas.filter((f) => f.vendedorId === vendedorId);

  function avanceBudget(vendedor: Vendedor, t: Trimestre): AvanceBudget {
    const propias = facturasDe(vendedor.id);
    const logrado =
      reglas.baseBudget === 'facturado'
        ? sumar(propias.filter((f) => fechaEnTrimestre(f.fecha, t)).map((f) => f.montoSinImpuestos))
        : // Lo cobrado incluye cobros previos: son dinero que entró en ese trimestre.
          sumar(
            propias.flatMap((f) => pagosPorFactura.get(f.id) ?? []).filter((p) => fechaEnTrimestre(p.fecha, t)).map((p) => p.monto),
          );
    const meta = vendedor.budgetTrimestral;
    return { meta, logrado, alcanzado: meta === null ? null : logrado >= meta };
  }

  return [...vendedores]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((vendedor) => {
      const budget = avanceBudget(vendedor, trimestre);

      // El avance de otros trimestres solo hace falta con la regla "trimestre de la factura".
      const avancesPorTrimestre = new Map<string, AvanceBudget>([[claveTrimestre(trimestre), budget]]);
      const noAlcanzo = (t: Trimestre): boolean => {
        const clave = claveTrimestre(t);
        let avance = avancesPorTrimestre.get(clave);
        if (!avance) {
          avance = avanceBudget(vendedor, t);
          avancesPorTrimestre.set(clave, avance);
        }
        return avance.alcanzado === false;
      };

      const detalle: DetallePago[] = [];
      for (const pago of pagos) {
        if (pago.cobroPrevio || !fechaEnTrimestre(pago.fecha, trimestre)) continue;
        const factura = facturasPorId.get(pago.facturaId);
        if (!factura || factura.vendedorId !== vendedor.id) continue;
        const trimestreQueDecide = reglas.baseDescuento === 'trimestrePago' ? trimestre : trimestreDeFecha(factura.fecha);
        const conDescuento = noAlcanzo(trimestreQueDecide);
        detalle.push({
          pago,
          factura,
          conDescuento,
          comision: aplicarPorcentajes(pago.monto, vendedor.comision),
          descuento: conDescuento ? aplicarPorcentajes(pago.monto, vendedor.comision, reglas.descuento) : 0,
        });
      }
      detalle.sort((a, b) => a.pago.fecha.localeCompare(b.pago.fecha) || a.factura.numero.localeCompare(b.factura.numero));

      const cobrado = sumar(detalle.map((d) => d.pago.monto));
      const cobradoConDescuento = sumar(detalle.filter((d) => d.conDescuento).map((d) => d.pago.monto));
      const comisionCompleta = aplicarPorcentajes(cobrado, vendedor.comision);
      const descuento = aplicarPorcentajes(cobradoConDescuento, vendedor.comision, reglas.descuento);

      return {
        vendedor,
        cobrado,
        comisionCompleta,
        descuento,
        neto: comisionCompleta - descuento,
        pendiente: comisionPendiente(vendedor, facturas, pagosPorFactura),
        budget,
        detalle,
      };
    });
}

/** Balance abierto de todas sus facturas, a la fecha de hoy, × su porcentaje. Sin descuento. */
function comisionPendiente(vendedor: Vendedor, facturas: readonly Factura[], pagosPorFactura: Map<string, Pago[]>): Centavos {
  const abierto = sumar(
    facturas.filter((f) => f.vendedorId === vendedor.id).map((f) => balanceFactura(f, pagosPorFactura.get(f.id) ?? [])),
  );
  return aplicarPorcentajes(abierto, vendedor.comision);
}
