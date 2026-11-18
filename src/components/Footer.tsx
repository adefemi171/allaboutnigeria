import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#09090b] py-12 text-sm text-[#9a9891]">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-[#f5f4f0]">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-[#00a862] font-mono-tech text-[11px] font-bold text-[#0b1620]">
              NG
            </span>
            <span className="font-display font-semibold">allaboutnigeria.ng</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#9a9891]">
            Clear survival guides, interactive tools, and real-data 3D voxel maps covering all 36 Nigerian states and the FCT.
          </p>
          <p className="mt-3 font-mono-tech text-[10px] text-[#71717a]">
            by Runeward Labs ·{" "}
            <a href="mailto:adefemi@runeward.io" className="text-[#9a9891] hover:text-white">
              adefemi@runeward.io
            </a>
          </p>
        </div>

        <div>
          <h4 className="font-mono-tech text-xs uppercase tracking-wider text-[#f5f4f0]">
            3D Voxel Cities
          </h4>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link href="/explore/abuja" className="hover:text-white">
                Abuja FCT (Aso Rock &amp; CBD)
              </Link>
            </li>
            <li>
              <Link href="/explore/kano" className="hover:text-white">
                Kano (Old City &amp; Nassarawa)
              </Link>
            </li>
            <li>
              <Link href="/explore/rivers" className="hover:text-white">
                Port Harcourt (Rivers)
              </Link>
            </li>
            <li>
              <Link href="/explore/enugu" className="hover:text-white">
                Enugu · <span className="text-[#9a9891]">Ibadan · Lagos</span>
              </Link>
            </li>
            <li>
              <Link href="/atlas" className="text-[#10b981] hover:text-white">
                All 36 States + FCT Atlas →
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono-tech text-xs uppercase tracking-wider text-[#f5f4f0]">
            Survival Guides
          </h4>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link href="/guides/moving-to-lagos" className="hover:text-white">
                Moving to Nigeria
              </Link>
            </li>
            <li>
              <Link href="/guides/renting-an-apartment" className="hover:text-white">
                Renting an Apartment
              </Link>
            </li>
            <li>
              <Link href="/guides/nin-bvn-immigration" className="hover:text-white">
                NIN, BVN &amp; Visas
              </Link>
            </li>
            <li>
              <Link href="/guides/power-solar-internet" className="hover:text-white">
                Power, Solar &amp; Fiber
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono-tech text-xs uppercase tracking-wider text-[#f5f4f0]">
            Tools &amp; Connect
          </h4>
          <ul className="mt-3 space-y-2 text-xs">
            <li>
              <Link href="/tools#rent-calc" className="hover:text-white">
                Nigeria True Rent Calculator
              </Link>
            </li>
            <li>
              <Link href="/tools#solar-calc" className="hover:text-white">
                Inverter &amp; Solar Sizing
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-white">
                About
              </Link>
            </li>
            <li>
              <Link href="/newsletter" className="hover:text-white">
                Newsletter
              </Link>
            </li>
            <li>
              <Link href="/contact" className="hover:text-white">
                Contact (adefemi@runeward.io)
              </Link>
            </li>
            <li>
              <Link href="/feedback" className="text-[#f59e0b] hover:text-white">
                Spot something wrong? Report it →
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-7xl flex-col items-start justify-between gap-3 border-t border-white/10 px-4 pt-6 font-mono-tech text-[11px] text-[#71717a] sm:flex-row sm:items-center sm:px-6">
        <span>© 2026 All About Nigeria · by Runeward Labs</span>
        <span>3D city geometry derived from © OpenStreetMap contributors</span>
      </div>
    </footer>
  );
}
