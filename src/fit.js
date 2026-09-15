// Génération de fichiers FIT « workout » (séances structurées), à copier sur une
// montre Garmin (dossier GARMIN/NewFiles) ou à importer dans Garmin Connect,
// intervals.icu, Coros, Suunto…
//
// Encodeur FIT minimal, sans dépendance : en-tête de 14 octets, trois messages
// (file_id, workout, workout_step), CRC 16 bits, tout en little endian.
// Référence : FIT Protocol / FIT Profile (Garmin SDK).
import { roundTo, toISODate } from './format.js';

const PROTOCOL_VERSION = 0x20; // 2.0
const PROFILE_VERSION = 2140; // 21.40
const FIT_EPOCH = 631065600; // secondes entre le 1er janvier 1970 et le 31 décembre 1989 (UTC)
const NAME_SIZE = 48; // octets réservés au nom de la séance
const STEP_NAME_SIZE = 32; // octets réservés au libellé d'une étape

// Types de base FIT utilisés ici : identifiant, taille, valeur « non renseignée ».
const ENUM = { base: 0x00, size: 1, invalid: 0xff };
const UINT16 = { base: 0x84, size: 2, invalid: 0xffff };
const UINT32 = { base: 0x86, size: 4, invalid: 0xffffffff };
const STR = (size) => ({ base: 0x07, size, invalid: null });

// Messages (numéro global) et champs (numéro de champ) du profil FIT.
const MSG = {
  fileId: {
    local: 0,
    global: 0,
    fields: [
      ['type', 0, ENUM],
      ['manufacturer', 1, UINT16],
      ['product', 2, UINT16],
      ['time_created', 4, UINT32],
    ],
  },
  workout: {
    local: 1,
    global: 26,
    fields: [
      ['wkt_name', 8, STR(NAME_SIZE)],
      ['sport', 4, ENUM],
      ['num_valid_steps', 6, UINT16],
    ],
  },
  step: {
    local: 2,
    global: 27,
    fields: [
      ['message_index', 254, UINT16],
      ['wkt_step_name', 0, STR(STEP_NAME_SIZE)],
      ['duration_type', 1, ENUM],
      ['duration_value', 2, UINT32],
      ['target_type', 3, ENUM],
      ['target_value', 4, UINT32],
      ['custom_target_value_low', 5, UINT32],
      ['custom_target_value_high', 6, UINT32],
      ['intensity', 7, ENUM],
    ],
  },
};

const FILE_TYPE_WORKOUT = 5;
const MANUFACTURER_DEVELOPMENT = 255;
export const SPORT_RUNNING = 1;
export const FIT_MIME = 'application/vnd.ant.fit';
export const ZIP_MIME = 'application/zip';

// Énumérations du profil FIT.
const DURATION = { time: 0, distance: 1, repeatUntilStepsCmplt: 6 };
const TARGET = { speed: 0, open: 2 };
const INTENSITY = { active: 0, rest: 1, warmup: 2, cooldown: 3, recovery: 4 };

