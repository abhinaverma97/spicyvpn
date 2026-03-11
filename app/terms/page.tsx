export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-24">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold">Terms & Conditions</h1>
        <p className="text-white/60">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-white/80 leading-relaxed">
          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">1. Acceptance of Terms</h2>
            <p>By accessing and using SpicyVPN, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">2. Acceptable Use</h2>
            <p>You agree to use the service only for lawful purposes. You may not use our service to engage in illegal activities, including but not limited to distributing malware, participating in DDoS attacks, or accessing child exploitation material. Torrenting is strictly blocked on our network.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">3. Fair Usage Policy</h2>
            <p>Accounts are granted a specific data quota (e.g., 30GB per 30 days). Access will be suspended automatically upon exceeding this quota.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">4. No Warranty</h2>
            <p>The service is provided &quot;as is&quot; without any warranties of any kind. We do not guarantee uninterrupted or error-free operation.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 text-white">5. Contact</h2>
            <p>If you have questions, please contact us at stealthvpn365@gmail.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}