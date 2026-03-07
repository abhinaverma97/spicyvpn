"use client";
import { useEffect, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

export default function ScrambleText({
  text,
  className = "",
  trigger = true,
  speed = 40,
}: {
  text: string;
  className?: string;
  trigger?: boolean;
  speed?: number;
}) {
  const [display, setDisplay] = useState(text);
  const frameRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!trigger) return;
    let iteration = 0;
    const total = text.length * 3;

    function step() {
      setDisplay(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < iteration / 3) return text[i];
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join("")
      );
      iteration++;
      if (iteration <= total) {
        frameRef.current = setTimeout(step, speed);
      }
    }
    step();
    return () => { if (frameRef.current) clearTimeout(frameRef.current); };
  }, [text, trigger, speed]);

  return <span className={className}>{display}</span>;
}
