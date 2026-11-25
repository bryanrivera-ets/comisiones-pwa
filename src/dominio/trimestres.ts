import type { FechaISO } from './fechas';

/** T1 ene–mar, T2 abr–jun, T3 jul–sep, T4 oct–dic. */
export interface Trimestre {
  anio: number;
  numero: 1 | 2 | 3 | 4;
}

const MESES = ['ene–mar', 'abr–jun', 'jul–sep', 'oct–dic'] as const;
const ULTIMO_DIA = ['03-31', '06-30', '09-30', '12-31'] as const;
const PRIMER_DIA = ['01-01', '04-01', '07-01', '10-01'] as const;

export function trimestreDeFecha(fecha: FechaISO): Trimestre {
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  return { anio, numero: Math.ceil(mes / 3) as Trimestre['numero'] };
}

export function rangoTrimestre(t: Trimestre): { desde: FechaISO; hasta: FechaISO } {
  return {
    desde: `${t.anio}-${PRIMER_DIA[t.numero - 1]}`,
    hasta: `${t.anio}-${ULTIMO_DIA[t.numero - 1]}`,
  };
}

export function fechaEnTrimestre(fecha: FechaISO, t: Trimestre): boolean {
  const { desde, hasta } = rangoTrimestre(t);
  return fecha >= desde && fecha <= hasta;
}

export function mismoTrimestre(a: Trimestre, b: Trimestre): boolean {
  return a.anio === b.anio && a.numero === b.numero;
}

/** "2026-T4" — sirve como clave y en URLs. */
export function claveTrimestre(t: Trimestre): string {
  return `${t.anio}-T${t.numero}`;
}

export function parsearClaveTrimestre(clave: string): Trimestre | null {
  const m = /^(\d{4})-T([1-4])$/.exec(clave);
  if (!m) return null;
  return { anio: Number(m[1]), numero: Number(m[2]) as Trimestre['numero'] };
}

/** "T4 2026 (oct–dic)" */
export function etiquetaTrimestre(t: Trimestre): string {
  return `T${t.numero} ${t.anio} (${MESES[t.numero - 1]})`;
}

export function trimestreSiguiente(t: Trimestre): Trimestre {
  return t.numero === 4 ? { anio: t.anio + 1, numero: 1 } : { anio: t.anio, numero: (t.numero + 1) as Trimestre['numero'] };
}

export function trimestreAnterior(t: Trimestre): Trimestre {
  return t.numero === 1 ? { anio: t.anio - 1, numero: 4 } : { anio: t.anio, numero: (t.numero - 1) as Trimestre['numero'] };
}
