import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingPaces } from '../src/paces.js';
import { buildPlan } from '../src/plan.js';
import { repsSession, easyRun } from '../src/workouts.js';
import { encodeWorkoutFit, fitCrc, fitFileName, planToFitFiles, sessionToFit, slug, workoutToFitSteps } from '../src/fit.js';
import { crc32, zipStore } from '../src/zip.js';

const days3 = [
  { weekday: 2, role: 'quality' },
  { weekday: 5, role: 'easy' },
  { weekday: 7, role: 'long' },
];
const today = new Date(2026, 8, 14, 12); // lundi 14 septembre 2026
const createdAt = new Date(Date.UTC(2026, 8, 14, 10));

// --- Décodeur FIT minimal, pour relire ce que l'encodeur produit -------------
const BASE_SIZE = { 0x00: 1, 0x02: 1, 0x84: 2, 0x86: 4 };

function decodeFit(bytes) {
  assert.equal(bytes[0], 14, 'en-tête de 14 octets');
  assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), '.FIT');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataSize = dv.getUint32(4, true);
  assert.equal(bytes.length, 14 + dataSize + 2, 'taille annoncée = taille réelle');
  assert.equal(dv.getUint16(12, true), fitCrc(bytes.subarray(0, 12)), 'CRC de l’en-tête');
  assert.equal(dv.getUint16(bytes.length - 2, true), fitCrc(bytes.subarray(0, bytes.length - 2)), 'CRC du fichier');

  const defs = new Map();
  const messages = [];
  let i = 14;
  const end = 14 + dataSize;
  while (i < end) {
    const header = bytes[i++];
    assert.equal(header & 0x80, 0, 'pas d’en-tête compressé');
    const local = header & 0x0f;
    if (header & 0x40) {
      i += 1; // réservé
      assert.equal(bytes[i++], 0, 'little endian');
      const global = dv.getUint16(i, true);
      i += 2;
      const n = bytes[i++];
      const fields = [];
      for (let f = 0; f < n; f++) {
        fields.push({ num: bytes[i], size: bytes[i + 1], base: bytes[i + 2] });
        i += 3;
      }
      defs.set(local, { global, fields });
      continue;
    }
    const def = defs.get(local);
    assert.ok(def, `définition manquante pour le type local ${local}`);
    const values = {};
    for (const f of def.fields) {
      if (f.base === 0x07) {
        const raw = bytes.subarray(i, i + f.size);
        const zero = raw.indexOf(0);
        values[f.num] = new TextDecoder().decode(raw.subarray(0, zero < 0 ? raw.length : zero));
      } else {
        assert.equal(f.size, BASE_SIZE[f.base], 'taille cohérente avec le type de base');
        values[f.num] = f.size === 1 ? bytes[i] : f.size === 2 ? dv.getUint16(i, true) : dv.getUint32(i, true);
      }
      i += f.size;
    }
    messages.push({ global: def.global, values });
  }
  return messages;
}

const of = (messages, global) => messages.filter((m) => m.global === global).map((m) => m.values);

// --- Encodage ---------------------------------------------------------------
test('fichier FIT : en-tête, CRC, file_id et workout', () => {
  const p = trainingPaces('10k', 3300);
  const w = easyRun(p, 8);
  const bytes = encodeWorkoutFit({ name: 'Footing', steps: workoutToFitSteps(w, p), createdAt });
  const msgs = decodeFit(bytes);

  const [fileId] = of(msgs, 0);
  assert.equal(fileId[0], 5, 'type de fichier : workout');
  assert.equal(fileId[1], 255, 'fabricant : development');
  assert.equal(fileId[4], Math.round(createdAt.getTime() / 1000) - 631065600, 'horodatage FIT');

  const [workout] = of(msgs, 26);
  assert.equal(workout[8], 'Footing');
  assert.equal(workout[4], 1, 'sport : course à pied');
  assert.equal(workout[6], 1, 'une seule étape');

  const steps = of(msgs, 27);
  assert.equal(steps.length, 1);
  assert.equal(steps[0][254], 0, 'message_index');
  assert.equal(steps[0][1], 1, 'durée exprimée en distance');
  assert.equal(steps[0][2], 800000, '8 km en centimètres');
  assert.equal(steps[0][3], 0, 'cible : vitesse');
  assert.equal(steps[0][5], Math.round(1e6 / p.easySlow), 'borne basse = allure la plus lente');
  assert.equal(steps[0][6], Math.round(1e6 / p.easyFast), 'borne haute = allure la plus rapide');
  assert.ok(steps[0][5] < steps[0][6], 'vitesse basse < vitesse haute');
});

