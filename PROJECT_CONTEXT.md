# Punto Fadey 1.0.0

POS web para bodegas, minimarkets, ferreterías y retail. Corre en escritorio, tablet y teléfono, y se puede instalar como PWA. Cada negocio ve solo sus propios datos.

## Cómo correrlo

```bash
npm install
npx prisma db push
npm run dev
```

La app queda en http://localhost:3000. La primera visita sin usuarios abre `/setup` y crea el dueño, la sucursal, el almacén y la caja. En esta máquina ya existe el negocio local Bodega Central. La cuenta de desarrollo está en `scripts/seed-dev.ts`.

`npm run verify` ejecuta las pruebas de dominio sobre `prisma/verify.db` y no toca la base de desarrollo.

Variables de entorno:

- `DB_PATH`: ruta absoluta del único archivo SQLite. En local no hace falta: se usa `prisma/dev.db`. En Render apunta al disco persistente, por ejemplo `/var/data/punto-fadey.db`.
- `DATABASE_URL`: la usa Prisma. Si existe `DB_PATH`, la aplicación la arma como `file:` más esa ruta. En local, `.env` trae `file:./dev.db`.
- `AUTH_SECRET`: secreto de la sesión y de las credenciales de facturación. Mínimo 16 caracteres. No se guarda en el repositorio.

El token del proveedor de facturación no va en el entorno. Se cifra con AES-256-GCM y se guarda en `BillingProfile.tokenCipher`.

## Arquitectura

- Next.js 16 (App Router, Cache Components), React 19, TypeScript y Tailwind 4.
- La base local es SQLite con Prisma 6. No hay PostgreSQL ni Docker en esta máquina. El esquema usa textos en lugar de enums de Postgres para poder cambiar de motor después. El aislamiento entre negocios se aplica en el código: cada consulta de negocio filtra por `businessId` tomado de la sesión.
- La sesión es un JWT HS256 (`jose`) en la cookie httpOnly `fadey_session`. El rol se vuelve a leer de la membresía en cada petición. `businessId`, sucursal y almacén salen de la sesión y se comprueban en el servidor.
- El dinero se guarda en centavos enteros. Las cantidades y los factores de conversión se guardan en diezmilésimas. No se usan decimales de punto flotante para saldos ni totales. El IGV se guarda como porcentaje por 100: 18% es 1800.
- El stock solo cambia dentro de `applyStock`. Una salida no puede dejar el saldo en negativo. Cada cambio escribe un movimiento de kardex. Las presentaciones convierten a unidad base: una caja de 12 mueve 12 unidades.
- La venta exige caja abierta del mismo usuario y sucursal. El servidor recalcula precios. Repetir la misma clave de idempotencia devuelve la operación ya hecha y no vuelve a mover stock ni dinero.
- Los permisos se comprueban en el servidor con `assertCan`. El menú solo oculta enlaces. El dueño no puede quedarse sin acceso. Un permiso distinto del valor por defecto se guarda en `PermissionGrant`.

## Módulos

| Módulo | Estado |
| --- | --- |
| Sesión, alta del negocio y cambio de sucursal o almacén | Operativo |
| Catálogo, códigos, listas, importación y exportación CSV | Operativo |
| Escáner de cámara y lector USB o Bluetooth | Operativo en venta, productos e inventario |
| Venta, pagos combinados, anulación y devolución | Operativo |
| Caja: apertura, movimientos, cierre e historial | Operativo |
| Inventario, transferencias, ajustes, kardex y alertas | Operativo |
| Compras, proveedores y cuentas por pagar | Operativo. Una compra pendiente no aumenta el stock. Recibir sí lo aumenta y actualiza el costo base. |
| Clientes, ventas a crédito, abonos y cuentas por cobrar | Operativo. Cada abono queda ligado a la venta original y entra en la caja abierta. |
| Facturación electrónica | Operativo hasta la cola. Genera XML UBL 2.1 y conserva el número. No marca aceptado sin un CDR real. |
| Informes y exportación Excel y PDF | Operativo, con datos reales del negocio |
| Roles, permisos, auditoría y copia de seguridad | Operativo |
| PWA | Instalable. Si no hay red, muestra una página de aviso. No vende sin conexión. |

## Rutas

Panel: `/`, `/ventas`, `/ventas/pendientes`, `/ventas/historial`, `/ventas/devoluciones`, `/ventas/anulaciones`, `/ventas/[id]`.

Caja: `/caja`, `/caja/movimientos`, `/caja/ingresos`, `/caja/cierre`, `/caja/historial`.

Productos: `/productos`, `/productos/nuevo`, `/productos/[id]`, `/productos/categorias`, `/productos/marcas`, `/productos/unidades`, `/productos/presentaciones`, `/productos/codigos`, `/productos/precios`.

Inventario: `/inventario`, `/inventario/entradas`, `/inventario/salidas`, `/inventario/transferencias`, `/inventario/ajustes`, `/inventario/kardex`, `/inventario/alertas`, `/inventario/almacenes`.

