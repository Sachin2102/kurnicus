import React, { useState, useEffect } from 'react';
import "./NetworkLogs.css"
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import axios from 'axios';
import { API_BASE } from '../../config';
import InfoBanner from '../InfoBanner/InfoBanner';
import ApexChart from '../Chart/ApexChart';
import AiInsights from '../AiInsights/AiInsights';
import "../viz.css"

// Instant, built-in explanation for a suspicious connection (no AI needed).
const COMMON_SAFE_PORTS = { '443': 'secure web (HTTPS)', '80': 'web (HTTP)', '53': 'DNS lookups', '22': 'secure shell (SSH)', '123': 'time sync (NTP)' };
function explainNetworkRow(row) {
  const dst = row['ip.dst'];
  const port = (row['tcp.dstport'] && row['tcp.dstport'] !== 'N/A') ? row['tcp.dstport'] : row['udp.dstport'];
  const portUse = COMMON_SAFE_PORTS[port];
  return {
    what: `This device (${row['ip.src']}) opened a network connection to ${dst} on port ${port}.`,
    why: `The address ${dst} is not on this device's list of known-safe destinations${portUse ? '' : `, and port ${port} is not a normal everyday port`}. Unexpected outbound connections like this are a common sign of malware "calling home", data being stolen, or a remote attacker in control.`,
    how: [
      `Do you recognize ${dst}? If it's a service this device should talk to, mark it safe.`,
      `If you don't recognize it, block ${dst} on your router/firewall.`,
      `Check the "Live Process Logs" tab to find which program opened it — stop it if it's unknown.`,
      `If this device holds sensitive data, disconnect it from the network until reviewed.`,
    ],
  };
}

const columns = [
    { id: 'frame.number', label: 'Frame Number', minWidth: 100 },
    { id: 'frame.date', label: 'Frame Date', minWidth: 200 },
    { id: 'ip.src', label: 'Source IP', minWidth: 150 },
    { id: 'ip.dst', label: 'Destination IP', minWidth: 150 },
    { id: 'tcp.srcport', label: 'TCP Source Port', minWidth: 150 },
    { id: 'tcp.dstport', label: 'TCP Destination Port', minWidth: 150 },
    { id: 'udp.srcport', label: 'UDP Source Port', minWidth: 150 },
    { id: 'udp.dstport', label: 'UDP Destination Port', minWidth: 150 },
    { id: 'frame.len', label: 'Frame Length', minWidth: 150 },
    { id: 'frame.protocols', label: 'Frame Protocols', minWidth: 200 },
    { id: 'listing', label: 'Listing', minWidth: 150 },
];


