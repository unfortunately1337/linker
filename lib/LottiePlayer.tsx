import React, { useEffect, useRef } from "react";

interface LottiePlayerProps {
  src: string;
  width?: number | string;
  height?: number | string;
  loop?: boolean;
}

export default function LottiePlayer({ src, width = '100%', height = '100%', loop = true }: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Mobile optimization: avoid loading heavy lottie-web on small screens or when user prefers reduced motion or save-data is enabled.
    let lottie: any;
    const isSmallScreen = typeof window !== 'undefined' && (window.innerWidth || document.documentElement.clientWidth) < 600;
    const saveData = typeof navigator !== 'undefined' && (navigator as any).connection && (navigator as any).connection.saveData;
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isSmallScreen || saveData || prefersReduced) {
      // Do not load lottie; leave a simple placeholder to reduce JS/CSS cost on mobile
      return;
    }

    (async () => {
      lottie = await import('lottie-web');
      if (containerRef.current) {
        lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop,
          autoplay: true,
          path: src,
        });
      }
    })();
    return () => {
      try {
        if (lottie && containerRef.current && typeof lottie.destroy === 'function') {
          lottie.destroy();
        }
      } catch (e) {}
    };
  }, [src, loop]);

  return <div ref={containerRef} style={{ width, height }} />;
}
