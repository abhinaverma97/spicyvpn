"use client";
import React, { useRef, useState } from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  spotlightColor?: string;
  blur?: string;
  intensity?: number;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.1)",
  blur = "12px",
  intensity = 0.2,
  ...props
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  return (
    <div
      ref={divRef}
      className="relative overflow-hidden rounded-2xl border border-white/10 transition-all duration-500"
      style={{
        background: `rgba(255, 255, 255, ${intensity * 0.2})`,
        backdropFilter: `blur(${blur})`,
        WebkitBackdropFilter: `blur(${blur})`,
      }}
      {...props}
    >
      {/* Noise Texture Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-100 contrast-150"></div>

      {/* Shine Line (Top Edge) */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"></div>

      <div className={`relative z-10 h-full w-full ${className}`}>{children}</div>
    </div>
  );
};

export default GlassCard;
