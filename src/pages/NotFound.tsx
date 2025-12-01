import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home, Search, ArrowLeft, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full text-center">
        <CardHeader>
          <div className="mx-auto mb-4 relative">
            <div className="text-8xl font-bold text-muted-foreground/20">404</div>
            <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Page Not Found</CardTitle>
          <CardDescription>
            The page <code className="bg-muted px-2 py-1 rounded text-sm">{location.pathname}</code> doesn't exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Links */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/">
              <Button className="w-full" size="lg">
                <TrendingUp className="w-4 h-4 mr-2" />
                Browse Markets
              </Button>
            </Link>
            <Link to="/my-bets">
              <Button variant="outline" className="w-full" size="lg">
                <Home className="w-4 h-4 mr-2" />
                My Bets
              </Button>
            </Link>
          </div>
          
          {/* Go back button */}
          <Button 
            variant="ghost" 
            onClick={() => window.history.back()}
            className="text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go back to previous page
          </Button>
          
          {/* Helpful info */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Looking for something specific? Our prediction markets let you bet on stock price movements.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
