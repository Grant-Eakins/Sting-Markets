import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export default function Terms() {
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
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: November 29, 2025</p>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Acceptance of Terms</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                By accessing or using Sting Markets ("the Platform"), you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, do not use the Platform.
              </p>
              <p>
                The Platform is a decentralized prediction market operating on blockchain technology. You must be at least 
                18 years old (or the age of majority in your jurisdiction) to use this service.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Description of Service</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                Sting Markets provides a platform for users to participate in Coin Battles - head-to-head prediction markets 
                where users bet on which cryptocurrency will perform better over a set time period. Users can also participate 
                in the Listing Auction to nominate coins for upcoming battles.
              </p>
              <p>
                All transactions occur on the Base blockchain network. You are responsible for understanding how blockchain 
                transactions work, including gas fees and transaction finality.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. User Responsibilities</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>You agree to:</p>
              <ul>
                <li>Provide accurate information and maintain the security of your wallet</li>
                <li>Comply with all applicable laws and regulations in your jurisdiction</li>
                <li>Not use the Platform for money laundering, fraud, or other illegal activities</li>
                <li>Not attempt to manipulate markets or exploit technical vulnerabilities</li>
                <li>Accept full responsibility for your trading decisions</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. Risks and Disclaimers</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p className="font-semibold text-destructive">
                IMPORTANT: Prediction markets involve significant financial risk. You may lose some or all of your funds.
              </p>
              <p>You acknowledge and accept:</p>
              <ul>
                <li>Past performance does not guarantee future results</li>
                <li>Cryptocurrency values are volatile and can change rapidly</li>
                <li>Smart contracts may contain bugs or vulnerabilities</li>
                <li>Blockchain transactions are irreversible</li>
                <li>The Platform may experience downtime or technical issues</li>
                <li>Market settlements are based on external data sources which may be inaccurate</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>5. Fees</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                The Platform charges a 3% fee on all transactions (buying and selling shares). Additionally, you are 
                responsible for all blockchain gas fees associated with your transactions.
              </p>
              <p>
                Fees are subject to change with reasonable notice provided through the Platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>6. Intellectual Property</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                All content, branding, and software on the Platform are owned by Sting Markets or its licensors. 
                You may not copy, modify, or distribute our intellectual property without permission.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>7. Limitation of Liability</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, STING MARKETS AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY 
                INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, 
                OR OTHER INTANGIBLE LOSSES.
              </p>
              <p>
                Our total liability shall not exceed the amount of fees you have paid to the Platform in the 12 months 
                preceding the claim.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>8. Prohibited Jurisdictions</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                The Platform is not available to users in jurisdictions where prediction markets or cryptocurrency 
                trading is prohibited. You are responsible for ensuring compliance with your local laws.
              </p>
              <p>
                Users from the following regions are prohibited: OFAC-sanctioned countries, and any jurisdiction 
                where online gambling or prediction markets are illegal.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>9. Modifications</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                We reserve the right to modify these Terms at any time. Continued use of the Platform after changes 
                constitutes acceptance of the new Terms. Material changes will be announced on the Platform.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>10. Governing Law</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                These Terms shall be governed by and construed in accordance with applicable laws. Any disputes shall 
                be resolved through binding arbitration.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>11. Contact</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                For questions about these Terms of Service, please contact us through our official channels.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6">
            <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link to="/risk-disclaimer" className="hover:underline">Risk Disclaimer</Link>
            <Link to="/" className="hover:underline">Back to Coin Battles</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
