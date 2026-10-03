import { neon } from "@neondatabase/serverless";

// Busca una URL de Postgres válida entre las variables de entorno (tolera comillas,
// "psql '...'", prefijos de nombre) o, si no, la arma con PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
function urlValida(txt) {
  const m = String(txt || "").match(/postgres(?:ql)?:\/\/[^\s'"]+/);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return u.hostname && u.username && u.pathname.length > 1 ? m[0] : null;
  } catch { return null; }
}

export function urlBase() {
  const e = process.env;
  const claves = Object.keys(e).filter((k) => !/UNPOOLED|NON_POOLING/.test(k));
  for (const k of claves) { const u = urlValida(e[k]); if (u) return u; }
  for (const k of Object.keys(e)) { const u = urlValida(e[k]); if (u) return u; }
  if (e.PGHOST && e.PGUSER && e.PGPASSWORD && e.PGDATABASE)
    return `postgresql://${encodeURIComponent(e.PGUSER)}:${encodeURIComponent(e.PGPASSWORD)}@${e.PGHOST}/${e.PGDATABASE}?sslmode=require`;
  const vistas = Object.keys(e).filter((k) => /DATA|POSTGRES|PG|NEON|STORAGE/i.test(k));
  throw new Error("No hay una URL de Postgres válida. Variables relacionadas encontradas (solo nombres): " + (vistas.join(", ") || "ninguna"));
}

export const sql = neon(urlBase());

let listo;
export function prepararTablas() {
  if (!listo) {
    listo = (async () => {
      await sql.query(`CREATE TABLE IF NOT EXISTS datos (
        fecha TIMESTAMP PRIMARY KEY,
        record INTEGER,
        velviento_s_wvt DOUBLE PRECISION,
        direccion_d1_wvt DOUBLE PRECISION,
        direccion_sd1_wvt DOUBLE PRECISION,
        velviento_max DOUBLE PRECISION,
        velviento_std DOUBLE PRECISION
      )`);
      await sql.query(`CREATE TABLE IF NOT EXISTS vivo (
        id INTEGER PRIMARY KEY DEFAULT 1,
        fecha TEXT, record INTEGER,
        velviento_s_wvt DOUBLE PRECISION,
        direccion_d1_wvt DOUBLE PRECISION,
        direccion_sd1_wvt DOUBLE PRECISION,
        velviento_max DOUBLE PRECISION,
        velviento_std DOUBLE PRECISION,
        recibido TIMESTAMPTZ DEFAULT now()
      )`);
    })().catch((e) => { listo = null; throw e; });
  }
  return listo;
}

const limpiar = (t) => String(t || "").trim().replace(/^["']|["']$/g, "");

export function autorizado(req) {
  const esperado = limpiar(process.env.INGEST_TOKEN);
  const recibido = limpiar((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  return esperado.length > 0 && recibido === esperado;
}

// Pistas para depurar un 401 sin revelar la clave (quitar cuando ya funcione el envío).
export function pistaToken(req) {
  const esperado = limpiar(process.env.INGEST_TOKEN);
  const recibido = limpiar((req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  return { token_configurado_en_vercel: esperado.length > 0,
           largo_esperado: esperado.length, largo_recibido: recibido.length };
}

export const COLS = `to_char(fecha,'YYYY-MM-DD HH24:MI:SS') AS "Fecha", record AS "Record",
  velviento_s_wvt AS "Velviento_S_WVT", direccion_d1_wvt AS "Direccion_D1_WVT",
  direccion_sd1_wvt AS "Direccion_SD1_WVT", velviento_max AS "Velviento_Max",
  velviento_std AS "Velviento_Std"`;

// horas = 0 -> todo el histórico. Se mide desde el último dato guardado.
export function filtroHoras(horas, prefijo = "WHERE") {
  const h = parseInt(horas) || 0;
  return h > 0
    ? ` ${prefijo} fecha >= (SELECT MAX(fecha) FROM datos) - make_interval(hours => ${h}) `
    : " ";
}

// Caché en el CDN de Vercel: todas las personas que abran la página comparten la misma
// respuesta durante 10 min, así que 1 o 100 visitantes consumen lo mismo.
export const CACHE = "public, s-maxage=600, stale-while-revalidate=300";
