import { css } from "lit";

export const cardStyles = css`
  :host {
    --rc-slat: var(--raffstore-slat-color, var(--secondary-text-color, #727272));
    --rc-rail: var(--raffstore-rail-color, var(--primary-text-color, #212121));
    --rc-box: var(--raffstore-box-color, var(--divider-color, #c8c8c8));
    --rc-glass: var(--raffstore-glass-color, rgba(var(--rgb-primary-color, 3, 169, 244), 0.14));
    --rc-ground: var(--raffstore-ground-color, rgba(var(--rgb-success-color, 76, 175, 80), 0.22));
    --rc-target: var(--raffstore-target-color, var(--accent-color, #ff9800));
    --rc-radius: var(--ha-card-border-radius, 12px);
  }
  ha-card {
    padding: 16px;
    box-sizing: border-box;
    container: rc / inline-size;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 16px;
    font-weight: 500;
    color: var(--primary-text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .state {
    font-size: 14px;
    color: var(--secondary-text-color);
  }
  button {
    font: inherit;
    color: var(--primary-text-color);
    background: none;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:hover {
    background: var(--secondary-background-color, rgba(0, 0, 0, 0.04));
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
    background: none;
  }
  button:focus-visible,
  svg.ctl:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 2px;
  }
  .pill {
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 13px;
    white-space: nowrap;
  }
  .pill.auto {
    background: rgba(var(--rgb-success-color, 76, 175, 80), 0.16);
    color: var(--success-color, #43a047);
    border-color: transparent;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
  .tab {
    font-size: 13px;
    padding: 4px 12px;
  }
  .tab.on {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.16);
    color: var(--primary-color, #03a9f4);
    border-color: transparent;
  }
  .visual {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 12px;
    margin-top: 12px;
    align-items: start;
  }
  svg.ctl {
    width: 100%;
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: ns-resize;
    border-radius: 6px;
  }
  svg.ctl:focus:not(:focus-visible) {
    outline: none;
  }
  svg.ctl.disabled {
    cursor: default;
    opacity: 0.5;
  }
  .readout {
    text-align: center;
    margin-top: 4px;
  }
  .label {
    font-size: 12px;
    color: var(--secondary-text-color);
  }
  .value {
    font-size: 22px;
    font-weight: 500;
    color: var(--primary-text-color);
    line-height: 1.3;
  }
  .value.pending {
    color: var(--rc-target);
  }
  .now {
    font-size: 12px;
    color: var(--secondary-text-color);
    min-height: 16px;
  }
  .presets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 12px;
  }
  @container rc (min-width: 330px) {
    .presets {
      grid-template-columns: repeat(var(--rc-n, 4), minmax(0, 1fr));
    }
  }
  .presets button {
    font-size: 13px;
    padding: 8px 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
  .presets ha-icon {
    --mdc-icon-size: 18px;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-top: 6px;
  }
  .controls button {
    padding: 8px 0;
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
`;
