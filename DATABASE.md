# Base de datos de desarrollo

## Configuración local activa

Se restauró el respaldo del 7 de septiembre de 2026 (UTC) en MongoDB Server 8.0 de esta computadora:

`mongodb://127.0.0.1:27017/laboratorios-soporte_dev_20260907`

El `.env` privado ya conecta la aplicación a esa base y contiene un JWT_SECRET propio.
Ejecuta `npm run dev` y abre `http://localhost:3000`. En MongoDB Compass, conecta a
`mongodb://127.0.0.1:27017` y selecciona `laboratorios-soporte_dev_20260907`.
Atlas es el servicio en la nube; esta copia usa el servidor MongoDB local.

Se verificaron 19 colecciones, 24 697 documentos y 51 índices. El respaldo original está en
`backups/respaldo-mongodb-20260907.zip`. Las otras bases locales y la base de Atlas se conservaron.
`ENABLE_SCHEDULED_TASKS=false` desactiva los cambios automáticos de horarios y vacaciones para
conservar la copia al arrancar. Se puede activar explícitamente para probar esas tareas.
Correo, WhatsApp y Google Drive no tienen credenciales configuradas en este entorno;
las operaciones que dependan de esos servicios requieren configuración adicional.

La base de producción de este proyecto se llama `laboratorios-soporte` en MongoDB Atlas.
Los respaldos de datos reales se guardan en `backups/`, excluido de Git, igual que los archivos `.env`.

## Descargar un respaldo

Define `MONGODB_BACKUP_URI` con la conexión de origen en tu entorno o `.env` privado y ejecuta:

```powershell
npm run db:backup -- backups/respaldo-mongodb-FECHA
```

El directorio debe ser nuevo. La exportación solo lee la base de origen. Genera archivos Extended JSON
canónicos con tipos BSON, opciones de colección, índices y un `manifest.json` con conteos y hashes SHA-256.
El manifiesto se escribe al finalizar; una carpeta sin manifiesto es una descarga incompleta.
La copia lee cada colección por separado: cambios concurrentes en producción pueden dar diferencias
entre colecciones. No incluye archivos adjuntos de `uploads/`, usuarios de Atlas ni sus permisos.

## Restaurar otra copia de pruebas (opcional)

Define `MONGODB_RESTORE_URI` con una conexión a una base **nueva y vacía**, distinta del origen,
cuyo nombre termine en `_dev`, `_staging` o `_test` (se admite un identificador después del sufijo).

```powershell
npm run db:restore -- backups/respaldo-mongodb-FECHA
```

La importación verifica hashes y conteos antes de escribir. Rechaza una base que ya tenga colecciones;
no borra datos. Si falla después de empezar, conserva lo importado y requiere otra base vacía para
reintentar. Los respaldos antiguos sin hashes también se pueden leer, pero no permiten verificar integridad.

Configura `MONGODB_URI` en `.env` para que apunte a la base de pruebas y usa `npm run dev`.
Usa un `JWT_SECRET` propio de desarrollo. Las credenciales de correo y WhatsApp deben configurarse
con destinos de prueba antes de activar notificaciones. No copies el `.env` de desarrollo a producción.
