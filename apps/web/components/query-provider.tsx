'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';

const Selection = createContext<{
  selected: string | null;
  setSelected: (id: string | null) => void;
} | null>(null);
export function useMarketSelection() {
  const value = useContext(Selection);
  if (!value) throw new Error('Missing selection provider');
  return value;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
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
        {children}
      </Selection.Provider>
    </QueryClientProvider>
  );
}
