import * as XLSX from 'xlsx';

/** Celdas de la primera hoja, tal cual: números, textos o null. */
export type Matriz = unknown[][];

export const EXTENSIONES_ACEPTADAS = ['.xlsx', '.xls', '.csv'] as const;

function decodificarTexto(datos: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    // CSV guardado por Excel en Windows (sin UTF-8).
    return new TextDecoder('windows-1252').decode(datos);
  }
}

/**
 * Lee .xlsx, .xls o .csv y devuelve la primera hoja como matriz.
 * Las fechas de Excel quedan como número de serie y los textos del CSV quedan como texto:
 * la interpretación la hace `normalizar` con nuestras propias reglas (sin zonas horarias).
 */
export function leerArchivo(datos: ArrayBuffer, nombreArchivo: string): Matriz {
  const extension = nombreArchivo.toLowerCase().slice(nombreArchivo.lastIndexOf('.'));
  let libro: XLSX.WorkBook;
  try {
    libro =
      extension === '.csv' || extension === '.txt'
        ? XLSX.read(decodificarTexto(datos).replace(/^﻿/, ''), { type: 'string', raw: true })
        : XLSX.read(datos, { type: 'array' });
  } catch {
    throw new Error('No se pudo leer el archivo. ¿Es un Excel (.xlsx, .xls) o CSV?');
  }
  const nombreHoja = libro.SheetNames[0];
  const hoja = nombreHoja ? libro.Sheets[nombreHoja] : undefined;
  if (!hoja) throw new Error('El archivo no tiene hojas.');
  return XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null, blankrows: false });
}
