import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictTime, trainingPaces, vdotFromRace } from '../src/paces.js';
import { buildPlan } from '../src/plan.js';
import { repsSession, toIntervalsText } from '../src/workouts.js';
import { planToEvents } from '../src/intervals.js';

const days3 = [
  { weekday: 2, role: 'quality' },
  { weekday: 5, role: 'easy' },
  { weekday: 7, role: 'long' },
];
const today = new Date(2026, 8, 14, 12); // lundi 14 septembre 2026

test('VDOT : 10 km en 50:00 ≈ 40 (table Daniels)', () => {
  const v = vdotFromRace(10000, 3000);
  assert.ok(v > 39 && v < 41, String(v));
});

test('prédiction : 10 km en 50:00 → marathon entre 3h45 et 4h00', () => {
  const t = predictTime(vdotFromRace(10000, 3000), 42195);
  assert.ok(t > 3.75 * 3600 && t < 4 * 3600, String(t));
});

test('allures cohérentes pour un 10 km en 55:00', () => {
  const p = trainingPaces('10k', 3300);
  assert.equal(p.rp, 330);
  assert.ok(p.easySlow > p.easyFast && p.easyFast > p.rp, 'footing plus lent que la course');
  assert.ok(p.threshold < p.easyFast && p.interval < p.threshold && p.rep < p.interval, 'ordre seuil > intervalles > lignes droites');
  assert.ok(p.marathon > p.rp && p.half > p.rp, 'marathon et semi plus lents que le 10 km');
  for (const k of ['easySlow', 'easyFast', 'threshold', 'interval', 'rep', 'marathon']) assert.equal(p[k] % 5, 0, `${k} arrondi à 5 s`);
});

test('plan 10 km sur 6 semaines (structure du plan Runna)', () => {
  const plan = buildPlan({ raceDate: '2026-10-25', distKey: '10k', targetSeconds: 3300, days: days3, today });
  assert.equal(plan.weekCount, 6);
  for (const wk of plan.weeks) {
    assert.ok(wk.sessions.filter((s) => s.role === 'long').length <= 1, 'une sortie longue max par semaine');
    for (const s of wk.sessions) {
      assert.ok(s.iso > '2026-09-14', 'pas de séance avant demain');
      assert.ok(s.iso <= '2026-10-25', 'pas de séance après la course');
      assert.notEqual(s.iso, '2026-10-24', 'repos la veille');
    }
  }
  const last = plan.weeks.at(-1);
  assert.equal(last.phase, 'race');
  assert.equal(last.sessions.at(-1).role, 'race');
  assert.ok(last.sessions.some((s) => s.workout.title.includes('affûtage')), 'intervalles d’affûtage en semaine de course');
  const full = plan.weeks[1];
  assert.equal(full.sessions.length, 3);
  assert.equal(new Set(full.sessions.map((s) => s.workout.kind)).size, 3, 'trois séances différentes');
  const kinds = plan.weeks.slice(0, 4).map((w) => w.sessions.find((s) => s.role === 'quality')?.workout.kind);
  assert.ok(kinds.includes('intervals') && kinds.includes('tempo'), 'alternance intervalles / tempo');
});

test('marathon 16 semaines : progression plafonnée, pic 3 semaines avant, affûtage', () => {
  const plan = buildPlan({ raceDate: '2027-01-03', distKey: '42k', targetSeconds: 4 * 3600, days: days3, today });
  assert.equal(plan.weekCount, 16);
  let prevUp = null;
  for (const wk of plan.weeks) {
    if (wk.longKm == null || wk.phase === 'taper') continue;
    if (!wk.down) {
      if (prevUp != null) assert.ok(wk.longKm <= prevUp + 3.01, `saut ${prevUp} → ${wk.longKm}`);
      prevUp = wk.longKm;
    }
  }
  const peak = plan.weeks.find((w) => w.peak);
  assert.equal(peak.weeksBefore, 3);
  assert.ok(plan.peakLongKm >= 26 && plan.peakLongKm <= 32, String(plan.peakLongKm));
  const taper = plan.weeks.filter((w) => w.phase === 'taper');
  assert.equal(taper.length, 2);
  assert.ok(taper[0].longKm > taper[1].longKm && taper[1].longKm < plan.peakLongKm);
  assert.ok(plan.weeks.some((w) => w.down), 'au moins une semaine allégée');
});

test('format texte intervals.icu', () => {
  const p = trainingPaces('10k', 3300);
  const w = repsSession(p, { reps: 4, distM: 800, pace: p.interval, restSec: 90 });
  const txt = toIntervalsText(w);
  assert.match(
    txt,
    /^Échauffement\n- Échauffement 1\.5km \d:\d\d-\d:\d\d\/km Pace\n\nSérie 4x\n- Rapide 800mtr \d:\d\d-\d:\d\d\/km Pace\n- Récup marche 90s\n\nRetour au calme\n- Retour au calme 1km \d:\d\d-\d:\d\d\/km Pace$/,
  );
  for (const line of txt.split('\n')) {
    if (line.startsWith('- ')) assert.match(line, /^- [^\d]+ \d/, `libellé sans chiffre : ${line}`);
  }
  assert.ok(w.km > 5 && w.km < 7, String(w.km));
});

test('événements intervals.icu : ids uniques, dates locales, une course', () => {
  const plan = buildPlan({
    raceDate: '2026-11-15',
    distKey: '21k',
    targetSeconds: 110 * 60,
    days: [...days3, { weekday: 4, role: 'quality' }],
    today,
  });
  const events = planToEvents(plan);
  assert.equal(new Set(events.map((e) => e.external_id)).size, events.length);
  assert.ok(events.every((e) => /^\d{4}-\d{2}-\d{2}T00:00:00$/.test(e.start_date_local)));
  assert.equal(events.filter((e) => e.category === 'RACE_A').length, 1);
  assert.ok(events.filter((e) => e.category === 'WORKOUT').every((e) => e.description.includes('/km Pace')));
  const week = plan.weeks[2];
  assert.equal(week.sessions.filter((s) => s.role === 'quality').length, 2, 'deux séances de qualité');
  const qk = week.sessions.filter((s) => s.role === 'quality').map((s) => s.workout.kind);
  assert.deepEqual(qk, ['intervals', 'tempo']);
});

test('erreurs de saisie', () => {
  assert.throws(() => buildPlan({ raceDate: '2026-09-15', distKey: '10k', targetSeconds: 3300, days: days3, today }), /trois jours/);
  assert.throws(() => buildPlan({ raceDate: '2026-12-06', distKey: '10k', targetSeconds: 3300, days: [days3[0], days3[1]], today }), /sortie longue/);
  assert.throws(() => buildPlan({ raceDate: '2026-12-06', distKey: '10k', targetSeconds: 0, days: days3, today }), /objectif/);
});
