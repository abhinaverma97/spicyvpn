export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-24">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="text-white/60">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-white/80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">1. Information We Collect</h2>
            <p>We believe in minimal data collection. We only collect the information necessary to provide the service:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Email address and profile picture (via Google OAuth) for account management.</li>
              <li>Total bandwidth used (upload and download) to enforce quota limits.</li>
              <li>Connection timestamps to determine active status.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">2. No Logs Policy</h2>
            <p>We do not log, monitor, or store any details regarding the websites you visit, the content of your traffic, your DNS queries, or your origin IP address. Your browsing activity remains entirely private.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">3. How We Use Your Data</h2>
            <p>Your email is used solely for account identification. Your bandwidth usage is used solely to enforce the 30GB data limit. We do not sell or share any of this data with third parties.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">4. Data Deletion</h2>
            <p>If you wish to have your account and associated bandwidth data deleted, please contact the administrator. Deleting your account will immediately sever any active VPN connections.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">5. Contact</h2>
            <p>If you have any questions about this Privacy Policy, contact us at stealthvpn365@gmail.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}