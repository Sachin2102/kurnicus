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

const columns = [
  { id: 'listing', label: 'Listing', minWidth: 100 },
  { id: 'PID', label: 'PID', minWidth: 100 },
  { id: 'USER', label: 'USER', minWidth: 100 },
  { id: 'PR', label: 'PR', minWidth: 100 },
  { id: 'NI', label: 'NI', minWidth: 100 },
  { id: 'VIRT', label: 'VIRT', minWidth: 100 },
  { id: 'RES', label: 'RES', minWidth: 100 },
  { id: 'SHR', label: 'SHR', minWidth: 100 },
  { id: 'S', label: 'S', minWidth: 100 },
  { id: '%CPU', label: '%CPU', minWidth: 100 },
  { id: '%MEM', label: '%MEM', minWidth: 100 },
  { id: 'TIME+', label: 'TIME+', minWidth: 100 },
  { id: 'COMMAND', label: 'COMMAND', minWidth: 100 },
];

const LiveProcessLogs = () => {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  useEffect(() => {
    axios.get(`${API_BASE}/liveprocess_logs`)
      .then(response => {
        setLogs(response.data.logs.reverse());
      })
      .catch(error => {
        console.error('Error fetching live process logs:', error);
      });
  }, []);

  // Human-readable summary.
  const flagged = logs.filter(l => l.listing === 'BLACKLISTED').length;
  const topProcs = [...logs]
    .sort((a, b) => (parseFloat(b['%CPU']) || 0) - (parseFloat(a['%CPU']) || 0))
    .slice(0, 8);
  const barOptions = {
    chart: { type: 'bar', toolbar: { show: false }, foreColor: '#9fb3c8' },
    series: [{ name: 'CPU %', data: topProcs.map(p => Math.round((parseFloat(p['%CPU']) || 0) * 10) / 10) }],
    xaxis: { categories: topProcs.map(p => `${p.COMMAND} (${p.PID})`), labels: { formatter: v => `${v}%` } },
    plotOptions: { bar: { horizontal: true, distributed: true, borderRadius: 4 } },
    colors: topProcs.map(p => p.listing === 'BLACKLISTED' ? '#e53935' : '#2196f3'),
    dataLabels: { enabled: true, formatter: v => `${v}%`, style: { colors: ['#fff'] } },
    legend: { show: false },
    grid: { borderColor: '#3a4a63' },
    tooltip: {
      theme: 'dark',
      y: { formatter: (v, opts) => {
        const p = topProcs[opts.dataPointIndex];
        return `${v}% CPU — ${p.listing === 'BLACKLISTED' ? '⚠️ UNRECOGNIZED' : 'known-good'}`;
      } },
    },
  };
  const rowBg = (l) => l.listing === 'BLACKLISTED' ? 'rgba(229,57,53,0.14)' : 'transparent';

  return (
    <>
      <main className="main-container">
        <div className="main-title">
          <h2>Live Process Logs</h2>
        </div>
        <InfoBanner
          plain="These are the programs running on the device right now — like the Task Manager on your PC."
          what="Each row is a running program with how much CPU and memory it uses. 'Whitelisted' = known-good, 'Blacklisted' = unrecognized."
          watch="A 'Blacklisted' program, or one using unusually high CPU, may be malware — for example a hidden crypto-miner."
        />

        <AiInsights context="programs (processes) running on a monitored device"
          summary={{ programs_running: logs.length, unrecognized_flagged: flagged, busiest_program: topProcs[0] ? `${topProcs[0].COMMAND} at ${parseFloat(topProcs[0]['%CPU']).toFixed(0)}% CPU` : 'n/a' }} />

        <div className={`viz-summary ${flagged > 0 ? 'alert' : 'ok'}`}>
          <b>{flagged}</b> of <b>{logs.length}</b> running programs are unrecognized — {flagged > 0 ? 'check the red bars below; a program running near 100% CPU may be malware.' : 'all programs are known-good.'}
        </div>

        <div className="viz-cards">
          <div className="viz-card">
            <div className="viz-card-value">{logs.length}</div>
            <div className="viz-card-label">Programs running</div>
          </div>
          <div className={`viz-card ${flagged > 0 ? 'bad' : 'good'}`}>
            <div className="viz-card-value">{flagged}</div>
            <div className="viz-card-label">Unrecognized (flagged)</div>
            <span className={`viz-status ${flagged > 0 ? 'bad' : 'good'}`}>{flagged > 0 ? 'Needs review' : 'All clear'}</span>
          </div>
          <div className="viz-card">
            <div className="viz-card-value">{topProcs[0] ? `${parseFloat(topProcs[0]['%CPU']).toFixed(0)}` : '—'}<small>%</small></div>
            <div className="viz-card-label">Busiest program uses this much CPU</div>
          </div>
        </div>

        <div className="viz-chart-card">
          <div className="viz-chart-title">Which programs are working hardest? (red = unrecognized / possible threat)</div>
          {topProcs.length > 0 && <ApexChart options={barOptions} height={320} />}
        </div>

        <div className="viz-chart-title" style={{ marginBottom: 10 }}>All running programs (unrecognized ones highlighted red)</div>
        <Paper style={{ backgroundColor: "#263043", color: "#fff" }} sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align="center"
                      style={{ minWidth: column.minWidth, backgroundColor: "#263043", borderBottom: "1px solid #656669", color: "#fff" }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody style={{ backgroundColor: "#263043" }}>
                {logs
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row, index) => (
                    <TableRow hover role="checkbox" tabIndex={-1} key={index} style={{ backgroundColor: rowBg(row) }}>
                      {columns.map((column) => {
                        const value = row[column.id];
                        const isListing = column.id === 'listing';
                        const bad = row.listing === 'BLACKLISTED';
                        return (
                          <TableCell style={{ borderBottom: "1px solid #656669", color: isListing ? (bad ? '#ff8a8a' : '#7bd88f') : "#fff", fontWeight: isListing ? 700 : 400 }} key={column.id} align="center">
                            {isListing ? (bad ? '⚠ Unrecognized' : '✓ Known-good') : value}
                          </TableCell>
                        );
                      })}
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
      </main>
    </>
  )
}

export default LiveProcessLogs