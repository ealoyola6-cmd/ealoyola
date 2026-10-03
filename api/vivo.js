import { sql, prepararTablas, CACHE } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    await prepararTablas();
    const [r] = await sql.query(
      `SELECT fecha AS "Fecha", record AS "Record", velviento_s_wvt AS "Velviento_S_WVT",
              direccion_d1_wvt AS "Direccion_D1_WVT", direccion_sd1_wvt AS "Direccion_SD1_WVT",
              velviento_max AS "Velviento_Max", velviento_std AS "Velviento_Std",
              EXTRACT(EPOCH FROM (now() - recibido))::int AS hace_seg,
              (EXTRACT(EPOCH FROM recibido) * 1000)::bigint AS recibido_ms
       FROM vivo WHERE id = 1`);
    res.setHeader("Cache-Control", CACHE);
    if (!r) return res.status(200).json({});
    const intervalo = parseInt(process.env.INTERVALO_ENVIO_MIN) || 15;   // minutos (igual que el recolector)
    r.enlace = r.hace_seg <= (intervalo * 2 + 2) * 60;
    res.status(200).json(r);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al consultar" });
  }
}
