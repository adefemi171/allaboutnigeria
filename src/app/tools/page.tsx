"use client";

import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { openFeedbackModal } from "@/components/FeedbackWidget";
import Link from "next/link";
import { Home, Zap, Bus, Info, Flag, Satellite } from "lucide-react";

const CITY_RENT_PRESETS = [
  { name: "Abuja — Maitama / Asokoro", defaultRent: 16000000, serviceCharge: 2200000, agency: 10, legal: 5 },
  { name: "Abuja — Wuse II / Jabi", defaultRent: 9500000, serviceCharge: 1200000, agency: 10, legal: 5 },
  { name: "Abuja — Gwarinpa / Lugbe", defaultRent: 3800000, serviceCharge: 400000, agency: 10, legal: 5 },
  { name: "Lagos — Victoria Island / Ikoyi", defaultRent: 18000000, serviceCharge: 2800000, agency: 10, legal: 10 },
  { name: "Lagos — Lekki Phase 1", defaultRent: 9500000, serviceCharge: 1600000, agency: 10, legal: 10 },
  { name: "Lagos — Yaba / Ikeja GRA", defaultRent: 5500000, serviceCharge: 750000, agency: 10, legal: 10 },
  { name: "Port Harcourt — Old / New GRA", defaultRent: 5000000, serviceCharge: 700000, agency: 10, legal: 10 },
  { name: "Enugu — Independence Layout / New Haven", defaultRent: 2800000, serviceCharge: 350000, agency: 10, legal: 5 },
  { name: "Ibadan — Bodija / Jericho GRA", defaultRent: 2200000, serviceCharge: 250000, agency: 10, legal: 5 },
  { name: "Kano — Nassarawa GRA", defaultRent: 2400000, serviceCharge: 300000, agency: 5, legal: 5 },
  { name: "Benin City — GRA", defaultRent: 2600000, serviceCharge: 300000, agency: 10, legal: 5 },
  { name: "Calabar — State Housing / Marina", defaultRent: 2000000, serviceCharge: 250000, agency: 10, legal: 5 },
];

const TRANSIT_CORRIDORS = [
  {
    route: "Abuja (Idu) ↔ Kaduna (Rigasa) · Standard-Gauge Rail",
    peakRoadMin: "2h 15m (Train)",
    offPeakRoadMin: "2h 00m (Express)",
    transitTip: "Avoid highway stress—NRC morning and afternoon trains offer AC coaches and predictable arrival.",
    fareEstimate: "₦3,600 – ₦9,000 NRC Train",
  },
  {
    route: "Lagos (Ebute Metta) ↔ Abeokuta ↔ Ibadan · Rail",
    peakRoadMin: "2h 20m (Train)",
    offPeakRoadMin: "45m to Abeokuta",
    transitTip: "Reliable commute for living in Ibadan or Abeokuta while working hybrid in Lagos.",
    fareEstimate: "₦3,000 – ₦9,000 NRC Train",
  },
  {
    route: "Abuja (ABV) ↔ Lagos / Port Harcourt / Kano / Enugu · Flights",
    peakRoadMin: "55–75 min air",
    offPeakRoadMin: "+60m airport check-in",
    transitTip: "Book Ibom Air, Air Peace, ValueJet, or United Nigeria early-morning departures to minimize delays.",
    fareEstimate: "₦110,000 – ₦210,000 one-way",
  },
  {
    route: "Warri ↔ Itakpe (Kogi) · Rail Corridor",
    peakRoadMin: "4h 30m (Train)",
    offPeakRoadMin: "Station stops along Delta/Edo/Kogi",
    transitTip: "Connects Delta and Edo directly into Kogi State near the Abuja highway corridor.",
    fareEstimate: "₦2,500 – ₦6,000 NRC Train",
  },
  {
    route: "Urban Intra-City: Abuja Metro / PH / Kano / Lagos Lagoon",
    peakRoadMin: "20–60 min",
    offPeakRoadMin: "12–25 min",
    transitTip: "Use Uber/Bolt/inDrive in major capitals, Cowry-card BRT/LAGFERRY in Lagos, or keke/taxis for short hops.",
    fareEstimate: "₦500 – ₦6,500 per trip",
  },
];

function formatNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString("en-NG");
}

