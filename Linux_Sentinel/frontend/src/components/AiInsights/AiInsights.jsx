import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config';
import './AiInsights.css';

// Reusable "Explain this page with AI" widget. Drop it on any page, pass a
// short human context string and a small summary object; it asks the AI to
// explain the page in plain English (SUMMARY / CONCERN / ADVICE).
const parse = (text) => {
  if (!text) return null;
  const grab = (label, next) => {
    const m = text.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=(?:${next})|$)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const summary = grab('SUMMARY', 'CONCERN|ADVICE');
  const concern = grab('CONCERN', 'ADVICE');
  const advice = grab('ADVICE', '$');
  if (!summary && !concern && !advice) return { raw: text };
  return { summary, concern, advice };
};

const AiInsights = ({ context, summary }) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/api/ai/status`)
      .then(r => setEnabled(r.data.enabled))
      .catch(() => setEnabled(false));
  }, []);

  const run = async () => {
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    try {
      const r = await axios.post(`${API_BASE}/api/ai/insights`, { context, summary });
      setText(r.data.insights);
    } catch (e) {
      setText(`AI error: ${e.response?.data?.detail || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) return null;
  const parsed = parse(text);

  return (
    <div className="ai-insights">
      {!open ? (
        <button className="ai-insights-btn" onClick={run}>
          🤖 Explain this page in plain English
        </button>
      ) : (
        <div className="ai-insights-panel">
          <div className="ai-insights-head">
            <span>🤖 AI Assistant</span>
            <button className="ai-insights-close" onClick={() => setOpen(false)}>×</button>
          </div>
          {loading && <div className="ai-insights-loading"><span className="ai-insights-spin" /> Reading the data…</div>}
          {!loading && parsed && parsed.raw && <div className="ai-insights-row">{parsed.raw}</div>}
          {!loading && parsed && !parsed.raw && (
            <>
              {parsed.summary && <div className="ai-insights-row"><b>What this shows:</b> {parsed.summary}</div>}
              {parsed.concern && <div className="ai-insights-row"><b>Anything wrong?</b> {parsed.concern}</div>}
              {parsed.advice && <div className="ai-insights-row advice"><b>What to do:</b> {parsed.advice}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AiInsights;
