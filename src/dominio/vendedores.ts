import { normalizarNombre } from './texto';
import type { Vendedor } from './tipos';

/** Nombre y alias del vendedor, normalizados. */
export function nombresNormalizados(vendedor: Pick<Vendedor, 'nombre' | 'alias'>): string[] {
  return [vendedor.nombre, ...vendedor.alias].map(normalizarNombre).filter((n) => n !== '');
}

/** Busca un vendedor por su nombre o cualquiera de sus alias (sin distinguir tildes ni mayúsculas). */
export function buscarVendedorPorNombre(nombre: string, vendedores: readonly Vendedor[]): Vendedor | undefined {
  const buscado = normalizarNombre(nombre);
  if (buscado === '') return undefined;
  return vendedores.find((v) => nombresNormalizados(v).includes(buscado));
}