export default function ToolsPage() {
  const [presetIdx, setPresetIdx] = useState(1); // Abuja Wuse II default to keep focus balanced!
  const [annualRent, setAnnualRent] = useState(CITY_RENT_PRESETS[1].defaultRent);
  const [agencyPct, setAgencyPct] = useState(CITY_RENT_PRESETS[1].agency);
  const [legalPct, setLegalPct] = useState(CITY_RENT_PRESETS[1].legal);
  const [cautionPct, setCautionPct] = useState(10);
  const [serviceCharge, setServiceCharge] = useState(CITY_RENT_PRESETS[1].serviceCharge);

  const rentBreakdown = useMemo(() => {
    const agency = (annualRent * agencyPct) / 100;
    const legal = (annualRent * legalPct) / 100;
    const caution = (annualRent * cautionPct) / 100;
    const total = annualRent + agency + legal + caution + serviceCharge;
    return { agency, legal, caution, total, monthlyEq: total / 12 };
  }, [annualRent, agencyPct, legalPct, cautionPct, serviceCharge]);

  const [regionSun, setRegionSun] = useState<"north" | "central" | "south">("central");
  const [acCount, setAcCount] = useState(1);
  const [fridges, setFridges] = useState(1);
  const [laptopsRouter, setLaptopsRouter] = useState(2);
  const [gridHours, setGridHours] = useState(14);

  const solarSizing = useMemo(() => {
    const peakWatts = acCount * 1100 + fridges * 200 + laptopsRouter * 95 + 220;
    const backupHours = Math.max(4, 24 - gridHours);
    const avgWatts = acCount * 650 + fridges * 110 + laptopsRouter * 85 + 160;
    const neededKwh = (avgWatts * backupHours) / 1000;
    const recommendedKva = peakWatts <= 1800 ? 3 : peakWatts <= 3600 ? 5 : peakWatts <= 6500 ? 8 : 10;
    const batteryKwh = Math.ceil(neededKwh / 5) * 5;
    const sunYieldFactor = regionSun === "north" ? 4.4 : regionSun === "central" ? 3.8 : 3.2;
    const panelsKw = Math.max(2, Math.ceil(neededKwh / sunYieldFactor));
    const estCost = recommendedKva * 260000 + batteryKwh * 420000 + panelsKw * 320000;
    return { peakWatts, backupHours, recommendedKva, batteryKwh, panelsKw, estCost };
  }, [acCount, fridges, laptopsRouter, gridHours, regionSun]);

  const [corridorIdx, setCorridorIdx] = useState(0);

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-8 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono-tech text-xs uppercase tracking-widest text-[#00a862]">
              ALL ABOUT NIGERIA · INTERACTIVE TOOLS
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              Nigeria survival calculators.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-[#b6b4ad]">
              Compare Day-1 move-in rent across Nigerian cities, size a quiet lithium inverter + solar system for your region, and plan rail, flight, and urban transit.
            </p>
          </div>
          <button
            onClick={() => openFeedbackModal({ topic: "Survival Tools / Calculators", category: "outdated-cost" })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-[#d4d4d8] hover:border-[#00a862] hover:text-white"
          >
            <Flag className="h-3.5 w-3.5 text-[#00a862]" />
            Spot wrong pricing? Report it
          </button>
        </header>

        <div className="mt-10 space-y-12">
          <section className="rounded-2xl border border-[#38bdf8]/25 bg-gradient-to-br from-[#0c1520] to-[#121215] p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2.5">
                  <Satellite className="h-5 w-5 text-[#38bdf8]" />
                  <h2 className="font-display text-2xl font-semibold text-white">Sky over Nigeria</h2>
                </div>
                <p className="mt-1 max-w-xl text-xs text-[#9a9891]">
                  Which satellites passed over a place this week (Celestrak + SGP4), replayed on a
                  globe, with the pictures Sentinel, Landsat and the weather satellites took of it.
                </p>
              </div>
              <Link
                href="/sky"
                className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#38bdf8] px-4 py-2.5 text-sm font-semibold text-[#09090b] hover:bg-[#7dd3fc]"
              >
                Open Sky →
              </Link>
            </div>
          </section>

          {/* TOOL 1: Nigeria True Rent Calculator */}
          <section
            id="rent-calc"
            className="rounded-2xl border border-white/15 bg-[#121215] p-6 sm:p-8"
          >
            <div className="flex items-center gap-2.5">
              <Home className="h-5 w-5 text-[#00a862]" />
              <h2 className="font-display text-2xl font-semibold text-white">
                Nigeria True Rent &amp; Move-In Calculator
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#9a9891]">
              Across Nigeria, base annual rent is only ~70%–78% of what you pay on Day 1. Select any city preset and adjust fees below.
            </p>

            <div className="mt-6 grid gap-8 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-7">
                <div>
                  <label className="font-mono-tech text-[11px] uppercase text-[#9a9891]">
                    City &amp; District Preset
                  </label>
                  <select
                    value={presetIdx}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setPresetIdx(i);
                      setAnnualRent(CITY_RENT_PRESETS[i].defaultRent);
                      setServiceCharge(CITY_RENT_PRESETS[i].serviceCharge);
                      setAgencyPct(CITY_RENT_PRESETS[i].agency);
                      setLegalPct(CITY_RENT_PRESETS[i].legal);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#09090b] px-3 py-2.5 text-sm text-white focus:border-[#00a862] focus:outline-none"
                  >
                    {CITY_RENT_PRESETS.map((d, i) => (
                      <option key={d.name} value={i}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between font-mono-tech text-xs">
                    <span className="text-[#9a9891]">Headline Annual Rent</span>
                    <span className="text-white">{formatNaira(annualRent)}</span>
                  </div>
                  <input
                    type="range"
                    min={800000}
                    max={45000000}
                    step={200000}
                    value={annualRent}
                    onChange={(e) => setAnnualRent(Number(e.target.value))}
                    className="mt-1.5 h-1.5 w-full accent-[#00a862]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Agency ({agencyPct}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={15}
                      value={agencyPct}
                      onChange={(e) => setAgencyPct(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Legal ({legalPct}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={15}
                      value={legalPct}
                      onChange={(e) => setLegalPct(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Caution ({cautionPct}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={15}
                      value={cautionPct}
                      onChange={(e) => setCautionPct(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-mono-tech text-xs">
                    <span className="text-[#9a9891]">Annual Estate Service Charge</span>
                    <span className="text-white">{formatNaira(serviceCharge)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={6000000}
                    step={50000}
                    value={serviceCharge}
                    onChange={(e) => setServiceCharge(Number(e.target.value))}
                    className="mt-1.5 h-1.5 w-full accent-[#10b981]"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#09090b] p-5 lg:col-span-5">
                <div className="space-y-2.5 font-mono-tech text-xs">
                  <div className="flex justify-between text-[#b6b4ad]">
                    <span>Base Annual Rent</span>
                    <span>{formatNaira(annualRent)}</span>
                  </div>
                  <div className="flex justify-between text-[#b6b4ad]">
                    <span>Agency Fee ({agencyPct}%)</span>
                    <span>{formatNaira(rentBreakdown.agency)}</span>
                  </div>
                  <div className="flex justify-between text-[#b6b4ad]">
                    <span>Legal / Agreement ({legalPct}%)</span>
                    <span>{formatNaira(rentBreakdown.legal)}</span>
                  </div>
                  <div className="flex justify-between text-[#b6b4ad]">
                    <span>Caution Deposit ({cautionPct}%)</span>
                    <span>{formatNaira(rentBreakdown.caution)}</span>
                  </div>
                  <div className="flex justify-between text-[#b6b4ad]">
                    <span>Service Charge</span>
                    <span>{formatNaira(serviceCharge)}</span>
                  </div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4">
                  <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#9a9891]">
                    Total Day-1 Move-In Cash
                  </div>
                  <div className="font-display mt-1 text-3xl font-bold text-[#f59e0b]">
                    {formatNaira(rentBreakdown.total)}
                  </div>
                  <div className="mt-1 font-mono-tech text-xs text-[#10b981]">
                    Effective monthly burn: {formatNaira(rentBreakdown.monthlyEq)} / mo
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* TOOL 2: Inverter & Solar Sizing */}
          <section
            id="solar-calc"
            className="rounded-2xl border border-white/15 bg-[#121215] p-6 sm:p-8"
          >
            <div className="flex items-center gap-2.5">
              <Zap className="h-5 w-5 text-[#10b981]" />
              <h2 className="font-display text-2xl font-semibold text-white">
                Inverter &amp; Solar Sizing Calculator
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#9a9891]">
              Size a quiet LiFePO4 lithium + hybrid solar system adjusted for your Nigerian region&apos;s sunlight and grid hours.
            </p>

            <div className="mt-6 grid gap-8 lg:grid-cols-12">
              <div className="space-y-4 lg:col-span-7">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "north", label: "North (Kano / Sokoto / Bauchi)" },
                      { id: "central", label: "Central (Abuja / Jos / Kwara)" },
                      { id: "south", label: "South (Enugu / PH / Lagos / Ibadan)" },
                    ] as const
                  ).map((reg) => (
                    <button
                      key={reg.id}
                      onClick={() => setRegionSun(reg.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                        regionSun === reg.id
                          ? "border-[#10b981] bg-[#10b981]/15 text-white"
                          : "border-white/10 bg-[#09090b] text-[#9a9891] hover:text-white"
                      }`}
                    >
                      {reg.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex justify-between font-mono-tech text-xs">
                    <span className="text-[#9a9891]">Daily Grid / Band Supply (hours)</span>
                    <span className="text-white">{gridHours} hrs/day</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={22}
                    value={gridHours}
                    onChange={(e) => setGridHours(Number(e.target.value))}
                    className="mt-1.5 h-1.5 w-full accent-[#10b981]"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Inverter ACs ({acCount})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      value={acCount}
                      onChange={(e) => setAcCount(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Fridges ({fridges})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={3}
                      value={fridges}
                      onChange={(e) => setFridges(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                  <div>
                    <label className="font-mono-tech text-[11px] text-[#9a9891]">
                      Workstations/Starlink ({laptopsRouter})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      value={laptopsRouter}
                      onChange={(e) => setLaptopsRouter(Number(e.target.value))}
                      className="mt-1 h-1.5 w-full accent-[#00a862]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#09090b] p-5 font-mono-tech lg:col-span-5">
                <div>
                  <div className="text-[10px] text-[#71717a]">HYBRID INVERTER</div>
                  <div className="font-display mt-1 text-2xl font-bold text-white">
                    {solarSizing.recommendedKva} kVA
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717a]">LIFEPO4 BATTERY</div>
                  <div className="font-display mt-1 text-2xl font-bold text-[#10b981]">
                    {solarSizing.batteryKwh} kWh
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717a]">SOLAR ARRAY</div>
                  <div className="mt-1 text-sm text-white">{solarSizing.panelsKw} kWp panels</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#71717a]">EST. HARDWARE BUDGET</div>
                  <div className="mt-1 text-sm text-[#f59e0b]">
                    {formatNaira(solarSizing.estCost)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* TOOL 3: Intercity & Urban Transit */}
          <section
            id="commute-calc"
            className="rounded-2xl border border-white/15 bg-[#121215] p-6 sm:p-8"
          >
            <div className="flex items-center gap-2.5">
              <Bus className="h-5 w-5 text-[#f59e0b]" />
              <h2 className="font-display text-2xl font-semibold text-white">
                Nigeria Intercity &amp; Urban Transit Planner
              </h2>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TRANSIT_CORRIDORS.map((c, idx) => (
                <button
                  key={c.route}
                  onClick={() => setCorridorIdx(idx)}
                  className={`rounded-xl border p-4 text-left transition ${
                    corridorIdx === idx
                      ? "border-[#00a862] bg-[#191411]"
                      : "border-white/10 bg-[#09090b] hover:border-white/25"
                  }`}
                >
                  <div className="text-sm font-semibold text-white">{c.route}</div>
                  <div className="mt-2 flex gap-4 font-mono-tech text-[11px]">
                    <span className="text-[#f59e0b]">{c.peakRoadMin}</span>
                    <span className="text-[#10b981]">{c.offPeakRoadMin}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-[#09090b] p-4">
              <div className="flex items-start gap-2.5 text-xs text-[#d4d4d8]">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#10b981]" />
                <div>
                  <div className="font-semibold text-white">
                    {TRANSIT_CORRIDORS[corridorIdx].route}
                  </div>
                  <p className="mt-1 text-[#b6b4ad]">
                    {TRANSIT_CORRIDORS[corridorIdx].transitTip}
                  </p>
                  <div className="mt-2 font-mono-tech text-[11px] text-[#f59e0b]">
                    Typical fare: {TRANSIT_CORRIDORS[corridorIdx].fareEstimate}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
