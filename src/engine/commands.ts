// Every player decision that is not a queued campaign action goes through here. The same
// function backs single-player and the multiplayer server, so validation lives in one
// place. Commands mutate the state passed in; callers clone first.

import { POLICY_BY_ID } from './data/catalog.ts';
import { makeCandidate, makeStaff, staffMarket, STATE_BY_CODE } from './setup.ts';
import { clamp, hash, makeRng } from './rng.ts';
import type { Candidate, CampaignAction, GameState, Issue, StaffMember } from './types.ts';
import { validateAction } from './actions.ts';
import { resolveEvent } from './events.ts';
import { leaveAlliance, proposeAlliance, respondAllianceProposal } from './alliances.ts';
import { attemptPoach, takeBackdoorFunds } from './shadow.ts';
import { makeCoalitionOffer } from './coalition.ts';
import { adjustFaction } from './party.ts';
import { manifestoCredibility } from './ai.ts';
import { remember } from './world.ts';

export type Command =
  | { type: 'queue_action'; action: CampaignAction }
  | { type: 'unqueue_action'; id: string }
  | { type: 'respond_event'; eventId: string; option: string }
  | { type: 'pick_candidate'; seat: string; index: number }
  | { type: 'set_manifesto'; policies: string[] }
  | { type: 'propose_alliance'; to: string; seats: number }
  | { type: 'respond_proposal'; id: string; accept: boolean }
  | { type: 'leave_alliance' }
  | { type: 'hire_staff'; index: number }
  | { type: 'fire_staff'; id: string }
  | { type: 'assign_staff'; id: string; state: string }
  | { type: 'set_centrality'; value: number }
  | { type: 'poach'; seat: string; from: string; mult: number }
  | { type: 'backdoor'; amount: number }
  | { type: 'coalition_offer'; to: string; ministries: number; concession?: Issue; pm: boolean }
  | { type: 'mark_read'; id: string }
  | { type: 'mark_all_read' };

export interface CommandResult { ok: boolean; text: string }

export const MAX_POLICIES = 6;

export function aspirants(state: GameState, seatId: string, party: string): Candidate[] {
  const c = state.seats.find((x) => x.id === seatId);
  const p = state.parties[party];
  if (!c || !p) return [];
  const rng = makeRng(hash(`${seatId}|${party}|${state.cycle}`) ^ state.config.seed);
  const list = [0, 1, 2].map(() => makeCandidate(rng, p, c.state, p.stats.candidateQuality + 0.04));
  list[0].profile = 'local_notable'; list[0].localRep = clamp(list[0].localRep + 0.15); list[0].loyalty = clamp(list[0].loyalty - 0.2);
  list[1].profile = 'party_organiser'; list[1].loyalty = clamp(list[1].loyalty + 0.2); list[1].localRep = clamp(list[1].localRep - 0.1);
  return list;
}

export function market(state: GameState): StaffMember[] {
  return staffMarket(makeRng(hash(state.id + ':' + state.turn) ^ state.config.seed), state.turn);
}

