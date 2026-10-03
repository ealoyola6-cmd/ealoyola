import { sql, prepararTablas, filtroHoras, CACHE } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await prepararTablas();
    const horas = parseInt(req.query.horas) || 0;
    const where = filtroHoras(horas);
    const [r] = await sql.query(
      `SELECT COUNT(*)::int AS n, AVG(velviento_s_wvt) AS prom_vel, MAX(velviento_max) AS vel_max,
              (degrees(atan2(SUM(sin(radians(direccion_d1_wvt))), SUM(cos(radians(direccion_d1_wvt))))) + 360)::numeric % 360 AS prom_dir,
              AVG(direccion_sd1_wvt) AS prom_sd_dir, AVG(velviento_std) AS prom_std_vel,
              to_char(MIN(fecha),'YYYY-MM-DD HH24:MI') AS primera,
              to_char(MAX(fecha),'YYYY-MM-DD HH24:MI') AS ultima
       FROM datos ${where}`);
    if (!r.n) return res.status(400).json({ error: "No hay datos en el periodo seleccionado" });
    const unidad = horas > 0 && horas <= 240 ? "hour" : "day";
    const fmt = unidad === "hour" ? "MM-DD HH24\"h\"" : "YYYY-MM-DD";
    const serie = await sql.query(
      `SELECT to_char(date_trunc('${unidad}', fecha), '${fmt}') AS k,
              AVG(velviento_s_wvt) AS media, MAX(velviento_max) AS max
       FROM datos ${where} GROUP BY date_trunc('${unidad}', fecha) ORDER BY 1`);
    res.setHeader("Cache-Control", CACHE);
    res.status(200).json({ ...r, unidad, serie });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al consultar" });
  }
}
