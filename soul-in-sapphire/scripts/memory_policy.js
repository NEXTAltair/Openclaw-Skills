// Ambient recall is a distinct Soul experience-memory path, not replaced by
// OpenClaw's relevance-triggered recall. Preserve it unless explicitly paused.
export function ambientEnabled(env = process.env) {
  const value = env.SIS_AMBIENT_RECALL;
  if (value === undefined || value === '' || value === '1') return true;
  if (value === '0') return false;
  throw new Error('SIS_AMBIENT_RECALL must be 0 or 1');
}
