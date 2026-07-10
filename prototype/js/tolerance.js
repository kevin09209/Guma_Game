/* ============================================================
   tolerance.js — 女主忍受條
   ============================================================ */

export const TOLERANCE_MAX = 100;
export const TOLERANCE_EMERGENCY_THRESHOLD = 0;

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function deltaFromEffects(effects = {}) {
  const bad =
    Math.max(0, effects.awkwardness || 0) * 4 +
    Math.max(0, effects.social_death || 0) * 5 +
    Math.max(0, -(effects.favorability || 0)) * 5 +
    Math.max(0, -(effects.sincerity || 0)) * 4;
  const good =
    Math.max(0, effects.favorability || 0) * 1.5 +
    Math.max(0, effects.sincerity || 0) * 1.8 +
    Math.max(0, effects.comedy || 0) * 0.25 +
    Math.max(0, effects.confidence || 0) * 0.2;
  return Math.round(good - bad);
}

export function applyTolerance(current, effects = {}) {
  const next = clamp(current + deltaFromEffects(effects), 0, TOLERANCE_MAX);
  return {
    value: next,
    emergency: next <= TOLERANCE_EMERGENCY_THRESHOLD,
  };
}

export function renderTolerance(value, $) {
  const widget = $("heroine-tolerance");
  const fill = $("tolerance-fill");
  const label = $("tolerance-value");
  if (!widget || !fill || !label) return;
  label.textContent = `${value}%`;
  fill.style.width = `${value}%`;
  widget.classList.toggle("warn", value <= 35 && value > 0);
  widget.classList.toggle("danger", value <= 0);
}
