import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config';
import InfoBanner from '../InfoBanner/InfoBanner';
import "../viz.css";
import "./ActionCenter.css";

const SEV_COLORS = { critical: '#7b1fa2', high: '#e53935', medium: '#fb8c00', low: '#43a047' };

// The "what should I do right now" hub. Polls every 10s so it stays live.
const ActionCenter = () => {
  const [recs, setRecs] = useState([]);
  const [health, setHealth] = useState(null);
  const [updated, setUpdated] = useState(null);

  const load = async () => {
    try {
      const [r, h] = await Promise.all([
        axios.get(`${API_BASE}/api/recommendations`),
        axios.get(`${API_BASE}/api/health-score`),
      ]);
      setRecs(r.data.recommendations || []);
      setHealth(h.data);
      setUpdated(new Date());
    } catch (e) {
      console.error('Error loading action center:', e);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // live-updating
    return () => clearInterval(t);
  }, []);

  const healthColor = health ? (health.score >= 85 ? '#43a047' : health.score >= 60 ? '#fb8c00' : '#e53935') : '#90a4ae';

  return (
    <main className="main-container">
      <div className="main-title">
        <h2>Action Center</h2>
        {updated && <span className="ac-live">● live · updated {updated.toLocaleTimeString()}</span>}
      </div>

      <InfoBanner
        plain="This is your to-do list. Instead of raw numbers, it tells you exactly what needs your attention right now, why it matters, and what to do — most urgent first."
        what="Each card is a group of related security warnings, explained in plain language."
        watch="Start at the top. Purple/red items are the most serious and should be handled first."
      />

      {health && (
        <div className="ac-health" style={{ borderLeft: `5px solid ${healthColor}` }}>
          <div>
            <span className="ac-health-score" style={{ color: healthColor }}>{health.score}/100</span>
            <span className="ac-health-grade">{health.grade}</span>
          </div>
          <div className="ac-health-text">
            {health.grade === 'Good'
              ? "Your devices look healthy. Keep an eye on anything new below."
              : `Attention needed: ${health.open_critical} critical and ${health.open_high} high-priority issues are open across ${health.hosts} device${health.hosts === 1 ? '' : 's'}. Work through the list below, top first.`}
          </div>
        </div>
      )}

      {recs.length === 0 ? (
        <div className="ac-clear">✓ All clear — nothing needs your attention right now.</div>
      ) : (
        <div className="ac-list">
          {recs.map(rec => (
            <div className="ac-card" key={rec.priority} style={{ borderLeft: `5px solid ${SEV_COLORS[rec.severity] || '#90a4ae'}` }}>
              <div className="ac-card-head">
                <span className="ac-prio">#{rec.priority}</span>
                <span className="ac-sev" style={{ background: SEV_COLORS[rec.severity] }}>{rec.severity}</span>
                <span className="ac-card-title">{rec.title}</span>
                <span className="ac-count">{rec.count}</span>
              </div>
              <div className="ac-example">Example: {rec.example}</div>
              <div className="ac-why"><b>Why this matters:</b> {rec.why}</div>
              <div className="ac-how">
                <b>What to do:</b>
                <ol>{rec.how.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

export default ActionCenter;