Compras: `/compras/proveedores`, `/compras`, `/compras/nueva`, `/compras/[id]`, `/compras/historial`.

Clientes: `/clientes`, `/clientes/historial`, `/clientes/creditos`.

Facturación: `/facturacion`, `/facturacion/[id]`, `/facturacion/[id]/imprimir`.

Informes: `/informes`. Configuración: `/configuracion`.

API: `/api/billing/[id]/xml`, `/api/billing/[id]/cdr`, `/api/reports/export`, `/api/backup`, `/api/catalog/export`.

## Modelos principales

Negocio y acceso: `User`, `Business`, `Membership`, `Branch`, `Warehouse`, `CashRegister`, `PermissionGrant`, `AuditLog`.

Catálogo e inventario: `Category`, `Brand`, `Unit`, `Product`, `Presentation`, `ProductBarcode`, `PriceList`, `StockBalance`, `StockMovement`, `StockTransfer`.

Ventas y caja: `Sale`, `SaleLine`, `SalePayment`, `SaleReturn`, `CashSession`, `CashMovement`.

Compras: `Supplier`, `Purchase`, `PurchaseLine`, `PurchasePayment`. Una compra nace en `ORDERED`. `receivePurchase` pasa a `RECEIVED` y entra el stock pendiente. El saldo por pagar es `total - paid`.

Crédito: `Customer` (nombre, documento, teléfono, correo, dirección, límite y saldo) y `CustomerPayment` con `saleId`.

Facturación: `BillingProfile`, `DocumentSeries`, `ElectronicDocument`. Estados: `QUEUED`, `SENT`, `ACCEPTED`, `REJECTED`, `ERROR`. El número es único por negocio, serie y correlativo.

## Servicios

- `lib/catalog.ts`, `lib/inventory.ts`, `lib/sales.ts`, `lib/cash.ts`: primera parte, sin reconstruir.
- `lib/purchases.ts`: proveedores, compras, recepción y pagos.
- `lib/customers.ts`: clientes y abonos asignados a una venta o a la deuda más antigua.
- `lib/billing.ts`: RUC, DNI, XML, series y envío. `lib/secret.ts` cifra el token.
- `lib/reports.ts` y `lib/export.ts`: informes, Excel SpreadsheetML y PDF de texto.
- `lib/backup.ts`: copia el archivo indicado por `DB_PATH`, o `prisma/dev.db` en local, a `data/backups`.
- `lib/roles.ts`: matriz de permisos. Las acciones viven en `actions/operations.ts`, `actions/sales.ts` y `actions/part2.ts`.

## Integraciones

- Venta confirmada descuenta inventario y, si es contado en efectivo, entra en el efectivo esperado de la caja. Tarjeta, transferencia y crédito se informan aparte.
- Compra recibida aumenta inventario con movimiento `PURCHASE`. El pago en efectivo sale de la caja. Transferencia y otro medio no mueven el efectivo.
- Devolución y anulación reponen stock. Una anulación de crédito no deja el saldo del cliente en negativo: si ya hubo abono, hay que usar la devolución.
- Transferencia entre almacenes descuenta al enviar y suma al recibir.
- El comprobante queda ligado a la venta. Boleta y factura no se duplican si ya existe una no rechazada. Una nota solo puede referir un comprobante `ACCEPTED` de esa misma venta. El reintento conserva serie y número, con un máximo de 5 intentos.
- El envío hace un POST real al endpoint configurado, con el token descifrado, y espera 20 segundos. Solo pasa a `ACCEPTED` si la respuesta trae un `ApplicationResponse` con `ResponseCode` 0, o un JSON con `sunat_responsecode` `"0"` y un CDR (`cdr_zip_base64` o `enlace_del_cdr`). Sin proveedor, el comprobante sigue en cola.
- Los informes leen ventas, compras, stock y caja del mismo negocio. Ventas, ventas en efectivo, otros ingresos de caja, utilidad bruta (ventas menos costo) y utilidad neta (bruta menos egresos de caja) van por separado. Cuentas por cobrar es el saldo de clientes. Cuentas por pagar es el total de compras menos lo pagado.

## Roles

Dueño, Administrador, Encargado, Cajero, Almacenero y Vendedor. El dueño administra usuarios y permisos. El encargado vende, compra, acredita, cierra caja y ve informes. El cajero vende, cobra, devuelve y atiende clientes. El almacenero mueve stock, transfiere y registra compras. El vendedor vende y abre su caja, pero no la cierra ni aplica crédito.

## Manual breve

