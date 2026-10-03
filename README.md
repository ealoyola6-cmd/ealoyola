# Estación Anemométrica Loyola – Página en Vercel

## Pasos para publicar
1. Sube esta carpeta a un repositorio de GitHub (o usa `vercel` desde la terminal dentro de la carpeta).
2. En vercel.com: **Add New → Project** e importa el repositorio.
3. En el proyecto: **Storage → Create Database → Neon (Postgres)** y conéctalo al proyecto.
   Esto crea automáticamente la variable `DATABASE_URL`.
4. En **Settings → Environment Variables** agrega:
   - `INGEST_TOKEN` = una clave larga y aleatoria (ej.: resultado de `openssl rand -hex 24`).
5. Haz **Redeploy** para que tome las variables.
6. En `config_recolector.json` del recolector pon:
   - `remoto_url`: `https://TU-PROYECTO.vercel.app` (sin barra final)
   - `remoto_token`: el mismo valor de `INGEST_TOKEN`
7. Ejecuta el recolector. La carga inicial de ~3 años (~1.5 millones de filas) tarda un buen rato
   porque se envía en lotes de 500; la tabla irá llenándose sola.

## Endpoints
- `POST /api/ingest/historico` (Bearer token) – lote `{"registros":[...]}`
- `POST /api/ingest/vivo` (Bearer token) – última lectura
- `GET /api/vivo` – última lectura recibida
- `GET /api/serie?min=180` – datos minuto a minuto para las gráficas
- `GET /api/datos?pagina=1&por_pagina=20&horas=0` – tabla paginada (horas=0: todo)
- `GET /api/resumen?horas=24` – estadísticas para el informe PDF
- `GET /api/export?horas=0` – descarga CSV (abre en Excel)

La página es pública. Si quieres restringirla, activa **Deployment Protection** en Vercel
(ojo: las rutas `/api/ingest/*` también quedarían protegidas; usa "Standard Protection" o
un bypass token para el recolector).

## Consumo (plan gratuito)
- Las lecturas (`/api/vivo`, `/api/datos`, `/api/serie`, `/api/resumen`) se guardan 10 min en el CDN de Vercel:
  muchas personas viendo la página comparten la misma respuesta, así que no consumen más.
- La página consulta una vez por lote (cada 15 min, justo después del envío) y solo mientras la pestaña está visible.
- El recolector envía un lote cada 15 min (`intervalo_envio_min`). Así la base Neon puede "dormir"
  entre envíos y no se agotan sus horas de cómputo gratuitas. No lo bajes de 10 min.
- Si cambias `intervalo_envio_min`, crea en Vercel la variable `INTERVALO_ENVIO_MIN` con el mismo valor
  (solo afecta al indicador "Conectado") y redespliega.
