// Modèles de séances (inspirés des plans Runna que tu aimes) et conversion vers
// le format texte de séances structurées d'intervals.icu.
//
// Une séance = { kind, title, blocks, notes, km, seconds }
//   blocks : [{ header, repeat?, steps: [step] }]
//   step   : { cue, km? | sec?, pace?: [lente, rapide] (s/km), rest?: true }
import { fmtPace, fmtDist, fmtKm, fmtTime, roundTo } from './format.js';

const WALK_PACE = 12 * 60; // s/km : estimation de la distance parcourue en marchant

export const KIND_LABEL = {
  easy: 'Footing',
  long: 'Sortie longue',
  tempo: 'Tempo',
  intervals: 'Intervalles',
  race: 'Course',
};

const E = (p) => [p.easySlow, p.easyFast];
/** Fourchette [lente, rapide] autour d'une allure cible, arrondie à 5 s. */
const tgt = (pace, w = 10) => [roundTo(pace + w, 5), roundTo(pace - w, 5)];
const mid = (range) => (range[0] + range[1]) / 2;

const run = (cue, km, pace) => ({ cue, km, pace });
const runTime = (cue, sec, pace) => ({ cue, sec, pace });
const rest = (cue, sec) => ({ cue, sec, rest: true });

export function stepKm(s) {
  if (s.km != null) return s.km;
  if (s.rest || !s.pace) return s.sec / WALK_PACE;
  return s.sec / mid(s.pace);
}

export function stepSec(s) {
  if (s.sec != null) return s.sec;
  return s.km * mid(s.pace);
}

function build({ kind, title, blocks, notes }) {
  let km = 0;
  let sec = 0;
  for (const b of blocks) {
    const n = b.repeat || 1;
    for (const s of b.steps) {
      km += n * stepKm(s);
      sec += n * stepSec(s);
    }
  }
  return { kind, title, blocks, notes, km: Math.round(km * 10) / 10, seconds: Math.round(sec) };
}

/** "5:05/km (5:15-4:55/km)" */
function paceStr(pace, w = 10) {
  const [slow, fast] = tgt(pace, w);
  return `${fmtPace(roundTo(pace, 5))}/km (${fmtPace(slow)}-${fmtPace(fast)}/km)`;
}

const wu = (p, km) => ({ header: 'Échauffement', steps: [run('Échauffement', km, E(p))] });
const cd = (p, km) => ({ header: 'Retour au calme', steps: [run('Retour au calme', km, E(p))] });

const easyLimit = (p) =>
  `à une allure conversationnelle (pas plus vite que ${fmtPace(p.easyFast)}/km. C'est une limite, pas un objectif : courez à une allure qui vous semble vraiment facile !)`;
const wuText = (p, km) =>
  `${fmtKm(km)} d'échauffement à une allure conversationnelle (pas plus rapide que ${fmtPace(p.easyFast)}/km)`;
const cdText = (km) => `${fmtKm(km)} de retour au calme à une allure conversationnelle (ou plus lentement !)`;

// ---------------------------------------------------------------------------
// Footing
// ---------------------------------------------------------------------------
export function easyRun(p, km, { strides = 0 } = {}) {
  const blocks = [{ header: 'Footing facile', steps: [run('Footing facile', km, E(p))] }];
  let title = `Course facile de ${fmtKm(km)}`;
  let notes = `${fmtKm(km)} de course facile ${easyLimit(p)}`;
  if (strides) {
    blocks.push({
      header: 'Lignes droites',
      repeat: strides,
      steps: [runTime('Ligne droite', 20, tgt(p.rep, 10)), rest('Récup marche', 60)],
    });
    title += ` + ${strides} lignes droites`;
    notes += `\n\nTerminez par ${strides} lignes droites : 20 s d'accélération progressive jusqu'à une allure rapide mais relâchée (environ ${fmtPace(p.rep)}/km), avec 1 min de marche entre chaque. Ce n'est pas un sprint : on réveille les jambes, on ne les fatigue pas.`;
  }
  return build({ kind: 'easy', title, blocks, notes });
}

// ---------------------------------------------------------------------------
// Sorties longues
// ---------------------------------------------------------------------------
export function longEasy(p, km) {
  return build({
    kind: 'long',
    title: `Sortie longue de ${fmtKm(km)}`,
    blocks: [{ header: 'Sortie longue', steps: [run('Allure conversationnelle', km, E(p))] }],
    notes: `${fmtKm(km)} à une allure conversationnelle (${fmtPace(p.easySlow)}-${fmtPace(p.easyFast)}/km).\n\nL'objectif est le temps passé à courir, pas la vitesse : restez relâché, pensez à boire et gardez de l'énergie pour la fin.`,
  });
}

