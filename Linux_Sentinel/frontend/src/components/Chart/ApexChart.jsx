import React, { useRef, useEffect } from 'react';
import ApexCharts from 'apexcharts';

// Thin React wrapper around vanilla ApexCharts (no extra dependency needed).
// Re-renders when the options change.
const ApexChart = ({ options, height = 260 }) => {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    inst.current = new ApexCharts(ref.current, { ...options, chart: { ...options.chart, height } });
    inst.current.render();
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options), height]);

  return <div ref={ref} />;
};

export default ApexChart;
