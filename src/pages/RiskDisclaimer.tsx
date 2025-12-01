import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, TrendingDown, Shield, Scale } from 'lucide-react';

export default function RiskDisclaimer() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Simple Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Markets
            </Button>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-8" />
            <span className="text-lg font-bold italic tracking-tight hidden sm:inline">Sting Markets</span>
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Risk Disclaimer</h1>
        <p className="text-muted-foreground mb-8">Please read carefully before using Sting Markets</p>

        {/* Main Warning Banner */}
        <Alert variant="destructive" className="mb-8">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg">Important Risk Warning</AlertTitle>
          <AlertDescription className="text-base mt-2">
            <strong>Prediction markets involve substantial risk of loss.</strong> You should only participate with 
            funds you can afford to lose entirely. Past performance is not indicative of future results. 
            Do not bet more than you can afford to lose.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-destructive" />
                Financial Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <ul>
                <li>
                  <strong>Loss of Funds:</strong> You may lose some or ALL of the funds you bet. There is no 
                  guarantee of profit, and most participants in prediction markets lose money over time.
                </li>
                <li>
                  <strong>Volatility:</strong> Cryptocurrency values (ETH) can fluctuate dramatically. Even if 
                  you win a bet, the value of your winnings may decrease due to market movements.
                </li>
                <li>
                  <strong>No Recovery:</strong> Unlike traditional financial services, there is no insurance, 
                  no FDIC protection, and no way to reverse transactions. Lost funds cannot be recovered.
                </li>
                <li>
                  <strong>Gas Fees:</strong> Blockchain transactions require gas fees which are non-refundable, 
                  even if your transaction fails or you lose your bet.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-orange-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-500" />
                Technical Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <ul>
                <li>
                  <strong>Smart Contract Risk:</strong> The Platform relies on smart contracts which may contain 
                  bugs, vulnerabilities, or exploits. While we conduct testing, no code is perfectly secure.
                </li>
                <li>
                  <strong>Blockchain Risk:</strong> The Base network could experience congestion, forks, or 
                  technical issues that affect transaction processing or settlement.
                </li>
                <li>
                  <strong>Oracle Risk:</strong> Market settlements depend on external data sources (crypto prices). 
                  These oracles could provide incorrect data, be manipulated, or fail to update.
                </li>
                <li>
                  <strong>Wallet Security:</strong> You are responsible for securing your wallet. Lost private 
                  keys or compromised wallets result in permanent loss of funds.
                </li>
                <li>
                  <strong>Frontend Risk:</strong> The website interface could be compromised. Always verify 
                  transaction details in your wallet before signing.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-yellow-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Market Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <ul>
                <li>
                  <strong>Liquidity Risk:</strong> Markets may have low liquidity, making it difficult to enter 
                  or exit positions at favorable prices.
                </li>
                <li>
                  <strong>Price Impact:</strong> Large bets can move market odds significantly, resulting in 
                  worse execution prices than expected.
                </li>
                <li>
                  <strong>Settlement Risk:</strong> Crypto prices can move unexpectedly during volatile 
                  hours, affecting overnight market settlements.
                </li>
                <li>
                  <strong>Manipulation Risk:</strong> Markets could potentially be manipulated by large participants 
                  or coordinated groups.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-blue-500/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-500" />
                Legal and Regulatory Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <ul>
                <li>
                  <strong>Regulatory Uncertainty:</strong> Prediction markets and cryptocurrency regulations vary 
                  by jurisdiction and are evolving. What is legal today may not be tomorrow.
                </li>
                <li>
                  <strong>Tax Obligations:</strong> You are responsible for understanding and complying with tax 
                  obligations in your jurisdiction. Winnings may be taxable income.
                </li>
                <li>
                  <strong>Jurisdiction Restrictions:</strong> Using the Platform may be prohibited in your location. 
                  You are responsible for complying with local laws.
                </li>
                <li>
                  <strong>No Legal Recourse:</strong> As a decentralized platform, there may be limited or no legal 
                  recourse available if something goes wrong.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Responsible Participation Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>If you choose to participate in prediction markets, please follow these guidelines:</p>
              <ul>
                <li>✅ Only bet what you can afford to lose completely</li>
                <li>✅ Set strict limits on how much you bet per day/week/month</li>
                <li>✅ Never borrow money or use essential funds for betting</li>
                <li>✅ Take breaks and don't chase losses</li>
                <li>✅ Understand the markets you're betting on</li>
                <li>✅ Keep records of your activity for tax purposes</li>
                <li>✅ Secure your wallet with strong practices</li>
                <li>❌ Don't let betting interfere with work, relationships, or health</li>
                <li>❌ Don't bet under the influence of alcohol or drugs</li>
                <li>❌ Don't try to "win back" losses with bigger bets</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Problem Gambling Resources</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                If you or someone you know has a gambling problem, help is available:
              </p>
              <ul>
                <li><strong>National Council on Problem Gambling:</strong> 1-800-522-4700</li>
                <li><strong>Gamblers Anonymous:</strong> www.gamblersanonymous.org</li>
                <li><strong>National Problem Gambling Helpline:</strong> Available 24/7</li>
              </ul>
              <p>
                Signs of problem gambling include: betting more than you can afford, borrowing money to gamble, 
                neglecting responsibilities, lying about gambling, and feeling unable to stop.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted">
            <CardHeader>
              <CardTitle>Acknowledgment</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm dark:prose-invert">
              <p>
                By using Sting Markets, you acknowledge that you have read and understood this Risk Disclaimer. 
                You accept full responsibility for your decisions and any resulting losses.
              </p>
              <p>
                <strong>This is not financial advice.</strong> We do not provide investment recommendations. 
                Consider consulting a financial advisor before participating in prediction markets.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Links */}
        <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <div className="flex justify-center gap-6">
            <Link to="/terms" className="hover:underline">Terms of Service</Link>
            <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link to="/" className="hover:underline">Back to Markets</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
