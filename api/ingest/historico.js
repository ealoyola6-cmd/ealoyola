import { sql, prepararTablas, autorizado, pistaToken } from "../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!autorizado(req)) return res.status(401).json({ error: "Token inválido", ...pistaToken(req) });

  const regs = req.body?.registros;
  if (!Array.isArray(regs) || regs.length === 0 || regs.length > 2000)
    return res.status(400).json({ error: "Se esperaba 'registros' con 1 a 2000 elementos" });

  try {
    await prepararTablas();
    const col = (k) => regs.map((r) => r[k]);
    await sql.query(
      `INSERT INTO datos (fecha, record, velviento_s_wvt, direccion_d1_wvt,
                          direccion_sd1_wvt, velviento_max, velviento_std)
       SELECT * FROM unnest($1::timestamp[], $2::int[], $3::float8[], $4::float8[],
                            $5::float8[], $6::float8[], $7::float8[])
       ON CONFLICT (fecha) DO UPDATE SET
         record = EXCLUDED.record,
         velviento_s_wvt = EXCLUDED.velviento_s_wvt,
         direccion_d1_wvt = EXCLUDED.direccion_d1_wvt,
         direccion_sd1_wvt = EXCLUDED.direccion_sd1_wvt,
         velviento_max = EXCLUDED.velviento_max,
         velviento_std = EXCLUDED.velviento_std`,
      [col("Fecha"), col("Record"), col("Velviento_S_WVT"), col("Direccion_D1_WVT"),
       col("Direccion_SD1_WVT"), col("Velviento_Max"), col("Velviento_Std")]
    );
    // La "última lectura" se deriva del registro más reciente del lote (una sola petición)
    const u = regs.reduce((a, b) => (String(b.Fecha) > String(a.Fecha) ? b : a));
    await sql.query(
      `INSERT INTO vivo (id, fecha, record, velviento_s_wvt, direccion_d1_wvt,
                         direccion_sd1_wvt, velviento_max, velviento_std, recibido)
       VALUES (1,$1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (id) DO UPDATE SET
         fecha=EXCLUDED.fecha, record=EXCLUDED.record,
         velviento_s_wvt=EXCLUDED.velviento_s_wvt, direccion_d1_wvt=EXCLUDED.direccion_d1_wvt,
         direccion_sd1_wvt=EXCLUDED.direccion_sd1_wvt, velviento_max=EXCLUDED.velviento_max,
         velviento_std=EXCLUDED.velviento_std, recibido=now()
       WHERE vivo.fecha IS NULL OR vivo.fecha <= EXCLUDED.fecha`,
      [u.Fecha, u.Record, u.Velviento_S_WVT, u.Direccion_D1_WVT,
       u.Direccion_SD1_WVT, u.Velviento_Max, u.Velviento_Std]);
    res.status(200).json({ ok: true, recibidos: regs.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al guardar" });
  }
}
