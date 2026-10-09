export const navigation = [
  {
    group: 'WORKSPACES',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', phase: 0 },
      { id: 'markets', label: 'Markets', icon: 'chart', phase: 1 },
      { id: 'narratives', label: 'Narratives', icon: 'layers', phase: 2 },
      { id: 'tokens', label: 'Tokens', icon: 'diamond', phase: 3 },
      { id: 'wallets', label: 'Wallets', icon: 'wallet', phase: 4 },
      { id: 'events', label: 'Events', icon: 'calendar', phase: 5 },
      { id: 'macro', label: 'Macro', icon: 'globe', phase: 5 },
      { id: 'risk', label: 'Risk', icon: 'shield', phase: 3 },
      { id: 'ai-analyst', label: 'AI Analyst', icon: 'spark', phase: 6 },
      { id: 'research', label: 'Research', icon: 'book', phase: 7 },
    ],
  },
  {
    group: 'TOOLS',
    items: [
      { id: 'screener', label: 'Screener', icon: 'filter', phase: 1 },
      { id: 'watchlist', label: 'Watchlist', icon: 'star', phase: 7 },
      { id: 'alerts', label: 'Alerts', icon: 'bell', phase: 7 },
      {
        id: 'event-study',
        label: 'Event Study / Backtest',
        icon: 'chart',
        phase: 5,
      },
      { id: 'reports', label: 'Reports', icon: 'document', phase: 7 },
    ],
  },
  {
    group: 'DATA',
    items: [
      { id: 'on-chain', label: 'On-chain', icon: 'globe', phase: 4 },
      { id: 'derivatives', label: 'Derivatives', icon: 'chart', phase: 1 },
      { id: 'cex-flows', label: 'CEX Flows', icon: 'flow', phase: 1 },
      { id: 'dex-flows', label: 'DEX Flows', icon: 'flow', phase: 3 },
      { id: 'news', label: 'News', icon: 'document', phase: 5 },
      { id: 'economic', label: 'Economic', icon: 'globe', phase: 5 },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { id: 'data-status', label: 'Data Status', icon: 'pulse', phase: 0 },
      { id: 'api-sources', label: 'API Sources', icon: 'layers', phase: 0 },
      { id: 'settings', label: 'Settings', icon: 'settings', phase: 0 },
    ],
  },
];

export const destinations = navigation.flatMap((group) => group.items);
export function workspaceHref(id: string) {
  return id === 'dashboard' ? '/' : `/${id}`;
}
export function findWorkspace(id: string) {
  return destinations.find((item) => item.id === id);
}
export function filterDestinations(query: string) {
  const text = query.trim().toLowerCase();
  return destinations
    .filter((item) => item.label.toLowerCase().includes(text))
    .slice(0, 10);
}

export const plannedProviders = [
  { name: 'Binance', purpose: 'Spot & derivatives', phase: 1 },
  { name: 'CoinGecko', purpose: 'Asset identity & metadata', phase: 1 },
  { name: 'DEX Screener', purpose: 'DEX liquidity & discovery', phase: 3 },
  { name: 'GoPlus', purpose: 'Optional security signals', phase: 3 },
  { name: 'Helius', purpose: 'Tracked Solana activity', phase: 4 },
  { name: 'DefiLlama', purpose: 'Protocol & chain metrics', phase: 5 },
  { name: 'FRED', purpose: 'Macro observations', phase: 5 },
];
