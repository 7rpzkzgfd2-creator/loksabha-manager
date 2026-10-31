import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

process.env.LSM_DATA = mkdtempSync(join(tmpdir(), 'lsm-'));
const { server } = await import('../server/server.ts');
let base = '';
before(() => new Promise<void>((r) => server.listen(0, () => { base = `http://localhost:${(server.address() as AddressInfo).port}`; r(); })));
after(() => new Promise<void>((r) => server.close(() => r())));

async function api(path: string, body?: unknown) {
  const res = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() as any };
}
let host: any, guest: any, lobby = '';

test('host creates a lobby and a guest joins', async () => {
  const c = await api('/api/lobbies', { name: 'Asha', lobbyName: 'Test', scenarioId: 'ls2029', difficulty: 'normal', campaignTurns: 6, turnSeconds: 600 });
  assert.equal(c.status, 200);
  host = c.json; lobby = host.lobbyId;
  const j = await api(`/api/lobbies/${lobby}/join`, { name: 'Bilal' });
  assert.equal(j.status, 200);
  guest = j.json;
  const list = await api('/api/lobbies');
  assert.ok(list.json.lobbies.some((l: any) => l.id === lobby));
});

test('parties are exclusive and the game needs everyone ready', async () => {
  assert.equal((await api(`/api/lobbies/${lobby}/claim`, { token: host.token, party: 'BJP' })).status, 200);
  assert.equal((await api(`/api/lobbies/${lobby}/claim`, { token: guest.token, party: 'BJP' })).status, 409);
  assert.equal((await api(`/api/lobbies/${lobby}/claim`, { token: guest.token, party: 'INC' })).status, 200);
  assert.equal((await api(`/api/lobbies/${lobby}/start`, { token: host.token })).status, 409);
  await api(`/api/lobbies/${lobby}/ready`, { token: host.token, ready: true });
  await api(`/api/lobbies/${lobby}/ready`, { token: guest.token, ready: true });
  assert.equal((await api(`/api/lobbies/${lobby}/start`, { token: guest.token })).status, 403, 'only the host may start');
  assert.equal((await api(`/api/lobbies/${lobby}/start`, { token: host.token })).status, 200);
});

test('strangers are refused', async () => {
  assert.equal((await api(`/api/lobbies/${lobby}/state?token=nope`)).status, 403);
  assert.equal((await api(`/api/lobbies/${lobby}/command`, { token: 'nope', cmd: { type: 'backdoor', amount: 50 }, nonce: 'x1' })).status, 403);
});

test('each player sees only their own private information', async () => {
  const s = await api(`/api/lobbies/${lobby}/state?token=${guest.token}`);
  const g = s.json.game;
  assert.equal(g.playerParty, 'INC');
  assert.equal(g.parties.BJP.stats.funds, 0, 'rival funds hidden');
  assert.deepEqual(g.pollBias, {}, 'polling error hidden');
  assert.equal(g.rng, 0, 'rng stream hidden');
  assert.ok(g.parties.INC.stats.funds > 0);
  assert.ok(g.inbox.every((m: any) => m.party === 'INC'));
});

test('commands act only for the authenticated party, and duplicates are rejected', async () => {
  const st = (await api(`/api/lobbies/${lobby}/state?token=${guest.token}`)).json.game;
  const seat = st.seats.find((c: any) => c.candidates.INC).id;
  const action = { id: 'a1', party: 'BJP', type: 'town_hall', constituency: seat, issue: 'jobs' };
  const r1 = await api(`/api/lobbies/${lobby}/command`, { token: guest.token, cmd: { type: 'queue_action', action }, nonce: 'n1' });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.equal((await api(`/api/lobbies/${lobby}/command`, { token: guest.token, cmd: { type: 'queue_action', action }, nonce: 'n1' })).status, 409, 'replayed nonce');
  assert.equal((await api(`/api/lobbies/${lobby}/command`, { token: guest.token, cmd: { type: 'queue_action', action }, nonce: 'n2' })).status, 409, 'duplicate action id');
  const g = (await api(`/api/lobbies/${lobby}/state?token=${guest.token}`)).json.game;
  assert.equal(g.queued.INC.length, 1);
  assert.equal(g.queued.INC[0].party, 'INC', 'client-claimed party is overridden');
  const hostView = (await api(`/api/lobbies/${lobby}/state?token=${host.token}`)).json.game;
  assert.equal(hostView.queued.INC, undefined, 'the host cannot see the guest’s plan');
});

test('client-sent results or money are impossible: unknown commands fail', async () => {
  const r = await api(`/api/lobbies/${lobby}/command`, { token: guest.token, cmd: { type: 'set_funds', amount: 99999 }, nonce: 'n3' });
  assert.equal(r.status, 400);
});

test('turns wait for every player, then resolve once', async () => {
  const before = (await api(`/api/lobbies/${lobby}/state?token=${host.token}`)).json;
  const s1 = await api(`/api/lobbies/${lobby}/submit`, { token: host.token });
  assert.match(s1.json.text, /Waiting for Bilal/);
  assert.equal((await api(`/api/lobbies/${lobby}/submit`, { token: host.token })).status, 409, 'no double submit');
  const mid = (await api(`/api/lobbies/${lobby}/state?token=${host.token}`)).json;
  assert.equal(mid.game.campaignTurn, before.game.campaignTurn, 'turn must not advance early');
  assert.equal((await api(`/api/lobbies/${lobby}/command`, { token: host.token, cmd: { type: 'backdoor', amount: 10 }, nonce: 'n4' })).status, 409, 'no changes after submitting');
  await api(`/api/lobbies/${lobby}/submit`, { token: guest.token });
  const after = (await api(`/api/lobbies/${lobby}/state?token=${host.token}`)).json;
  assert.equal(after.game.campaignTurn, before.game.campaignTurn + 1);
});

test('reconnecting with the same token restores the same state, and it survives on disk', async () => {
  const a = (await api(`/api/lobbies/${lobby}/state?token=${guest.token}`)).json;
  const b = (await api(`/api/lobbies/${lobby}/state?token=${guest.token}`)).json;
  assert.equal(a.rev, b.rev);
  assert.equal(a.game.campaignTurn, b.game.campaignTurn);
  assert.ok(readdirSync(process.env.LSM_DATA!).includes(`${lobby}.json`));
});

test('the host cannot force a turn before half the deadline', async () => {
  assert.equal((await api(`/api/lobbies/${lobby}/force`, { token: host.token })).status, 409);
  assert.equal((await api(`/api/lobbies/${lobby}/force`, { token: guest.token })).status, 403);
});
