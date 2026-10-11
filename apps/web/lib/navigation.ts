export const navigation = [
  {
    group: 'WORKSPACES',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'markets', label: 'Markets', icon: 'chart' },
      { id: 'narratives', label: 'Narratives', icon: 'layers' },
      { id: 'tokens', label: 'Tokens', icon: 'diamond' },
      { id: 'wallets', label: 'Wallets', icon: 'wallet' },
      { id: 'events', label: 'Events', icon: 'calendar' },
      { id: 'macro', label: 'Macro', icon: 'globe' },
      { id: 'risk', label: 'Risk', icon: 'shield' },
      { id: 'ai-analyst', label: 'AI Analyst', icon: 'spark' },
      { id: 'research', label: 'Research', icon: 'book' },
    ],
  },
  {
    group: 'TOOLS',
    items: [
      { id: 'screener', label: 'Screener', icon: 'filter' },
      { id: 'watchlist', label: 'Watchlist', icon: 'star' },
      { id: 'alerts', label: 'Alerts', icon: 'bell' },
      {
        id: 'event-study',
        label: 'Event Study / Backtest',
        icon: 'chart',
      },
      { id: 'reports', label: 'Reports', icon: 'document' },
    ],
  },
  {
    group: 'DATA',
    items: [
      { id: 'on-chain', label: 'On-chain', icon: 'globe' },
      { id: 'derivatives', label: 'Derivatives', icon: 'chart' },
      { id: 'cex-flows', label: 'CEX Flows', icon: 'flow' },
      { id: 'dex-flows', label: 'DEX Flows', icon: 'flow' },
      { id: 'news', label: 'News', icon: 'document' },
      { id: 'economic', label: 'Economic', icon: 'globe' },
    ],
  },
  {
    group: 'SYSTEM',
    items: [
      { id: 'data-status', label: 'Data Status', icon: 'pulse' },
      { id: 'api-sources', label: 'API Sources', icon: 'layers' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
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

export const providerCatalog = [
  { name: 'Binance', purpose: 'Spot & derivatives' },
  { name: 'CoinGecko', purpose: 'Asset identity & metadata' },
  { name: 'DEX Screener', purpose: 'DEX liquidity & discovery' },
  { name: 'GoPlus', purpose: 'Optional security signals' },
  { name: 'Helius', purpose: 'Tracked Solana activity' },
  { name: 'DefiLlama', purpose: 'Protocol & chain metrics' },
  { name: 'FRED', purpose: 'Macro observations' },
];
