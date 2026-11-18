export interface GuideSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: {
    type: "tip" | "warning" | "portal";
    title: string;
    body: string;
  };
}

export interface SurvivalGuide {
  slug: string;
  aliases?: string[];
  title: string;
  shortTitle: string;
  category:
    | "arrival"
    | "housing"
    | "bureaucracy"
    | "money"
    | "mobility"
    | "utilities"
    | "business"
    | "health";
  cityFocus: "Nationwide" | "All 36 States + FCT" | "Urban Hubs";
  readTime: string;
  updatedAt: string;
  summary: string;
  keyTakeaways: string[];
  iconName:
    | "compass"
    | "home"
    | "id-card"
    | "landmark"
    | "bus"
    | "zap"
    | "briefcase"
    | "heart-pulse"
    | "plane";
  sections: GuideSection[];
}

export const SURVIVAL_GUIDES: SurvivalGuide[] = [
  {
    slug: "moving-to-lagos",
    aliases: ["moving-to-nigeria", "choosing-a-city"],
    title: "Moving to Nigeria: Choosing Between Abuja, Lagos, Port Harcourt, Enugu, Ibadan & Kano",
    shortTitle: "Move to Nigeria",
    category: "arrival",
    cityFocus: "All 36 States + FCT",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How the main Nigerian cities differ on rent, electricity and getting around, and what to sort out in your first month: NIN, phone line, bank account and somewhere to live.",
    keyTakeaways: [
      "No city is best at everything. Lagos has the most jobs and the highest rents; central Abuja is planned and quieter but also expensive; Port Harcourt is the oil and gas base; Ibadan, Enugu, Kano and Kaduna are cheaper to live in.",
      "Expect to pay a full year's rent in advance plus agency, agreement and caution fees. In Lagos, Section 4 of the Tenancy Law 2011 makes it unlawful to demand more than one year's rent from a new tenant.",
      "You need a NIN before a SIM can be activated or a full bank account opened. NIN enrolment and the first NIN slip are free at NIMC centres (NIMC fee schedule, checked Nov 2026).",
      "Before signing a lease, ask which electricity company (DisCo) serves the street and which band the feeder is on. Band A means a minimum of 20 hours a day; Band E means a minimum of 4 (NERC).",
    ],
    iconName: "compass",
    sections: [
      {
        id: "comparing-cities",
        heading: "How the Main Cities Compare",
        paragraphs: [
          "Daily life differs a lot from one state to another, so choose a city for your work and budget rather than its reputation. Lagos and Abuja are the two most expensive places to rent. Published figures for Lagos give a sense of scale: a 2026 Lagos Realty report quoted by Nairametrics (July–August 2026) put the average yearly rent for a two-bedroom flat at ₦17.25 million in Ikoyi, ₦15 million in Victoria Island, ₦10 million in Lekki Phase 1 and ₦8.5 million in Ikate. A Nairametrics ranking published in January 2026 put 2025 averages at ₦5.2 million in Ikeja and ₦3 million in Yaba.",
          "We could not find a comparable dated survey for other cities, so treat any single figure you see for Ibadan, Enugu, Kano or Port Harcourt as an asking price, and compare several current listings yourself. Security also varies widely between and within states: read a current government travel advisory for the specific state before you commit.",
        ],
        bullets: [
          "Abuja (FCT): planned road network, federal government and embassies; electricity from Abuja Electricity Distribution Company (AEDC). Hottest and driest from about February to April. Maitama and Wuse II are the expensive districts; Gwarinpa and Lugbe are cheaper.",
          "Lagos (South-West): the largest job market, split between the Mainland and the Island by the lagoon. Rents are the highest in the country and bridge traffic shapes where people choose to live.",
          "Port Harcourt and Uyo (South-South): Port Harcourt is the centre of the oil, gas and marine industries; Uyo is a smaller state capital with its own airport.",
          "Enugu and Owerri (South-East): smaller, quieter state capitals with universities and a strong trading culture.",
          "Ibadan and Abeokuta (South-West): both are on the Nigerian Railway Corporation's Lagos–Ibadan line, and rents are well below Lagos levels.",
          "Kano, Kaduna and Jos (North): Kano and Kaduna are the northern trading centres; Jos sits on a plateau at roughly 1,200 m and is noticeably cooler than the rest of the country.",
        ],
        callout: {
          type: "tip",
          title: "Look at a state capital in 3D",
          body: "Open the 36 States Atlas to see a 3D map of any state capital, built from OpenStreetMap data, before you visit.",
        },
      },
      {
        id: "first-30-days",
        heading: "Your First 30 Days (Anywhere in Nigeria)",
        paragraphs: [
          "Most everyday tasks depend on three things: a National Identification Number (NIN), a phone line registered to that NIN, and a bank account. Do them in that order, because each one is needed for the next.",
        ],
        bullets: [
          "Day 1–2: Enrol for a NIN at a NIMC enrolment centre if you do not already have one. Enrolment and the first slip are free. Citizens and legal residents can enrol.",
          "Day 3–5: Buy and register a SIM at an operator's own shop (MTN and Airtel have the widest coverage). The line is linked to your NIN at registration, and NCC rules allow a maximum of four SIMs per person on each network.",
          "Week 1: Open a bank account. A full account needs a BVN, your NIN, an ID and proof of address; BVN enrolment is free inside Nigeria. Many people also open a mobile-money or fintech account (OPay, Moniepoint, PalmPay, Kuda) as a backup for transfers.",
          "Week 2–4: Stay in a short-let or hotel while you inspect flats in person. Visit after rain to check drainage, test the mobile signal indoors and ask neighbours how many hours of electricity the street really gets.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "NIMC (NIN enrolment and fees): nimc.gov.ng. Nigerian Communications Commission (SIM registration rules): ncc.gov.ng. Nigerian Electricity Regulatory Commission (tariff bands and orders): nerc.gov.ng. Nigerian Railway Corporation: nrc.gov.ng. Lagos State Tenancy Law 2011 (Lagos State Ministry of Justice).",
        },
      },
    ],
  },
  {
    slug: "renting-an-apartment",
    title: "Renting in Nigeria: Annual Rent, Agency Fees & Checks Before You Pay",
    shortTitle: "Rent an apartment",
    category: "housing",
    cityFocus: "All 36 States + FCT",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How renting works in Nigerian cities: a year's rent in advance, the extra fees on top, what Lagos law currently says about advance rent, and what to check before you pay anyone.",
    keyTakeaways: [
      "Paying 12 months' rent up front is normal nationwide. In Lagos it is unlawful to demand more than one year from a new tenant, or more than six months from a sitting monthly tenant (Tenancy Law 2011, s.4). The 2011 law does not apply in Apapa, Ikeja GRA, Ikoyi and Victoria Island.",
      "Agency and agreement ('legal') fees are market practice, not fixed by law. In Lagos each is commonly 10% of a year's rent, so with a caution deposit the first payment is often 25–30% above the quoted rent, before service charge.",
      "A Lagos bill that would cap agent commission at 5% of a year's rent (Tenancy and Recovery of Premises Bill 2025) was still before the House of Assembly when we checked in November 2026. It is not yet law.",
      "Do not pay anything before you have seen the flat and confirmed who owns it. Pay into the landlord's or registered agent's account and insist on a receipt.",
    ],
    iconName: "home",
    sections: [
      {
        id: "hidden-costs",
        heading: "What You Actually Pay to Move In",
        paragraphs: [
          "The figure in a listing is the yearly rent only. Ask the agent for the 'total package' in writing before you view, because the extra charges are added afterwards and differ from landlord to landlord.",
          "For scale, published Lagos averages for a two-bedroom flat were ₦17.25 million a year in Ikoyi, ₦15 million in Victoria Island, ₦10 million in Lekki Phase 1 and ₦8.5 million in Ikate (2026 Lagos Realty report, quoted by Nairametrics, July–August 2026), and ₦5.2 million in Ikeja and ₦3 million in Yaba (2025 averages, Nairametrics, January 2026).",
        ],
        bullets: [
          "Rent: usually 12 months in advance. Some landlords accept six months or quarterly payments, mostly on renewal; ask.",
          "Agency fee: commonly 10% of one year's rent in Lagos; often lower elsewhere and negotiable if you deal with the landlord directly.",
          "Agreement ('legal') fee: commonly 5–10%, charged for preparing the tenancy agreement. Ask to see the agreement before paying for it.",
          "Caution deposit: typically 5–10%, refundable when you leave if there is no damage. Get the refund terms written into the agreement.",
          "Service charge: in estates and serviced blocks this covers security, waste, water pumping and the shared generator or solar system. Ask for last year's statement.",
        ],
        callout: {
          type: "portal",
          title: "Work out the full cost",
          body: "The True Rent Calculator under Tools adds agency, agreement, caution and service charges to a quoted rent so you can see the first-year total.",
        },
      },
      {
        id: "power-and-water",
        heading: "Power, Water & Tenancy Protections",
        paragraphs: [
          "Ask for the electricity meter number and the name of the feeder, then confirm the tariff band with the distribution company (DisCo) that serves the area: AEDC in Abuja, Eko Electric or Ikeja Electric in Lagos, IBEDC in Ibadan, MainPower/EEDC in Enugu, PHED in Port Harcourt, KEDCO in Kano. Band A feeders are meant to supply at least 20 hours a day and cost several times more per unit than Bands B–E. Supply can fall short: in June 2026 NERC ordered compensation for Band A customers who did not get the promised hours in February and March 2026. Check that the flat has its own prepaid meter.",
          "Most homes rely on a borehole. Run the taps, look at the water in a clear glass and ask whether it is treated. Ask neighbours whether the borehole runs low in the dry season (roughly December to March) and whether the street floods after heavy rain.",
          "In Lagos, the Tenancy Law 2011 is still the law in force. It limits advance rent (see above) and requires the landlord to issue a rent receipt. Lagos estate agents are required to register with the Lagos State Real Estate Regulatory Authority (LASRERA); ask for the registration and report demands for two or three years' rent to LASRERA. Other states have their own tenancy laws, so check locally. Everywhere, get a signed written agreement and keep proof of every payment.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "Lagos State Tenancy Law 2011 (Lagos State Ministry of Justice) and the Lagos State Real Estate Regulatory Authority (LASRERA) for agent registration and complaints. NERC for tariff bands and DisCo orders: nerc.gov.ng. Rent figures are from dated market reports named in the text, not from an official source.",
        },
      },
    ],
  },
  {
    slug: "nin-bvn-immigration",
    title: "NIN, BVN, Passports & Nigerian Visas (e-Visa / CERPAC)",
    shortTitle: "NIN, BVN & Visas",
    category: "bureaucracy",
    cityFocus: "Nationwide",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "What the NIN and BVN are, what they cost, current Nigerian passport fees, and how visitors and foreign workers enter Nigeria now that visa on arrival has ended.",
    keyTakeaways: [
      "NIN: enrolment and the first slip are free. Corrections are charged: ₦28,574 for a date-of-birth change, ₦2,000 for a name, address or other change, ₦600 for a slip reprint (NIMC fee schedule of May 2025, still current when checked in Nov 2026).",
      "BVN: free at any bank in Nigeria. Nigerians abroad can enrol remotely through the Non-Resident BVN platform for about US$50 (CBN, July 2025). CBN rules effective 1 May 2026 set 18 as the minimum age for a BVN.",
      "Visa on arrival ended in 2025. Visitors must get an e-Visa before travelling at evisa.immigration.gov.ng and complete the online landing card at lecard.immigration.gov.ng. ECOWAS citizens do not need a visa.",
      "Foreigners staying to work or study need a CERPAC residence permit: US$2,000 for employed foreigners, US$600 for students, free for spouses of Nigerian citizens (Nigeria Immigration Service, checked Nov 2026).",
      "Passports issued in Nigeria cost ₦100,000 (32 pages, 5 years) or ₦200,000 (64 pages, 10 years) since 1 September 2025. Fees at missions abroad stayed at US$150 and US$230.",
    ],
    iconName: "id-card",
    sections: [
      {
        id: "nin-and-bvn",
        heading: "NIN vs. BVN: What Each One Does",
        paragraphs: [
          "The NIN (National Identification Number) is your civil identity number, issued by the National Identity Management Commission (NIMC). You need it for a SIM card, a bank account, a passport and most government services. The BVN (Bank Verification Number) is a banking identity number: you enrol once at any bank, the record is held by NIBSS, and the same BVN links every account you open.",
          "Since January 2026 the NIN is also the basis of your Tax ID: the Nigeria Revenue Service says individuals retrieve their Tax ID using their NIN, and registered companies use their CAC registration number.",
          "Make sure your names, their order and your date of birth are identical on your passport, NIN record and BVN. Mismatches are the most common reason for blocked account upgrades and passport delays. Correct the NIN through NIMC's self-service modification portal or a NIMC office; NIMC has warned about fake correction websites, so start from nimc.gov.ng.",
        ],
        bullets: [
          "NIMC (enrolment centres, fee schedule, modification portal): nimc.gov.ng.",
          "NIBSS (BVN, including the list of enrolment centres abroad): nibss-plc.com.ng.",
          "Nigeria Immigration Service: immigration.gov.ng. Passport applications: passport.immigration.gov.ng.",
          "NIMC fees for Nigerians abroad are set in US dollars and differ by region (for example US$50 for adult enrolment in African countries); check the NIMC schedule for your country.",
        ],
      },
      {
        id: "expat-visas",
        heading: "e-Visas, Work Visas & CERPAC",
        paragraphs: [
          "Short visits: apply online for an e-Visa before you travel. The Nigeria Immigration Service (NIS) lists the e-Visa classes on its site; the common ones are Tourism (single entry, 30 days) and Business single entry (30 days, not extendable). The fee depends on your nationality and visa class and is shown on the portal when you apply. Travellers without an approved e-Visa are refused boarding or entry. The UK government's travel advice also says your passport needs at least six months' validity on arrival.",
          "Every passenger entering or leaving Nigeria must complete the online landing or exit card (required since 1 May 2025). International arrivals must also complete the NCDC Nigeria Health Declaration Form at healthapp.ncdc.gov.ng.",
          "Working in Nigeria: your employer must first hold an approved expatriate quota position. You then apply for an Employment (Expatriate) visa, which NIS describes as an initial 90-day entry followed by a residence permit, typically for two years and renewable. After arrival you regularise your stay and obtain the CERPAC (Combined Expatriate Residence Permit and Aliens Card). NIS states that CERPAC is mandatory for non-Nigerians who intend to stay beyond 56 days for work, business or long-term residence. Short technical assignments use a Temporary Work Permit instead.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "e-Visa: evisa.immigration.gov.ng. Visa classes: immigration.gov.ng/nigerian-visa. Landing and exit card: lecard.immigration.gov.ng. CERPAC: immigration.gov.ng (CERPAC and e-CERPAC pages). Health declaration: healthapp.ncdc.gov.ng. NIN: nimc.gov.ng. BVN: nibss-plc.com.ng and cbn.gov.ng.",
        },
      },
    ],
  },
  {
    slug: "banking-and-fintech",
    title: "Banking in Nigeria: Bank Accounts, Transfers, Fees & Fintech Apps",
    shortTitle: "Open a bank account",
    category: "money",
    cityFocus: "Nationwide",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How account levels work, why many people keep a bank account and a fintech account, what transfers and cash withdrawals cost in 2026, and how money from abroad is paid out.",
    keyTakeaways: [
      "Bank-to-bank transfers (NIBSS Instant Payment, NIP) normally arrive within seconds and are how most things are paid for.",
      "Since 1 January 2026 the sender pays a ₦50 stamp duty on each electronic transfer of ₦10,000 or more, on top of the bank's own transfer fee. Salary payments and transfers between your own accounts in the same bank are exempt.",
      "Cash from a POS agent is capped at ₦100,000 a day and ₦500,000 a week per customer (CBN agent banking rules). Using another bank's ATM costs ₦100 per ₦20,000 at a bank branch, plus up to ₦500 at stand-alone ATMs (CBN, since 1 March 2025).",
      "Money sent through licensed international money transfer operators (IMTOs) is paid out in naira. To hold foreign currency, open a domiciliary account and receive a bank wire.",
    ],
    iconName: "landmark",
    sections: [
      {
        id: "two-account-rule",
        heading: "Why Most People Keep Two Accounts",
        paragraphs: [
          "Any bank's app can be slow or briefly unavailable at busy times such as month-end. For that reason many people keep their main account with a large commercial bank that has branches nationwide (for example Access, GTBank, Zenith, UBA, First Bank or Stanbic IBTC) and a second account with a fintech or mobile-money provider (OPay, Moniepoint, PalmPay, Kuda) for day-to-day transfers. Whichever you choose, check that the provider is licensed by the Central Bank of Nigeria (CBN) and that deposits are insured by the NDIC.",
          "Accounts come in three levels set by the CBN. A Tier 1 account can be opened with little documentation but has low transaction and balance limits; Tier 3 is a full account and needs a BVN, NIN, valid ID and proof of address. Your bank's app shows the limits that apply to you. Opening a BVN is free in Nigeria.",
          "CBN rules issued in March 2026 also limit what a newly set-up phone can do: for the first 24 hours after you activate a banking app on a new device, transfers are capped at no more than ₦20,000, and an app can be active on only one device at a time. Plan for this if you change phones.",
        ],
      },
      {
        id: "cash-and-pos",
        heading: "Cash, Cards & POS Agents",
        paragraphs: [
          "Transfers and cards cover most payments in cities, but carry some cash for markets, transport and small shops. POS agents are found on most streets and give cash against a card or transfer. They charge their own fee, which varies with the amount and the area, so ask before the transaction. The CBN caps agent cash-outs at ₦100,000 per customer per day and ₦500,000 per week.",
          "Money from abroad: remittances sent through licensed IMTOs are paid in naira at the day's rate. If you earn in foreign currency, a domiciliary (USD, GBP or EUR) account lets you receive wires and keep the money in that currency. The CBN issued a revised Foreign Exchange Manual effective 1 June 2026; anyone carrying more than US$10,000 in cash across the border must declare it. The official exchange rate moves daily: the CBN published about ₦1,328 to US$1 on 24 September 2026. Check cbn.gov.ng for today's rate rather than relying on any figure printed here.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "Central Bank of Nigeria (circulars, guide to charges, exchange rates, lists of licensed banks, mobile money operators and IMTOs): cbn.gov.ng. NIBSS (BVN and instant payments): nibss-plc.com.ng. Nigeria Deposit Insurance Corporation: ndic.gov.ng. Stamp duty on transfers: Nigeria Tax Act 2025, administered by the Nigeria Revenue Service.",
        },
      },
    ],
  },
  {
    slug: "getting-around-lagos",
    aliases: ["getting-around-nigeria", "transit"],
    title: "Getting Around Nigeria: Domestic Flights, Trains & City Transport",
    shortTitle: "Get around Nigeria",
    category: "mobility",
    cityFocus: "All 36 States + FCT",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How to travel between cities by air and by Nigerian Railway Corporation trains, and how city transport works, including the Cowry card, BRT and the Blue and Red rail lines in Lagos.",
    keyTakeaways: [
      "The Nigerian Railway Corporation (NRC) runs three standard-gauge passenger services: Abuja–Kaduna, Lagos–Ibadan and Warri–Itakpe. Tickets are sold online and sell out: in October 2026 NRC said demand exceeded seats by more than ten times.",
      "Domestic flights are the quickest way between regions, but allow for delays. NCAA data for August 2026 showed 59.9% of domestic flights (4,765 of 7,961) left late.",
      "In Lagos you need a Cowry card (₦500, sold at designated bus stops and at Blue and Red Line stations) for BRT, regulated buses and the trains. From 1 August 2026, paying cash on regulated buses is an offence for the passenger as well as the driver (LAMATA).",
      "In April 2026 the Blue Line was running between Marina and Mile 2 and the Red Line between Oyingbo and Agbado; the other sections were still under construction.",
    ],
    iconName: "bus",
    sections: [
      {
        id: "rail-and-flights",
        heading: "Flights and Trains Between Cities",
        paragraphs: [
          "Distances are long and road journeys are slow, so most people fly between regions and avoid driving at night. Lagos and Abuja are the two main hubs, with flights to Port Harcourt, Uyo, Enugu, Kano, Benin, Owerri, Calabar, Yola and other state capitals. Airlines flying domestic routes in 2026 include Air Peace, Ibom Air, ValueJet, United Nigeria and Enugu Air. Book the first flight of the day where you can, and do not plan a tight same-day connection.",
          "NRC's three standard-gauge services are the Abuja–Kaduna Train Service (Idu to Rigasa), the Lagos–Ibadan Train Service (via Abeokuta) and the Warri–Itakpe Train Service. Each has its own official booking site, listed below. Fares differ by class and NRC said in 2026 that it was reviewing them, so check the price on the booking site; we could not confirm a current fare table. Buy only from the official sites or the station ticket office, and arrive early for ID and security checks.",
        ],
        bullets: [
          "Abuja–Kaduna tickets: nrc.tps.ng.",
          "Lagos–Ibadan tickets: nrc.gsds.ng.",
          "Warri–Itakpe tickets: nrc-fane.ng.",
          "Flight delay and cancellation figures are published by the Nigeria Civil Aviation Authority (NCAA), which also handles passenger complaints.",
        ],
      },
      {
        id: "urban-transit",
        heading: "Getting Around Inside Cities",
        paragraphs: [
          "Ride-hailing apps (Uber, Bolt and inDrive) work in the larger cities and are the simplest option for newcomers. Beyond that, each city has its own mix: taxis and buses in Abuja; tricycles (keke) for short trips in Kano, Kaduna, Enugu and many other cities; small shared taxis in Ibadan; taxis and boats in Port Harcourt and Calabar. Fares for unmetered taxis and keke are agreed before you get in.",
          "Lagos has the most organised system, managed by LAMATA: BRT and other regulated buses, the Blue Line (Marina–Mile 2) and the Red Line (Oyingbo–Agbado), all paid for with the Cowry card, alongside yellow danfo minibuses that still take cash. LAMATA does not publish a current fare table; the last announced Red Line fare for the full Agbado–Oyingbo trip was ₦1,000 (Lagos State, February 2025), so check at the station. Ferries are run by the state company LAGFERRY and by private operators; fares and timetables changed several times in 2025–26, so confirm at the jetty and wear the life jacket provided.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "Nigerian Railway Corporation: nrc.gov.ng (links to the three booking sites). LAMATA (BRT, Blue and Red Lines, Cowry card): lamata-ng.com. Nigeria Civil Aviation Authority (monthly delay data, passenger rights): ncaa.gov.ng. Federal Airports Authority of Nigeria: faan.gov.ng. LAGFERRY and the Lagos State Waterways Authority (LASWA) for ferries.",
        },
      },
    ],
  },
  {
    slug: "power-solar-internet",
    title: "Power, Tariff Bands, Solar/Inverter Sizing & Home Internet",
    shortTitle: "Power & Internet",
    category: "utilities",
    cityFocus: "Nationwide",
    readTime: "7 min read",
    updatedAt: "Nov 2026",
    summary:
      "What electricity Bands A–E mean and cost, which company supplies each state, what a home inverter and solar system costs in 2026, and the options for home internet.",
    keyTakeaways: [
      "Bands are defined by minimum daily supply: A 20 hours, B 16, C 12, D 8, E 4 (NERC). Your band is set by the feeder your street is on, not by your meter type.",
      "Band A is far more expensive per unit. NERC's September 2026 order for Ikeja Electric lists ₦209.50/kWh for Band A (unchanged since August 2024), against ₦62.48 for Band B, ₦45.80 for Band C and ₦31.24 for Bands D and E, which have been frozen since December 2022. Other DisCos' rates are close but not identical.",
      "The promised hours are not always delivered. In June 2026 NERC ordered compensation for Band A customers for shortfalls in February and March 2026.",
      "Starlink's residential plan was listed at ₦57,000 a month in October 2026, but new residential orders were blocked in parts of Lagos and Abuja earlier in the year. Check availability for your exact address on starlink.com before buying a kit.",
    ],
    iconName: "zap",
    sections: [
      {
        id: "band-a-grid",
        heading: "Who Supplies Your Electricity, and the Bands",
        paragraphs: [
          "Grid electricity is sold by regional distribution companies (DisCos): Abuja Electric/AEDC (FCT, Kogi, Nasarawa, Niger); Eko Electric and Ikeja Electric (Lagos); IBEDC (Oyo, Ogun, Osun, Kwara); Enugu Electric/EEDC, operating as MainPower in Enugu State (South-East); Port Harcourt Electric/PHED (Rivers, Bayelsa, Cross River, Akwa Ibom); Benin Electric/BEDC (Edo, Delta, Ondo, Ekiti); Kano Electric/KEDCO (Kano, Katsina, Jigawa); Kaduna Electric (Kaduna, Sokoto, Kebbi, Zamfara); Jos Electric/JED (Plateau, Bauchi, Gombe, Benue); and Yola Electric/YEDC (Adamawa, Borno, Taraba, Yobe). Aba and its surroundings are served separately by Aba Power.",
          "Tariffs for each DisCo are set in NERC's tariff orders, which list every feeder with its band and minimum hours. The federal government still subsidises Bands B–E, which is why those rates have not moved since December 2022 while Band A was raised in 2024. Under the Electricity Act 2023 states can regulate their own electricity markets, and 15 states had taken over from NERC by April 2026 (ThisDay, 16 April 2026). In those states the state regulator, not NERC, sets the tariff, so rates can differ from the figures above.",
          "To check a home: ask for the meter number, look up the feeder and band with the DisCo, and compare that with what neighbours say they actually receive. NERC also issued a net billing framework in 2026 for customers who export solar power to the grid; ask your DisCo whether it is available on your feeder.",
        ],
      },
      {
        id: "solar-and-internet",
        heading: "Solar, Inverters & Home Internet",
        paragraphs: [
          "A common setup for a two-bedroom flat running a fridge, fans, lights, laptops, a router and one inverter air conditioner at night is a 5 kVA hybrid inverter with 5–10 kWh of lithium (LiFePO4) battery and rooftop panels. The right size depends on your appliances and on how many hours of grid supply you get, so have an installer do a load calculation. Published 2026 price guides vary widely: from about ₦2.0–3.5 million for a complete 5 kVA lithium system (SolarDecide, April 2026) to ₦3.6–5.7 million on a Lagos installer price list (September 2026). Get at least three itemised quotes that name the battery brand, capacity and warranty.",
          "The north of the country gets more sunshine over the year than the humid coastal south, where cloud in the rainy season (roughly April to October) cuts solar output noticeably. Size the panels for the rainy months, not the dry season.",
          "Internet: fibre to the home is available on some streets in the bigger cities but coverage is patchy, so ask providers to confirm your exact address. 4G and 5G home routers from the mobile networks work where the signal is strong; test with a SIM in the flat first. Starlink is licensed in Nigeria and works in areas with no fibre: the residential plan was ₦57,000 a month in October 2026 (starlink.com data), with the standard kit reported at about ₦590,000–669,000. In early 2026 new residential orders were closed in congested parts of Lagos and Abuja, where only a costlier priority plan (about ₦159,000 a month) was on sale.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "NERC tariff orders and feeder lists: nerc.gov.ng (Regulatory Instruments, Orders); the September 2026 Supplementary Order for Ikeja Electric is Order NERC/2026/093. Nigerian Communications Commission (licensed operators and internet providers): ncc.gov.ng. Starlink availability and prices: starlink.com. Solar prices are from dated market guides named in the text, not from an official source.",
        },
      },
    ],
  },
  {
    slug: "starting-a-business",
    title: "Starting a Business in Nigeria: CAC Registration, Tax ID & Fees",
    shortTitle: "Start a business",
    category: "business",
    cityFocus: "Nationwide",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How to register a business name or company with the Corporate Affairs Commission (CAC), what it costs under the current fee schedule, and what changed for small businesses under the tax laws that took effect on 1 January 2026.",
    keyTakeaways: [
      "Registration is done online on the CAC portal at icrp.cac.gov.ng, from anywhere in Nigeria or abroad.",
      "Official CAC fees (schedule gazetted 29 May 2025, still on cac.gov.ng in Nov 2026): name reservation ₦1,000; business name ₦20,000; private company ₦10,000 for every ₦1 million of share capital or part of it. Stamp duty and any agent's fee are extra.",
      "The Federal Inland Revenue Service became the Nigeria Revenue Service (NRS) on 1 January 2026. A company's CAC registration (RC) number is used to generate its Tax ID; there is no separate TIN application.",
      "Under the Nigeria Tax Act 2025, small companies pay 0% companies income tax. Most summaries give the limit as ₦100 million turnover and ₦250 million fixed assets, but some readings of the gazetted text give ₦50 million turnover. Professional service firms are excluded. Confirm your position with the NRS or a tax adviser.",
    ],
    iconName: "briefcase",
    sections: [
      {
        id: "cac-steps",
        heading: "Registering with CAC, Step by Step",
        paragraphs: [
          "Decide first between a business name (a sole trader or partnership; cheapest, but you are personally liable) and a private limited company (a separate legal entity with shareholders and directors). Proprietors, directors and shareholders are identified by NIN, so make sure everyone's NIN details are correct before you start.",
          "CAC's published service timelines are 4 working hours for a name search and 24 working hours for a new business name or company registration, counted from when all documents are received or a query is resolved. In practice, queries about the name or the stated business objects are what cause delays, so allow several working days.",
          "Trade is spread across the country: Lagos for finance, technology and media; Abuja for government-facing work and NGOs; Aba, Nnewi, Onitsha and Kano for manufacturing and wholesale trade; Port Harcourt for oil, gas and marine services. Registration is federal, so where you register does not restrict where you operate, but state and local permits and levies vary.",
        ],
        bullets: [
          "1. Create an account on icrp.cac.gov.ng and reserve a name (₦1,000).",
          "2. Complete the registration form, upload IDs and signatures, and pay the filing fee and stamp duty online.",
          "3. Download the certificate and, for companies, the certified incorporation documents.",
          "4. Retrieve the Tax ID with your RC number on the Nigeria Revenue Service / Joint Revenue Board Tax ID portal, then open a corporate bank account.",
          "5. Register for VAT and PAYE as they become applicable, and with SCUML if your line of business is on its list of designated businesses.",
          "6. File annual returns with CAC every year (₦5,000 for a business name, or for a company with share capital up to ₦100 million) to avoid being struck off.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "Corporate Affairs Commission: cac.gov.ng (Summary of Fees and Service Timelines) and the registration portal icrp.cac.gov.ng. Nigeria Revenue Service (formerly FIRS) for Tax ID, VAT and company tax under the Nigeria Tax Act 2025 and Nigeria Tax Administration Act 2025. SCUML (Special Control Unit Against Money Laundering) for designated businesses.",
        },
      },
    ],
  },
  {
    slug: "healthcare-and-safety",
    title: "Healthcare, Health Insurance, Pharmacies & Emergencies in Nigeria",
    shortTitle: "Health & Safety",
    category: "health",
    cityFocus: "Nationwide",
    readTime: "6 min read",
    updatedAt: "Nov 2026",
    summary:
      "How to choose a hospital and a health insurance plan, how to buy medicines safely, malaria and current outbreak advice, and which numbers to call in an emergency.",
    keyTakeaways: [
      "Most people who can afford it use private hospitals through an HMO plan. Check that the HMO is on the National Health Insurance Authority (NHIA) accredited list at nhia.gov.ng/hmo and that hospitals near your home are in its network.",
      "112 was adopted as the single national emergency number on 30 April 2026, but it does not connect reliably everywhere yet. Save your nearest hospital's emergency line and your state's emergency numbers as well.",
      "Malaria risk is high throughout Nigeria all year. Visitors are advised to take preventive tablets (CDC and UK TravelHealthPro); residents should sleep under treated nets and test promptly for any fever.",
      "For disease outbreaks, call the Nigeria Centre for Disease Control (NCDC) toll-free on 6232 and check ncdc.gov.ng.",
    ],
    iconName: "heart-pulse",
    sections: [
      {
        id: "hospitals-hmos",
        heading: "Hospitals, Insurance, Medicines & Emergencies",
        paragraphs: [
          "Hospitals: public teaching hospitals have the widest range of specialists but long waits; private hospitals are quicker and cost more. Well-known examples include Nizamiye, Cedarcrest and Primus in Abuja; Reddington, Evercare and Lagoon in Lagos; University College Hospital (UCH) in Ibadan; Aminu Kano Teaching Hospital in Kano; UNTH and Memfys in Enugu; and Rivers State University Teaching Hospital in Port Harcourt. This is a starting list, not a ranking: ask colleagues and neighbours, and visit before you need care.",
          "Insurance: the NHIA Act 2022 makes health insurance mandatory in law for all Nigerians and legal residents, though enforcement is still limited. Employees are usually covered through an employer's HMO plan, with contributions covering the employee, a spouse and up to four children under the NHIA formal-sector programme. If you are self-employed you can buy a private HMO plan (Reliance, AXA Mansard, Hygeia and Leadway are among the larger HMOs) or enrol through NHIA's programme for people outside the civil service. Read what the plan excludes and whether it covers you outside your home city.",
          "Medicines: buy from a registered pharmacy with a pharmacist on duty, such as the larger chains (HealthPlus, Medplus) or a hospital pharmacy, not from open markets or buses. Check that the pack carries a NAFDAC registration number, an intact seal and an expiry date.",
          "Emergencies: call 112, then your hospital directly. Ambulance response varies by state; in Lagos the state emergency agency is LASEMA and in Abuja it is the FCT Emergency Management Department. If you can travel safely by car or taxi to a hospital you already know, that is often faster.",
          "Current outbreaks (UK TravelHealthPro, checked Nov 2026): one confirmed Ebola (Bundibugyo) case in the FCT on 20 October 2026; a large cholera outbreak in Borno State since May 2026; diphtheria, mainly in Kano, Bauchi, Katsina, Borno and Sokoto; and 1,056 confirmed Lassa fever cases across 24 states up to 23 August 2026. The picture changes quickly, so read NCDC's latest update.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "National Health Insurance Authority (enrolment and accredited HMOs): nhia.gov.ng. Nigeria Centre for Disease Control: ncdc.gov.ng, toll-free 6232. NAFDAC (medicine registration and alerts): nafdac.gov.ng. Travel health: US CDC Travelers' Health (Nigeria) at wwwnc.cdc.gov/travel and UK TravelHealthPro at travelhealthpro.org.uk.",
        },
      },
    ],
  },
  {
    slug: "visiting-nigeria",
    title: "Visiting Nigeria: Entry Rules, Health, Festivals & Places to See",
    shortTitle: "Visit Nigeria",
    category: "arrival",
    cityFocus: "All 36 States + FCT",
    readTime: "5 min read",
    updatedAt: "Nov 2026",
    summary:
      "What visitors and returnees need before they fly (e-Visa, landing card, health form, yellow fever certificate), when the main festivals take place, and places worth the trip.",
    keyTakeaways: [
      "Get an e-Visa before you travel at evisa.immigration.gov.ng; visa on arrival no longer exists. Complete the landing card (lecard.immigration.gov.ng) and the NCDC Health Declaration Form (healthapp.ncdc.gov.ng) before your flight.",
      "Carry a yellow fever vaccination certificate. Nigeria's authorities told the UK's travel health service in August 2025 that it is required of all travellers entering or leaving, except infants under nine months and adults over 60.",
      "Malaria risk is high everywhere: see a travel clinic about preventive tablets before you go. The US CDC also recommends being up to date on polio, hepatitis A, typhoid and, for the north in the dry season, meningitis vaccines.",
      "Festival timing: Argungu Fishing Festival in February (11–14 February in 2026), Osun-Osogbo in August, Calabar Carnival in December, and Durbar processions at the two Eid (Sallah) holidays in Kano, Zaria, Katsina and Ilorin.",
    ],
    iconName: "plane",
    sections: [
      {
        id: "culture-and-rhythm",
        heading: "Before You Fly, and Where to Go",
        paragraphs: [
          "Entry checklist: a passport valid for at least six months, an approved e-Visa (tourist e-Visas are single entry for 30 days), the online landing card, the NCDC health declaration and your yellow fever certificate. ECOWAS citizens do not need a visa. Read your own government's current travel advice for Nigeria: it differs sharply by state, and several states carry advice against travel.",
          "Places people travel for: Aso Rock and Zuma Rock around Abuja; the Jos Plateau; Yankari Game Reserve and Wikki Warm Springs in Bauchi; Kano's old city, walls and dye pits; the bronze casters of Igun Street in Benin City; Awhum and Ngwo waterfalls near Enugu; Cross River's rainforest and the Obudu plateau; Olumo Rock in Abeokuta; the Osun-Osogbo Sacred Grove, a UNESCO World Heritage Site, with Erin-Ijesha Waterfalls nearby; and the galleries and beaches of Lagos.",
          "Festival dates are announced by the organisers each year and can change. Durbar depends on the Islamic calendar, and processions have been restricted on security grounds in some recent years, so confirm with the state government or emirate before booking.",
          "Food changes by region: suya and masa in the north; amala with ewedu in the South-West; bole with fish and fisherman soup in the South-South; abacha and ofe nsala in the South-East. Jollof rice and pepper soup are everywhere.",
        ],
        callout: {
          type: "portal",
          title: "Official pages for this guide",
          body: "Nigeria Immigration Service: immigration.gov.ng, evisa.immigration.gov.ng and lecard.immigration.gov.ng. NCDC Health Declaration Form: healthapp.ncdc.gov.ng. Yellow fever and vaccines: US CDC Travelers' Health (Nigeria), UK TravelHealthPro (Nigeria) and the UK government's Nigeria travel advice at gov.uk/foreign-travel-advice/nigeria. Osun-Osogbo Sacred Grove: UNESCO World Heritage Centre, whc.unesco.org.",
        },
      },
    ],
  },
];

export function getGuideBySlug(slug: string): SurvivalGuide | undefined {
  return SURVIVAL_GUIDES.find((g) => g.slug === slug || g.aliases?.includes(slug));
}
