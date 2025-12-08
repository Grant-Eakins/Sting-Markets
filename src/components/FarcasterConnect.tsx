import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFarcasterAuth } from '@/hooks/useFarcasterAuth';
import { LogOut, User, ExternalLink } from 'lucide-react';

// Farcaster purple brand color
const FARCASTER_PURPLE = '#8A63D2';

export function FarcasterConnect() {
  const { user, isConnected, isLoading, signIn, signOut, error } = useFarcasterAuth();

  if (isLoading) {
    return (
      <Button disabled className="gap-2">
        <FarcasterIcon className="w-4 h-4 animate-pulse" />
        Connecting...
      </Button>
    );
  }

  if (isConnected && user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={user.pfpUrl} alt={user.displayName || user.username} />
              <AvatarFallback>
                {(user.displayName || user.username || 'FC').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">
              {user.displayName || `@${user.username}` || `FID: ${user.fid}`}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-muted-foreground">@{user.username}</p>
            <p className="text-xs text-muted-foreground mt-1">FID: {user.fid}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a
              href={`https://warpcast.com/${user.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              <User className="mr-2 h-4 w-4" />
              View Profile
              <ExternalLink className="ml-auto h-3 w-3 opacity-50" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={signIn}
        className="gap-2"
        style={{ backgroundColor: FARCASTER_PURPLE }}
      >
        <FarcasterIcon className="w-4 h-4" />
        Sign in with Farcaster
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Farcaster logo icon
function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1000 1000"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z" />
      <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.445H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" />
      <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.445H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" />
    </svg>
  );
}
