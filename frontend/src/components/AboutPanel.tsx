import { useEffect, useState } from "react";

const SOURCES: { name: string; role: string; href: string }[] = [
  { name: "Zillow ZHVI", role: "median home values + history", href: "https://www.zillow.com/research/data/" },
  { name: "U.S. Census Bureau", role: "ZIP boundaries (ZCTA) + ACS population/income", href: "https://www.census.gov/" },
  { name: "Redfin Data Center", role: "sold $/sqft", href: "https://www.redfin.com/news/data-center/" },
  { name: "GeoNames (CC BY 4.0)", role: "place names", href: "https://www.geonames.org/" },
  { name: "Wikipedia (CC BY-SA 4.0)", role: "area summaries", href: "https://en.wikipedia.org/" },
  { name: "CARTO / © OpenStreetMap contributors", role: "basemap tiles", href: "https://carto.com/attribution/" },
  { name: "Mapbox", role: "drive-time contours, routing, geocoding", href: "https://www.mapbox.com/" },
];

/** About & data popover (012 R5): every source credited in one place, plus
 * the estimates-not-advice disclaimer. */
export default function AboutPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="about-trigger" onClick={() => setOpen(true)}>
        ⓘ About & data
      </button>
      {open && (
        <div className="about" role="dialog" aria-label="About tradespace and its data sources">
          <div className="about__card">
            <header className="about__head">
              <h2 className="about__title">About tradespace</h2>
              <button
                type="button"
                className="about__close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <p className="about__blurb">
              tradespace overlays housing cost and commute reach so you can see
              where you could live. All figures are estimates built from public,
              aggregate data — <strong>not financial or real-estate advice</strong>.
              Traffic and prices vary; verify anything that matters.
            </p>
            <h3 className="about__subhead">Data &amp; services</h3>
            <ul className="about__sources">
              {SOURCES.map((s) => (
                <li key={s.name}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.name}
                  </a>{" "}
                  — {s.role}
                </li>
              ))}
            </ul>
            <p className="about__foot">
              Code AGPL-3.0 ·{" "}
              <a
                href="https://github.com/alex-g-davies/Housing-Tradespace"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source on GitHub
              </a>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
