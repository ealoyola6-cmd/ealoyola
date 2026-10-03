import { sql, prepararTablas, autorizado, pistaToken } from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!autorizado(req)) return res.status(401).json({ error: "Token inválido", ...pistaToken(req) });

  const d = req.body;
  if (!d || !d.Fecha) return res.status(400).json({ error: "Falta Fecha" });

  try {
    await prepararTablas();
    await sql.query(
      `INSERT INTO vivo (id, fecha, record, velviento_s_wvt, direccion_d1_wvt,
                         direccion_sd1_wvt, velviento_max, velviento_std, recibido)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (id) DO UPDATE SET
         fecha=EXCLUDED.fecha, record=EXCLUDED.record,
         velviento_s_wvt=EXCLUDED.velviento_s_wvt,
         direccion_d1_wvt=EXCLUDED.direccion_d1_wvt,
         direccion_sd1_wvt=EXCLUDED.direccion_sd1_wvt,
         velviento_max=EXCLUDED.velviento_max,
         velviento_std=EXCLUDED.velviento_std, recibido=now()`,
      [d.Fecha, d.Record, d.Velviento_S_WVT, d.Direccion_D1_WVT,
       d.Direccion_SD1_WVT, d.Velviento_Max, d.Velviento_Std]
    );
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al guardar" });
  }
}
