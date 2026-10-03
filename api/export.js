import { sql, prepararTablas, COLS, filtroHoras } from "../lib/db.js";
import { escribirXlsx } from "../lib/xlsx.js";

const MAX_FILAS = 1048575;   // límite de filas de una hoja de Excel (menos la cabecera)
const PAGINA = 20000;

async function* lotes(horas, inicio) {
  let cursor = inicio, inclusivo = true, enviadas = 0;
  while (enviadas < MAX_FILAS) {
    const filas = cursor
      ? await sql.query(`SELECT ${COLS} FROM datos WHERE fecha ${inclusivo ? ">=" : ">"} $1::timestamp
                         ${filtroHoras(horas, "AND")} ORDER BY fecha LIMIT ${PAGINA}`, [cursor])
      : await sql.query(`SELECT ${COLS} FROM datos ${filtroHoras(horas)} ORDER BY fecha LIMIT ${PAGINA}`);
    if (!filas.length) return;
    yield filas;
    enviadas += filas.length;
    cursor = filas[filas.length - 1].Fecha; inclusivo = false;
    if (filas.length < PAGINA) return;
  }
}

async function csv(req, res) {   // respaldo: /api/export?formato=csv  (o csv-us)
  const us = req.query.formato === "csv-us";
  const SEP = us ? "," : ";";
  const num = (n) => (n == null ? "" : us ? String(n) : String(n).replace(".", ","));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="datos_viento_${Date.now()}.csv"`);
  res.write("\ufeff" + ["Fecha", "Record", "Velviento_S_WVT", "Direccion_D1_WVT",
    "Direccion_SD1_WVT", "Velviento_Max", "Velviento_Std"].join(SEP) + "\r\n");
  for await (const filas of lotes(req.query.horas, null))
    res.write(filas.map((f) => [f.Fecha, f.Record, num(f.Velviento_S_WVT), num(f.Direccion_D1_WVT),
      num(f.Direccion_SD1_WVT), num(f.Velviento_Max), num(f.Velviento_Std)].join(SEP)).join("\r\n") + "\r\n");
  res.end();
}

export default async function handler(req, res) {
  try {
    await prepararTablas();
    if (String(req.query.formato || "").startsWith("csv")) return await csv(req, res);

    // Si hay más filas de las que caben en una hoja, se exportan las más recientes.
    const [{ n }] = await sql.query(`SELECT COUNT(*)::int AS n FROM datos ${filtroHoras(req.query.horas)}`);
    let inicio = null;
    if (n > MAX_FILAS) {
      const [r] = await sql.query(
        `SELECT to_char(fecha,'YYYY-MM-DD HH24:MI:SS') AS f FROM datos ${filtroHoras(req.query.horas)}
         ORDER BY fecha DESC OFFSET ${MAX_FILAS - 1} LIMIT 1`);
      inicio = r.f;
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="datos_viento_${Date.now()}.xlsx"`);
    await escribirXlsx(res, () => lotes(req.query.horas, inicio));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Error al exportar" });
    else res.end();
  }
}
