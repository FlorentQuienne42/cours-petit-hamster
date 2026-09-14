// Client minimal de l'API intervals.icu (appelé directement depuis le navigateur :
// l'API autorise les requêtes cross-origin). Authentification HTTP Basic,
// utilisateur "API_KEY", mot de passe = la clé.
import { fmtKm, fmtTime } from './format.js';
import { toIntervalsText } from './workouts.js';

const BASE = 'https://intervals.icu/api/v1';
export const ID_PREFIX = 'cph-';
export const CALENDAR_URL = 'https://intervals.icu/calendar';

export function makeClient({ apiKey, athleteId }) {
  const key = (apiKey || '').trim();
  if (!key) throw new Error('Clé API manquante (INTERVALS_API_KEY).');
  const id = (athleteId || '').trim() || '0';
  const headers = {
    Authorization: `Basic ${btoa(`API_KEY:${key}`)}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(`${BASE}/athlete/${encodeURIComponent(id)}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`Impossible de joindre intervals.icu (${e.message}).`);
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = j.error || j.message || text;
      } catch {
        /* texte brut */
      }
      if (res.status === 401 || res.status === 403) {
        msg = `authentification refusée (${res.status}). Vérifiez INTERVALS_API_KEY et INTERVALS_ATHLETE_ID.`;
      }
      throw new Error(`intervals.icu : ${String(msg).slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    athleteId: id,
    /** Profil de l'athlète : sert de test de connexion. */
    athlete: () => call('GET', ''),
    listEvents: (oldest, newest) => call('GET', `/events?oldest=${oldest}&newest=${newest}`),
    /** Crée les événements ; ceux dont l'external_id existe déjà sont mis à jour. */
    bulkUpsert: (events) => call('POST', '/events/bulk?upsert=true', events),
    bulkDelete: (ids) => call('PUT', '/events/bulk-delete', ids.map((eventId) => ({ id: eventId }))),
  };
}

/** Transforme le programme en événements intervals.icu. */
export function planToEvents(plan) {
  const events = [];
  for (const wk of plan.weeks) {
    for (const s of wk.sessions) {
      const w = s.workout;
      if (s.role === 'race') {
        events.push({
          category: 'RACE_A',
          type: 'Run',
          start_date_local: `${s.iso}T00:00:00`,
          name: `🏁 ${w.title} : objectif ${fmtTime(w.seconds)}`,
          description: w.notes,
          distance: Math.round(w.km * 1000),
          moving_time: w.seconds,
          external_id: s.externalId,
        });
      } else {
        const showKm = w.kind !== 'easy' && w.kind !== 'long';
        events.push({
          category: 'WORKOUT',
          type: 'Run',
          target: 'PACE',
          start_date_local: `${s.iso}T00:00:00`,
          name: `🏃 ${w.title}${showKm ? ` • ${fmtKm(w.km)}` : ''}`,
          description: toIntervalsText(w),
          external_id: s.externalId,
        });
      }
    }
  }
  return events;
}

async function findPlanEvents(client, plan) {
  const existing = await client.listEvents(plan.rangeStart, plan.rangeEnd);
  return (existing || []).filter((e) => typeof e.external_id === 'string' && e.external_id.startsWith(ID_PREFIX));
}

/**
 * Exporte le programme. Avec `replace`, les séances déjà créées par cette application
 * sur la période sont d'abord supprimées (évite les doublons si les jours ont changé).
 */
export async function exportPlan(client, plan, { replace = true, onProgress = () => {} } = {}) {
  const events = planToEvents(plan);
  let deleted = 0;
  if (replace) {
    onProgress('Recherche des séances déjà exportées…');
    const doomed = await findPlanEvents(client, plan);
    if (doomed.length) {
      onProgress(`Suppression de ${doomed.length} ancienne(s) séance(s)…`);
      await client.bulkDelete(doomed.map((e) => e.id));
      deleted = doomed.length;
    }
  }
  onProgress(`Envoi de ${events.length} événements…`);
  const created = await client.bulkUpsert(events);
  return { deleted, created: Array.isArray(created) ? created.length : events.length };
}

/** Supprime les séances créées par cette application sur la période du programme. */
export async function deletePlanEvents(client, plan, { onProgress = () => {} } = {}) {
  onProgress('Recherche des séances exportées…');
  const doomed = await findPlanEvents(client, plan);
  if (!doomed.length) return { deleted: 0 };
  onProgress(`Suppression de ${doomed.length} séance(s)…`);
  await client.bulkDelete(doomed.map((e) => e.id));
  return { deleted: doomed.length };
}
