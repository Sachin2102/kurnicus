import React from 'react';
import './InfoBanner.css';

// Plain-language explainer shown at the top of each monitoring page so a
// non-technical reader understands what the data means and what's worrying.
const InfoBanner = ({ what, watch, plain }) => (
  <div className="info-banner">
    <span className="info-banner-icon">💡</span>
    <div className="info-banner-text">
      <div><span className="info-banner-key">In plain English:</span> {plain}</div>
      {what && <div><span className="info-banner-key">What you're seeing:</span> {what}</div>}
      {watch && <div className="info-banner-watch"><span className="info-banner-key">Red flags:</span> {watch}</div>}
    </div>
  </div>
);

export default InfoBanner;
