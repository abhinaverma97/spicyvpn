import { Shield } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-transparent py-8 px-6 mt-auto">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Shield className="w-4 h-4" />
          <span>&copy; {new Date().getFullYear()} SpicyVPN. All rights reserved.</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-white/40">
          <a href="mailto:stealthvpn365@gmail.com" className="hover:text-white transition-colors">
            Contact: stealthvpn365@gmail.com
          </a>
          <Link href="/terms" className="hover:text-white transition-colors">
            Terms & Conditions
          </Link>
          <Link href="/privacy" className="hover:text-white transition-colors">
            Privacy Policy
          </Link>
        </div>

      </div>
    </footer>
  );
}