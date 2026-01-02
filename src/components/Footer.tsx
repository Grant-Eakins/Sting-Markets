import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-6 sm:mt-12 mb-16 md:mb-0">
      <div className="container mx-auto px-4 py-4 sm:py-8">
        <div className="flex justify-center items-center">
          {/* Logo and tagline - centered */}
          <div className="flex items-center gap-2">
            <img src="/Copilot_20251128_175824-removebg-preview.png" alt="Sting Markets" className="h-6 sm:h-8" />
            <div>
              <span className="font-bold italic text-sm sm:text-base">Sting Markets</span>
              <p className="text-xs text-muted-foreground hidden sm:block">Crypto Prediction Markets on Base</p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
