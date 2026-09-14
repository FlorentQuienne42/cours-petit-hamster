// Allures d'entraînement dérivées de l'objectif via la formule VDOT de Jack Daniels
// (Daniels' Running Formula). Toutes les allures sont en secondes par km.
import { roundTo } from './format.js';

export const DISTANCES = {
  '10k': { key: '10k', label: '10 km', meters: 10000, raceLabel: '10 km' },
  '21k': { key: '21k', label: 'Semi-marathon', meters: 21097.5, raceLabel: 'semi-marathon' },
  '42k': { key: '42k', label: 'Marathon', meters: 42195, raceLabel: 'marathon' },
};

/** VDOT à partir d'une performance (distance en mètres, temps en secondes). */
export function vdotFromRace(meters, seconds) {
  const t = seconds / 60; // minutes
  const v = meters / t; // m/min
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}

/** Vitesse (m/min) correspondant à un pourcentage du VDOT. */
export function speedAtPct(vdot, pct) {
  const vo2 = vdot * pct;
  return (-0.182258 + Math.sqrt(0.182258 ** 2 - 4 * 0.000104 * (-4.6 - vo2))) / (2 * 0.000104);
}

/** Allure (s/km) correspondant à un pourcentage du VDOT. */
export function paceAtPct(vdot, pct) {
  return 60000 / speedAtPct(vdot, pct);
}

/** Temps prédit (s) sur une autre distance pour un VDOT donné (dichotomie). */
export function predictTime(vdot, meters) {
  let lo = 120;
  let hi = 10 * 3600;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(meters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Allures d'entraînement pour une course cible. Arrondies à 5 s, sauf rpExact.
 *  - easySlow/easy/easyFast : footing (64 %, 70 %, 76 % du VDOT) ; easyFast = "pas plus vite que"
 *  - marathon / half / tenK / fiveK : allures de course équivalentes
 *  - threshold : allure seuil (~88 %), interval : allure VMA/5 km (~98,5 %), rep : lignes droites (~107 %)
 *  - rp : allure de la course cible
 */
export function trainingPaces(distKey, targetSeconds) {
  const dist = DISTANCES[distKey];
  if (!dist) throw new Error(`Distance inconnue : ${distKey}`);
  const vdot = vdotFromRace(dist.meters, targetSeconds);
  const rp = targetSeconds / (dist.meters / 1000);
  const r5 = (p) => roundTo(p, 5);
  const eq = (m) => predictTime(vdot, m) / (m / 1000);
  return {
    vdot,
    rpExact: rp,
    rp: r5(rp),
    easySlow: r5(paceAtPct(vdot, 0.64)),
    easy: r5(paceAtPct(vdot, 0.7)),
    easyFast: r5(paceAtPct(vdot, 0.76)),
    marathon: r5(distKey === '42k' ? rp : eq(42195)),
    half: r5(distKey === '21k' ? rp : eq(21097.5)),
    tenK: r5(distKey === '10k' ? rp : eq(10000)),
    fiveK: r5(eq(5000)),
    threshold: r5(paceAtPct(vdot, 0.88)),
    interval: r5(paceAtPct(vdot, 0.985)),
    rep: r5(paceAtPct(vdot, 1.07)),
  };
}
