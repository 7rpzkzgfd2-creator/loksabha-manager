import { useState } from 'react';
import { useGame, useStore } from '../store.tsx';
import { PageHead, Panel, Seg } from '../components.tsx';

const IMP = { critical: 'var(--bad)', high: 'var(--warn)', normal: 'var(--info)', low: 'var(--line2)' };

export default function Inbox() {
  const g = useGame();
  const { me, run, go } = useStore();
  const [filter, setFilter] = useState<'all' | 'unread' | 'decisions'>('all');
  const all = g.inbox.filter((m) => m.party === me);
  const list = all.filter((m) => filter === 'all' || (filter === 'unread' ? !m.read : m.kind === 'event' || m.kind === 'proposal'));
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const m = all.find((x) => x.id === sel);
  const ev = m?.eventId ? g.events.find((e) => e.id === m.eventId) : undefined;
  const prop = m?.proposalId ? g.proposals.find((x) => x.id === m.proposalId) : undefined;

  const open = (id: string) => { setSel(id); const x = all.find((y) => y.id === id); if (x && !x.read) run({ type: 'mark_read', id }, true); };

  return (
    <>
      <PageHead title="Inbox" sub="Reports, warnings and decisions. Critical items are red.">
        <Seg value={filter} onChange={setFilter} options={[{ v: 'all', label: `All (${all.length})` }, { v: 'unread', label: `Unread (${all.filter((x) => !x.read).length})` }, { v: 'decisions', label: 'Decisions' }]} />
        <button className="btn sm" onClick={() => run({ type: 'mark_all_read' }, true)}>Mark all read</button>
      </PageHead>
      <div className="inbox">
        <Panel className="flush">
          <div className="msg-list">
            {list.length === 0 && <div className="empty" style={{ margin: 14 }}>Nothing here.</div>}
            {list.map((x) => (
              <div key={x.id} className={`msg ${x.read ? '' : 'unread'} ${x.id === sel ? 'on' : ''}`} onClick={() => open(x.id)}>
                <span className="imp" style={{ background: IMP[x.importance] }} />
                <div className="ellipsis"><div className="subj ellipsis">{x.subject}</div><div className="tiny dim">{x.from} · week {x.turn}</div></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          {!m ? <div className="empty">Select a message.</div> : (
            <div className="col" style={{ gap: 14 }}>
              <div>
                <div className="row"><span className="chip" style={{ color: IMP[m.importance] }}>{m.importance}</span><span className="dim small">{m.from} · week {m.turn}</span></div>
                <h2 className="display" style={{ margin: '10px 0 0', fontSize: 22 }}>{m.subject}</h2>
              </div>
              <div className="msg-body">{m.body}</div>
              {ev && !ev.resolved && (
                <div className="col">
                  <div className="upper">Your options</div>
                  {ev.options.map((o) => (
                    <button key={o.id} className="opt" onClick={() => run({ type: 'respond_event', eventId: ev.id, option: o.id })}>
                      <b>{o.label}{o.cost ? <span className="dim"> · ₹{o.cost} cr</span> : null}</b><span className="small muted">{o.detail}</span><span className="risk">Risk: {o.risk}</span>
                    </button>
                  ))}
                </div>
              )}
              {ev?.resolved && <div className="panel" style={{ background: '#0b1017' }}><div className="upper">Decision taken</div><b>{ev.options.find((o) => o.id === ev.resolved)?.label}</b><div className="muted small">{ev.outcome}</div></div>}
              {prop && prop.status === 'open' && (
                <div className="row">
                  <button className="btn primary" onClick={() => run({ type: 'respond_proposal', id: prop.id, accept: true })}>Accept</button>
                  <button className="btn" onClick={() => run({ type: 'respond_proposal', id: prop.id, accept: false })}>Decline</button>
                  <button className="btn ghost" onClick={() => go('alliances')}>Review on Alliances</button>
                </div>
              )}
              {prop && prop.status !== 'open' && <div className="chip">{prop.status}</div>}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
