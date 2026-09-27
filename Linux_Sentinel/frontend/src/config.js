// Central API base URL. Override at build/dev time with VITE_API_URL.
// Defaults to the new Kurnicus FastAPI backend (platform/api) on port 8000.
export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
