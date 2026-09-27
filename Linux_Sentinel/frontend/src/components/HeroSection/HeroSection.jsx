import React, { useEffect, useState } from 'react';
import ApexCharts from 'apexcharts';
import "./HeroSection.css";
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../../config';
import InfoBanner from '../InfoBanner/InfoBanner';
import ApexChart from '../Chart/ApexChart';
import "../viz.css";
import "../ActionCenter/ActionCenter.css";
import BlockIcon from '@mui/icons-material/Block';

const SEV_COLORS = { critical: '#7b1fa2', high: '#e53935', medium: '#fb8c00', low: '#43a047' };
import VerifiedIcon from '@mui/icons-material/Verified';
import ReportIcon from '@mui/icons-material/Report';

const HeroSection = () => {

  const [blacklistedCounts, setBlacklistedCounts] = useState({ network: 0, file: 0, liveprocess: 0 });
  const [whitelistedCounts, setWhitelistedCounts] = useState({ network: 0, file: 0, liveprocess: 0 });
  const [alertCount, setAlertCount] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [recs, setRecs] = useState([]);
  const [updated, setUpdated] = useState(null);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [networkResponse, fileResponse, liveprocessResponse, alertsResponse, metricsResponse, healthResponse, recsResponse] = await Promise.all([
          axios.get(`${API_BASE}/network_logs`),
          axios.get(`${API_BASE}/file_logs`),
          axios.get(`${API_BASE}/liveprocess_logs`),
          axios.get(`${API_BASE}/api/alerts/summary`),
          axios.get(`${API_BASE}/api/metrics`),
          axios.get(`${API_BASE}/api/health-score`),
          axios.get(`${API_BASE}/api/recommendations`)
        ]);
        setAlertCount(alertsResponse.data.total || 0);
        setMetrics(metricsResponse.data);
        setHealth(healthResponse.data);
        setRecs(recsResponse.data.recommendations || []);

        const networkBlacklistedCount = networkResponse.data.blacklisted_count || 0;
        const networkWhitelistedCount = networkResponse.data.whitelisted_count || 0;

        const fileBlacklistedCount = fileResponse.data.blacklisted_count || 0;
        const fileWhitelistedCount = fileResponse.data.whitelisted_count || 0;

        const liveprocessBlacklistedCount = liveprocessResponse.data.blacklisted_count || 0;
        const liveprocessWhitelistedCount = liveprocessResponse.data.whitelisted_count || 0;

        setBlacklistedCounts({
          network: networkBlacklistedCount,
          file: fileBlacklistedCount,
          liveprocess: liveprocessBlacklistedCount
        });

        setWhitelistedCounts({
          network: networkWhitelistedCount,
          file: fileWhitelistedCount,
          liveprocess: liveprocessWhitelistedCount
        });
        setUpdated(new Date());
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };

    fetchCounts();
    const t = setInterval(fetchCounts, 10000); // live-updating dashboard
    return () => clearInterval(t);
  }, []);

  const handleDownloadLogs = () => {
    axios.get(`${API_BASE}/download_all_files`, { responseType: 'blob' })
      .then(response => {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'myzipfile.zip');
        document.body.appendChild(link);
        link.click();
      })
      .catch(error => {
        console.error('Error downloading logs:', error);
      });
  };



  return (
    <main className="main-container">
      <div className="main-title">
        <h2>DASHBOARD</h2>
        {updated && <span style={{ fontSize: 12, color: '#7bd88f', fontWeight: 600, alignSelf: 'center' }}>● live · updated {updated.toLocaleTimeString()}</span>}
      </div>

      <InfoBanner
        plain="This is the health-and-safety overview for all your monitored devices — at a glance, is everything okay?"
        what="'Suspicious' is activity we flagged as risky, 'Verified safe' is normal activity, and 'Alerts' are threats that need a person to look."
        watch="If the Alerts number is climbing, open the Alerts page and start with the red 'Critical' ones."
      />

      {health && (() => {
        const color = health.score >= 85 ? '#43a047' : health.score >= 60 ? '#fb8c00' : '#e53935';
        const gauge = {
          chart: { type: 'radialBar', sparkline: { enabled: true } },
          series: [health.score],
          colors: [color],
          plotOptions: { radialBar: {
            hollow: { size: '60%' },
            track: { background: '#1c2636' },
            dataLabels: {
              name: { show: true, color: '#9fb3c8', fontSize: '13px', offsetY: 22 },
              value: { color: '#fff', fontSize: '38px', fontWeight: 800, offsetY: -12, formatter: v => `${Math.round(v)}` },
            },
          } },
          labels: [health.grade],
          stroke: { lineCap: 'round' },
        };
        return (
          <div className="health-panel">
            <div className="health-gauge">
              <ApexChart options={gauge} height={200} />
            </div>
            <div className="health-body">
              <div className="health-title">Security Health Score</div>
              <div className="health-desc">
                {health.score >= 85
                  ? `Your ${health.hosts} device${health.hosts === 1 ? '' : 's'} look healthy — no urgent issues. Keep monitoring.`
                  : health.score >= 60
                  ? `Some attention needed: ${health.open_critical} critical and ${health.open_high} high issues are open. Open the Action Center to work through them.`
                  : `Action required now: ${health.open_critical} critical and ${health.open_high} high-priority threats are open across ${health.hosts} device${health.hosts === 1 ? '' : 's'}. Go to the Action Center for a step-by-step to-do list.`}
              </div>
              <div className="health-factors">
                <span className="hf crit">{health.open_critical} critical</span>
                <span className="hf high">{health.open_high} high</span>
                <span className="hf med">{health.open_medium} medium</span>
                <span className="hf">{health.suspicious_percent}% activity looked suspicious</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="main-cards">

        <div className="card">
          <div className="card-inner">
            <h3>Suspicious</h3>
            <BlockIcon style={{ fontSize: "45px" }} />
          </div>
          <h1>{blacklistedCounts.network + blacklistedCounts.file + blacklistedCounts.liveprocess}</h1>
          <p className="card-sub">Activity we flagged as risky</p>
        </div>

        <div className="card">
          <div className="card-inner">
            <h3>Verified safe</h3>
            <VerifiedIcon style={{ fontSize: "45px" }} />
          </div>
          <h1>{whitelistedCounts.network + whitelistedCounts.file + whitelistedCounts.liveprocess}</h1>
          <p className="card-sub">Known-good, normal activity</p>
        </div>

        <div className="card">
          <div className="card-inner">
            <h3>Alerts</h3>
            <ReportIcon style={{ fontSize: "50px" }} />
          </div>
          <h1>{alertCount}</h1>
          <p className="card-sub">Threats needing attention</p>
        </div>

      </div>

      {metrics && metrics.events_scored > 0 && (
        <div className="rt-metrics">
          <div className="rt-metric">
            <span className="rt-value">{metrics.avg_latency_ms ?? '—'}<small>ms</small></span>
            <span className="rt-label">Avg time to catch a threat</span>
          </div>
          <div className="rt-metric">
            <span className="rt-value">{metrics.p95_latency_ms ?? '—'}<small>ms</small></span>
            <span className="rt-label">Even the slowest cases</span>
          </div>
          <div className="rt-metric">
            <span className="rt-value">{(metrics.events_scored || 0).toLocaleString()}</span>
            <span className="rt-label">Security checks run</span>
          </div>
          <div className="rt-metric">
            <span className="rt-value">{metrics.events_last_60s || 0}</span>
            <span className="rt-label">Checks in the last minute</span>
          </div>
        </div>
      )}

      {/* What needs your attention (merged from Action Center) */}
      <h2 className="dash-section-title">What needs your attention</h2>
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

      <Link className='download_logs'>
        <button className="button-87" onClick={handleDownloadLogs} role="button">Download All Logs</button>
      </Link>

    </main>
  );
}

export default HeroSection;
