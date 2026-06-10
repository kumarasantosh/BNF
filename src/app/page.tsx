import Header from '@/components/Header';
import WeightageChart from '@/components/WeightageChart';
import AdminNotes from '@/components/AdminNotes';
import LiveBNFDetails from '@/components/LiveBNFDetails';
import VegaDashboard from '@/components/VegaDashboard';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#0f1117]">
      <Header />

      <main className="mx-auto max-w-screen-2xl px-4 py-6 space-y-8 sm:px-6 lg:px-8">
        {/* Row 1 — NSE ATM Vega Trend */}
        <section aria-label="NSE ATM Vega Trend">
          <VegaDashboard />
        </section>

        {/* Row 2 — Live Bank Nifty Details (full width) */}
        <section aria-label="Live Bank Nifty Details">
          <LiveBNFDetails />
        </section>

        {/* Row 3 — Weightage Chart + Admin Notes side by side */}
        <section
          aria-label="Weightage and Notes"
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <div>
            <WeightageChart />
          </div>
          <div>
            <AdminNotes />
          </div>
        </section>
      </main>

      <footer className="mt-12 border-t border-[#2a2d3e] py-4 text-center text-xs text-slate-500">
        Bank Nifty Dashboard — for informational purposes only. Not financial advice.
      </footer>
    </div>
  );
}
