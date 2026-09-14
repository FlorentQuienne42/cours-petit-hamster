// Contrôleur de la page : formulaire → programme → export.
import { buildPlan, ROLE_LABEL } from './plan.js';
import { DISTANCES } from './paces.js';
import { addDays, fmtDateFr, fmtPace, fmtTime, isoWeekday, toISODate } from './format.js';
import { h, renderPlan } from './render.js';
import { CALENDAR_URL, deletePlanEvents, exportPlan, makeClient, planToEvents } from './intervals.js';

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'cph-settings-v1';
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Valeurs du fichier .env (exposées par Vite grâce à envPrefix: 'INTERVALS_')
const viteEnv = import.meta.env || {};
const env = {
  apiKey: viteEnv.INTERVALS_API_KEY || '',
  athleteId: viteEnv.INTERVALS_ATHLETE_ID || '',
};

let state = loadSettings() || defaultSettings();
let plan = null;

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------
function defaultSettings() {
  // par défaut : un dimanche dans au moins 10 semaines
  let d = addDays(new Date(), 70);
  d = addDays(d, (7 - isoWeekday(d)) % 7);
  return {
    raceDate: toISODate(d),
    distKey: '10k',
    h: 0,
    m: 55,
    days: [
      { weekday: 2, role: 'quality' },
      { weekday: 5, role: 'easy' },
      { weekday: 7, role: 'long' },
    ],
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.days) || !DISTANCES[s.distKey]) return null;
    return s;
  } catch {
    return null;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : pas grave */
  }
}

function targetSeconds() {
  return (Number(state.h) || 0) * 3600 + (Number(state.m) || 0) * 60;
}

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------
function renderForm() {
  $('#raceDate').value = state.raceDate;
  $('#raceDate').min = toISODate(addDays(new Date(), 3));
  for (const r of document.querySelectorAll('input[name="distKey"]')) r.checked = r.value === state.distKey;
  $('#h').value = state.h;
  $('#m').value = state.m;
  renderDays();
  renderTargetPace();
}

function renderTargetPace() {
  const sec = targetSeconds();
  const dist = DISTANCES[state.distKey];
  $('#target-pace').textContent = sec > 0 ? `${fmtTime(sec)} sur ${dist.label} → ${fmtPace(sec / (dist.meters / 1000))}/km` : '';
}

function renderDays() {
  const daysEl = $('#days');
  daysEl.replaceChildren(
    ...DAY_NAMES.map((name, i) => {
      const weekday = i + 1;
      const active = state.days.some((d) => d.weekday === weekday);
      return h('button', {
        type: 'button',
        class: `day${active ? ' active' : ''}`,
        'aria-pressed': String(active),
        text: name,
        onClick: () => toggleDay(weekday),
      });
    }),
  );
  const rolesEl = $('#roles');
  const sorted = [...state.days].sort((a, b) => a.weekday - b.weekday);
  rolesEl.replaceChildren(
    ...sorted.map((d) =>
      h(
        'label',
        { class: 'role' },
        h('b', { text: DAY_NAMES[d.weekday - 1] }),
        h(
          'select',
          {
            onChange: (e) => {
              d.role = e.target.value;
              saveSettings();
            },
          },
          ...Object.entries(ROLE_LABEL).map(([value, label]) => h('option', { value, selected: d.role === value, text: label })),
        ),
      ),
    ),
  );
}

function toggleDay(weekday) {
  const idx = state.days.findIndex((d) => d.weekday === weekday);
  if (idx >= 0) {
    const [removed] = state.days.splice(idx, 1);
    if (removed.role === 'long' && state.days.length && !state.days.some((d) => d.role === 'long')) {
      // la sortie longue passe au dernier jour restant de la semaine
      const last = [...state.days].sort((a, b) => a.weekday - b.weekday).at(-1);
      last.role = 'long';
    }
  } else {
    let role = 'easy';
    if (!state.days.some((d) => d.role === 'long')) role = 'long';
    else if (!state.days.some((d) => d.role === 'quality')) role = 'quality';
    state.days.push({ weekday, role });
  }
  saveSettings();
  renderDays();
}

function readForm() {
  state.raceDate = $('#raceDate').value;
  state.distKey = document.querySelector('input[name="distKey"]:checked')?.value || state.distKey;
  state.h = Number($('#h').value) || 0;
  state.m = Number($('#m').value) || 0;
  saveSettings();
}

function showFormError(msg) {
  const el = $('#form-error');
  el.textContent = msg || '';
  el.hidden = !msg;
}

