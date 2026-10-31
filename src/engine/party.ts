// Parties as organisations: factions, cohesion, staff capacity and workload.

import { clamp } from './rng.ts';
import type { Faction, Party, StaffRole } from './types.ts';

export function recomputeCohesion(p: Party) {
  if (!p.factions.length) return;
  const tot = p.factions.reduce((a, f) => a + f.strength, 0);
  const sat = p.factions.reduce((a, f) => a + f.strength * f.satisfaction, 0) / tot;
  // the weakest strong faction drags cohesion down more than averages suggest
  const worst = Math.min(...p.factions.filter((f) => f.strength >= 0.2).map((f) => f.satisfaction));
  p.stats.cohesion = clamp(0.7 * sat + 0.3 * worst);
}

export function adjustFaction(p: Party, pick: (f: Faction) => boolean, delta: number, grievance?: string) {
  for (const f of p.factions) {
    if (!pick(f)) continue;
    f.satisfaction = clamp(f.satisfaction + delta);
    if (grievance && delta < 0) {
      f.grievances.unshift(grievance);
      f.grievances = f.grievances.slice(0, 4);
    }
  }
  recomputeCohesion(p);
}

// Effective skill of the best person in a role, accounting for overload and morale. 0..1.
// AI parties without explicit staff use their campaignSkill as a stand-in.
export function staffSkill(p: Party, role: StaffRole, state?: string): number {
  if (p.controlledBy === 'ai' && p.staff.length === 0) return p.stats.campaignSkill * 0.85;
  const pool = p.staff.filter((s) => s.role === role && (!state || role !== 'regional_coordinator' || s.assignedState === state));
  if (!pool.length) return 0;
  let best = 0;
  for (const s of pool) {
    const overload = Math.max(0, s.workload - 6) * 0.06;
    const eff = (s.skill / 100) * (0.7 + 0.3 * s.morale) - overload + Math.min(s.experience, 20) * 0.004;
    best = Math.max(best, eff);
  }
  return clamp(best);
}

export function leaderDays(p: Party): number {
  return p.leaderStyle === 'charismatic' || p.leaderStyle === 'populist' ? 6 : 5;
}

export function teamCapacity(p: Party): number {
  if (p.controlledBy === 'ai' && p.staff.length === 0) return Math.round(6 + p.stats.organisation * 10);
  let cap = 6 + Math.round(p.stats.organisation * 8);
  for (const s of p.staff) {
    if (s.role === 'campaign_manager') cap += Math.round(s.skill / 25);
    if (s.role === 'regional_coordinator') cap += 2;
    if (s.role === 'volunteer_coordinator') cap += 1;
  }
  return cap;
}

export function payroll(p: Party): number {
  return p.staff.reduce((a, s) => a + s.salary, 0);
}
