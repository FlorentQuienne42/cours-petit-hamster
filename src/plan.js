// Construction du programme : calendrier, périodisation, choix des séances.
//
// Principes (Daniels, Pfitzinger, Hansons, et la structure des plans Runna) :
//  - 1 séance de qualité (intervalles / tempo en alternance), 1 sortie longue,
//    le reste en footing facile ;
//  - progression de la sortie longue plafonnée (+2 à +3 km/semaine max), semaine
//    allégée toutes les 4 semaines, pic 2 semaines (3 pour le marathon) avant la course ;
//  - affûtage : volume réduit, intensité courte à l'allure de course ;
//  - repos la veille de la course.
import { DISTANCES, trainingPaces } from './paces.js';
import * as W from './workouts.js';
import { addDays, daysBetween, fmtKm, isoWeekday, parseISODate, roundTo, toISODate } from './format.js';

export const ROLE_LABEL = { quality: 'Qualité', easy: 'Footing', long: 'Sortie longue' };
export const PHASE_LABEL = { base: 'Base', build: 'Développement', taper: 'Affûtage', race: 'Semaine de course' };

const CFG = {
  '10k': { peakKm: 14, peakMin: 85, startFrac: 0.6, maxStep: 2, peakW: 2, easyKm: 6, taper: { 1: 0.6 }, blockFrac: [0.2, 0.3], blockPace: 'threshold', blockLabel: 'seuil' },
  '21k': { peakKm: 22, peakMin: 125, startFrac: 0.55, maxStep: 2.5, peakW: 2, easyKm: 7, taper: { 1: 0.6 }, blockFrac: [0.25, 0.45], blockPace: 'rp', blockLabel: 'semi-marathon' },
  '42k': { peakKm: 32, peakMin: 195, startFrac: 0.5, maxStep: 3, peakW: 3, easyKm: 8, taper: { 2: 0.68, 1: 0.5 }, blockFrac: [0.3, 0.55], blockPace: 'rp', blockLabel: 'marathon' },
};

// Séquences de séances, de la plus douce à la plus exigeante.
const INTERVALS = {
  '10k': (p) => [
    () => W.variables300(p),
    () => W.repsSession(p, { reps: 6, distM: 400, pace: p.interval, restSec: 75 }),
    () => W.repsSession(p, { reps: 5, distM: 600, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 4, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 5, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 6, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 5, distM: 1000, pace: p.interval, restSec: 120 }),
  ],
  '21k': (p) => [
    () => W.variables300(p),
    () => W.repsSession(p, { reps: 5, distM: 600, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 4, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 5, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 4, distM: 1000, pace: p.interval, restSec: 120 }),
    () => W.repsSession(p, { reps: 5, distM: 1000, pace: p.interval, restSec: 120 }),
    () => W.repsSession(p, { reps: 6, distM: 1000, pace: p.interval, restSec: 120 }),
  ],
  '42k': (p) => [
    () => W.repsSession(p, { reps: 5, distM: 800, pace: p.interval, restSec: 90 }),
    () => W.repsSession(p, { reps: 4, distM: 1000, pace: p.interval, restSec: 120 }),
    () => W.repsSession(p, { reps: 5, distM: 1000, pace: p.interval, restSec: 120 }),
    () => W.repsSession(p, { reps: 6, distM: 1000, pace: p.interval, restSec: 120 }),
    () => W.repsSession(p, { reps: 4, distM: 1200, pace: p.interval + 5, restSec: 150 }),
    () => W.repsSession(p, { reps: 4, distM: 1600, pace: p.interval + 10, restSec: 180 }),
  ],
};

