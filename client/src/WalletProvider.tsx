import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import type { PropsWithChildren } from "react";

export function WalletProvider({ children }: PropsWithChildren) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: Network.TESTNET,
      }}
      onError={(error) => {
        // Handle specific wallet errors
        const errorMessage = error.message || String(error);
        
        if (errorMessage.includes("User has rejected")) {
          console.warn("User rejected the wallet request");
          // You can dispatch to a state/context here if needed
        } else if (errorMessage.includes("not installed")) {
          console.error("Wallet extension not installed:", errorMessage);
        } else {
          console.error("Wallet error:", errorMessage);
        }
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}
