import { ConnectButton } from "@rainbow-me/rainbowkit";

export const WalletConnect = () => {
  return (
    <ConnectButton 
      chainStatus="icon"
      showBalance={false}
    />
  );
};
