/** Descarga un archivo generado en el navegador (enlace con `download`). */
export function descargarArchivo(nombre: string, contenido: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function esIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export type ResultadoGuardar = 'compartido' | 'descargado' | 'cancelado';

/**
 * Entrega un archivo al usuario.
 * En iPhone/iPad (sobre todo con la app instalada) las descargas no son confiables, así que se usa
 * la hoja de "Compartir" del sistema (Guardar en Archivos, AirDrop, correo…). En lo demás, descarga normal.
 * Llamar directamente desde el clic: el navegador exige que compartir venga de una acción del usuario.
 */
export async function guardarArchivo(nombre: string, contenido: string, tipo: string): Promise<ResultadoGuardar> {
  if (esIOS() && typeof navigator.canShare === 'function') {
    const archivo = new File([contenido], nombre, { type: tipo });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: nombre });
        return 'compartido';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado';
        // Si compartir falla por otra razón, se intenta la descarga normal.
      }
    }
  }
  descargarArchivo(nombre, contenido, tipo);
  return 'descargado';
}

/** CSV con BOM: así Excel reconoce las tildes (UTF-8). */
export function descargarCsv(nombre: string, csv: string): Promise<ResultadoGuardar> {
  return guardarArchivo(nombre, '﻿' + csv, 'text/csv;charset=utf-8');
}
