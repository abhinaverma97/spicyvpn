"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  Smartphone,
  Monitor,
  ChevronDown,
  Wifi,
  Clock,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import Footer from "./Footer";

type User = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type VpnConfig = {
  id: string;
  uuid: string;
  token: string;
  expiresAt: string;
  active: boolean;
  createdAt: string;
  usedTraffic: number;
  dataLimit: number;
  deviceCount: number;
};

export default function Dashboard({ user }: { user: User }) {
  const [config, setConfig] = useState<VpnConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedSub, setCopiedSub] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/vpn");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setConfig(data[0]);
      }
    } catch (e) {
      console.error("Failed to fetch config");
    }
  }

  async function generateConfig() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vpn", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setConfig(data);
    } catch (e: any) {
      setError(e.message || "Failed to generate config");
    } finally {
      setLoading(false);
    }
  }

  function subUrl() {
    if (!config) return "";
    return `https://spicypepper.app/api/sub?token=${config.token}`;
  }

  function copySubUrl() {
    navigator.clipboard.writeText(subUrl());
    setCopiedSub(true);
    setTimeout(() => setCopiedSub(false), 2000);
  }

  function daysLeft(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }

  const initials = user.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "??";

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <span className="font-semibold tracking-tight">SpicyVPN</span>
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white/70 hover:text-white">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={user.image ?? ""} />
                  <AvatarFallback className="text-base bg-white/10">{initials}</AvatarFallback>
                </Avatar>
                <span className="text-base hidden sm:block">{user.name}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-white/10 text-white">
              {user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL && (
                <DropdownMenuItem
                  className="hover:bg-white/10 cursor-pointer"
                  onClick={() => window.location.href = "/admin"}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Admin Panel
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="hover:bg-white/10 cursor-pointer"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-2xl font-bold mb-1">Your VPN Access</h1>
          <p className="text-white/40 text-base">
            Copy your subscription link and import it into Hiddify.
          </p>
        </div>

        {!config ? (
          <Card className="bg-zinc-900 border-white/10 text-center py-16">
            <CardContent className="flex flex-col items-center gap-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <Wifi className="w-7 h-7 text-white/30" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">No config yet</h3>
                <p className="text-white/40 text-base mb-6">
                  Generate your personal access link to get started.
                </p>
              </div>
              <Button
                onClick={generateConfig}
                disabled={loading}
                className="bg-white text-black hover:bg-white/90 px-8"
              >
                {loading ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  "Generate my access link"
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">

            {/* Stats Row */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-zinc-900 border-white/10">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-4xl font-black">{daysLeft(config.expiresAt)}</span>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-wider">Days Remaining</span>
                </CardContent>
              </Card>

              <Card className="bg-zinc-900 border-white/10">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
                  <span className="text-4xl font-black">
                    {Math.max(0, (35 * 1073741824 - config.usedTraffic) / 1073741824).toFixed(1)}
                    <span className="text-2xl text-white/40 ml-1">GB</span>
                  </span>
                  <span className="text-sm font-medium text-white/40 uppercase tracking-wider">Data Left</span>
                </CardContent>
              </Card>
            </div>

            {/* Subscription Link */}
            <Card className="bg-zinc-900 border-white/10 relative overflow-hidden">
              <CardHeader className="pb-3 pt-6">
                <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-2">
                  <div>
                    <CardTitle className="text-xl font-bold mb-1">Subscription Link</CardTitle>
                    <CardDescription className="text-white/40 text-base">
                      Copy this link and import it into Hiddify using <strong className="text-white/60">Add from clipboard</strong>
                    </CardDescription>
                  </div>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-base shrink-0">
                    <Check className="w-3.5 h-3.5 mr-1" /> Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-black rounded-lg p-4 flex items-center justify-between border border-white/10 gap-3">
                  <code className="text-base font-mono text-white/60 break-all leading-relaxed flex-1">
                    {subUrl()}
                  </code>
                  <button
                    onClick={copySubUrl}
                    className="shrink-0 text-white/40 hover:text-white transition-colors"
                  >
                    {copiedSub ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <Button
                  onClick={copySubUrl}
                  className="w-full bg-white text-black hover:bg-white/90 font-medium py-6 text-lg"
                >
                  {copiedSub ? (
                    <><Check className="w-5 h-5 mr-2" /> Copied!</>
                  ) : (
                    <><Copy className="w-5 h-5 mr-2" /> Copy subscription link</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Games + How to connect — side by side on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

            {/* How to connect */}
            <Card className="bg-zinc-900 border-white/10 flex flex-col h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium">How to connect</CardTitle>
                <CardDescription className="text-white/40 text-base">
                  Use <span className="text-white/70 font-semibold">Hiddify</span> — free, open-source, works on all platforms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 flex-1">

                {/* Android */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="w-4 h-4 text-white/50" />
                    <span className="text-lg font-medium text-white/80">Android</span>
                    <a
                      href="https://play.google.com/store/apps/details?id=app.hiddify.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 text-lg font-medium px-2.5 py-1 rounded-full border border-white/20 text-white/70 hover:border-white/50 hover:text-white transition-colors"
                    >
                      Google Play <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="space-y-1.5 text-base text-white/40 ml-6">
                    <li>1. Install <span className="text-white/70">Hiddify</span> from Google Play</li>
                    <li>2. Copy your subscription link (button above)</li>
                    <li>3. Open Hiddify → tap <span className="text-white/70">+</span> → <span className="text-white/70">Add from clipboard</span></li>
                    <li>4. Tap <span className="text-white/70">Connect</span> ✓</li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* Windows */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor className="w-4 h-4 text-white/50" />
                    <span className="text-lg font-medium text-white/80">Windows</span>
                    <a
                      href="https://github.com/spicyvpn365/spicyvpn/releases/download/win/SpicyVPN_0.1.0_x64-setup.exe"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 text-lg font-medium px-2.5 py-1 rounded-full border border-white/20 text-white/70 hover:border-white/50 hover:text-white transition-colors"
                    >
                      Download SpicyVPN <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="space-y-1.5 text-base text-white/40 ml-6">
                    <li>1. Install <span className="text-white/70">SpicyVPN</span> from the link above</li>
                    <li>2. Copy your subscription link (button above)</li>
                    <li>3. Paste the sub link in the application</li>
                    <li>4. Click <span className="text-white/70">Connect</span> ✓</li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* macOS */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Monitor className="w-4 h-4 text-white/50" />
                    <span className="text-lg font-medium text-white/80">macOS</span>
                    <a
                      href="https://github.com/hiddify/hiddify-app/releases/download/v4.1.1/Hiddify-MacOS.dmg"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 text-lg font-medium px-2.5 py-1 rounded-full border border-white/20 text-white/70 hover:border-white/50 hover:text-white transition-colors"
                    >
                      Download Hiddify <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="space-y-1.5 text-base text-white/40 ml-6">
                    <li>1. Install <span className="text-white/70">Hiddify</span> from the link above</li>
                    <li>2. Copy your subscription link (button above)</li>
                    <li>3. Open Hiddify → click <span className="text-white/70">+</span> → <span className="text-white/70">Add from clipboard</span></li>
                    <li>4. Click <span className="text-white/70">Connect</span> ✓</li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

                {/* iOS */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="w-4 h-4 text-white/50" />
                    <span className="text-lg font-medium text-white/80">iPhone / iPad</span>
                    <a
                      href="https://apps.apple.com/app/hiddify-proxy-vpn/id6596777532"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 text-lg font-medium px-2.5 py-1 rounded-full border border-white/20 text-white/70 hover:border-white/50 hover:text-white transition-colors"
                    >
                      App Store <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <ol className="space-y-1.5 text-base text-white/40 ml-6">
                    <li>1. Install <span className="text-white/70">Hiddify</span> from the App Store</li>
                    <li>2. Copy your subscription link (button above)</li>
                    <li>3. Open Hiddify → tap <span className="text-white/70">+</span> → <span className="text-white/70">Add from clipboard</span></li>
                    <li>4. Tap <span className="text-white/70">Connect</span> ✓</li>
                  </ol>
                </div>

                <div className="border-t border-white/5" />

              </CardContent>
            </Card>

            {/* Games & System Apps */}
            <Card className="bg-zinc-900 border-white/10 flex flex-col h-full">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-medium">🎮 For games & system apps</CardTitle>
                <CardDescription className="text-white/40 text-base">Discord, Valorant, and any UDP app — enable VPN mode for full system routing</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <p className="text-base text-white/30 mb-4">By default Hiddify runs as a proxy — games and apps using UDP won&apos;t go through it. Enable <span className="text-white/60">VPN mode</span> to route all traffic.</p>
                <ol className="space-y-3 text-base text-white/40">
                  <li>1. <span className="text-white/70 font-bold">Run Hiddify as administrator</span> (right-click → Run as administrator on Windows)</li>
                  <li className="space-y-2">
                    <span>2. On the home screen, click the <span className="text-white/70">sliders icon</span> (top-right, next to the + button)</span>
                    <img src="/hiddify-mode-step1.jpg" alt="Click sliders icon to set mode" className="rounded-lg border border-white/10 w-full max-w-sm mt-1" />
                  </li>
                  <li>3. Select <span className="text-white/70">VPN</span> from the mode options (Proxy / System proxy / VPN / VPN service)
                    <img src="/hiddify-mode-step2.jpg" alt="Select VPN mode" className="rounded-lg border border-white/10 w-full max-w-sm mt-2" />
                  </li>
                  <li>4. Connect as usual — all apps now route through SpicyVPN ✓</li>
                </ol>
              </CardContent>
            </Card>

            </div> {/* end grid */}

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <p className="text-base text-amber-400 font-medium">
                Chrome/Brave might have issues, use Firefox.
              </p>
            </div>

            <div className="flex items-center gap-3 px-1">
              <Clock className="w-3.5 h-3.5 text-white/20" />
              <span className="text-base text-white/20">
                Config expires {new Date(config.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
              <Shield className="w-3.5 h-3.5 text-white/20 ml-auto" />
              <span className="text-base text-white/20">Secured with Hysteria 2</span>
            </div>

          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
