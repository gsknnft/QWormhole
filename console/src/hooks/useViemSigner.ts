/* eslint-disable */
// @ts-nocheck
import * as React from "react";
import { useWalletClient } from "wagmi";
import { createPublicClient, createWalletClient, http, type WalletClient } from "viem";

/**
 * Converts a viem WalletClient to a signer-like object for transaction signing.
 */
export function walletClientToSigner(walletClient: WalletClient) {
  const { account, chain, transport } = walletClient;

  // Create a wallet client instance using viem
  const walletClientInstance = createWalletClient({
    account: account,
    chain: chain,
    transport: transport,
  });

  return {
    async signMessage(message: string | Uint8Array) {
      return walletClientInstance.signMessage({ message });
    },
    async signTransaction(transaction) {
      return walletClientInstance.signTransaction(transaction);
    },
    async sendTransaction(transaction) {
      return walletClientInstance.sendTransaction(transaction);
    },
    getAddress() {
      return account.address;
    },
    getChainId() {
      return chain.id;
    },
  };
}

/** Hook to convert a viem Wallet Client into a custom signer-like object. */
export function useViemSigner({ chainId }: { chainId?: number } = {}) {
  const { data: walletClient } = useWalletClient({ chainId });

  return React.useMemo(
    () => (walletClient ? walletClientToSigner(walletClient) : undefined),
    [walletClient],
  );
}
