-- Automotive support: map alerts to automotive cybersecurity standards
-- (ISO/SAE 21434, UN Regulation No. 155). Surfaced in the UI as a compliance
-- reference next to the MITRE technique.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS standard_ref TEXT;
