export interface NewsletterSection {
  heading: string;
  subSections: {
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }[];
}

export interface NewsletterIssue {
  slug: string;
  title: string;
  date: string;
  author: string;
  summary: string;
  intro: string;
  sections: NewsletterSection[];
  sources: string[];
}

export const NEWSLETTER_ISSUES: NewsletterIssue[] = [
  {
    slug: "november-2026",
    title: "What's new in November 2026",
    date: "November 14, 2026",
    author: "Adefemi",
    summary:
      "36-state + FCT 3D voxel maps, 16 Nigerian university campuses, Harmattan prep, and street-level walking mode.",
    intro:
      "Harmattan is starting to drift south from the Sahel, university calendars are back in full swing, and this month marks the biggest expansion yet on All About Nigeria—moving well beyond one city to cover all 36 states and the FCT in interactive 3D.",
    sections: [
      {
        heading: "What's new across Nigeria's states",
        subSections: [
          {
            title: "Harmattan haze arrives from late November",
            paragraphs: [
              "The Harmattan, a dry and dusty north-easterly wind from the Sahara, normally sets in across the far north (Kano, Sokoto, Katsina, Maiduguri) from late November and reaches the southern coastal states in December and January.",
              "Expect cooler nights and dusty, hazy mornings, most noticeably in the far north and on the Jos Plateau. Thick dust haze reduces visibility and can delay or divert flights, so leave slack in any same-day connection. For forecasts, use the Nigerian Meteorological Agency (NiMet).",
            ],
            bullets: [
              "Keep saline nasal spray, lip balm, and extra drinking water handy.",
              "Clean air-conditioner filters and wipe dust off solar panels more often; dust cuts panel output.",
              "Avoid tight same-day flight connections on hazy days.",
            ],
          },
          {
            title: "December travel: book early and expect delays",
            paragraphs: [
              "December is the busiest travel month of the year, and flights and short-let apartments in Lagos, Abuja, Port Harcourt, Uyo, Calabar and Owerri fill up and get more expensive as the holidays approach. Book early. Allow for delays too: Nigeria Civil Aviation Authority figures for August 2026 showed 59.9% of domestic flights (4,765 of 7,961) left late. Visitors flying in from abroad need an e-Visa before travel, because visa on arrival has ended.",
            ],
          },
        ],
      },
      {
        heading: "What's new on All About Nigeria",
        subSections: [
          {
            title: "All 36 States + FCT & 16 Universities in 3D voxels",
            paragraphs: [
              "Every state capital in Nigeria—plus 16 flagship university campuses including UI Ibadan, UNILAG, OAU Ile-Ife, ABU Zaria, UNN Nsukka, BUK Kano, UNIPORT, UNIBEN, UniAbuja, UNILORIN, UNIJOS, UNICAL, UNIUYO, FUTO, UNIZIK, and Covenant—now has its own interactive 3D OpenStreetMap voxel map.",
              "You can also drop into Street View on any map, walk down sidewalks with animated pedestrians, or switch to a 1st-person eye-level walk.",
            ],
          },
          {
            title: "Community corrections & feedback log",
            paragraphs: [
              "Nigeria's prices, transit routes, and landmarks move quickly. You can now flag anything outdated or inaccurate on any page via the Report Issue button or the Contact page.",
            ],
          },
        ],
      },
    ],
    sources: [
      "OpenStreetMap contributors (building footprints, roads & campus POIs)",
      "Nigerian Meteorological Agency (NiMet): nimet.gov.ng",
      "Nigeria Civil Aviation Authority (NCAA) August 2026 flight delay data, published September 2026",
      "Nigeria Immigration Service e-Visa portal: evisa.immigration.gov.ng",
    ],
  },
  {
    slug: "october-2026",
    title: "What's new in October 2026",
    date: "October 31, 2026",
    author: "Adefemi",
    summary:
      "Checking a flat's electricity band before you pay, and booking NRC trains early.",
    intro:
      "The rains ease off in October in most of the country. Two practical checks for residents and returnees before year-end.",
    sections: [
      {
        heading: "What's new in Nigeria",
        subSections: [
          {
            title: "Check the electricity band before you pay rent",
            paragraphs: [
              "Before paying a year's rent anywhere in Abuja (AEDC), Lagos (Eko Electric or Ikeja Electric), Ibadan (IBEDC), Enugu (MainPower/EEDC) or Port Harcourt (PHED), ask for the meter number and feeder name and confirm the tariff band with the distribution company. NERC's tariff orders list each feeder with its band and minimum hours: Band A is 20 hours a day, B 16, C 12, D 8 and E 4. NERC's September 2026 order for Ikeja Electric lists Band A at ₦209.50/kWh, against ₦62.48 for Band B.",
            ],
          },
          {
            title: "Trains between cities: book early",
            paragraphs: [
              "The Nigerian Railway Corporation runs standard-gauge passenger trains on Abuja–Kaduna, Lagos–Abeokuta–Ibadan and Warri–Itakpe. Seats are scarce: in October 2026 NRC said demand for tickets was more than ten times the available capacity. Book as early as the official sites allow (nrc.tps.ng, nrc.gsds.ng, nrc-fane.ng) and do not buy from touts.",
            ],
          },
        ],
      },
      {
        heading: "What's new on All About Nigeria",
        subSections: [
          {
            title: "Regional solar sizing updates",
            paragraphs: [
              "Our Inverter & Solar Sizing Calculator now distinguishes between North (Kano/Sokoto/Bauchi), Central (Abuja/Jos/Kwara), and South (Enugu/PH/Lagos/Ibadan) solar panel yield factors.",
            ],
          },
        ],
      },
    ],
    sources: [
      "NERC September 2026 Supplementary Order for Ikeja Electric (Order NERC/2026/093): nerc.gov.ng",
      "Nigerian Railway Corporation: nrc.gov.ng; NRC statement on ticket demand reported 16 October 2026",
    ],
  },
  {
    slug: "september-2026",
    title: "What's new in September 2026",
    date: "September 28, 2026",
    author: "Adefemi",
    summary:
      "NIN and BVN name matching, and registering a business with CAC.",
    intro:
      "Two pieces of paperwork that trip people up: mismatched names on the NIN and BVN, and registering a business with the Corporate Affairs Commission.",
    sections: [
      {
        heading: "What's new in Nigeria",
        subSections: [
          {
            title: "NIN & BVN exact name-matching",
            paragraphs: [
              "Banks and fintechs check the names and date of birth on your BVN against your NIN record, and a mismatch can block an account upgrade. Fix differences in spelling or name order before you apply. NIMC charges ₦2,000 to change a name or address and ₦28,574 to change a date of birth (fee schedule of May 2025); BVN corrections are made at your bank. Use NIMC's own site, nimc.gov.ng: the commission warned in June 2026 about fake correction portals.",
            ],
          },
          {
            title: "CAC online company registration",
            paragraphs: [
              "Company and business name registration is done on the CAC portal at icrp.cac.gov.ng. CAC's published service timeline is 24 working hours from the time all documents are received or a query is resolved; allow several working days if the name or business objects are queried. Official fees are ₦1,000 for name reservation, ₦20,000 for a business name and ₦10,000 per ₦1 million of share capital for a private company (schedule gazetted 29 May 2025).",
            ],
          },
        ],
      },
    ],
    sources: [
      "NIMC schedule of fees (May 2025) and nimc.gov.ng",
      "Corporate Affairs Commission: cac.gov.ng (Summary of Fees, Service Timelines) and icrp.cac.gov.ng",
    ],
  },
  {
    slug: "august-2026",
    title: "What's new in August 2026",
    date: "August 30, 2026",
    author: "Adefemi",
    summary:
      "Osun-Osogbo festival trip ideas and rainy-season flat inspections.",
    intro:
      "August is the height of the rainy season in much of southern Nigeria, and the month of the Osun-Osogbo festival at the Osun-Osogbo Sacred Grove.",
    sections: [
      {
        heading: "What's new in Nigeria",
        subSections: [
          {
            title: "August festival highlights & heritage trips",
            paragraphs: [
              "The Osun-Osogbo festival takes place every August at the Osun-Osogbo Sacred Grove, a UNESCO World Heritage Site in Osogbo, Osun State. Places within reach for the same trip include Erin-Ijesha Waterfalls (Osun), Idanre Hills (Ondo) and Ikogosi Warm Springs (Ekiti).",
            ],
          },
          {
            title: "Rainy-season apartment inspections",
            paragraphs: [
              "The rainy season is a good time to view a flat: visit the street soon after heavy rain to see whether the road and the compound drain or flood.",
            ],
          },
        ],
      },
    ],
    sources: [
      "UNESCO World Heritage Centre — Osun-Osogbo Sacred Grove",
      "General rainy-season inspection advice; no survey data",
    ],
  },
  {
    slug: "july-2026",
    title: "What's new in July 2026",
    date: "July 29, 2026",
    author: "Adefemi",
    summary:
      "True Rent Calculator: presets for more cities.",
    intro:
      "More city presets in the True Rent Calculator.",
    sections: [
      {
        heading: "What's new on All About Nigeria",
        subSections: [
          {
            title: "Nationwide rent presets",
            paragraphs: [
              "Expanded the True Rent Calculator to include Abuja (Maitama, Wuse II, Gwarinpa), Port Harcourt (Old/New GRA), Enugu (Independence Layout), Ibadan (Bodija/Jericho), Kano (Nassarawa GRA), Benin City, Calabar, and Lagos.",
            ],
          },
        ],
      },
    ],
    sources: ["Published rental listings (asking prices); presets are estimates, not survey data"],
  },
  {
    slug: "june-2026",
    title: "What's new in June 2026",
    date: "June 27, 2026",
    author: "Adefemi",
    summary:
      "Keeping two accounts, and POS cash limits.",
    intro:
      "Notes on everyday payments: why many people keep two accounts, and the limits on cash from POS agents.",
    sections: [
      {
        heading: "What's new in Nigeria",
        subSections: [
          {
            title: "The two-account rule",
            paragraphs: [
              "Any bank's app can be slow at busy times such as month-end, so many people keep an account with a large commercial bank and a second one with a fintech such as OPay, Moniepoint, Kuda or PalmPay. Cash from POS agents is capped by the Central Bank of Nigeria at ₦100,000 per customer per day and ₦500,000 per week.",
            ],
          },
        ],
      },
    ],
    sources: ["Central Bank of Nigeria agent banking rules (December 2024 circular; October 2025 guidelines): cbn.gov.ng"],
  },
];

export function getNewsletterIssueBySlug(slug: string): NewsletterIssue | undefined {
  return NEWSLETTER_ISSUES.find((issue) => issue.slug === slug);
}
