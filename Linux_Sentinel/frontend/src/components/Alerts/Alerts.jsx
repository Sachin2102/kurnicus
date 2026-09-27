import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config';
import "../NetworkLogs/NetworkLogs.css";
import "./Alerts.css";
import InfoBanner from '../InfoBanner/InfoBanner';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';

const SEV_COLORS = { critical: '#7b1fa2', high: '#e53935', medium: '#fb8c00', low: '#43a047' };
const STATUS_COLORS = { open: '#e53935', acknowledged: '#fb8c00', resolved: '#43a047' };

const cellStyle = { borderBottom: "1px solid #656669", color: "#fff" };
const headStyle = { backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" };

const Chip = ({ text, color }) => (
  <span style={{
    backgroundColor: color, color: '#fff', padding: '3px 10px',
    borderRadius: '12px', fontSize: '12px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'
  }}>{text}</span>
);

// Parse the model's "ASSESSMENT: ... MITRE: ... ACTION: ..." into sections.
const parseAnalysis = (text) => {
  if (!text) return null;
  const grab = (label, next) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=(?:${next})|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  const assessment = grab('ASSESSMENT', 'MITRE|ACTION');
  const mitre = grab('MITRE', 'ACTION');
  const action = grab('ACTION', '$');
  if (!assessment && !mitre && !action) return { raw: text };
  return { assessment, mitre, action };
};

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({ total: 0, by_severity: {} });
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiText, setAiText] = useState({});      // alertId -> explanation
  const [aiLoading, setAiLoading] = useState({}); // alertId -> bool
  const [modalId, setModalId] = useState(null);  // alert shown in the AI modal

  const fetchAlerts = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: '1000' });
      if (severityFilter !== 'all') qs.set('severity', severityFilter);
      const [a, s] = await Promise.all([
        axios.get(`${API_BASE}/api/alerts?${qs.toString()}`),
        axios.get(`${API_BASE}/api/alerts/summary`)
      ]);
      setAlerts(a.data);
      setSummary(s.data);
    } catch (e) {
      console.error('Error fetching alerts:', e);
    }
  }, [severityFilter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    axios.get(`${API_BASE}/api/ai/status`)
      .then(r => setAiEnabled(r.data.enabled))
      .catch(() => setAiEnabled(false));
  }, []);

  const runExplain = async (id) => {
    setAiLoading(prev => ({ ...prev, [id]: true }));
    try {
      const r = await axios.post(`${API_BASE}/api/alerts/${id}/explain`);
      setAiText(prev => ({ ...prev, [id]: r.data.ai_summary }));
    } catch (e) {
      setAiText(prev => ({ ...prev, [id]: `AI error: ${e.response?.data?.detail || e.message}` }));
    } finally {
      setAiLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  // Open the modal for an alert; fetch analysis if we don't have it yet.
  const openAiModal = (a) => {
    setModalId(a.id);
    if (!aiText[a.id] && !a.ai_summary && !aiLoading[a.id]) runExplain(a.id);
  };

  const acknowledge = async (id, status) => {
    try {
      await axios.patch(`${API_BASE}/api/alerts/${id}`, { status });
      setAlerts(prev => prev.map(al => al.id === id ? { ...al, status } : al));
    } catch (e) {
      console.error('Error updating alert:', e);
    }
  };

  const fmt = (ts) => {
    const d = new Date(ts);
    return isNaN(d) ? ts : d.toLocaleString();
  };

  return (
    <main className="main-container">
      <div className="main-title"><h2>Security Alerts</h2></div>

      <InfoBanner
        plain="These are the security warnings the system raised automatically — like a smoke alarm for your devices."
        what="Each alert names the problem, how serious it is, and which device it's on. 'Critical' and 'High' need attention first."
        watch="Click '✨ AI' on any alert for a plain-English explanation of what happened and exactly what to do about it."
      />

      {/* Severity summary tiles */}
      <div className="alert-tiles">
        <div className="alert-tile" style={{ borderLeft: '4px solid #90a4ae' }}>
          <span className="alert-tile-num">{summary.total}</span>
          <span className="alert-tile-label">Total</span>
        </div>
        {['high', 'medium', 'low'].map(sev => (
          <div key={sev} className="alert-tile" style={{ borderLeft: `4px solid ${SEV_COLORS[sev]}` }}>
            <span className="alert-tile-num">{summary.by_severity[sev] || 0}</span>
            <span className="alert-tile-label">{sev}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="alert-filters">
        {['all', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            className={`alert-filter-btn ${severityFilter === f ? 'active' : ''}`}
            onClick={() => { setSeverityFilter(f); setPage(0); }}
          >{f}</button>
        ))}
      </div>

      <Paper style={{ backgroundColor: "#263043", color: "#fff" }} sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table stickyHeader aria-label="alerts table">
            <TableHead>
              <TableRow>
                {['Severity', 'Time', 'Host', 'Alert', 'Description', 'MITRE', 'Status', 'Action'].map(h => (
                  <TableCell key={h} style={{ ...headStyle, minWidth: h === 'Description' ? 260 : 90 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody style={{ backgroundColor: "#263043" }}>
              {alerts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(a => (
                <React.Fragment key={a.id}>
                  <TableRow hover>
                    <TableCell style={cellStyle}><Chip text={a.severity} color={SEV_COLORS[a.severity] || '#90a4ae'} /></TableCell>
                    <TableCell style={cellStyle}>{fmt(a.ts)}</TableCell>
                    <TableCell style={cellStyle}>{a.hostname}</TableCell>
                    <TableCell style={{ ...cellStyle, fontWeight: 600 }}>{a.title}</TableCell>
                    <TableCell style={cellStyle}>{a.description}</TableCell>
                    <TableCell style={cellStyle}>
                      {a.mitre_technique
                        ? <a href={`https://attack.mitre.org/techniques/${a.mitre_technique}/`}
                             target="_blank" rel="noreferrer" style={{ color: '#64b5f6' }}>{a.mitre_technique}</a>
                        : '—'}
                      {a.standard_ref && <div className="std-ref-tag" title={a.standard_ref}>🚗 {a.standard_ref.split(';')[0]}</div>}
                    </TableCell>
                    <TableCell style={cellStyle}><Chip text={a.status} color={STATUS_COLORS[a.status] || '#90a4ae'} /></TableCell>
                    <TableCell style={cellStyle}>
                      {aiEnabled && (
                        <button className="ack-btn ai" onClick={() => openAiModal(a)}>
                          {aiText[a.id] || a.ai_summary ? '🛡️ View' : '✨ AI'}
                        </button>
                      )}
                      {a.status === 'open' && (
                        <button className="ack-btn" onClick={() => acknowledge(a.id, 'acknowledged')}>Ack</button>
                      )}
                      {a.status !== 'resolved' && (
                        <button className="ack-btn resolve" onClick={() => acknowledge(a.id, 'resolved')}>Resolve</button>
                      )}
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
              {alerts.length === 0 && (
                <TableRow><TableCell style={cellStyle} colSpan={8}>No alerts. Run the detector: <code>docker compose run --rm detector</code></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[25, 50, 100]}
          component="div"
          count={alerts.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(+e.target.value); setPage(0); }}
          style={{ color: "#fff" }}
        />
      </Paper>

      {/* AI SOC Analyst modal */}
      {modalId && (() => {
        const alert = alerts.find(x => x.id === modalId);
        if (!alert) return null;
        const text = aiText[modalId] || alert.ai_summary;
        const loading = aiLoading[modalId];
        const parsed = parseAnalysis(text);
        return (
          <div className="ai-modal-overlay" onClick={() => setModalId(null)}>
            <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ai-modal-header">
                <div>
                  <div className="ai-modal-eyebrow">🛡️ AI SOC Analyst</div>
                  <div className="ai-modal-title">{alert.title}</div>
                  <div className="ai-modal-sub">
                    <Chip text={alert.severity} color={SEV_COLORS[alert.severity] || '#90a4ae'} />
                    <span>{alert.hostname}</span>
                    <span>{fmt(alert.ts)}</span>
                  </div>
                </div>
                <button className="ai-modal-close" onClick={() => setModalId(null)}>×</button>
              </div>

              <div className="ai-modal-body">
                {loading && (
                  <div className="ai-loading">
                    <div className="ai-spinner" />
                    <span>Analyzing telemetry with the SOC model…</span>
                  </div>
                )}
                {!loading && parsed && parsed.raw && (
                  <pre className="ai-raw">{parsed.raw}</pre>
                )}
                {!loading && parsed && !parsed.raw && (
                  <>
                    {parsed.assessment && (
                      <div className="ai-section">
                        <div className="ai-section-label">Assessment</div>
                        <div className="ai-section-text">{parsed.assessment}</div>
                      </div>
                    )}
                    {parsed.mitre && (
                      <div className="ai-section">
                        <div className="ai-section-label">MITRE ATT&CK</div>
                        <div className="ai-section-text">{parsed.mitre}</div>
                      </div>
                    )}
                    {alert.standard_ref && (
                      <div className="ai-section">
                        <div className="ai-section-label">🚗 Automotive standard</div>
                        <div className="ai-section-text">{alert.standard_ref}</div>
                      </div>
                    )}
                    {parsed.action && (
                      <div className="ai-section action">
                        <div className="ai-section-label">Recommended action</div>
                        <div className="ai-section-text">{parsed.action}</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="ai-modal-footer">
                <button className="ai-modal-btn ghost" disabled={loading}
                  onClick={() => runExplain(modalId)}>Re-analyze</button>
                <button className="ai-modal-btn" onClick={() => setModalId(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}
    </main>
  );
};

export default Alerts;
