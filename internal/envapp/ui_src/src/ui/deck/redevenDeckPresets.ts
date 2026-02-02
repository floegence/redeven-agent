// Deck preset layouts used by the Env App.

export const REDEVEN_DECK_LAYOUT_IDS = {
  default: 'redeven-layout-default',
  terminal: 'redeven-layout-terminal',
  files: 'redeven-layout-files',
  monitoring: 'redeven-layout-monitoring',
} as const;

export const redevenDeckPresets = [
  {
    id: REDEVEN_DECK_LAYOUT_IDS.default,
    name: 'Default',
    isPreset: true,
    widgets: [
      { id: 'files', type: 'redeven.files', position: { col: 0, row: 0, colSpan: 8, rowSpan: 24 } },
      { id: 'terminal', type: 'redeven.terminal', position: { col: 8, row: 0, colSpan: 16, rowSpan: 12 } },
      { id: 'monitor', type: 'redeven.monitor', position: { col: 8, row: 12, colSpan: 16, rowSpan: 12 } },
    ],
  },
  {
    id: REDEVEN_DECK_LAYOUT_IDS.terminal,
    name: 'Terminal Focus',
    isPreset: true,
    widgets: [
      { id: 'terminal', type: 'redeven.terminal', position: { col: 0, row: 0, colSpan: 24, rowSpan: 12 } },
      { id: 'files', type: 'redeven.files', position: { col: 0, row: 12, colSpan: 12, rowSpan: 12 } },
      { id: 'monitor', type: 'redeven.monitor', position: { col: 12, row: 12, colSpan: 12, rowSpan: 12 } },
    ],
  },
  {
    id: REDEVEN_DECK_LAYOUT_IDS.files,
    name: 'Files Focus',
    isPreset: true,
    widgets: [
      { id: 'files', type: 'redeven.files', position: { col: 0, row: 0, colSpan: 12, rowSpan: 24 } },
      { id: 'terminal', type: 'redeven.terminal', position: { col: 12, row: 0, colSpan: 12, rowSpan: 12 } },
      { id: 'monitor', type: 'redeven.monitor', position: { col: 12, row: 12, colSpan: 12, rowSpan: 12 } },
    ],
  },
  {
    id: REDEVEN_DECK_LAYOUT_IDS.monitoring,
    name: 'Monitoring',
    isPreset: true,
    widgets: [
      { id: 'monitor', type: 'redeven.monitor', position: { col: 0, row: 0, colSpan: 12, rowSpan: 24 } },
      { id: 'terminal', type: 'redeven.terminal', position: { col: 12, row: 0, colSpan: 12, rowSpan: 12 } },
      { id: 'files', type: 'redeven.files', position: { col: 12, row: 12, colSpan: 12, rowSpan: 12 } },
    ],
  },
] as const;
