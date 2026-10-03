// Generador mínimo de archivos .xlsx en streaming, sin dependencias (solo módulos de Node).
// Escribe el ZIP directamente en la respuesta HTTP, así que no carga el archivo en memoria.
import zlib from "node:zlib";
import { once } from "node:events";

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf, previo = 0) {
  let c = ~previo >>> 0;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const DOS_FECHA = ((2026 - 1980) << 9) | (1 << 5) | 1;   // 2026-01-01
const DOS_HORA = 0;

class ZipStream {
  constructor(res) { this.res = res; this.offset = 0; this.entradas = []; }

  _escribir(buf) { this.offset += buf.length; return this.res.write(buf); }

  async agregar(nombre, generador) {
    const nom = Buffer.from(nombre, "utf8");
    const inicio = this.offset;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0808, 6);                       // bit 3: tamaños después; bit 11: UTF-8
    h.writeUInt16LE(8, 8);                            // deflate
    h.writeUInt16LE(DOS_HORA, 10); h.writeUInt16LE(DOS_FECHA, 12);
    h.writeUInt16LE(nom.length, 26);
    if (!this._escribir(Buffer.concat([h, nom]))) await once(this.res, "drain");

    const deflate = zlib.createDeflateRaw({ level: 6 });
    let csize = 0, usize = 0, crc = 0;
    const fin = new Promise((ok, mal) => {
      deflate.on("data", (c) => { csize += c.length; this._escribir(c); });
      deflate.on("end", ok);
      deflate.on("error", mal);
    });
    for await (const parte of generador()) {
      const b = Buffer.isBuffer(parte) ? parte : Buffer.from(parte, "utf8");
      crc = crc32(b, crc); usize += b.length;
      if (!deflate.write(b)) await once(deflate, "drain");
    }
    deflate.end();
    await fin;

    const d = Buffer.alloc(16);
    d.writeUInt32LE(0x08074b50, 0); d.writeUInt32LE(crc, 4);
    d.writeUInt32LE(csize, 8); d.writeUInt32LE(usize, 12);
    if (!this._escribir(d)) await once(this.res, "drain");
    this.entradas.push({ nom, inicio, crc, csize, usize });
  }

  cerrar() {
    const cdInicio = this.offset;
    for (const e of this.entradas) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0808, 8); c.writeUInt16LE(8, 10);
      c.writeUInt16LE(DOS_HORA, 12); c.writeUInt16LE(DOS_FECHA, 14);
      c.writeUInt32LE(e.crc, 16); c.writeUInt32LE(e.csize, 20); c.writeUInt32LE(e.usize, 24);
      c.writeUInt16LE(e.nom.length, 28); c.writeUInt32LE(e.inicio, 42);
      this._escribir(Buffer.concat([c, e.nom]));
    }
    const cdTam = this.offset - cdInicio;
    const f = Buffer.alloc(22);
    f.writeUInt32LE(0x06054b50, 0);
    f.writeUInt16LE(this.entradas.length, 8); f.writeUInt16LE(this.entradas.length, 10);
    f.writeUInt32LE(cdTam, 12); f.writeUInt32LE(cdInicio, 16);
    this._escribir(f);
    this.res.end();
  }
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const ARCHIVOS_FIJOS = {
  "[Content_Types].xml": XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  "_rels/.rels": XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": XML + `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": XML + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  // estilos: 0 normal, 1 encabezado, 2 fecha y hora, 3 número 0.00, 4 entero
  "xl/styles.xml": XML + `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd\\ hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF16406B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
};

const ENCABEZADOS = ["Fecha", "Record", "Velviento_S_WVT", "Direccion_D1_WVT",
                     "Direccion_SD1_WVT", "Velviento_Max", "Velviento_Std"];
const ANCHOS = [20, 10, 18, 20, 22, 16, 16];
const COL = "ABCDEFG";

// "2026-09-30 10:01:00" -> número de serie de Excel (fecha y hora sin zona horaria)
function serie(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(txt);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  // +1e-8 día (~1 ms): evita que Excel/LibreOffice muestren 10:00:59 en lugar de 10:01:00
  return (ms / 86400000 + 25569 + 1e-8).toFixed(10);
}
const num = (v) => (v == null || !isFinite(v) ? "" : String(v));
const celda = (ref, estilo, v) => (v === "" || v == null ? "" : `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`);

export function filaXml(n, f) {
  return `<row r="${n}">` +
    celda(`A${n}`, 2, serie(f.Fecha)) + celda(`B${n}`, 4, num(f.Record)) +
    celda(`C${n}`, 3, num(f.Velviento_S_WVT)) + celda(`D${n}`, 3, num(f.Direccion_D1_WVT)) +
    celda(`E${n}`, 3, num(f.Direccion_SD1_WVT)) + celda(`F${n}`, 3, num(f.Velviento_Max)) +
    celda(`G${n}`, 3, num(f.Velviento_Std)) + "</row>";
}

function cabeceraHoja() {
  const cols = ANCHOS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const enc = `<row r="1">` + ENCABEZADOS.map((t, i) =>
    `<c r="${COL[i]}1" s="1" t="inlineStr"><is><t>${t}</t></is></c>`).join("") + "</row>";
  return XML + `<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>` + enc;
}

// `lotes` es un generador asíncrono que entrega arreglos de filas (objetos con las 7 columnas).
export async function escribirXlsx(res, lotes) {
  const zip = new ZipStream(res);
  for (const [nombre, contenido] of Object.entries(ARCHIVOS_FIJOS))
    await zip.agregar(nombre, async function* () { yield contenido; });
  await zip.agregar("xl/worksheets/sheet1.xml", async function* () {
    yield cabeceraHoja();
    let n = 2;
    for await (const filas of lotes()) {
      let buf = "";
      for (const f of filas) buf += filaXml(n++, f);
      yield buf;
    }
    yield "</sheetData></worksheet>";
  });
  zip.cerrar();
}
