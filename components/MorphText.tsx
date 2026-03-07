"use client";

import { useEffect, useRef, useState } from "react";

const TEXTS = ["Invisible.", "Untraceable.", "Unstoppable.", "Private."];
const MORPH_TIME = 1.5;
const COOLDOWN = 2.5;

export default function MorphText({ className = "" }: { className?: string }) {
  const text1Ref = useRef<HTMLSpanElement>(null);
  const text2Ref = useRef<HTMLSpanElement>(null);

  const textIndex = useRef(TEXTS.length - 1);
  const morphRef = useRef(0);
  const cooldownRef = useRef(COOLDOWN);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  function setMorph(fraction: number) {
    const t1 = text1Ref.current;
    const t2 = text2Ref.current;
    if (!t1 || !t2) return;

    t2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
    t2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

    const inv = 1 - fraction;
    t1.style.filter = `blur(${Math.min(8 / inv - 8, 100)}px)`;
    t1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;

    t1.textContent = TEXTS[textIndex.current % TEXTS.length];
    t2.textContent = TEXTS[(textIndex.current + 1) % TEXTS.length];
  }

  function doCooldown() {
    const t1 = text1Ref.current;
    const t2 = text2Ref.current;
    if (!t1 || !t2) return;
    morphRef.current = 0;
    t1.style.filter = "";
    t1.style.opacity = "0%";
    t2.style.filter = "";
    t2.style.opacity = "100%";
    t1.textContent = TEXTS[textIndex.current % TEXTS.length];
    t2.textContent = TEXTS[(textIndex.current + 1) % TEXTS.length];
  }

  useEffect(() => {
    function animate(now: number) {
      rafRef.current = requestAnimationFrame(animate);
      if (lastTimeRef.current === null) { lastTimeRef.current = now; return; }
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      cooldownRef.current -= dt;

      if (cooldownRef.current <= 0) {
        if (cooldownRef.current <= -MORPH_TIME) {
          textIndex.current++;
          cooldownRef.current = COOLDOWN;
        } else {
          const fraction = cooldownRef.current / -MORPH_TIME;
          setMorph(fraction);
          return;
        }
      }
      doCooldown();
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <span className={`relative inline-block ${className}`}>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="morphing-blur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur" />
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
              result="goo"
            />
          </filter>
        </defs>
      </svg>
      <span
        style={{ filter: "url(#morphing-blur)", display: "inline-block", position: "relative" }}
      >
        <span
          ref={text1Ref}
          style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap" }}
        />
        <span
          ref={text2Ref}
          style={{ whiteSpace: "nowrap", visibility: "visible" }}
        />
      </span>
    </span>
  );
}