export function longProgressive(p, km) {
  if (km < 6) return longEasy(p, km);
  const paces = [p.marathon + 15, p.marathon, p.threshold + 5].map((x) => roundTo(x, 5));
  const easyKm = roundTo(km * 0.4, 0.5);
  const remaining = km - easyKm;
  const seg = Math.max(0.5, roundTo(remaining / 3, 0.5));
  const segs = [seg, seg, Math.max(0.5, Math.round((remaining - 2 * seg) * 2) / 2)];
  const steps = [
    run('Allure conversationnelle', easyKm, E(p)),
    ...segs.map((k, i) => run('Progressif', k, tgt(paces[i], 5))),
  ];
  const notes =
    [`${fmtKm(easyKm)} à une allure conversationnelle`, ...segs.map((k, i) => `${fmtKm(k)} : ${fmtPace(paces[i])}/km`)].join('\n') +
    `\n\nAccélérez progressivement : chaque bloc est un peu plus rapide que le précédent, le dernier se court à une allure soutenue mais contrôlée.`;
  return build({
    kind: 'long',
    title: `Sortie longue progressive de ${fmtKm(km)}`,
    blocks: [{ header: 'Sortie longue progressive', steps }],
    notes,
  });
}

export function longRaceBlock(p, km, blockKm, pace, paceLabel, cue = 'Allure course') {
  if (km - blockKm < 2) return longEasy(p, km);
  const pre = roundTo((km - blockKm) * 0.55, 0.5);
  const post = Math.round((km - blockKm - pre) * 2) / 2;
  const steps = [run('Allure conversationnelle', pre, E(p)), run(cue, blockKm, tgt(pace, 5))];
  if (post > 0) steps.push(run('Allure conversationnelle', post, E(p)));
  let notes = `${fmtKm(pre)} à une allure conversationnelle\n${fmtKm(blockKm)} : ${fmtPace(roundTo(pace, 5))}/km (votre allure cible : ${paceLabel})`;
  if (post > 0) notes += `\n${fmtKm(post)} à une allure conversationnelle`;
  notes += `\n\nLe bloc à allure cible se court sur des jambes déjà un peu fatiguées : c'est exactement ce que la course vous demandera.`;
  return build({
    kind: 'long',
    title: `Sortie longue d'entraînement à la course de ${fmtKm(km)}`,
    blocks: [{ header: 'Sortie longue', steps }],
    notes,
  });
}

// ---------------------------------------------------------------------------
// Intervalles
// ---------------------------------------------------------------------------
export function repsSession(p, { reps, distM, pace, restSec, wuKm = 1.5, cdKm = 1, title }) {
  const distKm = distM / 1000;
  const blocks = [
    wu(p, wuKm),
    { header: 'Série', repeat: reps, steps: [run('Rapide', distKm, tgt(pace, 10)), rest('Récup marche', restSec)] },
    cd(p, cdKm),
  ];
  const notes = `${wuText(p, wuKm)}\n\n${reps} répétitions de :\n• ${fmtDist(distKm)} : ${paceStr(pace)}, marche de repos de ${restSec} s\n\n${cdText(cdKm)}`;
  return build({ kind: 'intervals', title: title || `Répétitions de ${fmtDist(distKm)}`, blocks, notes });
}

