"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Globe, Lock, Eye, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-white" />
            <span className="font-semibold tracking-tight">SpicyVPN</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white hover:text-black"
            onClick={() => signIn("google")}
          >
            Sign in
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-32 pb-24 text-center">
        <Badge
          variant="outline"
          className="border-white/20 text-white/60 mb-6 text-xs tracking-widest uppercase"
        >
          Military-grade encryption
        </Badge>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-none">
          Invisible.
          <br />
          <span className="text-white/40">Unstoppable.</span>
        </h1>
        <p className="text-lg text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
          Your traffic looks like normal internet browsing — not a VPN.
          Bypass any firewall, anywhere in the world.
        </p>
        <Button
          size="lg"
          className="bg-white text-black hover:bg-white/90 px-8 py-6 text-base font-medium"
          onClick={() => signIn("google")}
        >
          Get started free
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <p className="text-white/30 text-sm mt-4">No credit card required</p>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-24 border-t border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Eye className="w-5 h-5" />}
            title="Undetectable"
            desc="Traffic is indistinguishable from normal HTTPS. No VPN fingerprint. Passes deep packet inspection."
          />
          <FeatureCard
            icon={<Zap className="w-5 h-5" />}
            title="One-click connect"
            desc="Scan a QR code or tap a link. Connected in seconds on any device, any platform."
          />
          <FeatureCard
            icon={<Globe className="w-5 h-5" />}
            title="Works everywhere"
            desc="Built for the most restrictive networks — China, Iran, Russia. If the internet is blocked, this works."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-24 border-t border-white/10">
        <h2 className="text-3xl font-bold mb-12 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          {[
            { step: "01", title: "Sign in", desc: "Login with your Google account. No password to remember." },
            { step: "02", title: "Get your link", desc: "We generate a personal VPN config link valid for 30 days." },
            { step: "03", title: "Connect", desc: "Import the link into any v2ray app. One tap and you're in." },
          ].map((s) => (
            <div key={s.step} className="flex flex-col items-center gap-3">
              <span className="text-5xl font-bold text-white/10">{s.step}</span>
              <h3 className="font-semibold text-lg">{s.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-6 py-24 border-t border-white/10 text-center">
        <Lock className="w-8 h-8 text-white/30 mx-auto mb-6" />
        <h2 className="text-3xl font-bold mb-4">Ready to disappear?</h2>
        <p className="text-white/40 mb-8">Get your stealth VPN config in under a minute.</p>
        <Button
          size="lg"
          className="bg-white text-black hover:bg-white/90 px-8 py-6 text-base font-medium"
          onClick={() => signIn("google")}
        >
          Continue with Google
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-white/30 text-sm">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>SpicyVPN</span>
          </div>
          <span>Built for the most restricted networks on earth</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="border border-white/10 rounded-xl p-6 flex flex-col gap-4 hover:border-white/20 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/70">
        {icon}
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-white/40 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
