"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CommandSearch } from "@/components/CommandSearch";

const SCENE_NAV_DESKTOP = [
  { href: "/guides", label: "Guides" },
  { href: "/atlas", label: "Map" },
  { href: "/map", label: "3D Map" },
  { href: "/sky", label: "Sky" },
  { href: "/about", label: "About" },
];

const SCENE_NAV_MOBILE = [
  { href: "/guides", label: "Guides" },
  { href: "/atlas", label: "Map" },
  { href: "/map", label: "3D Map" },
  { href: "/sky", label: "Sky" },
  { href: "/places", label: "Universities" },
  { href: "/about", label: "About" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/contact", label: "Contact" },
];

const FULL_NAV = [
  { href: "/atlas", label: "36 States" },
  { href: "/map", label: "Map" },
  { href: "/places", label: "Universities" },
  { href: "/explore/abuja", label: "3D Cities" },
  { href: "/sky", label: "Sky" },
  { href: "/guides", label: "Guides" },
  { href: "/tools", label: "Tools" },
  { href: "/about", label: "About" },
  { href: "/newsletter", label: "Newsletter" },
  { href: "/contact", label: "Contact" },
];

/** The site icon (src/app/icon0.svg): Nigeria's outline on flag green. */
function NigeriaMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" rx="11" fill="#008751" />
      <path fill="#fff" d="M31.9 21.2L31.0 20.8L29.3 21.6L27.1 21.4L24.2 22.2L22.6 23.3L22.5 26.2L21.6 27.7L19.8 29.0L19.8 33.7L18.9 34.2L18.8 36.4L20.2 37.5L20.3 39.5L21.0 40.8L20.6 41.9L20.0 41.7L19.3 42.7L20.0 43.4L19.5 44.7L19.0 45.3L18.0 45.5L18.0 46.2L16.7 47.8L16.4 49.9L14.6 50.2L14.0 57.1L14.1 62.9L14.6 64.2L14.0 66.4L21.0 66.1L24.8 66.7L27.6 69.2L28.9 71.2L30.9 71.0L29.1 71.2L28.8 71.5L29.3 72.1L30.5 72.5L31.5 71.7L30.7 72.5L29.8 72.6L30.0 73.8L30.6 74.0L30.1 74.0L30.5 75.3L32.1 77.7L34.4 79.2L35.2 79.2L35.3 78.5L35.4 79.1L38.0 78.9L38.2 77.2L38.2 78.8L39.9 78.6L39.8 77.1L40.0 78.2L40.9 77.8L40.4 76.5L41.2 77.6L40.7 78.6L43.4 78.1L43.1 76.6L43.0 77.5L43.5 78.0L47.6 77.6L48.0 77.2L47.5 75.7L48.9 76.7L50.8 73.8L51.4 71.2L51.1 69.7L54.1 66.7L56.2 65.6L56.7 63.8L57.1 64.0L58.9 62.5L59.3 63.4L61.0 63.4L61.6 62.2L64.2 64.1L64.7 66.1L66.2 66.0L67.0 65.0L67.4 63.3L69.1 62.1L68.4 61.0L70.2 59.1L70.1 58.3L71.2 56.6L71.4 54.1L74.0 53.7L74.9 53.1L75.0 50.6L75.6 50.1L75.3 48.4L76.1 47.5L77.4 47.0L77.4 44.2L79.0 43.1L79.3 40.5L80.8 38.0L82.0 36.6L82.9 36.9L85.6 35.2L85.5 33.7L86.0 31.2L84.8 30.1L83.0 29.7L82.4 25.6L79.7 21.8L78.0 21.8L77.1 23.0L75.2 23.2L74.0 24.5L73.5 24.4L72.7 25.7L70.5 25.4L66.6 23.8L62.2 23.8L58.7 24.6L55.7 27.3L51.8 27.1L49.9 26.5L46.6 24.3L44.8 24.0L42.2 25.5L41.2 25.4L40.4 26.2L39.5 26.2L36.8 22.7Z" />
    </svg>
  );
}

export function Navbar({
  transparent = false,
  scene = false,
}: {
  transparent?: boolean;
  scene?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onSolid = (e: Event) => {
      const detail = (e as CustomEvent<{ solid: boolean }>).detail;
      setSolid(Boolean(detail?.solid));
    };
    const onOpenSearch = () => setSearchOpen(true);
    window.addEventListener("story-header-solid", onSolid as EventListener);
    window.addEventListener("open-command-search", onOpenSearch);
    return () => {
      window.removeEventListener("story-header-solid", onSolid as EventListener);
      window.removeEventListener("open-command-search", onOpenSearch);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (scene) {
    return (
      <>
        <header
          data-site-header
          className={`site-header site-header--scene${solid || open ? " is-solid" : ""}${open ? " is-menu-open" : ""}`}
        >
          <div className="site-header__inner">
            <Link className="wordmark" href="/" aria-label="All About Nigeria, home">
              <NigeriaMark />
              <span>
                <span className="wordmark__lead">All About </span>Nigeria
              </span>
            </Link>

            <nav className="site-nav site-nav--desktop" aria-label="Main">
              {SCENE_NAV_DESKTOP.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="search search--desktop" data-search>
              <label className="visually-hidden" htmlFor="site-search">
                Search guides and places
              </label>
              <input
                className="search__field"
                id="site-search"
                type="text"
                inputMode="search"
                enterKeyHint="search"
                placeholder="Search guides and places"
                autoComplete="off"
                spellCheck={false}
                readOnly
                onFocus={() => setSearchOpen(true)}
                onClick={() => setSearchOpen(true)}
              />
              <kbd className="search__key" aria-hidden="true">
                /
              </kbd>
            </div>

            <div className="site-header__mobile-actions">
              <button
                type="button"
                className="header-icon-btn"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="header-icon-btn"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </header>
        {open && (
          <div className="site-drawer" role="dialog" aria-label="Site menu">
            <nav className="site-drawer__nav" aria-label="Mobile">
              {SCENE_NAV_MOBILE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/explore/abuja" onClick={() => setOpen(false)}>
                Open Abuja 3D
              </Link>
              <Link href="/tools" onClick={() => setOpen(false)}>
                Tools
              </Link>
            </nav>
            <button
              type="button"
              className="site-drawer__search"
              onClick={() => {
                setOpen(false);
                setSearchOpen(true);
              }}
            >
              <Search className="h-4 w-4" />
              Search guides and places
            </button>
          </div>
        )}
        <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </>
    );
  }

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors ${
        transparent
          ? "border-b border-white/10 bg-[#0b1620]/75 backdrop-blur-md"
          : "border-b border-white/10 bg-[#0b1620]/95 backdrop-blur-md"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex min-w-0 items-center gap-2.5">
          <NigeriaMark />
          <div className="flex min-w-0 flex-col leading-none">
            <span className="font-display truncate text-sm font-semibold tracking-tight text-[#e9e5db] sm:text-base">
              All About Nigeria
            </span>
            <span className="font-mono-tech hidden text-[10px] tracking-wider text-[#93a3b5] sm:block">
              ALLABOUTNIGERIA.NG
            </span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {FULL_NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href.startsWith("/explore") &&
                (pathname.startsWith("/explore") || pathname === "/lagos")) ||
              pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-[#93a3b5] hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle Menu"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 text-[#e9e5db] md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#0b1620] px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {FULL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm text-[#e9e5db] hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
