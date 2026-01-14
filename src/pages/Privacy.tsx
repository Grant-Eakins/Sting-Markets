import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Simple Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Coin Battles
            </Button>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8" />
            <span className="text-lg font-bold italic tracking-tight hidden sm:inline">Sting Markets</span>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: November 29, 2025</p>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Introduction</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                Sting Markets ("we", "our", or "the Platform") respects your privacy and is committed to protecting 
                your personal data. This Privacy Policy explains how we collect, use, and safeguard your information 
                when you use our prediction market platform.
              </p>
              <p>
                As a decentralized application (dApp), we collect minimal personal data. Most interactions occur 
                directly with the blockchain and are pseudonymous by nature.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Information We Collect</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p><strong>Information collected automatically:</strong></p>
              <ul>
                <li><strong>Wallet Address:</strong> Your public wallet address when you connect to participate in Coin Battles</li>
                <li><strong>Transaction Data:</strong> All Coin Battle bets and auction bids are public blockchain transactions</li>
                <li><strong>Usage Data:</strong> Pages visited, battles participated in, and interaction patterns</li>
                <li><strong>Device Information:</strong> Browser type, operating system, and device identifiers</li>
                <li><strong>IP Address:</strong> For security and fraud prevention purposes</li>
              </ul>
              <p><strong>Information we do NOT collect:</strong></p>
              <ul>
                <li>Your name, email, or other personal identifiers</li>
                <li>Your private keys or seed phrases (never share these!)</li>
                <li>Financial information beyond public blockchain data</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. How We Use Your Information</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>We use collected information to:</p>
              <ul>
                <li>Provide and maintain the Platform's functionality</li>
                <li>Display your positions and betting history</li>
                <li>Prevent fraud, abuse, and security threats</li>
                <li>Analyze usage patterns to improve the Platform</li>
                <li>Comply with legal obligations</li>
                <li>Communicate important updates about the service</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Blockchain Data</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                <strong>Important:</strong> All transactions on the blockchain are public and permanent. This includes:
              </p>
              <ul>
                <li>Your wallet address</li>
                <li>All bets you place and shares you buy/sell</li>
                <li>Transaction amounts and timestamps</li>
                <li>Payouts you receive</li>
              </ul>
              <p>
                This data is not controlled by us and cannot be deleted. Anyone can view blockchain data using 
                block explorers. Consider using a separate wallet for privacy-sensitive activities.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Cookies and Tracking</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>We use minimal cookies and similar technologies:</p>
              <ul>
                <li><strong>Essential Cookies:</strong> Required for the Platform to function (wallet connection state)</li>
                <li><strong>Analytics:</strong> Anonymous usage statistics to improve the Platform</li>
              </ul>
              <p>
                We do not use advertising cookies or sell your data to third parties.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>6. Third-Party Services</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>The Platform integrates with third-party services that have their own privacy policies:</p>
              <ul>
                <li><strong>WalletConnect / RainbowKit:</strong> For wallet connections</li>
                <li><strong>Base Network (Coinbase):</strong> Blockchain infrastructure</li>
                <li><strong>CoinGecko:</strong> For cryptocurrency price data</li>
                <li><strong>Crypto data providers:</strong> For market price information</li>
              </ul>
              <p>
                We encourage you to review the privacy policies of these services.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>7. Data Security</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                We implement appropriate technical and organizational measures to protect your data, including:
              </p>
              <ul>
                <li>HTTPS encryption for all connections</li>
                <li>Secure smart contract development practices</li>
                <li>Regular security audits</li>
                <li>Limited access to any centralized systems</li>
              </ul>
              <p>
                However, no system is 100% secure. You are responsible for securing your own wallet and private keys.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8. Your Rights (GDPR/CCPA)</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>Depending on your location, you may have the right to:</p>
              <ul>
                <li><strong>Access:</strong> Request a copy of data we hold about you</li>
                <li><strong>Rectification:</strong> Correct inaccurate data</li>
                <li><strong>Erasure:</strong> Request deletion of your data (where technically possible)</li>
                <li><strong>Portability:</strong> Receive your data in a portable format</li>
                <li><strong>Objection:</strong> Object to certain processing activities</li>
                <li><strong>Opt-out:</strong> Opt out of data sales (we don't sell data)</li>
              </ul>
              <p>
                <strong>Note:</strong> Blockchain data cannot be deleted or modified due to its immutable nature. 
                These rights apply only to off-chain data we may collect.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>9. Data Retention</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                Off-chain data (logs, analytics) is retained for up to 12 months for operational purposes, 
                unless longer retention is required by law.
              </p>
              <p>
                Blockchain data is permanent and exists as long as the blockchain network operates.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>10. Children's Privacy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                The Platform is not intended for users under 18 years of age. We do not knowingly collect 
                information from children. If we learn that we have collected data from a child, we will 
                delete it promptly.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>11. International Transfers</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                Blockchain data is distributed globally across network nodes. Any off-chain data may be 
                processed in various jurisdictions. By using the Platform, you consent to such transfers.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>12. Changes to This Policy</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                We may update this Privacy Policy from time to time. Changes will be posted on this page 
                with an updated revision date. Continued use of the Platform after changes constitutes 
                acceptance of the updated policy.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>13. Contact Us</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                For privacy-related inquiries or to exercise your rights, please contact us through our 
                official channels.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6">
            <Link to="/terms" className="hover:underline">Terms of Service</Link>
            <Link to="/risk-disclaimer" className="hover:underline">Risk Disclaimer</Link>
            <Link to="/" className="hover:underline">Back to Coin Battles</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
