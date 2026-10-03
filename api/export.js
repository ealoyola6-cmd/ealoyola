import { sql, prepararTablas, COLS, filtroHoras } from "../lib/db.js";

// Formato por defecto: el de Excel en español (separador ";" y decimales con coma).
// Para configuración regional en inglés: /api/export?formato=us  (separador "," y decimales con punto)
export default async function handler(req, res) {
  try {
    await prepararTablas();
    const us = req.query.formato === "us";
    const SEP = us ? "," : ";";
    const num = (n) => (n == null ? "" : us ? String(n) : String(n).replace(".", ","));

    const where = filtroHoras(req.query.horas);
    const y = where.trim() ? "AND" : "WHERE";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="datos_viento_${Date.now()}.csv"`);
    res.write("\ufeff" + ["Fecha", "Record", "Velviento_S_WVT", "Direccion_D1_WVT",
      "Direccion_SD1_WVT", "Velviento_Max", "Velviento_Std"].join(SEP) + "\r\n");

    let ultima = null;
    for (;;) {
      const filas = ultima
        ? await sql.query(`SELECT ${COLS} FROM datos ${where} ${y} fecha > $1::timestamp ORDER BY fecha LIMIT 20000`, [ultima])
        : await sql.query(`SELECT ${COLS} FROM datos ${where} ORDER BY fecha LIMIT 20000`);
      if (!filas.length) break;
      res.write(filas.map((f) => [f.Fecha, f.Record, num(f.Velviento_S_WVT), num(f.Direccion_D1_WVT),
        num(f.Direccion_SD1_WVT), num(f.Velviento_Max), num(f.Velviento_Std)].join(SEP)).join("\r\n") + "\r\n");
      ultima = filas[filas.length - 1].Fecha;
      if (filas.length < 20000) break;
    }
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Error al exportar" });
    else res.end();
  }
}
