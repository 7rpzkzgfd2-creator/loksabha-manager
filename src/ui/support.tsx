import { useState } from 'react';
import { Modal } from './components.tsx';

// Fill these in to switch the support button on. Leave a field empty to hide that option.
export const SUPPORT = {
  upiId: 'akshajsood7@okhdfcbank',
  upiName: 'Lok Sabha Manager',
  qr: '/upi-qr.png', // scan-to-pay image in public/; empty to hide
  link: '', // e.g. https://buymeacoffee.com/yourname or a Razorpay payment page
  linkLabel: 'Support on Buy Me a Coffee',
};
export const SITE_URL = 'https://loksabha-manager.onrender.com';

const enabled = () => !!(SUPPORT.upiId || SUPPORT.link);

export function SupportButton({ className = 'btn' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  if (!enabled()) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>♥ Support the game</button>
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SupportModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const upi = `upi://pay?pa=${encodeURIComponent(SUPPORT.upiId)}&pn=${encodeURIComponent(SUPPORT.upiName)}&cu=INR&tn=${encodeURIComponent('Lok Sabha Manager')}`;
  return (
    <Modal title={<b>Support Lok Sabha Manager</b>} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <p className="small muted" style={{ margin: 0 }}>The game is free, with no ads and no paywall. If you enjoy it, a small contribution pays for the server and new features. Any amount helps.</p>
        {SUPPORT.upiId && (
          <div className="panel" style={{ padding: 14 }}>
            <div className="upper dim">UPI (India)</div>
            <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              <b className="mono" style={{ fontSize: 16 }}>{SUPPORT.upiId}</b>
              <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(SUPPORT.upiId).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Copied' : 'Copy'}</button>
              <a className="btn sm primary" href={upi}>Pay with a UPI app</a>
            </div>
            {SUPPORT.qr && <img src={SUPPORT.qr} alt={`UPI QR code for ${SUPPORT.upiId}`} width={231} height={260} style={{ display: 'block', margin: '12px auto 4px', borderRadius: 10, maxWidth: '70%', height: 'auto' }} />}
            {SUPPORT.qr && <div className="tiny dim" style={{ textAlign: 'center' }}>Scan with any UPI app</div>}
            <div className="tiny dim" style={{ marginTop: 6 }}>"Pay with a UPI app" opens GPay, PhonePe or Paytm on a phone. On a computer, scan the QR code with your phone or copy the ID.</div>
          </div>
        )}
        {SUPPORT.link && <a className="btn primary" href={SUPPORT.link} target="_blank" rel="noreferrer">{SUPPORT.linkLabel}</a>}
      </div>
    </Modal>
  );
}
