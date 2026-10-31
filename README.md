# Lok Sabha Manager

A Football Manager-style simulation of an Indian general election. You lead a real party, or found your own, through a campaign across all 543 constituencies: pick tickets, write a manifesto, strike alliances, spend money you don't quite have, survive scandals, count the votes, then try to form a government. In Career mode you carry on into the next term and the election after it.

Every decision changes the political world through intermediate state (persuasion, turnout, organisation, mood, trust, factions, money, memory). Nothing hands out a fixed number of votes.

## Running it

Needs Node 23.6 or newer (it runs TypeScript directly; built with Node 24).

```bash
npm install
```

Single-player (opens on http://localhost:5199):

```bash
npm run dev
```

Multiplayer server (keep it running in a second terminal; the dev client proxies `/api` to it):

```bash
npm run server
```

Production build, with the server serving the client on one port (http://localhost:8787):

```bash
npm run build && npm start
```

Tests (41 engine and multiplayer tests):

```bash
npm test
```

The 500-election balance batch, which writes `docs/BALANCE.md`:

```bash
npm run balance
```

## What's in the game

**Modes.** Career (multi-cycle, with five governance years between elections), Quick election, Historical (2014, 2019, 2024), Sandbox (set your popularity, money, organisation, the economy and rival strength; flagged as non-standard), and turn-based Multiplayer.

**Parties.** 24 real parties plus Others & Independents, including split factions (Shiv Sena / SS(UBT), NCP / NCP(SP)) only in scenarios after the splits. Or build a custom party: name, colours, symbol, four ideology axes, focus issues, structure and recruitment style, all paid for from one launch budget, so you can't have everything.

**Electoral engine.** First-past-the-post in every seat. Each constituency mixes eight overlapping voter segments; each segment has a utility for every party (historical baseline, issue fit, leader effect, candidate, state mood, air war, local persuasion, incumbency), then a separate turnout propensity. Partners who stand down for an ally become "ghosts" whose voters only partly transfer. Supporters of hopeless third parties desert strategically. Rebel independents split votes. Ties go to a draw of lots. Lost deposits are flagged under one-sixth of the vote.

**Campaign.** Ten action types (rallies, town halls, door-to-door, roadshows, digital, press conferences, organisation building, volunteer drives, research, mid-campaign policy announcements), all limited by money, leader days and team capacity. Outcomes depend on local organisation, the speaker, how well the issue fits, audience fatigue, competing news, staff skill and luck. Rallies can backfire; organisers inflate crowd numbers; persuasion lands a week later.

**Backroom.** Buy rival candidates (paid from your war chest; they bring part of their personal vote) and take undeclared money. Both raise a hidden exposure score; getting caught costs trust, leader standing, seized funds and factional peace, and is remembered.

**Living world.** 11 contextual event types with hidden facts (how strong the evidence really is), escalation and delayed consequences; faction revolts and defections; alliance seat disputes; economic shocks; disasters. Rival AIs plan with the same rules and only public information, react to where you campaign, exploit seats you neglect, form counter-alliances and make coalition offers. A political memory feeds future negotiations.

**Election night and after.** Round-by-round counting with flips, a wire feed and too-close-to-call seats; a results autopsy that labels each explanation as clear, plausible or uncertain; coalition negotiations with ministries, policy promises and even the PM post; a confidence vote; governance years where promises are kept or broken.

**Interface.** Football Manager layout: sidebar with every screen, top bar with date, funds, leader days, team and a Continue button (Shift+Space), an inbox-first home, a war room with reasoned recommendations, sortable tables everywhere, FM-style 1–20 attributes, a schematic tile map with nine layers, a 10-step skippable tutorial, autosave plus named saves and JSON export.

## Multiplayer

Turn-based and server-authoritative. The host creates a lobby and shares its code; players pick distinct parties and ready up; the AI plays every unclaimed party. Each week players plan privately and submit; the turn resolves when everyone has submitted, or automatically at the deadline (the host can force it after half the deadline has passed). The server validates every command with the same engine, overrides any party a client claims, rejects replayed nonces and duplicate actions, rate-limits requests, never sends rivals' money, staff, plans, inbox, private ledger, polling error or RNG state, and writes every lobby to `server/data/` so a restart loses nothing. Reconnecting from the same browser restores your seat.

Limits: clients poll every 1.5s rather than using WebSockets; there are no accounts (a lobby token in local storage is your identity); in government formation, human parties that have not chosen are scored like AI parties; multiplayer games end after government formation (no governance years); counting and formation rounds are advanced by the host.

## Data and honesty

- **Historical:** seat counts and constituency names follow the 2008 delimitation (names transcribed by hand, so check them against ECI before citing). Recorded national seat totals for the largest parties in 2014, 2019 and 2024 are shown only after you play, for comparison.
- **Estimates:** starting vote shares by state, all party attributes, electors, urbanisation and turnout. They are hand-set approximations, not official statistics or real polls.
- **Simulated:** everything during play, including the "previous result" that seeds incumbents. The model is not validated as a predictor of real elections.
- **Fictional:** every leader, candidate, staff member and media outlet. Party symbols are original glyphs, not ECI symbols.
- **Voters** are aggregate economic and life-stage groups. Caste, religion and language enter only through each seat's historical baseline; no identity mechanically decides a vote.
- **Map:** no boundary GeoJSON is bundled. The map is a tile cartogram with every real constituency clickable.
- **Known simplifications:** all scenarios use 2008 boundaries (2014 is played on post-bifurcation AP/Telangana; Assam uses pre-2023 names); campaign-finance ceilings are abstracted to party-level money plus scrutiny risk; state assembly elections are not simulated.

## Balance

See `docs/BALANCE.md` for the latest 500-run batch. From the last run: targeted ground campaigning in toss-ups beat doing nothing (59.4 vs 53.9 seats for a scripted INC), while hammering rallies into safe seats did worse than doing nothing (51.7). Four times the money gave about 4 seats. Alliances helped the INDIA bloc overall, while some members did worse inside it. The same strategy did worse on Hard than on Easy. Dirty money backfired: caught in 35 of 40 runs. Two findings are left as they are: a brand-new party almost never wins a seat in its first election (its route is alliances, defections and later cycles), and seat-level forecast error is large (about 33 seats on average), so the game stays uncertain.

## Layout

```
src/engine/   simulation (pure TypeScript, no UI): data, voters, forecast, actions, AI, events,
              alliances, shadow politics, election, coalition and governance, turn loop, commands
src/ui/       React screens and components
server/       multiplayer server (node:http, no extra dependencies)
tests/        node:test suites
scripts/      balance batch, smoke run
```
