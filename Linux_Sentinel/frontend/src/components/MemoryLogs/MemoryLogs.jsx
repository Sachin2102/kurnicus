import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config';
import InfoBanner from '../InfoBanner/InfoBanner';
import ApexChart from '../Chart/ApexChart';
import AiInsights from '../AiInsights/AiInsights';
import "../NetworkLogs/NetworkLogs.css"
import "../viz.css"
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';

const MemoryLogs = () => {

  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [logs, setLogs] = useState([]);
  const [showRaw, setShowRaw] = useState(false);

  // Turn the raw rows into something a human can read at a glance.
  const usedSeries = logs
    .map(l => parseFloat(l['%memused']))
    .filter(v => Number.isFinite(v));
  const latest = usedSeries.length ? usedSeries[usedSeries.length - 1] : null;
  const peak = usedSeries.length ? Math.max(...usedSeries) : null;
  const avg = usedSeries.length ? usedSeries.reduce((a, b) => a + b, 0) / usedSeries.length : null;

  const statusOf = (v) => v == null ? { k: '', t: '—' }
    : v < 70 ? { k: 'good', t: 'Healthy' }
    : v < 90 ? { k: 'warn', t: 'Elevated' }
    : { k: 'bad', t: 'Critical' };
  const status = statusOf(latest);

  const chartOptions = {
    chart: { type: 'area', toolbar: { show: false }, foreColor: '#9fb3c8', animations: { enabled: true } },
    series: [{ name: 'Memory used %', data: usedSeries.map(v => Math.round(v * 10) / 10) }],
    xaxis: { labels: { show: false }, axisTicks: { show: false }, axisBorder: { show: false } },
    yaxis: { min: 0, max: 100, labels: { formatter: v => `${Math.round(v)}%` } },
    stroke: { curve: 'smooth', width: 2 },
    colors: ['#2196f3'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    grid: { borderColor: '#3a4a63' },
    tooltip: { theme: 'dark', y: { formatter: v => `${v}% of RAM in use` } },
  };

  useEffect(() => {
    const fetchMemoryLogs = async () => {
      try {
        const response = await axios.get(`${API_BASE}/memory_logs`);
        setLogs(response.data.logs.reverse());
      } catch (error) {
        console.error('Error fetching memory logs:', error);
      }
    };

    fetchMemoryLogs();
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  return (
    <>
      <main className="main-container">
        <div className="main-title">
          <h2>Memory Logs</h2>
        </div>
        <InfoBanner
          plain="This is the device's short-term memory (RAM) — the workspace it uses to run programs right now."
          what="Each row is a snapshot over time showing how much memory is free, used, and cached."
          watch="Memory that keeps climbing toward 100%, or sudden spikes, can mean a runaway or malicious program."
        />

        <AiInsights context="device memory (RAM) usage"
          summary={{ current_percent_used: latest != null ? latest.toFixed(0) : 'n/a', average_percent: avg != null ? avg.toFixed(0) : 'n/a', peak_percent: peak != null ? peak.toFixed(0) : 'n/a' }} />

        {latest != null && (
          <div className={`viz-summary ${status.k === 'bad' ? 'alert' : 'ok'}`}>
            Right now <b>{latest.toFixed(0)}%</b> of memory is in use — {status.t === 'Healthy' ? 'plenty of headroom, nothing to do.' : status.t === 'Elevated' ? 'a little high; keep an eye on it in case it keeps climbing.' : 'very high — close programs you are not using, or restart the device.'}
          </div>
        )}

        {/* At-a-glance status */}
        <div className="viz-cards">
          <div className={`viz-card ${status.k}`}>
            <div className="viz-card-value">{latest != null ? latest.toFixed(0) : '—'}<small>%</small></div>
            <div className="viz-card-label">Memory in use right now</div>
            <span className={`viz-status ${status.k}`}>{status.t}</span>
          </div>
          <div className="viz-card">
            <div className="viz-card-value">{avg != null ? avg.toFixed(0) : '—'}<small>%</small></div>
            <div className="viz-card-label">Average over this period</div>
          </div>
          <div className={`viz-card ${statusOf(peak).k}`}>
            <div className="viz-card-value">{peak != null ? peak.toFixed(0) : '—'}<small>%</small></div>
            <div className="viz-card-label">Highest it reached (peak)</div>
          </div>
        </div>

        {/* Trend over time */}
        <div className="viz-chart-card">
          <div className="viz-chart-title">Memory usage over time — is it steady, or climbing?</div>
          {usedSeries.length > 0 && <ApexChart options={chartOptions} height={260} />}
        </div>

        <button className="viz-section-toggle" onClick={() => setShowRaw(s => !s)}>
          {showRaw ? '▾ Hide detailed numbers' : '▸ Show detailed numbers (for technical users)'}
        </button>

        {showRaw && (
        <Paper style={{ backgroundColor: "#263043", color: "#fff" }} sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>Time</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbmemfree</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbavail</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbmemused</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>%memused</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbbuffers</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbcached</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbcommit</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>%commit</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbactive</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbinact</TableCell>
                  <TableCell style={{ minWidth: 170, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}>kbdirty</TableCell>
                </TableRow>
              </TableHead>
              <TableBody style={{ backgroundColor: "#263043" }}>
                {logs
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((log, index) => (
                    <TableRow hover role="checkbox" tabIndex={-1} key={index}>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.time}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbmemfree}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbavail}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbmemused}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log['%memused']}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbbuffers}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbcached}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbcommit}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log['%commit']}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbactive}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbinact}</TableCell>
                      <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }}>{log.kbdirty}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 100]}
            component="div"
            count={logs.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            style={{ color: "#fff" }}
          />
        </Paper>
        )}
      </main>
    </>
  )
}

export default MemoryLogs