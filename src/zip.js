// Archive ZIP minimale : fichiers stockés sans compression (méthode 0). Suffisant
// pour regrouper les séances .fit — elles sont minuscules — et évite une dépendance.

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC32_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date/heure MS-DOS (résolution : 2 s), format historique du ZIP. */
function dosDateTime(date) {
  const d = date || new Date();
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

class Out {
  constructor() {
    this.a = [];
  }
  get length() {
    return this.a.length;
  }
  u16(v) {
    this.a.push(v & 0xff, (v >>> 8) & 0xff);
  }
  u32(v) {
    this.u16(v);
    this.u16(v >>> 16);
  }
  bytes(list) {
    for (const b of list) this.a.push(b & 0xff);
  }
  toBytes() {
    return Uint8Array.from(this.a);
  }
}

/**
 * @param {{name: string, data: Uint8Array, date?: Date}[]} files
 * @returns {Uint8Array} archive ZIP
 */
export function zipStore(files) {
  const enc = new TextEncoder();
  const out = new Out();
  const entries = [];
  for (const f of files) {
    const name = enc.encode(f.name);
    const { time, date } = dosDateTime(f.date);
    const crc = crc32(f.data);
    entries.push({ name, time, date, crc, size: f.data.length, offset: out.length });
    out.u32(0x04034b50); // signature d'en-tête local
    out.u16(20); // version minimale
    out.u16(0x0800); // noms de fichiers en UTF-8
    out.u16(0); // méthode : stocké
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(f.data.length); // taille compressée
    out.u32(f.data.length); // taille d'origine
    out.u16(name.length);
    out.u16(0); // pas de champ « extra »
    out.bytes(name);
    out.bytes(f.data);
  }
  const cdStart = out.length;
  for (const e of entries) {
    out.u32(0x02014b50); // signature d'entrée du répertoire central
    out.u16(20); // version d'écriture
    out.u16(20); // version minimale
    out.u16(0x0800);
    out.u16(0);
    out.u16(e.time);
    out.u16(e.date);
    out.u32(e.crc);
    out.u32(e.size);
    out.u32(e.size);
    out.u16(e.name.length);
    out.u16(0); // extra
    out.u16(0); // commentaire
    out.u16(0); // disque
    out.u16(0); // attributs internes
    out.u32(0); // attributs externes
    out.u32(e.offset);
    out.bytes(e.name);
  }
  const cdSize = out.length - cdStart;
  out.u32(0x06054b50); // fin du répertoire central
  out.u16(0); // disque courant
  out.u16(0); // disque du répertoire central
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(cdSize);
  out.u32(cdStart);
  out.u16(0); // commentaire
  return out.toBytes();
}
