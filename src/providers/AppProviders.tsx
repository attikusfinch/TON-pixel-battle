import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

const DEFAULT_MANIFEST_URL =
  'https://attikusfinch.github.io/TON-banners/tonconnect-manifest.json';

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST_URL ?? DEFAULT_MANIFEST_URL;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TonConnectUIProvider>
  );
}
