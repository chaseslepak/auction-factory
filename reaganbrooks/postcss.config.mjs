// Local PostCSS config so the parent repo's Tailwind config is not
// inherited via PostCSS's upward search. No plugins needed in v1 — the
// brand uses hand-written CSS without any utility framework.
const config = {
  plugins: {},
};

export default config;
