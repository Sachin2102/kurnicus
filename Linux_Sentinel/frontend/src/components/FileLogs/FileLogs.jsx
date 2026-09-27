import React, { useState, useEffect } from 'react';
import "../NetworkLogs/NetworkLogs.css"
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
import AiInsights from '../AiInsights/AiInsights';
import "../viz.css"

const columns = [
  { id: 'timestamp', label: 'Timestamp', minWidth: 200 },
  { id: 'user', label: 'User', minWidth: 150 },
  { id: 'group', label: 'Group', minWidth: 150 },
  { id: 'event', label: 'Event', minWidth: 150 },
  { id: 'file', label: 'File', minWidth: 250 },
  { id: 'listing', label: 'Blacklist/Whitelist', minWidth: 250 },
];

const FileLogs = () => {

  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get(`${API_BASE}/file_logs`);
        setLogs(response.data.logs.reverse());
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };
    fetchLogs();
  }, []);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  const flagged = logs.filter(l => l.listing === 'Blacklist').length;
  const users = new Set(logs.map(l => l.user).filter(Boolean)).size;
  const isBad = (l) => l.listing === 'Blacklist';

  return (
    <>
      <main className="main-container">
        <div className="main-title">
          <h2>File Logs</h2>
        </div>
        <InfoBanner
          plain="This tracks which important files were opened on the device, and by which user."
          what="Each row is a file access event: when it happened, who did it, and which file."
          watch="Access to sensitive files (like the system password file) by an unexpected user can signal a break-in."
        />

        <AiInsights context="file access events on a monitored device"
          summary={{ total_accesses: logs.length, suspicious_accesses: flagged, users_involved: users }} />

        <div className={`viz-summary ${flagged > 0 ? 'alert' : 'ok'}`}>
          <b>{flagged}</b> of <b>{logs.length}</b> file accesses looked suspicious — {flagged > 0 ? 'review who accessed sensitive files in the red rows below.' : 'no risky file access was seen.'}
        </div>

        <div className="viz-cards">
          <div className="viz-card">
            <div className="viz-card-value">{logs.length}</div>
            <div className="viz-card-label">File accesses recorded</div>
          </div>
          <div className={`viz-card ${flagged > 0 ? 'bad' : 'good'}`}>
            <div className="viz-card-value">{flagged}</div>
            <div className="viz-card-label">Sensitive / suspicious accesses</div>
            <span className={`viz-status ${flagged > 0 ? 'bad' : 'good'}`}>{flagged > 0 ? 'Investigate' : 'All clear'}</span>
          </div>
          <div className="viz-card">
            <div className="viz-card-value">{users}</div>
            <div className="viz-card-label">Different users involved</div>
          </div>
        </div>

        <div className="viz-chart-title" style={{ marginBottom: 10 }}>File access log (suspicious accesses highlighted red)</div>
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
                    const bad = isBad(row);
                    return (
                      <TableRow hover role="checkbox" tabIndex={-1} key={index} style={{ backgroundColor: bad ? 'rgba(229,57,53,0.14)' : 'transparent' }}>
                        {columns.map((column) => {
                          const value = row[column.id];
                          if (column.id === 'listing') {
                            return (
                              <TableCell style={{ borderBottom: "1px solid #656669", color: bad ? '#ff8a8a' : '#7bd88f', fontWeight: 700 }} key={column.id} align="left">
                                {bad ? '⚠ Suspicious' : '✓ Normal'}
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell style={{ borderBottom: "1px solid #656669", color: "#fff" }} key={column.id} align="left">
                              {value ? value : 'N/A'}
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
      </main>
    </>
  )
}

export default FileLogs