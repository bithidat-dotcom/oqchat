import React from 'react';
import { cn } from '../../lib/utils';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  online?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'md', className, online }) => {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    '2xl': 'h-24 w-24',
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <div className={cn("relative overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center", sizes[size])}>
        {src ? (
          <img src={src} alt={alt || 'Avatar'} className="h-full w-full object-cover" />
        ) : (
          <User className="h-1/2 w-1/2 text-zinc-400" />
        )}
      </div>
      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-white dark:ring-zinc-950",
            online ? "bg-green-500" : "bg-zinc-400",
            size === 'sm' ? "h-2 w-2" : (size === 'xl' || size === '2xl') ? "h-4 w-4" : "h-3 w-3"
          )}
        />
      )}
    </div>
  );
};