function generate() {
  readForm();
  try {
    plan = buildPlan({
      raceDate: state.raceDate,
      distKey: state.distKey,
      targetSeconds: targetSeconds(),
      days: state.days.map((d) => ({ ...d })),
    });
  } catch (e) {
    plan = null;
    showFormError(e.message);
    $('#plan-card').hidden = true;
    $('#export-card').hidden = true;
    return;
  }
  showFormError('');
  $('#plan-out').replaceChildren(renderPlan(plan));
  $('#plan-card').hidden = false;
  $('#export-card').hidden = false;
  hideConfirm();
  setStatus('');
  $('#plan-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function credentials() {
  return { apiKey: $('#apiKey').value, athleteId: $('#athleteId').value };
}

function setStatus(msg, cls = '') {
  const el = $('#export-status');
  el.className = `status${cls ? ` ${cls}` : ''}`;
  el.replaceChildren();
  if (typeof msg === 'string') el.textContent = msg;
  else if (msg) el.append(msg);
  el.hidden = !msg;
}

function setBusy(busy) {
  for (const id of ['#test-btn', '#export-btn', '#confirm-btn', '#cancel-btn', '#delete-btn']) $(id).disabled = busy;
}

let pendingAction = null;

function askConfirm(text, label, action) {
  pendingAction = action;
  $('#confirm-text').textContent = text;
  $('#confirm-btn').textContent = label;
  $('#confirm-box').hidden = false;
  $('#confirm-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideConfirm() {
  pendingAction = null;
  $('#confirm-box').hidden = true;
}

async function runWithStatus(fn) {
  setBusy(true);
  try {
    await fn((msg) => setStatus(msg, 'busy'));
  } catch (e) {
    setStatus(`❌ ${e.message}`, 'err');
  } finally {
    setBusy(false);
  }
}

function testConnection() {
  runWithStatus(async (progress) => {
    progress('Connexion à intervals.icu…');
    const client = makeClient(credentials());
    const a = await client.athlete();
    const name = a?.name || [a?.firstname, a?.lastname].filter(Boolean).join(' ') || 'athlète';
    setStatus(`✅ Connecté : ${name} (${a?.id || client.athleteId})`, 'ok');
  });
}

function askExport() {
  if (!plan) return;
  let client;
  try {
    client = makeClient(credentials());
  } catch (e) {
    setStatus(`❌ ${e.message}`, 'err');
    return;
  }
  const events = planToEvents(plan);
  const replace = $('#replace').checked;
  const text =
    `Vous allez créer ${events.length - 1} séances et 1 course (${plan.dist.label}, objectif ${fmtTime(plan.targetSeconds)}) ` +
    `dans le calendrier intervals.icu de l'athlète ${client.athleteId}, du ${fmtDateFr(new Date(plan.rangeStart + 'T12:00:00'))} au ${fmtDateFr(plan.race)}.` +
    (replace ? ' Les séances déjà exportées par cette application sur cette période seront remplacées.' : '');
  askConfirm(text, `Confirmer l'export`, () =>
    runWithStatus(async (progress) => {
      const res = await exportPlan(client, plan, { replace, onProgress: progress });
      setStatus(
        h(
          'span',
          {},
          `✅ ${res.created} événements créés ou mis à jour` + (res.deleted ? ` (${res.deleted} anciens supprimés)` : '') + '. ',
          h('a', { href: CALENDAR_URL, target: '_blank', rel: 'noopener', text: 'Ouvrir le calendrier intervals.icu ↗' }),
        ),
        'ok',
      );
    }),
  );
}

function askDelete() {
  if (!plan) return;
  let client;
  try {
    client = makeClient(credentials());
  } catch (e) {
    setStatus(`❌ ${e.message}`, 'err');
    return;
  }
  askConfirm(
    `Supprimer d'intervals.icu toutes les séances créées par cette application entre le ${fmtDateFr(new Date(plan.rangeStart + 'T12:00:00'))} et le ${fmtDateFr(plan.race)} (athlète ${client.athleteId}) ?`,
    'Confirmer la suppression',
    () =>
      runWithStatus(async (progress) => {
        const res = await deletePlanEvents(client, plan, { onProgress: progress });
        setStatus(res.deleted ? `🗑️ ${res.deleted} séance(s) supprimée(s).` : 'Aucune séance de cette application sur la période.', 'ok');
      }),
  );
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
function init() {
  renderForm();

  $('#plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    generate();
  });
  for (const id of ['#h', '#m']) $(id).addEventListener('input', () => { readForm(); renderTargetPace(); });
  for (const r of document.querySelectorAll('input[name="distKey"]')) r.addEventListener('change', () => { readForm(); renderTargetPace(); });
  $('#raceDate').addEventListener('change', readForm);

  $('#apiKey').value = env.apiKey;
  $('#athleteId').value = env.athleteId;
  $('#env-status').textContent =
    env.apiKey && env.athleteId
      ? 'Clé et identifiant chargés depuis le fichier .env ✓'
      : 'Renseigne INTERVALS_API_KEY et INTERVALS_ATHLETE_ID dans le fichier .env (Vite recharge la page tout seul), ou saisis les valeurs ici.';

  $('#test-btn').addEventListener('click', testConnection);
  $('#export-btn').addEventListener('click', askExport);
  $('#delete-btn').addEventListener('click', askDelete);
  $('#confirm-btn').addEventListener('click', () => {
    const action = pendingAction;
    hideConfirm();
    if (action) action();
  });
  $('#cancel-btn').addEventListener('click', hideConfirm);
}

init();
