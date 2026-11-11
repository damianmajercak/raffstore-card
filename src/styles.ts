import { css } from "lit";

export const cardStyles = css`
  :host {
    --rc-fg: var(--primary-text-color, #212121);
    --rc-bg: var(--card-background-color, var(--ha-card-background, #fff));
    --rc-accent: var(--primary-color, #03a9f4);
    --rc-tonal: color-mix(in srgb, var(--rc-fg) 6%, transparent);
    --rc-tonal-hover: color-mix(in srgb, var(--rc-fg) 11%, transparent);

    --rc-sky: var(--raffstore-glass-color, color-mix(in srgb, var(--rc-accent) 17%, var(--rc-bg)));
    --rc-hill-far: var(--raffstore-ground-color, color-mix(in srgb, var(--success-color, #43a047) 22%, var(--rc-sky)));
    --rc-hill-near: color-mix(in srgb, var(--success-color, #43a047) 38%, var(--rc-sky));
    --rc-sun: var(--amber-color, #ffc107);
    --rc-reveal: color-mix(in srgb, var(--rc-fg) 7%, var(--rc-bg));
    --rc-box: var(--raffstore-box-color, color-mix(in srgb, var(--rc-fg) 26%, var(--rc-bg)));
    --rc-guide: color-mix(in srgb, var(--rc-fg) 32%, var(--rc-bg));
    --rc-slat: var(--raffstore-slat-color, color-mix(in srgb, var(--rc-fg) 40%, var(--rc-bg)));
    --rc-slat-hi: color-mix(in srgb, var(--rc-slat) 55%, #fff);
    --rc-slat-lo: color-mix(in srgb, var(--rc-slat) 60%, #000);
    --rc-rail: var(--raffstore-rail-color, color-mix(in srgb, var(--rc-fg) 72%, var(--rc-bg)));
    --rc-target: var(--raffstore-target-color, var(--rc-accent));
    --rc-radius: 12px;
  }
  ha-card {
    padding: 16px;
    box-sizing: border-box;
    container: rc / inline-size;
  }

  /* header */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 16px;
    font-weight: 500;
    line-height: 22px;
    color: var(--rc-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .state {
    font-size: 13px;
    line-height: 18px;
    color: var(--secondary-text-color);
  }
  .state.moving {
    color: var(--rc-accent);
  }

  /* buttons */
  button {
    font: inherit;
    color: var(--rc-fg);
    background: var(--rc-tonal);
    border: none;
    border-radius: var(--rc-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms ease;
  }
  button:hover {
    background: var(--rc-tonal-hover);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
    background: var(--rc-tonal);
  }
  button:focus-visible,
  svg.ctl:focus-visible {
    outline: 2px solid var(--rc-accent);
    outline-offset: 2px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 5px 12px 5px 10px;
    font-size: 13px;
    white-space: nowrap;
  }
  .pill .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--secondary-text-color);
  }
  .pill.auto {
    background: color-mix(in srgb, var(--success-color, #43a047) 16%, transparent);
    color: var(--success-color, #43a047);
  }
  .pill.auto .dot {
    background: var(--success-color, #43a047);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .tab {
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 999px;
  }
  .tab.on {
    background: color-mix(in srgb, var(--rc-accent) 18%, transparent);
    color: var(--rc-accent);
  }

  /* illustration */
  .visual {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 3fr);
    gap: 14px;
    margin-top: 14px;
    align-items: start;
  }
  svg.ctl {
    width: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    border-radius: 10px;
  }
  svg.win {
    cursor: ns-resize;
  }
  svg.dial {
    cursor: grab;
  }
  svg.ctl:focus:not(:focus-visible) {
    outline: none;
  }
  svg.ctl.disabled {
    cursor: default;
    opacity: 0.5;
  }

  .reveal { fill: var(--rc-reveal); }
  .sky { fill: var(--rc-sky); }
  .sun { fill: var(--rc-sun); opacity: 0.9; }
  .hill-far { fill: var(--rc-hill-far); }
  .hill-near { fill: var(--rc-hill-near); }
  .slat { fill: var(--rc-slat); }
  .slat-hi { fill: var(--rc-slat-hi); }
  .slat-lo { fill: var(--rc-slat-lo); opacity: 0.55; }
  .rail { fill: var(--rc-rail); }
  .grip { fill: var(--rc-accent); }
  .guide { fill: var(--rc-guide); }
  .box { fill: var(--rc-box); }
  .box-shade { fill: var(--rc-slat-lo); opacity: 0.35; }
  .ghost-line {
    stroke: var(--rc-target);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .ghost-dot { fill: var(--rc-target); }

  .dial-side,
  .dial-num {
    font-size: 11px;
    fill: var(--secondary-text-color);
  }
  .cord {
    stroke: var(--rc-guide);
    stroke-width: 1;
    stroke-dasharray: 2 4;
  }
  .track {
    fill: none;
    stroke: var(--rc-tonal-hover);
    stroke-width: 8;
    stroke-linecap: round;
  }
  .track-fill {
    fill: none;
    stroke: color-mix(in srgb, var(--rc-accent) 45%, transparent);
    stroke-width: 8;
    stroke-linecap: round;
  }
  .tick {
    stroke: var(--secondary-text-color);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .slat-main,
  .slat-ctx,
  .slat-ghost {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .slat-main {
    stroke: var(--rc-rail);
    stroke-width: 6;
  }
  .slat-ctx {
    stroke: var(--rc-slat);
    stroke-width: 5;
    opacity: 0.55;
  }
  .slat-ghost {
    stroke: var(--rc-target);
    stroke-width: 2.5;
    stroke-dasharray: 4 4;
  }
  .pivot { fill: var(--rc-bg); stroke: var(--rc-rail); stroke-width: 2; }
  .handle {
    fill: var(--rc-accent);
    stroke: var(--rc-bg);
    stroke-width: 3;
  }
  .handle-ghost {
    fill: none;
    stroke: var(--rc-target);
    stroke-width: 2;
    stroke-dasharray: 3 3;
  }

  /* readouts */
  .readout {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
    flex-wrap: wrap;
  }
  .value {
    font-size: 22px;
    font-weight: 500;
    line-height: 28px;
    color: var(--rc-fg);
    font-variant-numeric: tabular-nums;
  }
  .value small {
    font-size: 14px;
    font-weight: 400;
    margin-left: 1px;
  }
  .value.pending {
    color: var(--rc-target);
  }
  .label {
    font-size: 13px;
    color: var(--secondary-text-color);
  }
  .now {
    text-align: center;
    font-size: 12px;
    color: var(--secondary-text-color);
    min-height: 16px;
  }

  /* presets and controls */
  .presets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  @container rc (min-width: 330px) {
    .presets {
      grid-template-columns: repeat(var(--rc-n, 4), minmax(0, 1fr));
    }
  }
  .presets button {
    font-size: 13px;
    min-height: 40px;
    padding: 6px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .presets button.on {
    background: color-mix(in srgb, var(--rc-accent) 18%, transparent);
    color: var(--rc-accent);
    font-weight: 500;
  }
  .presets ha-icon {
    --mdc-icon-size: 18px;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-top: 8px;
  }
  .controls button {
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .controls svg {
    width: 22px;
    height: 22px;
    fill: currentColor;
  }
  .note {
    margin-top: 10px;
    font-size: 12px;
    color: var(--secondary-text-color);
  }
  .warning {
    color: var(--warning-color, #ffa600);
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`;