test('séance à intervalles : échauffement, répétition, retour au calme', () => {
  const p = trainingPaces('10k', 3300);
  const w = repsSession(p, { reps: 4, distM: 800, pace: p.interval, restSec: 90 });
  const steps = workoutToFitSteps(w, p);
  const decoded = of(decodeFit(encodeWorkoutFit({ name: '4 x 800 m', steps, createdAt })), 27);

  assert.equal(decoded.length, 5, 'échauffement, rapide, récup, répétition, retour au calme');
  assert.deepEqual(
    decoded.map((s) => s[0]),
    ['Échauffement', 'Rapide', 'Récup marche', '', 'Retour au calme'],
  );
  assert.deepEqual(
    decoded.map((s) => s[7]),
    [2, 0, 1, 0xff, 3],
    'intensités : warmup, active, rest, (répétition), cooldown',
  );
  assert.equal(decoded[0][2], 150000, 'échauffement de 1,5 km');
  assert.equal(decoded[1][2], 80000, '800 m');
  assert.equal(decoded[2][1], 0, 'récupération exprimée en temps');
  assert.equal(decoded[2][2], 90000, '90 s en millisecondes');
  assert.equal(decoded[2][3], 2, 'récupération sans cible');

  const repeat = decoded[3];
  assert.equal(repeat[1], 6, 'duration_type : repeat_until_steps_cmplt');
  assert.equal(repeat[2], 1, 'retour à l’étape « Rapide »');
  assert.equal(repeat[4], 4, '4 répétitions');
  assert.equal(decoded.at(-1)[254], 4, 'message_index continu');
});

test('la course devient une étape unique à l’allure cible', () => {
  const plan = buildPlan({ raceDate: '2026-10-25', distKey: '10k', targetSeconds: 3300, days: days3, today });
  const race = plan.weeks.at(-1).sessions.at(-1);
  const msgs = decodeFit(sessionToFit(race, plan, { createdAt }));
  const steps = of(msgs, 27);
  assert.equal(steps.length, 1);
  assert.equal(steps[0][2], 1000000, '10 km en centimètres');
  assert.equal(steps[0][3], 0, 'cible : vitesse');
  assert.ok(steps[0][5] < Math.round(1e6 / plan.paces.rpExact) && steps[0][6] > Math.round(1e6 / plan.paces.rpExact));
  assert.equal(of(msgs, 26)[0][8], '25/10 Course : 10 km');
});

test('un fichier par séance, noms datés et uniques', () => {
  const plan = buildPlan({ raceDate: '2026-11-15', distKey: '21k', targetSeconds: 110 * 60, days: days3, today });
  const files = planToFitFiles(plan, { createdAt });
  const sessions = plan.weeks.flatMap((wk) => wk.sessions);
  assert.equal(files.length, sessions.length);
  assert.equal(new Set(files.map((f) => f.name)).size, files.length, 'noms uniques');
  for (const f of files) {
    assert.match(f.name, /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.fit$/, f.name);
    const msgs = decodeFit(f.data);
    const [workout] = of(msgs, 26);
    assert.equal(workout[6], of(msgs, 27).length, 'num_valid_steps = nombre d’étapes');
    assert.ok(workout[8].length > 0 && workout[8].length <= 47, workout[8]);
  }
  assert.equal(fitFileName(sessions[0]), `${sessions[0].iso}-${slug(sessions[0].workout.title)}.fit`);
  assert.equal(slug('Répétitions de 800 m'), 'repetitions-de-800-m');
});

test('noms tronqués sans couper un caractère accentué', () => {
  const long = 'Séance très très longue dont le nom dépasse largement la place réservée dans le fichier';
  const msgs = decodeFit(encodeWorkoutFit({ name: long, steps: workoutToFitSteps(easyRun(trainingPaces('10k', 3300), 5)), createdAt }));
  const name = of(msgs, 26)[0][8];
  assert.ok(long.startsWith(name), `« ${name} » doit être un préfixe du nom complet`);
  assert.ok(new TextEncoder().encode(name).length <= 47, 'terminateur compris');
});

// --- Archive ----------------------------------------------------------------
test('archive ZIP : signatures, CRC et catalogue', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'CRC-32 de référence');

  const files = [
    { name: 'a.fit', data: Uint8Array.from([1, 2, 3]), date: new Date(2026, 8, 20, 8, 30) },
    { name: 'b.fit', data: Uint8Array.from([4, 5]), date: new Date(2026, 8, 21, 8, 30) },
  ];
  const zip = zipStore(files);
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50, 'en-tête local');

  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'fin du répertoire central');
  assert.equal(dv.getUint16(eocd + 10, true), files.length, 'nombre d’entrées');
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  assert.equal(cdOffset + cdSize, eocd, 'le répertoire central précède exactement la fin');
  assert.equal(dv.getUint32(cdOffset, true), 0x02014b50, 'entrée du répertoire central');

  // chaque entrée pointe vers un en-tête local valide dont le CRC correspond aux données
  let p = cdOffset;
  for (const f of files) {
    const offset = dv.getUint32(p + 42, true);
    assert.equal(dv.getUint32(offset, true), 0x04034b50);
    assert.equal(dv.getUint32(offset + 14, true), crc32(f.data), `CRC de ${f.name}`);
    assert.equal(dv.getUint32(offset + 18, true), f.data.length, 'stocké sans compression');
    const nameLen = dv.getUint16(offset + 26, true);
    const start = offset + 30 + nameLen + dv.getUint16(offset + 28, true);
    assert.deepEqual(zip.subarray(start, start + f.data.length), f.data);
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
});