1. En Configuración, guarda el nombre y un RUC válido del negocio antes de emitir comprobantes. Activa el crédito si el negocio vende fiado.
2. Abre la caja del día en Caja. Cada usuario usa su propia sesión.
3. Registra productos con unidad base, presentaciones y código. El escáner de cámara y el lector por teclado funcionan en venta e inventario.
4. En venta rápida, agrega productos, elige cliente si hace falta y cobra. Crédito exige cliente, permiso y límite disponible. El stock baja al confirmar.
5. Para abastecer, crea el proveedor y la compra. Si no marcas recibir ahora, el stock no cambia. En el detalle, recibe la mercadería y registra el pago. Lo no pagado queda por pagar.
6. Los abonos se registran en Clientes, Créditos, contra una venta concreta o contra la más antigua. Entran como ingreso de la caja abierta.
7. En Facturación, genera boleta o factura desde la venta. El estado inicial es En cola. Configura la URL y el token del proveedor autorizado para enviar. No des por aceptado un papel impreso: la aceptación es el CDR.
8. Informes filtra por fechas y exporta Excel o PDF. La copia de seguridad se descarga en Configuración. Para restaurar, detén la aplicación y reemplaza el archivo de `DB_PATH` (en local, `prisma/dev.db`). No la reemplaces con el servidor encendido.

## Despliegue

Hay un solo archivo de base. Usuarios, ventas, stock, caja, compras, clientes y facturación viven ahí. Las fotos de producto y la portada se guardan en la carpeta `uploads` junto a ese archivo cuando `DB_PATH` está definido.

GitHub es el origen del código. El servicio que escribe la base es Render, con un disco persistente montado en `/var/data` y una sola instancia. `render.yaml` fija `DB_PATH=/var/data/punto-fadey.db`. El arranque `npm run start:server` crea el archivo si no existe y aplica el esquema con `prisma db push`. `AUTH_SECRET` se define en el panel de Render y no va en el repositorio.

Vercel no comparte el disco de Render. Publicar el mismo proyecto también en Vercel crearía otra base vacía y efímera. El dominio de la tienda debe apuntar al servicio de Render.

1. Define `DB_PATH` y `AUTH_SECRET` fuera del código. En local basta `DATABASE_URL`.
2. Sirve la app por HTTPS, con el dominio propio. La PWA se instala desde el manifiesto en `/manifest.webmanifest` y registra `/sw.js`.
3. El motor es SQLite. No hace falta PostgreSQL para este archivo único.
4. En local, arranca con `npm run build` y `npm run start` cuando no haya un `next dev` usando la misma carpeta `.next`.
5. Para actualizar en Render, despliega el commit. Antes, descarga la copia desde Configuración. No reemplaces el archivo con el servidor encendido.
6. Los logs de error salen del proceso de Node. Las operaciones de compra, abono, facturación y permisos también quedan en `AuditLog`.
7. La copia descargada incluye todos los negocios de ese archivo SQLite.

## Pruebas ejecutadas

`npx tsc --noEmit` terminó sin errores. `npm run verify` pasó la suite de la primera parte y la de compras, crédito, facturación e informes: la compra pendiente no mueve stock, recibir 3 unidades suma 3, otro negocio no puede recibir esa compra, el crédito queda en el cliente, el abono queda ligado a la venta, la boleta nace en cola y el envío sin proveedor no la marca aceptada, un permiso denegado bloquea al cajero y el informe incluye la venta real.

En el navegador, con Bodega Central:

1. Se registró Distribuidora Lima. La compra F001-100 de 1 unidad a S/ 2.50 quedó pendiente y el stock siguió en 10 unidades.
2. Al recibir, el stock pasó a 11 unidades y el valor al costo a S/ 27.50, porque el costo del producto quedó en S/ 2.50. El pago por transferencia dejó la cuenta por pagar en cero.
3. Se creó Cliente Norte, se vendió 1 unidad a crédito por S/ 5.00 y un abono de S/ 2.00 dejó S/ 3.00 por cobrar.
4. La boleta B001-1 quedó en cola, ligada a esa venta, con XML e impresión. No se marcó aceptada.
5. Finanzas del mes mostró ventas S/ 15.00, ventas en efectivo S/ 10.00, otros ingresos de caja S/ 2.00, utilidad bruta y neta S/ 6.50, por cobrar S/ 3.00 y por pagar S/ 0.00.
6. En un ancho de teléfono el panel lateral queda fuera de la pantalla y el botón Abrir menú sigue disponible. Los avisos de hidratación del navegador de Cursor apuntan a atributos que inyecta esa herramienta, no a datos del negocio.

## Pendiente

La facturación electrónica no está validada con SUNAT. Falta configurar un proveedor autorizado o el servicio de SUNAT y recibir un CDR real. Hasta entonces los comprobantes permanecen en cola. La recepción de compras es del saldo pendiente completo; no hay una pantalla para recibir una cantidad parcial. La PWA no sincroniza ventas offline. El respaldo es una copia del archivo SQLite, no un servicio externo. `npm install` reportó 3 avisos altos de dependencias. No se ejecutó `next build` mientras el servidor de desarrollo estaba usando `.next`.
