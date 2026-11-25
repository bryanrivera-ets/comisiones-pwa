# Comisiones de vendedores

Aplicación web interna (PWA) para calcular las **comisiones trimestrales** de los vendedores a partir de las
facturas de Odoo. Funciona en computadora y celular, se instala como app y trabaja **sin conexión** una vez cargada.

- Importa el Excel o CSV de la lista de facturas de cliente de Odoo, cuantas veces quieras.
- Calcula por trimestre: cobrado, comisión completa, descuento por budget, neto a pagar y comisión pendiente.
- Exporta el detalle a CSV y respalda todos los datos en un archivo JSON.

> **Importante:** los datos viven en el navegador de cada dispositivo. La computadora y el celular **no comparten
> datos**: usa *Respaldo → Exportar / Restaurar* para pasarlos de uno a otro, y haz respaldos con frecuencia.

---

## Cómo correrla en tu computadora

Requisitos: [Node.js](https://nodejs.org/) 20.19 o más reciente (recomendado: 22 LTS).

```bash
npm install        # instala dependencias (SheetJS se descarga de cdn.sheetjs.com: requiere internet)
npm run dev        # abre http://localhost:5173 (recarga sola al editar)
npm test           # corre las pruebas (reglas de negocio, importador, pantallas)
npm run build      # genera la versión de producción en la carpeta dist/
npm run preview    # sirve dist/ en http://localhost:4173 (aquí sí funciona el modo sin conexión)
```

Otros comandos:

- `npm run iconos`: regenera todos los íconos a partir de `public/logo.svg`.
- `node scripts/generar-ejemplos-odoo.mjs`: regenera los Excel de ejemplo de `tests/fixtures/`, útiles también para
  probar el importador a mano.

## Cómo publicarla

La app es un sitio estático: cualquier hosting con **HTTPS** sirve (HTTPS es obligatorio para instalarla como app).
El proyecto ya trae la configuración para Netlify (`netlify.toml`) y Vercel (`vercel.json`).

### Netlify

**Opción rápida, sin Git:**

1. Corre `npm run build`.
2. Entra a <https://app.netlify.com/drop> y arrastra la carpeta `dist`.
3. Netlify te da una dirección `https://algo.netlify.app`. Para actualizar, repite los pasos en el mismo sitio
   (*Deploys → arrastrar*).

**Con Git (se publica sola en cada cambio):**

1. Sube el proyecto a GitHub, GitLab o Bitbucket.
2. En Netlify: *Add new site → Import an existing project* y escoge el repositorio.
3. Netlify lee `netlify.toml` (comando `npm run build`, carpeta `dist`). Solo confirma.

### Vercel

1. Sube el proyecto a GitHub, GitLab o Bitbucket.
2. En <https://vercel.com/new> importa el repositorio. Vercel detecta Vite y usa `vercel.json`.
3. También se puede publicar desde la terminal: `npx vercel` (y `npx vercel --prod` para producción).

### Actualizaciones

Cuando publiques una versión nueva, la app abierta muestra **"Hay una versión nueva de la app"** con el botón
*Actualizar*. Los datos no se pierden al actualizar.

> La app se instala por dirección: si cambias de dominio, el navegador la trata como otra app con **otros datos**.
> Antes de mudarte de dirección, exporta un respaldo y restáuralo en la nueva.

## Cómo instalarla en el celular

Abre la dirección publicada (HTTPS) en el navegador del celular:

- **Android (Chrome):** menú **⋮ → Instalar app** (o *Agregar a pantalla principal*). También puede aparecer un aviso
  de instalación en la parte de abajo.
- **iPhone / iPad (Safari):** botón **Compartir** (cuadro con flecha) → **Agregar a pantalla de inicio** → *Agregar*.
  En iPhone, instálala: Safari puede borrar los datos de sitios que no se abren en varias semanas, pero no los de las apps
  instaladas.
- **Computadora (Chrome / Edge):** ícono de instalar en la barra de direcciones, o menú → *Instalar Comisiones*.

Después de abrirla una vez con internet, funciona sin conexión. Arriba aparece *Sin conexión* cuando no hay red.

En iPhone, al exportar el CSV o el respaldo se abre la hoja de **Compartir**: escoge *Guardar en Archivos*, correo,
AirDrop, etc.

## Uso

### 1. Vendedores y reglas

Da de alta a cada vendedor con su **porcentaje de comisión**, su **budget trimestral** (vacío = sin budget, nunca
lleva descuento) y sus **alias**: los nombres con que aparece en Odoo.

Reglas configurables:

| Regla | Opciones | Por defecto |
|---|---|---|
| Descuento si no alcanza el budget | cualquier % | 20% |
| El budget se mide con | lo facturado / lo cobrado en el trimestre | lo facturado |
| El descuento depende del budget de | el trimestre en que se paga / el trimestre de la factura | el trimestre en que se paga |

### 2. Importar desde Odoo

1. En Odoo, abre **Facturación → Clientes → Facturas** (vista de lista), selecciona las facturas y usa **Exportar**
   (o el botón de descarga a Excel). Incluye al menos: número, cliente, vendedor, fecha de factura, base imponible
   (impuestos no incluidos), total, importe adeudado y estado de pago. Si puedes, añade la fecha de pago.
2. En la app: **Facturas → Importar Excel de Odoo** y escoge el archivo (`.xlsx`, `.xls` o `.csv`).
3. Revisa las columnas detectadas, la fecha para pagos sin fecha y, si los hay, indica quiénes son los vendedores que
   no se reconocen. El nombre se guarda como alias para la próxima vez.
4. Revisa el resumen (facturas nuevas, pagos nuevos, filas sin cambios, omitidas y para revisar) y pulsa
   **Guardar importación**.

Detalles:

- **Se puede subir el mismo reporte varias veces.** Cada factura se identifica por su número. Si Odoo muestra más
  pagado que lo registrado, se añade la diferencia como pago nuevo.
- **Lo pagado** se calcula como `base sin impuestos × (total − adeudado) / total`. Sin columna Total se usa la base;
  sin columna de adeudado, el estado de pago (*Pagado* = todo pagado).
- **Fecha de los pagos:** la lista de facturas de Odoo normalmente no trae la fecha de cada pago. Los pagos nuevos
  toman la fecha que escojas en la pantalla de importación, y **esa fecha decide en qué trimestre generan comisión**.
  Importa con frecuencia y siempre antes de cerrar cada trimestre.
- **Primera carga:** márcala solo la primera vez, para cargar el historial. Esos pagos quedan como *cobro previo*:
  cuentan como cobrados pero no generan comisión.
- Se **omiten** notas de crédito, montos ≤ 0, números repetidos en el archivo, fechas ilegibles y filas sin vendedor
  (o se asignan al vendedor que escojas).
- Se marcan **para revisión** (sin cambiar nada) las facturas cuyo monto cambió o cuyo vendedor es otro, y las que en
  Odoo aparecen con menos pagado que lo registrado.
- **Fechas en texto:** se aceptan `AAAA-MM-DD`, `MM/DD/AAAA` y `DD/MM/AAAA`. Si alguna fecha de una columna empieza
  con un número mayor de 12, toda esa columna se lee como `DD/MM/AAAA`.

### Plantilla de ventas (sin Odoo o a mano)

En **Facturas → Importar Excel de Odoo**, el botón **Descargar plantilla** baja un Excel con dos hojas: **Ventas**,
la que se llena, e **Instrucciones**, que trae la lista de vendedores registrados y un ejemplo. Se sube por el mismo
importador.

| Columna | Qué escribir |
|---|---|
| Número de factura | Obligatorio. Identifica la factura; al volver a subirla se actualiza en vez de duplicarse. |
| Cliente | Opcional. |
| Vendedor | Nombre del vendedor en la app (o uno de sus alias). |
| Fecha de factura | Obligatorio. Fecha de Excel o `AAAA-MM-DD`. |
| Monto sin impuestos | Obligatorio. Base de la comisión. |
| Total con impuestos | Opcional. |
| Cobrado sin impuestos | Lo pagado **hasta hoy, acumulado**. Vacío si no ha pagado nada. |
| Fecha de cobro | Fecha del último cobro. Vacía = la fecha escogida al importar. |

- **Cobrado es el acumulado, no el pago nuevo.** Al volver a subir el archivo, la app registra solo la diferencia
  con la fecha de cobro. Si alguien escribe un monto menor a lo ya registrado, la fila queda *para revisar* y no se
  cambia nada.
- Con la casilla **Incluir las facturas abiertas**, la plantilla sale con las facturas pendientes ya escritas y su
  cobrado actual: solo hay que actualizar *Cobrado* y *Fecha de cobro* y volver a subirla.

### 3. Facturas y pagos

Alta manual de facturas, registro y eliminación de pagos (con la casilla de *cobro previo*), y filtros por vendedor,
estado y texto. La app no permite un pago anterior a la factura ni mayor que el balance.

### 4. Resumen del trimestre

Escoge el trimestre (T1 ene–mar, T2 abr–jun, T3 jul–sep, T4 oct–dic). Cada vendedor tiene una tarjeta con cobrado,
comisión completa, descuento por budget, **neto a pagar**, comisión pendiente y avance del budget. Debajo aparece cada
pago que genera comisión. **Exportar CSV** descarga el detalle y el resumen; se abre directamente en Excel.

### 5. Respaldo

**Exportar respaldo** descarga un JSON con todos los datos. **Restaurar** reemplaza todos los datos por los del
archivo, después de revisar que el archivo sea válido. La app avisa si pasaron 7 días o más sin respaldo.

## Reglas de cálculo

1. La comisión se calcula sobre el monto **sin impuestos**.
2. Solo cuenta lo que el cliente **pagó dentro del trimestre**. Cada pago parcial genera comisión en el trimestre de su
   fecha.
3. Si el vendedor no alcanza su budget (*alcanzar* = lo logrado ≥ budget), la comisión lleva el descuento configurado.
   Sin budget, nunca hay descuento.
4. **Comisión pendiente** = balance abierto de sus facturas, a hoy, × su porcentaje, sin descuento.
5. Los **cobros previos** no generan comisión, pero reducen el balance y cuentan para el budget cuando se mide con lo
   cobrado.
6. El dinero se maneja en **centavos enteros** y las fechas como `AAAA-MM-DD`, sin zonas horarias. La comisión y el
   descuento se redondean una sola vez sobre el total del trimestre. En el detalle, cada pago se redondea por separado,
   así que en casos raros el detalle puede diferir del total en un centavo; manda el total.
7. El porcentaje de comisión y el budget son los **actuales** del vendedor: si los cambias, también cambian los
   cálculos de trimestres anteriores.

## Estructura del proyecto

```
src/
  dominio/       Reglas de negocio puras: dinero, fechas, trimestres, motor de comisiones, validaciones
  importacion/   Lectura del Excel/CSV, detección de columnas, normalización y plan de importación
  datos/         Interfaz Repositorio, implementaciones IndexedDB (Dexie) y en memoria, respaldo JSON
  exportacion/   CSV del resumen trimestral
  ui/            Pantallas React
tests/           Pruebas (Vitest) y Excel de ejemplo de Odoo en tests/fixtures
scripts/         Generador de los Excel de ejemplo
```

### Cambiar a un backend compartido o a Odoo

Toda la app habla con la interfaz `Repositorio` (`src/datos/Repositorio.ts`). Para compartir datos entre dispositivos,
o leer directamente de Odoo, basta con escribir otra implementación de esa interfaz y pasarla en `src/main.tsx`.
La batería de pruebas `tests/datos/contrato.ts` verifica que cualquier implementación se comporte igual que la actual.

## Tecnología

Vite · React · TypeScript · Dexie (IndexedDB) · SheetJS · Zod · vite-plugin-pwa (Workbox) · Vitest · Testing Library