// ---------------------------------------------------------------------------
// Écriture binaire
// ---------------------------------------------------------------------------
class Buf {
  constructor() {
    this.a = [];
  }
  get length() {
    return this.a.length;
  }
  u8(v) {
    this.a.push(v & 0xff);
  }
  u16(v) {
    this.u8(v);
    this.u8(v >>> 8);
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

/** Chaîne UTF-8 complétée par des zéros, tronquée sans couper un caractère. */
function strBytes(s, size) {
  const enc = new TextEncoder().encode(s == null ? '' : String(s));
  const out = new Uint8Array(size); // le reste vaut 0 : terminateur inclus
  let end = Math.min(enc.length, size - 1);
  while (end > 0 && (enc[end] & 0xc0) === 0x80) end--; // pas au milieu d'un caractère
  out.set(enc.subarray(0, end));
  return out;
}

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01,
  0x8801, 0x4400,
];

/** CRC 16 bits du protocole FIT (par demi-octets). */
export function fitCrc(bytes, crc = 0) {
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc;
}

function writeDefinition(buf, msg) {
  buf.u8(0x40 | msg.local); // en-tête d'enregistrement : définition
  buf.u8(0); // réservé
  buf.u8(0); // architecture : little endian
  buf.u16(msg.global);
  buf.u8(msg.fields.length);
  for (const [, num, type] of msg.fields) {
    buf.u8(num);
    buf.u8(type.size);
    buf.u8(type.base);
  }
}

function writeData(buf, msg, values) {
  buf.u8(msg.local); // en-tête d'enregistrement : données
  for (const [key, , type] of msg.fields) {
    const v = values[key];
    if (type.base === 0x07) {
      buf.bytes(strBytes(v, type.size));
      continue;
    }
    const raw = v == null ? type.invalid : v;
    if (type.size === 1) buf.u8(raw);
    else if (type.size === 2) buf.u16(raw);
    else buf.u32(raw);
  }
}

/** Secondes depuis le 31 décembre 1989 (horodatage FIT). */
function fitTime(date) {
  return Math.max(0, Math.round(date.getTime() / 1000) - FIT_EPOCH);
}

/**
 * Encode un fichier FIT de séance.
 * @param {{name: string, steps: object[], sport?: number, createdAt?: Date}} o
 * @returns {Uint8Array}
 */
export function encodeWorkoutFit({ name, steps, sport = SPORT_RUNNING, createdAt = new Date() }) {
  const body = new Buf();
  writeDefinition(body, MSG.fileId);
  writeData(body, MSG.fileId, {
    type: FILE_TYPE_WORKOUT,
    manufacturer: MANUFACTURER_DEVELOPMENT,
    product: 0,
    time_created: fitTime(createdAt),
  });
  writeDefinition(body, MSG.workout);
  writeData(body, MSG.workout, { wkt_name: name, sport, num_valid_steps: steps.length });
  writeDefinition(body, MSG.step);
  steps.forEach((s, i) => writeData(body, MSG.step, { ...s, message_index: i }));

  const header = new Buf();
  header.u8(14); // taille de l'en-tête
  header.u8(PROTOCOL_VERSION);
  header.u16(PROFILE_VERSION);
  header.u32(body.length);
  header.bytes([0x2e, 0x46, 0x49, 0x54]); // ".FIT"
  header.u16(fitCrc(header.toBytes())); // CRC des 12 premiers octets

  const out = new Uint8Array(header.length + body.length + 2);
  out.set(header.toBytes(), 0);
  out.set(body.toBytes(), header.length);
  const crc = fitCrc(out.subarray(0, out.length - 2));
  out[out.length - 2] = crc & 0xff;
  out[out.length - 1] = (crc >> 8) & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// Séance → étapes FIT
// ---------------------------------------------------------------------------
/** Allure (s/km) → vitesse en mm/s, unité des cibles de vitesse FIT. */
const paceToSpeed = (secPerKm) => Math.round(1e6 / secPerKm);

function intensityOf(s) {
  if (s.rest) return INTENSITY.rest;
  if (s.intensity === 'warmup') return INTENSITY.warmup;
  if (s.intensity === 'cooldown') return INTENSITY.cooldown;
  if (s.intensity === 'recovery') return INTENSITY.recovery;
  return INTENSITY.active;
}

function fitStep(s) {
  const step = { wkt_step_name: s.cue, intensity: intensityOf(s) };
  if (s.km != null) {
    step.duration_type = DURATION.distance;
    step.duration_value = Math.round(s.km * 100000); // km → cm
  } else {
    step.duration_type = DURATION.time;
    step.duration_value = Math.round(s.sec * 1000); // s → ms
  }
  if (s.pace && !s.rest) {
    step.target_type = TARGET.speed;
    step.target_value = 0; // 0 = fourchette personnalisée, pas une zone
    step.custom_target_value_low = paceToSpeed(s.pace[0]); // allure la plus lente
    step.custom_target_value_high = paceToSpeed(s.pace[1]); // allure la plus rapide
  } else {
    step.target_type = TARGET.open;
    step.target_value = 0;
  }
  return step;
}

/** Étape de répétition : « revenir à l'étape `from`, `times` fois en tout ». */
function repeatStep(from, times) {
  return {
    duration_type: DURATION.repeatUntilStepsCmplt,
    duration_value: from,
    target_type: TARGET.open,
    target_value: times,
  };
}

/**
 * Étapes FIT d'une séance. Les séances sans blocs (la course) deviennent une
 * étape unique sur la distance, à l'allure cible.
 */
export function workoutToFitSteps(w, paces) {
  const steps = [];
  if (!w.blocks.length) {
    const pace = paces?.rpExact;
    steps.push(
      fitStep({
        cue: w.kind === 'race' ? 'Allure course' : w.title,
        km: w.km,
        pace: pace ? [roundTo(pace + 5, 5), roundTo(pace - 5, 5)] : undefined,
      }),
    );
    return steps;
  }
  for (const b of w.blocks) {
    const from = steps.length;
    for (const s of b.steps) steps.push(fitStep(s));
    if (b.repeat > 1) steps.push(repeatStep(from, b.repeat));
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Programme → fichiers
// ---------------------------------------------------------------------------
/** "Tempo sur 3 km" → "tempo-sur-3-km" */
export function slug(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** Nom affiché sur la montre : "22/09 Tempo sur 3 km". */
export function fitWorkoutName(session) {
  const d = session.date;
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm} ${session.workout.title}`;
}

export function fitFileName(session) {
  return `${session.iso}-${slug(session.workout.title)}.fit`;
}

/** Fichier FIT d'une séance du programme. */
export function sessionToFit(session, plan, { createdAt } = {}) {
  return encodeWorkoutFit({
    name: fitWorkoutName(session),
    steps: workoutToFitSteps(session.workout, plan?.paces),
    createdAt: createdAt ?? session.date,
  });
}

/** Un fichier FIT par séance du programme, course comprise. */
export function planToFitFiles(plan, opts = {}) {
  return plan.weeks.flatMap((wk) =>
    wk.sessions.map((s) => ({ name: fitFileName(s), data: sessionToFit(s, plan, opts), date: s.date })),
  );
}

export function planZipName(plan) {
  return `seances-${plan.distKey}-${toISODate(plan.race)}.zip`;
}
