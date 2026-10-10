import { BarChart3, ShieldCheck, UsersRound } from 'lucide-react';

export default function BrandPanel() {
  return (
    <section className="brand-panel">
      <div className="brand-backdrop" />
      <div className="brand-content">
        <div className="brand-lockup">
          <img className="brand-logo" src="/logo.png" alt="SPU-SCCPMS logo" />
        </div>

        <div className="brand-message">
          <span className="eyebrow">Sol Plaatje University</span>
          <h1>Care that moves<br /><em>with you.</em></h1>
          <p>One secure space for healthier campus communities and better patient experiences.</p>
        </div>

        <div className="benefits">
          <div className="benefit"><span className="benefit-icon"><ShieldCheck size={21} /></span><span><strong>Secure &amp; Reliable</strong><small>Your data is protected.</small></span></div>
          <div className="benefit"><span className="benefit-icon"><UsersRound size={21} /></span><span><strong>Streamlined Care</strong><small>Better patient experiences.</small></span></div>
          <div className="benefit"><span className="benefit-icon"><BarChart3 size={21} /></span><span><strong>Smart &amp; Efficient</strong><small>Smarter decisions.</small></span></div>
        </div>
      </div>
      <p className="copyright"><ShieldCheck size={14} /> © 2026 SPU-SCCPMS · Sol Plaatje University. All rights reserved.</p>
    </section>
  );
}
