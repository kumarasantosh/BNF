import { BarChart2, TrendingUp } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2d3e] bg-[#0f1117]/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Left — branding */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <BarChart2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-none text-white tracking-tight">
              Bank Nifty Dashboard
            </h1>
            <p className="mt-0.5 text-[10px] text-slate-500 leading-none">
              NSE · Options & Futures · Admin View
            </p>
          </div>
        </div>

        {/* Right — market status */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
            <span>BANKNIFTY</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 live-dot" />
            <span className="text-green-400 font-medium">Market Open</span>
          </div>
        </div>
      </div>
    </header>
  );
}
