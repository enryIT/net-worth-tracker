'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useColorTheme } from '@/contexts/ColorThemeContext';
import { ACTION_CHART_NUMBER, type AllocationAction } from '@/lib/utils/allocationUtils';

/**
 * Resolves COMPRA / VENDI / OK to colors from the active theme's chart palette, clamped to
 * a lightness band that stays legible on the page background.
 *
 * Why clamp (and not reuse useChartColors): some themes define chart colors at extreme
 * lightness — cyberpunk's chart-5 is oklch(0.92), near-white — which is unreadable as chip
 * text on a light card. `useChartColors` swaps such colors for a *static* palette entry at
 * the same index, which here would both lose the theme hue and let two actions collapse to
 * the same color. Clamping only the L channel keeps each theme's hue and keeps the three
 * actions distinct, while guaranteeing contrast in both modes.
 *
 * Read once per section and pass the result down — never call this per row.
 */

// Legible default-theme colors shown for the first paint, before the CSS vars resolve.
const INITIAL: Record<AllocationAction, string> = {
  COMPRA: 'oklch(0.62 0.17 70)', // amber
  VENDI: 'oklch(0.62 0.21 25)', // coral
  OK: 'oklch(0.62 0.15 162)', // jade
};

/**
 * Clamp the lightness of an oklch() color into a legible band for the current mode,
 * preserving hue and chroma. On a light background a color must be dark enough; on a dark
 * background, light enough. Only clearly out-of-range colors are adjusted.
 */
function clampLightness(oklch: string, isDark: boolean): string {
  const match = oklch.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
  if (!match) return oklch;
  let l = parseFloat(match[1]);
  const chroma = match[2];
  const hue = match[3];
  if (!isDark && l > 0.72) l = 0.62; // too light for a light background
  else if (isDark && l < 0.48) l = 0.6; // too dark for a dark background
  return `oklch(${l} ${chroma} ${hue})`;
}

export function useActionColors(): Record<AllocationAction, string> {
  const { colorTheme } = useColorTheme();
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<AllocationAction, string>>(INITIAL);

  // Read AFTER paint (rAF) so next-themes has applied the active theme/mode to <html>.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const isDark = resolvedTheme === 'dark';
      const resolve = (action: AllocationAction): string => {
        const raw = style.getPropertyValue(`--chart-${ACTION_CHART_NUMBER[action]}`).trim();
        return raw ? clampLightness(raw, isDark) : INITIAL[action];
      };
      setColors({ COMPRA: resolve('COMPRA'), VENDI: resolve('VENDI'), OK: resolve('OK') });
    });
    return () => cancelAnimationFrame(frame);
  }, [colorTheme, resolvedTheme]);

  return colors;
}
