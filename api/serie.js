import { sql, prepararTablas, CACHE } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await prepararTablas();
    const min = Math.min(Math.max(parseInt(req.query.min) || 180, 10), 1440);
    const filas = await sql.query(
      `SELECT to_char(fecha,'YYYY-MM-DD HH24:MI:SS') AS "Fecha",
              velviento_s_wvt AS v, velviento_max AS m, direccion_d1_wvt AS d
       FROM datos
       WHERE fecha >= (SELECT MAX(fecha) FROM datos) - make_interval(mins => ${min})
       ORDER BY fecha`);
    res.setHeader("Cache-Control", CACHE);
    res.status(200).json(filas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al consultar" });
  }
}
