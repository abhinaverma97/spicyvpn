"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import Footer from "./Footer";

const Dither = dynamic(() => import("./Dither"), { ssr: false });

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col overflow-hidden">

      {/* Dither background */}
      <div className="absolute inset-0 z-0">
        <Dither />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-flex items-center gap-2 text-xs text-white/40 border border-white/10 rounded-full px-4 py-1.5 mb-8 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Peak Gaming Experience
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-none mb-6 max-w-3xl">
          Invisible.
          <br />
          <span className="text-white/30">Untraceable.</span>
        </h1>

        <p className="text-white/40 text-lg max-w-md mb-10 leading-relaxed">
          Experience the bleeding edge of stealth technology with uncompromising low latency.
        </p>

        <Button
          onClick={() => {
            if (session) {
              router.push("/dashboard");
            } else {
              setLoading(true);
              signIn("google", { callbackUrl: "/dashboard" });
            }
          }}
          disabled={loading}
          className="bg-white/5 backdrop-blur-lg text-white/90 hover:bg-white/10 hover:text-white px-8 py-5 rounded-lg font-bold text-sm transition-all duration-300 border border-white/10 hover:border-white/20 active:scale-[0.98] shadow-2xl"
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : session ? (
            "Go to dashboard →"
          ) : (
            "Get started for free"
          )}
        </Button>

        <p className="text-white/20 text-xs mt-4">{session ? session.user?.email : "No credit card required"}</p>
      </main>

      <Footer />
    </div>
  );
}
