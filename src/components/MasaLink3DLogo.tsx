'use client';

import React from 'react';

interface MasaLink3DLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  withGlow?: boolean;
  badge?: string;
  className?: string;
}

export const MasaLink3DLogo: React.FC<MasaLink3DLogoProps> = ({
  size = 'md',
  showText = true,
  withGlow = true,
  badge,
  className = '',
}) => {
  // Dimensions map for square format logo
  const sizeMap = {
    xs: { icon: 'w-7 h-7', text: 'text-sm', badge: 'text-[9px] px-1' },
    sm: { icon: 'w-9 h-9', text: 'text-base', badge: 'text-[9px] px-1.5' },
    md: { icon: 'w-11 h-11', text: 'text-xl', badge: 'text-[10px] px-1.5' },
    lg: { icon: 'w-14 h-14', text: 'text-2xl', badge: 'text-[11px] px-2' },
    xl: { icon: 'w-20 h-20', text: 'text-3xl', badge: 'text-xs px-2.5' },
    '2xl': { icon: 'w-28 h-28', text: 'text-4xl', badge: 'text-xs px-3' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-3 group select-none ${className}`}>
      {/* Square 3D Logo Container */}
      <div className="relative shrink-0">
        {/* Ambient Warm Glow */}
        {withGlow && (
          <div className="absolute inset-0 bg-gradient-to-tr from-orange-600/50 via-amber-500/40 to-transparent rounded-2xl blur-md opacity-60 group-hover:opacity-90 transition-opacity duration-300 scale-110 pointer-events-none" />
        )}

        {/* Square Raised Border Frame */}
        <div
          className={`${currentSize.icon} relative rounded-xl sm:rounded-2xl overflow-hidden p-[1px] bg-gradient-to-b from-orange-400/80 via-amber-600/40 to-zinc-900 shadow-xl shadow-orange-950/40 group-hover:shadow-orange-500/30 group-hover:scale-105 transition-all duration-300`}
        >
          <div className="w-full h-full rounded-[10px] sm:rounded-[14px] bg-[#0c0c10] overflow-hidden flex items-center justify-center relative p-0.5">
            <picture>
              <source 
                srcSet={size === 'xs' || size === 'sm' ? '/masalink-logo-sm.webp' : '/masalink-logo.webp'} 
                type="image/webp" 
              />
              <img
                src="/masalink-logo.webp"
                alt="MasaLink Logosu"
                width={size === 'xs' ? 28 : size === 'sm' ? 36 : size === 'md' ? 44 : size === 'lg' ? 56 : size === 'xl' ? 80 : 112}
                height={size === 'xs' ? 28 : size === 'sm' ? 36 : size === 'md' ? 44 : size === 'lg' ? 56 : size === 'xl' ? 80 : 112}
                decoding="async"
                loading="eager"
                className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300 rounded-[8px]"
                onError={(e) => {
                  // Fallback to original PNG if WebP fails
                  (e.target as HTMLImageElement).src = '/MasaLink Logosu.png';
                }}
              />
            </picture>
            {/* Subtle glass reflection highlight */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/15 pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity" />
          </div>
        </div>
      </div>

      {/* Typography & Sub-badge */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span className={`${currentSize.text} font-black tracking-tight text-white`}>
              Masa<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500">link</span>
            </span>
            {badge && (
              <span
                className={`${currentSize.badge} uppercase font-bold tracking-wider py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/25 shadow-sm shadow-orange-500/10`}
              >
                {badge}
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-400 tracking-wider font-medium mt-0.5">
            Cloud Restaurant OS
          </span>
        </div>
      )}
    </div>
  );
};
