import type { DatosCompletos } from '../../datos/Repositorio';
import { sumar, type Centavos } from '../../dominio/dinero';
import { normalizarNombre } from '../../dominio/texto';
import type { Factura, Pago, Vendedor } from '../../dominio/tipos';

export type EstadoFactura = 'abierta' | 'pagada';
export type FiltroEstado = 'todas' | 'abiertas' | 'pagadas';

export interface FilaFactura {
  factura: Factura;
  vendedor: Vendedor | undefined;
  /** Pagos de la factura, del más antiguo al más reciente. */
  pagos: Pago[];
  pagado: Centavos;
  balance: Centavos;
  estado: EstadoFactura;
}

export interface Filtros {
  /** '' = todos los vendedores. */
  vendedorId: string;
  estado: FiltroEstado;
  /** Busca en número y cliente. */
  texto: string;
}

export const FILTROS_INICIALES: Filtros = { vendedorId: '', estado: 'todas', texto: '' };

/** Una fila por factura con lo pagado y el balance. Más recientes primero. */
export function construirFilas(datos: Pick<DatosCompletos, 'vendedores' | 'facturas' | 'pagos'>): FilaFactura[] {
  const vendedores = new Map(datos.vendedores.map((v) => [v.id, v]));
  const pagosPorFactura = new Map<string, Pago[]>();
  for (const p of datos.pagos) pagosPorFactura.set(p.facturaId, [...(pagosPorFactura.get(p.facturaId) ?? []), p]);

  return datos.facturas
    .map((factura) => {
      const pagos = (pagosPorFactura.get(factura.id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const pagado = sumar(pagos.map((p) => p.monto));
      const balance = Math.max(0, factura.montoSinImpuestos - pagado);
      return {
        factura,
        vendedor: vendedores.get(factura.vendedorId),
        pagos,
        pagado,
        balance,
        estado: balance === 0 ? ('pagada' as const) : ('abierta' as const),
      };
    })
    .sort((a, b) => b.factura.fecha.localeCompare(a.factura.fecha) || b.factura.numero.localeCompare(a.factura.numero));
}

export function filtrarFilas(filas: readonly FilaFactura[], filtros: Filtros): FilaFactura[] {
  const texto = normalizarNombre(filtros.texto);
  return filas.filter(
    (f) =>
      (filtros.vendedorId === '' || f.factura.vendedorId === filtros.vendedorId) &&
      (filtros.estado === 'todas' ||
        (filtros.estado === 'abiertas' && f.estado === 'abierta') ||
        (filtros.estado === 'pagadas' && f.estado === 'pagada')) &&
      (texto === '' ||
        normalizarNombre(f.factura.numero).includes(texto) ||
        normalizarNombre(f.factura.cliente).includes(texto)),
  );
}