const TEMPOS = {
  '10k': (p) => [
    () => W.tempo(p, { title: 'Tempo sur 2 km', segs: [{ km: 2, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo 2-1-1', segs: [{ km: 2, pace: p.threshold, rest: 120 }, { km: 1, pace: p.rp, rest: 90 }, { km: 1, pace: p.rp }] }),
    () => W.tempo(p, { title: 'Tempo sur 3 km', segs: [{ km: 3, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo 2 × 2 km à allure course', segs: [{ km: 2, pace: p.rp, rest: 120 }, { km: 2, pace: p.rp }] }),
    () => W.tempo(p, { title: 'Tempo sur 4 km', segs: [{ km: 4, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo 3-2-1', segs: [{ km: 3, pace: p.threshold, rest: 120 }, { km: 2, pace: p.rp, rest: 90 }, { km: 1, pace: p.rp - 10 }] }),
  ],
  '21k': (p) => [
    () => W.tempo(p, { title: 'Tempo sur 3 km', segs: [{ km: 3, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo 2 × 2 km', segs: [{ km: 2, pace: p.threshold, rest: 120 }, { km: 2, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo sur 4 km à allure semi', segs: [{ km: 4, pace: p.rp }] }),
    () => W.tempo(p, { title: 'Tempo 3-2-1', segs: [{ km: 3, pace: p.rp, rest: 120 }, { km: 2, pace: p.threshold, rest: 90 }, { km: 1, pace: p.threshold - 5 }] }),
    () => W.tempo(p, { title: 'Tempo 2 × 3 km à allure semi', segs: [{ km: 3, pace: p.rp, rest: 150 }, { km: 3, pace: p.rp }] }),
    () => W.tempo(p, { title: 'Tempo sur 6 km à allure semi', segs: [{ km: 6, pace: p.rp }] }),
  ],
  '42k': (p) => [
    () => W.tempo(p, { title: 'Tempo sur 3 km', segs: [{ km: 3, pace: p.threshold }] }),
    () => W.racePaceFartlek(p, p.rp, 'marathon'),
    () => W.tempo(p, { title: 'Tempo sur 5 km à allure marathon', segs: [{ km: 5, pace: p.rp, w: 5 }] }),
    () => W.tempo(p, { title: 'Tempo 2 × 3 km', segs: [{ km: 3, pace: p.threshold, rest: 150 }, { km: 3, pace: p.threshold }] }),
    () => W.tempo(p, { title: 'Tempo sur 6 km à allure marathon', segs: [{ km: 6, pace: p.rp, w: 5 }] }),
    () => W.tempo(p, { title: 'Tempo 3 × 2 km', segs: [{ km: 2, pace: p.rp - 10, rest: 120 }, { km: 2, pace: p.rp - 10, rest: 120 }, { km: 2, pace: p.rp - 10 }] }),
    () => W.tempo(p, { title: 'Tempo sur 8 km à allure marathon', segs: [{ km: 8, pace: p.rp, w: 5 }] }),
  ],
};

const TAPER_TEMPO = {
  '10k': (p) => W.tempo(p, { title: 'Tempo 3 × 1 km à allure course', segs: [{ km: 1, pace: p.rp, rest: 120 }, { km: 1, pace: p.rp, rest: 120 }, { km: 1, pace: p.rp }], cdKm: 1 }),
  '21k': (p) => W.tempo(p, { title: 'Tempo 2 × 2 km à allure semi', segs: [{ km: 2, pace: p.rp, rest: 120 }, { km: 2, pace: p.rp }], cdKm: 1 }),
  '42k': (p) => W.tempo(p, { title: 'Tempo 2 × 2 km à allure marathon', segs: [{ km: 2, pace: p.rp, w: 5, rest: 120 }, { km: 2, pace: p.rp, w: 5 }], cdKm: 1 }),
};

const DOWN_QUALITY = {
  '10k': (p) => W.progressiveRun(p),
  '21k': (p) => W.progressiveRun(p),
  '42k': (p) => W.racePaceFartlek(p, p.rp, 'marathon'),
};

/** Classe chaque semaine : base / build / taper / race, semaine allégée, semaine du pic. */
export function classifyWeeks(N, cfg) {
  const B = N - cfg.peakW; // nombre de semaines de construction (indices 1..B)
  const baseCount = B >= 6 ? Math.round(B * 0.35) : B >= 3 ? 1 : 0;
  const weeks = [];
  for (let i = 1; i <= N; i++) {
    const w = N - i; // semaines avant la course (0 = semaine de course)
    let phase;
    let down = false;
    if (w === 0) phase = 'race';
    else if (i > B) phase = 'taper';
    else {
      phase = i <= baseCount ? 'base' : 'build';
      down = i % 4 === 0 && i < B;
    }
    weeks.push({ index: i, weeksBefore: w, phase, down, peak: i === B && B >= 1 });
  }
  return weeks;
}

/** Distance de la sortie longue par semaine, avec progression plafonnée. */
export function longRunPlan(weeks, cfg, paces) {
  const targetPeakKm = Math.min(cfg.peakKm, roundTo((cfg.peakMin * 60) / paces.easy, 0.5));
  const startKm = roundTo(targetPeakKm * cfg.startFrac, 0.5);
  const build = weeks.filter((w) => w.phase === 'base' || w.phase === 'build');
  const B = build.length;
  const km = {};
  let prevUp = null;
  let capped = false;
  build.forEach((wk, idx) => {
    const t = B > 1 ? idx / (B - 1) : 1;
    let target = startKm + (targetPeakKm - startKm) * t;
    if (prevUp != null && target > prevUp + cfg.maxStep) {
      target = prevUp + cfg.maxStep;
      capped = true;
    }
    const v = roundTo(target, 0.5);
    prevUp = v;
    km[wk.index] = wk.down ? roundTo(v * 0.8, 0.5) : v;
  });
  const peakKm = prevUp ?? targetPeakKm;
  for (const wk of weeks) {
    if (wk.phase === 'taper') km[wk.index] = roundTo(peakKm * (cfg.taper[wk.weeksBefore] ?? 0.6), 0.5);
  }
  return { km, peakKm, targetPeakKm, capped: capped && peakKm < targetPeakKm };
}

function easyKmFor(cfg, wk, paces) {
  let f = 1;
  if (wk.phase === 'build') f = wk.peak ? 1.3 : 1.2;
  if (wk.down) f *= 0.85;
  if (wk.phase === 'taper') f = 0.85;
  if (wk.phase === 'race') f = 0.7;
  const km = roundTo(cfg.easyKm * f, 0.5);
  const maxKm = roundTo(3600 / paces.easy, 0.5); // ≤ 1 h
  return Math.max(3, Math.min(km, maxKm));
}

/** Indice dans une séquence de longueur len pour la k-ième utilisation sur count. */
function seqIndex(k, count, len) {
  return Math.min(len - 1, Math.floor(((k + 0.5) * len) / count));
}

/**
 * @param {object} o
 * @param {string} o.raceDate  'YYYY-MM-DD'
 * @param {'10k'|'21k'|'42k'} o.distKey
 * @param {number} o.targetSeconds
 * @param {{weekday:number, role:'quality'|'easy'|'long'}[]} o.days  weekday : 1 = lundi … 7 = dimanche
 * @param {Date} [o.today]
 */
export function buildPlan({ raceDate, distKey, targetSeconds, days, today = new Date() }) {
  const dist = DISTANCES[distKey];
  if (!dist) throw new Error('Distance inconnue.');
  if (!(targetSeconds > 0)) throw new Error('Renseignez un objectif de temps.');
  const cfg = CFG[distKey];
  if (!raceDate) throw new Error('Choisissez la date de la course.');
  const race = parseISODate(raceDate);
  if (Number.isNaN(race.getTime())) throw new Error('Date de course invalide.');
  const start = addDays(parseISODate(toISODate(today)), 1); // demain
  if (daysBetween(start, race) < 2) throw new Error('La course doit être dans au moins trois jours.');
  if (!days || days.length < 2) throw new Error("Choisissez au moins deux jours d'entraînement.");
  if (days.filter((d) => d.role === 'long').length !== 1) throw new Error('Choisissez exactement un jour de sortie longue.');

  const warnings = [];
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday);
  let q = 0;
  const effDays = sorted.map((d) => (d.role === 'quality' ? { ...d, role: ++q <= 2 ? 'quality' : 'easy' } : { ...d }));
  if (q > 2) warnings.push('Au-delà de deux séances de qualité par semaine, les jours supplémentaires deviennent des footings.');
  if (q === 0) warnings.push('Aucun jour de qualité : le programme ne contient que des footings et des sorties longues.');

  const monday1 = addDays(start, 1 - isoWeekday(start));
  const raceMonday = addDays(race, 1 - isoWeekday(race));
  const N = Math.round(daysBetween(monday1, raceMonday) / 7) + 1;
  if (N < 6) warnings.push(`Programme court (${N} semaine${N > 1 ? 's' : ''}) : l'idéal est de 8 à 16 semaines. Les séances restent prudentes.`);
  if (N > 20) warnings.push(`Programme long (${N} semaines) : la progression est étalée, n'hésitez pas à régénérer le plan en cours de route avec un objectif ajusté.`);

  const paces = trainingPaces(distKey, targetSeconds);
  const weeks = classifyWeeks(N, cfg);
  const lr = longRunPlan(weeks, cfg, paces);
  if (lr.capped) warnings.push(`Progression de la sortie longue limitée à +${cfg.maxStep} km par semaine : pic à ${fmtKm(lr.peakKm)} au lieu de ${fmtKm(lr.targetPeakKm)}. Plus de semaines permettraient d'aller plus loin.`);

  // Passe 1 : type de chaque séance de qualité
  const qDays = effDays.filter((d) => d.role === 'quality').length;
  let altCounter = 0;
  for (const wk of weeks) {
    wk.qualityTypes = [];
    for (let slot = 0; slot < qDays; slot++) {
      let type;
      if (wk.phase === 'race') type = slot === 0 ? 'taperIntervals' : 'easyStrides';
      else if (wk.phase === 'taper') {
        if (slot === 0) type = cfg.peakW === 3 && wk.weeksBefore === 2 ? 'taperReps' : 'taperTempo';
        else type = 'easyStrides';
      } else if (wk.down) type = slot === 0 ? 'downQuality' : 'easy';
      else if (qDays >= 2) type = slot === 0 ? 'intervals' : 'tempo';
      else type = altCounter++ % 2 === 0 ? 'intervals' : 'tempo';
      wk.qualityTypes.push(type);
    }
  }
  const counts = { intervals: 0, tempo: 0 };
  for (const wk of weeks) for (const t of wk.qualityTypes) if (t in counts) counts[t]++;
  const used = { intervals: 0, tempo: 0 };
  const seqs = { intervals: INTERVALS[distKey](paces), tempo: TEMPOS[distKey](paces) };

  const buildWeeks = weeks.filter((w) => w.phase === 'build' && !w.down);
  let buildLongCounter = 0;

  const makeQuality = (wk, type, easyKm) => {
    switch (type) {
      case 'intervals':
      case 'tempo': {
        const seq = seqs[type];
        return seq[seqIndex(used[type]++, counts[type], seq.length)]();
      }
      case 'downQuality':
        return DOWN_QUALITY[distKey](paces);
      case 'taperTempo':
        return TAPER_TEMPO[distKey](paces);
      case 'taperReps':
        return W.repsSession(paces, { reps: 5, distM: 800, pace: paces.interval, restSec: 90 });
      case 'taperIntervals':
        return W.taperIntervals(paces, distKey);
      case 'easyStrides':
        return W.easyRun(paces, easyKm, { strides: 4 });
      default:
        return W.easyRun(paces, easyKm);
    }
  };

  const makeLong = (wk) => {
    const km = lr.km[wk.index];
    if (!km) return null;
    const blockPace = paces[cfg.blockPace];
    const blockCue = cfg.blockPace === 'threshold' ? 'Allure seuil' : 'Allure course';
    if (wk.phase === 'taper') {
      if (cfg.peakW === 3 && wk.weeksBefore === 2) {
        return W.longRaceBlock(paces, km, Math.max(2, roundTo(km * cfg.blockFrac[0], 0.5)), blockPace, cfg.blockLabel, blockCue);
      }
      return W.longEasy(paces, km);
    }
    if (wk.phase === 'base' || wk.down) return W.longEasy(paces, km);
    const idx = buildWeeks.indexOf(wk);
    const t = buildWeeks.length > 1 ? idx / (buildWeeks.length - 1) : 1;
    const useBlock = wk.peak || buildLongCounter++ % 2 === 1;
    if (useBlock) {
      const frac = cfg.blockFrac[0] + (cfg.blockFrac[1] - cfg.blockFrac[0]) * t;
      return W.longRaceBlock(paces, km, Math.max(2, roundTo(km * frac, 0.5)), blockPace, cfg.blockLabel, blockCue);
    }
    return W.longProgressive(paces, km);
  };

  // Passe 2 : calendrier
  const outWeeks = [];
  for (const wk of weeks) {
    const monday = addDays(monday1, (wk.index - 1) * 7);
    const sessions = [];
    let slot = 0;
    const easyKm = easyKmFor(cfg, wk, paces);
    for (const d of effDays) {
      const date = addDays(monday, d.weekday - 1);
      if (date < start) continue; // déjà passé
      if (date >= race) continue; // le jour de la course ou après
      if (daysBetween(date, race) === 1) continue; // repos la veille
      let workout = null;
      if (d.role === 'long') {
        if (wk.phase === 'race') continue; // la course remplace la sortie longue
        workout = makeLong(wk);
      } else if (d.role === 'quality') {
        workout = makeQuality(wk, wk.qualityTypes[slot++], easyKm);
      } else {
        workout = W.easyRun(paces, easyKm, { strides: wk.phase === 'taper' || wk.phase === 'race' ? 4 : 0 });
      }
      if (!workout) continue;
      sessions.push({
        date,
        iso: toISODate(date),
        weekday: d.weekday,
        role: d.role,
        workout,
        externalId: `cph-${raceDate}-${distKey}-s${wk.index}-${d.role}${d.weekday}`,
      });
    }
    if (wk.phase === 'race') {
      sessions.push({
        date: race,
        iso: raceDate,
        weekday: isoWeekday(race),
        role: 'race',
        workout: W.raceWorkout(paces, dist, targetSeconds),
        externalId: `cph-${raceDate}-${distKey}-race`,
      });
    }
    const km = sessions.reduce((a, s) => a + s.workout.km, 0);
    const seconds = sessions.reduce((a, s) => a + s.workout.seconds, 0);
    outWeeks.push({
      index: wk.index,
      weeksBefore: wk.weeksBefore,
      phase: wk.phase,
      phaseLabel: wk.down ? 'Récupération' : PHASE_LABEL[wk.phase],
      down: wk.down,
      peak: wk.peak,
      monday,
      sunday: addDays(monday, 6),
      longKm: lr.km[wk.index] ?? null,
      sessions,
      km: Math.round(km * 10) / 10,
      seconds,
    });
  }

  const all = outWeeks.flatMap((w) => w.sessions);
  const training = all.filter((s) => s.role !== 'race');
  return {
    distKey,
    dist,
    raceDate,
    race,
    targetSeconds,
    paces,
    weeks: outWeeks,
    weekCount: N,
    sessionCount: training.length,
    totalKm: Math.round(training.reduce((a, s) => a + s.workout.km, 0) * 10) / 10,
    peakLongKm: lr.peakKm,
    rangeStart: toISODate(start),
    rangeEnd: raceDate,
    warnings,
    days: effDays,
  };
}