const NetworkLogs = () => {
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [logs, setLogs] = useState([]);
    const [counts, setCounts] = useState({ blacklisted: 0, whitelisted: 0 });
    const [detailRow, setDetailRow] = useState(null);

    useEffect(() => {
        axios.get(`${API_BASE}/network_logs`)
            .then(response => {
                setCounts({
                    blacklisted: response.data.blacklisted_count || 0,
                    whitelisted: response.data.whitelisted_count || 0,
                });
                const updatedLogs = response.data.logs.map(log => {
                    const dateString = log['frame.time'];
                    // JS Date parses formats like "Sep 25, 2026 02:44:29" directly.
                    const date = dateString ? new Date(dateString) : null;
                    const formattedDate = (date && !isNaN(date)) ? `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${(date.getFullYear() % 100).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}` : (dateString || 'N/A');

                    return {
                        ...log,
                        'frame.date': formattedDate,
                        'frame.number': log['frame.number'] || 'N/A',
                        'ip.src': log['ip.src'] || 'N/A',
                        'ip.dst': log['ip.dst'] || 'N/A',
                        'tcp.srcport': log['tcp.srcport'] || 'N/A',
                        'tcp.dstport': log['tcp.dstport'] || 'N/A',
                        'udp.srcport': log['udp.srcport'] || 'N/A',
                        'udp.dstport': log['udp.dstport'] || 'N/A',
                        'frame.len': log['frame.len'] || 'N/A',
                        'frame.protocols': log['frame.protocols'] || 'N/A',
                        'listing': log['listing'] || 'N/A',
                    };
                });
                setLogs(updatedLogs.reverse());
            })
            .catch(error => console.error('Error fetching network logs:', error));
    }, []);


    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(+event.target.value);
        setPage(0);
    };

    const totalConns = counts.blacklisted + counts.whitelisted;
    const uniqueDsts = new Set(logs.map(l => l['ip.dst']).filter(v => v && v !== 'N/A')).size;
    const donutOptions = {
        chart: { type: 'donut', foreColor: '#9fb3c8' },
        series: [counts.whitelisted, counts.blacklisted],
        labels: ['Safe / known', 'Suspicious'],
        colors: ['#43a047', '#e53935'],
        legend: { position: 'bottom' },
        dataLabels: { enabled: true, formatter: v => `${Math.round(v)}%` },
        stroke: { colors: ['#263043'] },
        tooltip: { theme: 'dark', y: { formatter: v => `${v} connections` } },
        plotOptions: { pie: { donut: { labels: { show: true, total: { show: true, label: 'Total', color: '#cdd9e5' } } } } },
    };

    return (
        <>
            <main className="main-container">
                <div className="main-title">
                    <h2>Network Logs</h2>
                </div>
                <InfoBanner
                  plain="This is a phone log of every network conversation the device had — who it contacted and how."
                  what="Each row is one connection: the source device, the destination address, and the ports/protocol used."
                  watch="Connections to unknown or foreign addresses (marked 'Blacklisted') can mean data theft or malware calling home."
                />

                <AiInsights context="network connections from a monitored device"
                  summary={{ total_connections: totalConns, suspicious_connections: counts.blacklisted, unique_destinations: uniqueDsts }} />

                <div className={`viz-summary ${counts.blacklisted > 0 ? 'alert' : 'ok'}`}>
                    <b>{counts.blacklisted}</b> of <b>{totalConns}</b> connections looked suspicious — {counts.blacklisted > 0 ? "review the red rows below (click 'Why?') and block any address you don't recognize." : 'everything looks normal.'}
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 20 }}>
                    <div className="viz-cards" style={{ flex: 1, margin: 0, flexDirection: 'column', minWidth: 220 }}>
                        <div className="viz-card">
                            <div className="viz-card-value">{totalConns.toLocaleString()}</div>
                            <div className="viz-card-label">Network connections seen</div>
                        </div>
                        <div className={`viz-card ${counts.blacklisted > 0 ? 'bad' : 'good'}`}>
                            <div className="viz-card-value">{counts.blacklisted}</div>
                            <div className="viz-card-label">Suspicious connections</div>
                            <span className={`viz-status ${counts.blacklisted > 0 ? 'bad' : 'good'}`}>{counts.blacklisted > 0 ? 'Review these' : 'All clear'}</span>
                        </div>
                        <div className="viz-card">
                            <div className="viz-card-value">{uniqueDsts}</div>
                            <div className="viz-card-label">Different destinations contacted</div>
                        </div>
                    </div>
                    <div className="viz-chart-card" style={{ flex: 1, margin: 0, minWidth: 280 }}>
                        <div className="viz-chart-title">Safe vs. suspicious connections</div>
                        {totalConns > 0 && <ApexChart options={donutOptions} height={300} />}
                    </div>
                </div>

                <Paper style={{ backgroundColor: "#263043", color: "#fff" }} sx={{ width: '100%', overflow: 'hidden' }}>
                    <TableContainer sx={{ maxHeight: 440 }}>
                        <Table stickyHeader aria-label="sticky table">
                            <TableHead>
                                <TableRow>
                                    {columns.map((column) => (
                                        <TableCell
                                            key={column.id}
                                            align="left"
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
                                    .map((row, index) => {
                                        const bad = row['listing'] === 'Blacklisted';
                                        return (
                                            <TableRow hover role="checkbox" tabIndex={-1} key={index} style={{ backgroundColor: bad ? 'rgba(229,57,53,0.14)' : 'transparent' }}>
                                                {columns.map((column) => {
                                                    const value = row[column.id];
                                                    if (column.id === 'listing') {
                                                        return (
                                                            <TableCell style={{ borderBottom: "1px solid #656669", color: bad ? '#ff8a8a' : '#7bd88f', fontWeight: 700 }} key={column.id} align="left">
                                                                {bad ? '⚠ Suspicious' : '✓ Safe'}
                                                                {bad && <button className="why-btn" onClick={() => setDetailRow(row)}>Why?</button>}
                                                            </TableCell>
                                                        );
                                                    }
                                                    return (
                                                        <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }} key={column.id} align="left">
                                                            {value}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        );
                                    })}
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

                {detailRow && (() => {
                    const ex = explainNetworkRow(detailRow);
                    return (
                        <div className="detail-overlay" onClick={() => setDetailRow(null)}>
                            <div className="detail-modal" onClick={(e) => e.stopPropagation()}>
                                <div className="detail-head">
                                    <span>⚠ Why is this suspicious?</span>
                                    <button className="detail-close" onClick={() => setDetailRow(null)}>×</button>
                                </div>
                                <div className="detail-body">
                                    <div className="detail-sec"><div className="detail-label">What happened</div><div>{ex.what}</div></div>
                                    <div className="detail-sec"><div className="detail-label">Why it's suspicious</div><div>{ex.why}</div></div>
                                    <div className="detail-sec"><div className="detail-label">How to handle it</div>
                                        <ul className="detail-list">{ex.how.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

            </main>
        </>
    )
}

export default NetworkLogs