export function variables300(p) {
  const blocks = [
    wu(p, 1.2),
    {
      header: 'Variables',
      repeat: 4,
      steps: [run('Rapide', 0.3, tgt(p.interval, 10)), run('Modéré', 0.3, tgt(p.threshold, 10))],
    },
    { header: 'Récupération', steps: [rest('Récup marche', 90)] },
    cd(p, 1.4),
  ];
  const notes = `${wuText(p, 1.2)}\n\nRépétez 4 x :\n• 300 m : ${fmtPace(p.interval)}/km\n• 300 m : ${fmtPace(p.threshold)}/km\n\nMarche de repos de 90 s\n\n${cdText(1.4)}`;
  return build({ kind: 'intervals', title: '300 m variables', blocks, notes });
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------
/** segs : [{ km, pace, rest?, w? }] ; la récupération suit le segment (sauf le dernier). */
export function tempo(p, { title, segs, wuKm = 1.5, cdKm = 1.5 }) {
  const steps = [];
  segs.forEach((s, i) => {
    steps.push(run(s.cue || 'Tempo', s.km, tgt(s.pace, s.w ?? 10)));
    if (s.rest && i < segs.length - 1) steps.push(rest('Récup marche', s.rest));
  });
  const lines = segs.map(
    (s, i) =>
      `${fmtKm(s.km)} : ${paceStr(s.pace, s.w ?? 10)}` + (s.rest && i < segs.length - 1 ? `, marche de repos de ${s.rest} s` : ''),
  );
  const notes = `${wuText(p, wuKm)}\n\n${lines.join('\n')}\n\n${cdText(cdKm)}`;
  return build({ kind: 'tempo', title, blocks: [wu(p, wuKm), { header: 'Tempo', steps }, cd(p, cdKm)], notes });
}

export function progressiveRun(p) {
  const midPace = roundTo((p.marathon + p.threshold) / 2, 5);
  const segs = [
    [1, p.marathon],
    [2, midPace],
    [1, p.threshold],
    [1, p.tenK],
  ];
  const steps = segs.map(([km, pace]) => run('Progressif', km, tgt(pace, 5)));
  steps.push(rest('Récup marche', 90));
  const notes =
    `${wuText(p, 1)}\n\n` +
    segs.map(([km, pace]) => `${fmtKm(km)} : ${fmtPace(pace)}/km`).join('\n') +
    `, marche de repos de 90 s\n\n500 m de retour au calme à une allure conversationnelle, ou plus lentement ! Comme l'intensité a été élevée avec un retour au calme court, marchez 5 à 10 minutes pour terminer la séance.`;
  return build({
    kind: 'tempo',
    title: 'Course progressive',
    blocks: [wu(p, 1), { header: 'Progressif', steps }, cd(p, 0.5)],
    notes,
  });
}

export function racePaceFartlek(p, pace, paceLabel) {
  const steps = [run('Allure course', 1, tgt(pace, 5)), run('Récup trot', 0.5, E(p)), run('Allure course', 2, tgt(pace, 5))];
  const notes = `${wuText(p, 1)}, restez dans votre zone de confort\n\n1 km : ${fmtPace(roundTo(pace, 5))}/km, votre allure cible : ${paceLabel}\n\n500 m à une allure conversationnelle, gardez une allure très tranquille pour récupérer avant l'intervalle suivant\n\n2 km : ${fmtPace(roundTo(pace, 5))}/km\n\n500 m de retour au calme à une allure conversationnelle, ou plus lentement !`;
  return build({
    kind: 'tempo',
    title: 'Fartlek à allure de course',
    blocks: [wu(p, 1), { header: 'Fartlek', steps }, cd(p, 0.5)],
    notes,
  });
}

export function taperIntervals(p, distKey) {
  const cfg = { '10k': { reps: 5, distM: 400 }, '21k': { reps: 4, distM: 500 }, '42k': { reps: 3, distM: 1000 } }[distKey];
  const w = repsSession(p, { ...cfg, pace: p.rp, restSec: 90, wuKm: 1.5, cdKm: 1, title: "Intervalles d'affûtage" });
  w.notes += `\n\nSéance courte pour garder du rythme sans se fatiguer : les répétitions se courent à l'allure de course, pas plus vite.`;
  return w;
}

// ---------------------------------------------------------------------------
// Jour J
// ---------------------------------------------------------------------------
export function raceWorkout(p, dist, targetSeconds) {
  return {
    kind: 'race',
    title: `Course : ${dist.label}`,
    blocks: [],
    km: dist.meters / 1000,
    seconds: targetSeconds,
    notes: `Objectif : ${fmtTime(targetSeconds)} (${fmtPace(p.rpExact)}/km).\n\nPartez prudemment (les premiers kilomètres à l'allure cible, pas plus vite), restez régulier et gardez des forces pour finir fort. Bonne course !`,
  };
}

// ---------------------------------------------------------------------------
// Format texte intervals.icu, par exemple :
//   Échauffement
//   - Échauffement 1.5km 7:10-6:15/km Pace
//
//   Série 4x
//   - Rapide 800mtr 5:15-4:55/km Pace
//   - Récup marche 90s
// ---------------------------------------------------------------------------
function icuDuration(s) {
  if (s.km != null) return s.km < 1 ? `${Math.round(s.km * 1000)}mtr` : `${+s.km.toFixed(2)}km`;
  const sec = Math.round(s.sec);
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`;
}

function icuStep(s) {
  const target = s.rest || !s.pace ? '' : ` ${fmtPace(s.pace[0])}-${fmtPace(s.pace[1])}/km Pace`;
  return `- ${s.cue} ${icuDuration(s)}${target}`;
}

export function toIntervalsText(w) {
  const out = [];
  for (const b of w.blocks) {
    out.push(b.repeat ? `${b.header} ${b.repeat}x` : b.header);
    for (const s of b.steps) out.push(icuStep(s));
    out.push('');
  }
  return out.join('\n').trim();
}
