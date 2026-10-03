import { sql, prepararTablas, COLS, filtroHoras, CACHE } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await prepararTablas();
    const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
    const porPagina = Math.min(Math.max(parseInt(req.query.por_pagina) || 20, 1), 200);
    const where = filtroHoras(req.query.horas);

    const [agg] = await sql.query(
      `SELECT COUNT(*)::int AS n,
              to_char(MIN(fecha),'YYYY-MM-DD HH24:MI:SS') AS d,
              to_char(MAX(fecha),'YYYY-MM-DD HH24:MI:SS') AS h
       FROM datos ${where}`);
    const filas = await sql.query(
      `SELECT ${COLS} FROM datos ${where} ORDER BY fecha DESC LIMIT $1 OFFSET $2`,
      [porPagina, (pagina - 1) * porPagina]);

    let faltantes = 0;
    if (agg.n && agg.d && agg.h) {
      const min = (new Date(agg.h.replace(" ", "T") + "Z") - new Date(agg.d.replace(" ", "T") + "Z")) / 60000;
      faltantes = Math.max(0, Math.floor(min) + 1 - agg.n);
    }
    res.setHeader("Cache-Control", CACHE);
    res.status(200).json({ filas, total: agg.n, faltantes, desde: agg.d, hasta: agg.h,
                           pagina, por_pagina: porPagina, cargando: false, procesados: 0, error: null });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al consultar" });
  }
}
