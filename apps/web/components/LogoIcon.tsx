'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface LogoIconProps {
  className?: string;
  size?: number;
}

/**
 * Компонент иконки логотипа AI Orbiter
 * 
 * Использует SVG иконку из public/logo-icon.svg
 * SVG обеспечивает идеальное масштабирование без потери качества
 */
export function LogoIcon({ className, size = 48 }: LogoIconProps) {
  return (
    <Image
      src="/logo-icon.svg"
      alt="AI Orbiter"
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority
      style={{
        filter: 'contrast(2.5) saturate(1.8) brightness(0.9)',
      }}
    />
  );
}