export function applyCommand(state: GameState, party: string, cmd: Command): CommandResult {
  const p = state.parties[party];
  if (!p) return { ok: false, text: 'Unknown party.' };
  if (p.controlledBy !== 'human') return { ok: false, text: 'You do not control this party.' };
  const rng = makeRng(state.rng ^ hash(JSON.stringify(cmd)));
  const done = (text: string, ok = true): CommandResult => { state.rng = rng.state() ^ state.rng; return { ok, text }; };

  switch (cmd.type) {
    case 'queue_action': {
      const a = { ...cmd.action, party };
      const q = state.queued[party] ?? [];
      const err = validateAction(state, a, q);
      if (err) return { ok: false, text: err };
      state.queued[party] = [...q, a];
      return { ok: true, text: 'Added to this week’s plan.' };
    }
    case 'unqueue_action': {
      state.queued[party] = (state.queued[party] ?? []).filter((a) => a.id !== cmd.id);
      return { ok: true, text: 'Removed.' };
    }
    case 'respond_event': {
      const ev = state.events.find((e) => e.id === cmd.eventId);
      if (!ev || ev.party !== party) return { ok: false, text: 'Not your decision to make.' };
      const opt = ev.options.find((o) => o.id === cmd.option);
      if (opt?.cost && p.stats.funds < opt.cost) return { ok: false, text: 'Not enough money for that response.' };
      const out = resolveEvent(state, cmd.eventId, cmd.option, rng);
      return out ? done(out) : { ok: false, text: 'Already decided.' };
    }
    case 'pick_candidate': {
      if (state.stage !== 'preparation' || state.phase !== 'campaign') return { ok: false, text: 'Tickets are locked.' };
      const c = state.seats.find((x) => x.id === cmd.seat);
      if (!c || !c.candidates[party]) return { ok: false, text: 'You are not contesting this seat.' };
      const choice = aspirants(state, cmd.seat, party)[cmd.index];
      if (!choice) return { ok: false, text: 'No such aspirant.' };
      const old = c.candidates[party];
      if (old.id === choice.id) return { ok: false, text: 'Already the candidate.' };
      c.candidates[party] = { ...choice, vetted: old.vetted };
      if (old.incumbent) {
        adjustFaction(p, (f) => f.id === old.faction, -0.08, `Sitting MP ${old.name} denied a ticket`);
        if (old.localRep > 0.6 && old.loyalty < 0.5 && rng.chance(0.45)) { c.rebel = clamp(0.04 + old.localRep * 0.07, 0, 0.14); c.rebelFrom = party; }
      }
      if (choice.profile === 'local_notable' || choice.profile === 'turncoat') adjustFaction(p, (f) => f.outlook === 'loyalist', -0.02, `Outsider ticket in ${c.name}`);
      if (choice.profile === 'party_organiser') adjustFaction(p, (f) => f.outlook === 'loyalist', 0.015);
      remember(state, rng, { kind: 'candidate', party, text: `Picked ${choice.name} over ${old.name} in ${c.name}.`, weight: 0.2 });
      return done(`${choice.name} is now your candidate in ${c.name}.${c.rebelFrom === party && old.incumbent ? ` ${old.name} is threatening to run as an independent.` : ''}`);
    }
    case 'set_manifesto': {
      if (p.manifesto.locked) return { ok: false, text: 'The manifesto is locked. Use "Announce a policy" during the campaign.' };
      const pols = [...new Set(cmd.policies)].filter((id) => POLICY_BY_ID[id]);
      if (pols.length > MAX_POLICIES) return { ok: false, text: `At most ${MAX_POLICIES} headline promises.` };
      p.manifesto.policies = pols;
      p.manifesto.credibility = manifestoCredibility(state, p);
      for (const id of pols) p.issueOwn[POLICY_BY_ID[id].issue] = Math.max(p.issueOwn[POLICY_BY_ID[id].issue], 0.4);
      return { ok: true, text: `Manifesto updated. Credibility ${Math.round(p.manifesto.credibility * 100)}%.` };
    }
    case 'propose_alliance': {
      const r = proposeAlliance(state, party, cmd.to, Math.max(0, Math.round(cmd.seats)), rng);
      return done(r.text, r.ok);
    }
    case 'respond_proposal': {
      const prop = state.proposals.find((x) => x.id === cmd.id);
      if (!prop) return { ok: false, text: 'No such proposal.' };
      if (prop.from !== party && prop.to !== party) return { ok: false, text: 'Not your proposal.' };
      // AI-initiated offers are addressed "from" the human so the human leads the front
      return done(respondAllianceProposal(state, cmd.id, cmd.accept, rng));
    }
    case 'leave_alliance': {
      if (state.stage !== 'preparation') return { ok: false, text: 'Seat-sharing is locked until the next election.' };
      return done(leaveAlliance(state, party, rng));
    }
    case 'hire_staff': {
      const s = market(state)[cmd.index];
      if (!s) return { ok: false, text: 'That person is no longer available.' };
      if (p.staff.some((x) => x.name === s.name && x.role === s.role)) return { ok: false, text: 'Already on your team.' };
      if (p.staff.length >= 14) return { ok: false, text: 'Your team is full (14).' };
      const fee = Math.round(s.salary * 3 * 100) / 100;
      if (p.stats.funds < fee) return { ok: false, text: `Signing costs ₹${fee} cr.` };
      p.stats.funds -= fee;
      p.staff.push({ ...s, hiredTurn: state.turn, assignedState: s.role === 'regional_coordinator' ? p.homeStates[0] : undefined });
      return { ok: true, text: `${s.name} joins as ${s.role.replace(/_/g, ' ')} (signing ₹${fee} cr, ₹${s.salary} cr a week).` };
    }
    case 'fire_staff': {
      const s = p.staff.find((x) => x.id === cmd.id);
      if (!s) return { ok: false, text: 'Not on your team.' };
      p.staff = p.staff.filter((x) => x !== s);
      p.stats.funds -= s.salary * 2;
      for (const o of p.staff) o.morale = clamp(o.morale - 0.04);
      return { ok: true, text: `${s.name} has left. Severance ₹${(s.salary * 2).toFixed(2)} cr. The rest of the team noticed.` };
    }
    case 'assign_staff': {
      const s = p.staff.find((x) => x.id === cmd.id);
      if (!s || s.role !== 'regional_coordinator') return { ok: false, text: 'Only regional coordinators take a state.' };
      if (!STATE_BY_CODE[cmd.state]) return { ok: false, text: 'Unknown state.' };
      s.assignedState = cmd.state;
      return { ok: true, text: `${s.name} now runs ${STATE_BY_CODE[cmd.state].name}.` };
    }
    case 'set_centrality': {
      if (state.stage !== 'preparation') return { ok: false, text: 'The campaign’s shape is set; you can only change it during preparation.' };
      const v = clamp(cmd.value, 0.1, 0.95);
      const delta = v - p.stats.leaderCentrality;
      p.stats.leaderCentrality = v;
      adjustFaction(p, (f) => f.outlook === 'regional', -delta * 0.2, delta > 0 ? 'Campaign centralised around the leader' : undefined);
      return { ok: true, text: v > 0.6 ? 'A leader-led campaign: the national face matters most.' : v < 0.35 ? 'A local campaign: regional leaders and candidates front it.' : 'A balanced campaign.' };
    }
    case 'poach': return done(attemptPoach(state, party, cmd.seat, cmd.from, cmd.mult, rng));
    case 'backdoor': return done(takeBackdoorFunds(state, party, cmd.amount, rng));
    case 'coalition_offer': {
      const t = makeCoalitionOffer(state, party, cmd.to, cmd.ministries, cmd.concession, cmd.pm, rng);
      return done(t, t.startsWith('Offer sent'));
    }
    case 'mark_read': { const m = state.inbox.find((x) => x.id === cmd.id); if (m) m.read = true; return { ok: true, text: '' }; }
    case 'mark_all_read': { for (const m of state.inbox) if (m.party === party) m.read = true; return { ok: true, text: '' }; }
  }
  return { ok: false, text: 'Unknown command.' };
}

export { makeStaff };
