// Rendu DOM du programme (sans framework).
import { saveFile } from './download.js';
import { FIT_MIME, fitFileName, sessionToFit } from './fit.js';
import { fmtDateFr, fmtDuration, fmtKm, fmtPace, fmtTime } from './format.js';
import { KIND_LABEL, toIntervalsText } from './workouts.js';

/** Mini helper de création d'éléments : h('div', { class: 'x', text: '…' }, enfants…) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const stat = (value, label) => h('div', { class: 'stat' }, h('b', { text: value }), h('span', { text: label }));
const chip = (label, value, cls) => h('span', { class: `chip${cls ? ` ${cls}` : ''}` }, `${label} `, h('b', { text: value }));

function paceChips(plan) {
  const p = plan.paces;
  const chips = [
    chip('Allure course', `${fmtPace(p.rp)}/km`, 'rp'),
    chip('Footing', `${fmtPace(p.easySlow)}-${fmtPace(p.easyFast)}/km`),
  ];
  if (plan.distKey !== '42k') chips.push(chip('Marathon', `${fmtPace(p.marathon)}/km`));
  if (plan.distKey !== '21k') chips.push(chip('Semi', `${fmtPace(p.half)}/km`));
  if (plan.distKey !== '10k') chips.push(chip('10 km', `${fmtPace(p.tenK)}/km`));
  chips.push(chip('Seuil', `${fmtPace(p.threshold)}/km`), chip('Intervalles', `${fmtPace(p.interval)}/km`), chip('VDOT', p.vdot.toFixed(1)));
  return chips;
}

function renderSession(s, plan) {
  const w = s.workout;
  const meta = w.kind === 'race' ? `${fmtKm(w.km)} · objectif ${fmtTime(w.seconds)}` : `${fmtKm(w.km)} · ~${fmtDuration(w.seconds)}`;
  return h(
    'li',
    { class: `session kind-${w.kind}` },
    h(
      'div',
      { class: 'when' },
      h('span', { class: 'dow', text: fmtDateFr(s.date, { weekday: 'short' }) }),
      h('span', { class: 'dom', text: fmtDateFr(s.date, { day: 'numeric', month: 'short' }) }),
    ),
    h(
      'div',
      { class: 'body' },
      h(
        'div',
        { class: 'title-row' },
        h('span', { class: `badge kind-${w.kind}`, text: KIND_LABEL[w.kind] }),
        h('strong', { text: w.title }),
        h('span', { class: 'meta', text: meta }),
      ),
      h('p', { class: 'desc', text: w.notes }),
      w.blocks.length
        ? h('details', {}, h('summary', { text: 'Séance structurée (format intervals.icu)' }), h('pre', { text: toIntervalsText(w) }))
        : null,
      h(
        'div',
        { class: 'session-actions' },
        h('button', {
          type: 'button',
          class: 'mini',
          text: '⌚ Fichier .fit',
          title: 'Télécharger cette séance au format FIT (montre Garmin, Coros…)',
          onClick: () => saveFile(fitFileName(s), sessionToFit(s, plan), FIT_MIME),
        }),
      ),
    ),
  );
}

function renderWeek(wk, plan) {
  const range = `${fmtDateFr(wk.monday, { day: 'numeric', month: 'short' })} – ${fmtDateFr(wk.sunday, { day: 'numeric', month: 'short' })}`;
  return h(
    'article',
    { class: `week phase-${wk.phase}${wk.down ? ' down' : ''}` },
    h(
      'header',
      {},
      h('h3', {}, `Semaine ${wk.index}`, h('span', { class: 'range', text: range })),
      h(
        'div',
        { class: 'week-meta' },
        h('span', { class: `phase phase-${wk.phase}`, text: wk.phaseLabel }),
        wk.peak ? h('span', { class: 'phase peak', text: 'Pic de volume' }) : null,
        wk.sessions.length ? h('span', { class: 'total', text: `${fmtKm(wk.km)} · ${fmtDuration(wk.seconds)}` }) : null,
      ),
    ),
    wk.sessions.length
      ? h('ul', { class: 'sessions' }, ...wk.sessions.map((s) => renderSession(s, plan)))
      : h('p', { class: 'hint', style: 'padding: 0 1rem 0.9rem' }, 'Aucune séance : les jours choisis sont déjà passés.'),
  );
}

export function renderPlan(plan) {
  const frag = document.createDocumentFragment();
  frag.append(
    h(
      'div',
      { class: 'summary' },
      h(
        'div',
        { class: 'stats' },
        stat(String(plan.weekCount), plan.weekCount > 1 ? 'semaines' : 'semaine'),
        stat(String(plan.sessionCount), 'séances'),
        stat(fmtKm(plan.totalKm), 'au total'),
        stat(fmtKm(plan.peakLongKm), 'sortie longue max'),
      ),
      h('div', { class: 'paces' }, ...paceChips(plan)),
    ),
  );
  if (plan.warnings.length) frag.append(h('ul', { class: 'warnings' }, ...plan.warnings.map((w) => h('li', { text: w }))));
  frag.append(h('div', { class: 'weeks' }, ...plan.weeks.map((wk) => renderWeek(wk, plan))));
  return frag;
}
