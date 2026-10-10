'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';

const Selection = createContext<{
  selected: string | null;
  setSelected: (id: string | null) => void;
} | null>(null);
const TokenSelection = createContext<{
  selectedToken: string | null;
  setSelectedToken: (id: string | null) => void;
} | null>(null);
const WalletSelection = createContext<{
  selectedWallet: string | null;
  setSelectedWallet: (id: string | null) => void;
} | null>(null);
export function useWalletSelection() {
  const value = useContext(WalletSelection);
  if (!value) throw new Error('Missing wallet selection provider');
  return value;
}
export function useTokenSelection() {
  const value = useContext(TokenSelection);
  if (!value) throw new Error('Missing token selection provider');
  return value;
}
export function useMarketSelection() {
  const value = useContext(Selection);
  if (!value) throw new Error('Missing selection provider');
  return value;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            gcTime: 60000,
            retry: 1,
            refetchOnWindowFocus: true,
            refetchIntervalInBackground: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Selection.Provider value={{ selected, setSelected }}>
        <TokenSelection.Provider value={{ selectedToken, setSelectedToken }}>
          <WalletSelection.Provider
            value={{ selectedWallet, setSelectedWallet }}
          >
            {children}
          </WalletSelection.Provider>
        </TokenSelection.Provider>
      </Selection.Provider>
    </QueryClientProvider>
  );
}
