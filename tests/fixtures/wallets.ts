import type { WalletTransaction } from '../../packages/domain/src/wallets';
export const walletNow = new Date('2026-09-01T12:00:00Z');
export const walletAddress = '11111111111111111111111111111111';
export const counterparty = 'So11111111111111111111111111111111111111112';
export function walletTx(index = 0, time = walletNow): WalletTransaction {
  const timestamp = new Date(time.getTime() - index * 1000).toISOString();
  return {
    signature:
      '2'.repeat(76) +
      index
        .toString(2)
        .replaceAll('0', '3')
        .replaceAll('1', '4')
        .padStart(12, '3'),
    timestamp,
    slot: 1000 + index,
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    failed: false,
    transfers: [
      {
        from: counterparty,
        to: walletAddress,
        asset: 'SOL',
        amount: 1000000000,
        unit: 'LAMPORTS',
      },
    ],
    provenance: {
      providerId: 'helius',
      source: `/v0/addresses/${walletAddress}/transactions`,
      sourceTimestamp: timestamp,
      ingestedAt: walletNow.toISOString(),
      quality: 'AGGREGATED',
      methodologyVersion: 'helius-enhanced:v1',
    },
  };
}
export const rawWalletTx = (index = 0) => ({
  signature: walletTx(index).signature,
  timestamp: Math.floor(Date.parse(walletTx(index).timestamp) / 1000),
  slot: 1000 + index,
  type: 'TRANSFER',
  source: 'SYSTEM_PROGRAM',
  transactionError: null,
  nativeTransfers: [
    {
      fromUserAccount: counterparty,
      toUserAccount: walletAddress,
      amount: 1000000000,
    },
  ],
  tokenTransfers: [],
});
