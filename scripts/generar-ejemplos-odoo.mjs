// Genera los reportes de ejemplo de Odoo que usan las pruebas (y que sirven para probar la app a mano).
// Uso: node scripts/generar-ejemplos-odoo.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const carpeta = new URL('../tests/fixtures/', import.meta.url);
mkdirSync(carpeta, { recursive: true });

/** Fecha como número de serie de Excel con formato de fecha (sin zonas horarias). */
const fecha = (a, m, d) => ({ t: 'n', v: (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000, z: 'mm/dd/yyyy' });

function guardar(nombre, filas, bookType = 'xlsx') {
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Facturas');
  const datos = XLSX.write(libro, { type: 'buffer', bookType });
  writeFileSync(new URL(nombre, carpeta), datos);
  console.log('✓', nombre);
}

// Reporte 1 (español): títulos arriba, pago parcial, nota de crédito, fila sin vendedor,
// vendedor desconocido y un alias ("María G."), fechas reales y una en texto MM/DD/AAAA.
const reporte1 = [
  ['Facturas de cliente'],
  ['Exportado desde Odoo'],
  ['Número', 'Cliente', 'Vendedor', 'Fecha de factura', 'Fecha de vencimiento', 'Impuestos no incluidos', 'Total', 'Importe adeudado', 'Estado de pago'],
  ['INV/2026/00001', 'Ferretería López', 'Juan Pérez', fecha(2026, 7, 10), fecha(2026, 8, 9), 2000, 2300, 0, 'Pagado'],
  ['INV/2026/00002', 'Panadería Sol', 'Juan Pérez', fecha(2026, 7, 20), fecha(2026, 8, 19), 1000, 1150, 575, 'Parcialmente pagado'],
  ['INV/2026/00003', 'Taller Luna', 'María G.', '10/05/2026', null, 5000, 5750, 5750, 'No pagado'],
  ['RINV/2026/00001', 'Ferretería López', 'Juan Pérez', fecha(2026, 8, 1), null, -500, -575, 0, 'Pagado'],
  ['INV/2026/00004', 'Cliente de mostrador', null, fecha(2026, 9, 15), null, 300, 345, 0, 'Pagado'],
  ['INV/2026/00005', 'Hotel Brisa', 'Pedro Ramos', fecha(2026, 9, 15), null, 800, 920, 920, 'No pagado'],
];
guardar('odoo-facturas-1.xlsx', reporte1);
guardar('odoo-facturas-1.xls', reporte1, 'biff8');
guardar('odoo-facturas-1.csv', reporte1, 'csv');

// Reporte 2 (inglés), exportado más tarde: llegan pagos nuevos, una factura nueva,
// la fila sin vendedor sigue igual y Odoo cambió el monto de la 00005.
guardar('odoo-facturas-2.xlsx', [
  ['Number', 'Customer', 'Salesperson', 'Invoice Date', 'Tax Excluded', 'Total', 'Amount Due', 'Payment Status'],
  ['INV/2026/00001', 'Ferretería López', 'Juan Pérez', fecha(2026, 7, 10), 2000, 2300, 0, 'Paid'],
  ['INV/2026/00002', 'Panadería Sol', 'Juan Perez', fecha(2026, 7, 20), 1000, 1150, 0, 'Paid'],
  ['INV/2026/00003', 'Taller Luna', 'María G.', fecha(2026, 10, 5), 5000, 5750, 2875, 'Partially Paid'],
  ['RINV/2026/00001', 'Ferretería López', 'Juan Pérez', fecha(2026, 8, 1), -500, -575, 0, 'Paid'],
  ['INV/2026/00004', 'Cliente de mostrador', null, fecha(2026, 9, 15), 300, 345, 0, 'Paid'],
  ['INV/2026/00005', 'Hotel Brisa', 'Pedro Ramos', fecha(2026, 9, 15), 850, 977.5, 977.5, 'Not Paid'],
  ['INV/2026/00006', 'Farmacia Central', 'Juan Pérez', fecha(2026, 10, 20), 1200, 1380, 0, 'Paid'],
]);
