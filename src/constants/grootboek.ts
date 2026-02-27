/**
 * Belgian MAR (Minimum Algemeen Rekeningenstelsel) grootboek codes.
 *
 * Used as a local fallback when the Titan API endpoint
 * GET /api/v2/reference-data/grootboek is unavailable.
 * The canonical source of truth is Titan; this list covers the
 * most common codes used in EBITDA normalization.
 */

export interface LedgerAccount {
  code: string
  name: string
  category?: string
  balance?: number
}

export const DEFAULT_LEDGER_ACCOUNTS: LedgerAccount[] = [
  // ── 60x  Aankopen ──
  { code: '600', name: 'Aankopen handelsgoederen', category: 'Aankopen' },
  { code: '601', name: 'Aankopen grondstoffen', category: 'Aankopen' },
  { code: '602', name: 'Aankopen hulpgoederen', category: 'Aankopen' },
  { code: '603', name: 'Aankopen onderaannemingen', category: 'Aankopen' },
  { code: '604', name: 'Aankopen onroerende goederen bestemd voor verkoop', category: 'Aankopen' },
  { code: '608', name: 'Ontvangen kortingen en rabatten', category: 'Aankopen' },
  { code: '609', name: 'Voorraadwijzigingen', category: 'Aankopen' },

  // ── 61x  Diensten en diverse goederen ──
  { code: '610', name: 'Huur en huurlasten', category: 'Diensten en diverse goederen' },
  { code: '611', name: 'Onderhoud en herstellingen', category: 'Diensten en diverse goederen' },
  { code: '612', name: 'Leveringen aan de onderneming', category: 'Diensten en diverse goederen' },
  { code: '613', name: 'Vergoedingen aan derden', category: 'Diensten en diverse goederen' },
  { code: '614', name: 'Vervoer en verplaatsingen', category: 'Diensten en diverse goederen' },
  { code: '615', name: 'Verzekeringspremies', category: 'Diensten en diverse goederen' },
  { code: '616', name: 'Posten en telecommunicatie', category: 'Diensten en diverse goederen' },
  { code: '617', name: 'Kantoorkosten', category: 'Diensten en diverse goederen' },
  { code: '618', name: 'Reclame en publiciteit', category: 'Diensten en diverse goederen' },
  {
    code: '619',
    name: 'Overige diensten en diverse goederen',
    category: 'Diensten en diverse goederen',
  },

  // ── 62x  Bezoldigingen, sociale lasten en pensioenen ──
  { code: '620', name: 'Bezoldigingen bestuurders en zaakvoerders', category: 'Personeelskosten' },
  { code: '621', name: 'Bezoldigingen bedienden', category: 'Personeelskosten' },
  { code: '622', name: 'Bezoldigingen arbeiders', category: 'Personeelskosten' },
  { code: '623', name: 'Werkgeversbijdragen RSZ', category: 'Personeelskosten' },
  {
    code: '624',
    name: 'Werkgeversbijdragen bovenwettelijke verzekeringen',
    category: 'Personeelskosten',
  },
  { code: '625', name: 'Ouderdomspensioenen en renten', category: 'Personeelskosten' },
  { code: '626', name: 'Andere personeelskosten', category: 'Personeelskosten' },
  {
    code: '627',
    name: 'Uitzendkrachten en ter beschikking gesteld personeel',
    category: 'Personeelskosten',
  },
  { code: '628', name: 'Maaltijdcheques en ecocheques', category: 'Personeelskosten' },
  { code: '629', name: 'Groepsverzekering en hospitalisatie', category: 'Personeelskosten' },

  // ── 63x  Afschrijvingen, waardeverminderingen, voorzieningen ──
  {
    code: '630',
    name: 'Afschrijvingen oprichtingskosten',
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '631',
    name: 'Afschrijvingen immateriële vaste activa',
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '632',
    name: 'Afschrijvingen materiële vaste activa',
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '633',
    name: 'Waardeverminderingen voorraden',
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '634',
    name: 'Waardeverminderingen handelsvorderingen',
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '635',
    name: "Voorzieningen voor risico's en kosten",
    category: 'Afschrijvingen en waardeverminderingen',
  },
  {
    code: '636',
    name: 'Voorzieningen voor grote herstellings- en onderhoudswerken',
    category: 'Afschrijvingen en waardeverminderingen',
  },

  // ── 64x  Andere bedrijfskosten ──
  { code: '640', name: 'Bedrijfsbelastingen en -taksen', category: 'Andere bedrijfskosten' },
  {
    code: '641',
    name: 'Minderwaarden op courante realisatie vaste activa',
    category: 'Andere bedrijfskosten',
  },
  { code: '642', name: 'Minderwaarden op handelsvorderingen', category: 'Andere bedrijfskosten' },
  { code: '643', name: 'Diverse bedrijfskosten', category: 'Andere bedrijfskosten' },
  { code: '644', name: 'Eenmalige kosten', category: 'Andere bedrijfskosten' },
  { code: '645', name: 'Representatiekosten', category: 'Andere bedrijfskosten' },
  {
    code: '646',
    name: 'Bankkosten en financiële dienstverlening',
    category: 'Andere bedrijfskosten',
  },
  { code: '647', name: 'Juridische kosten', category: 'Andere bedrijfskosten' },
  { code: '648', name: 'Boetes en sancties', category: 'Andere bedrijfskosten' },
  { code: '649', name: 'Privékosten zaakvoerder', category: 'Andere bedrijfskosten' },

  // ── 65x  Financiële kosten ──
  { code: '650', name: 'Kosten van schulden', category: 'Financiële kosten' },
  {
    code: '651',
    name: 'Waardeverminderingen financiële vaste activa',
    category: 'Financiële kosten',
  },
  { code: '652', name: 'Waardeverminderingen vlottende activa', category: 'Financiële kosten' },
  { code: '653', name: 'Andere financiële kosten', category: 'Financiële kosten' },
  { code: '654', name: 'Wisselkoersverschillen', category: 'Financiële kosten' },
  { code: '655', name: 'Interestkosten leningen', category: 'Financiële kosten' },
  { code: '656', name: 'Interestkosten leasingschulden', category: 'Financiële kosten' },

  // ── 66x  Uitzonderlijke kosten ──
  { code: '660', name: 'Uitzonderlijke afschrijvingen', category: 'Uitzonderlijke kosten' },
  { code: '661', name: 'Uitzonderlijke waardeverminderingen', category: 'Uitzonderlijke kosten' },
  { code: '662', name: 'Uitzonderlijke voorzieningen', category: 'Uitzonderlijke kosten' },
  {
    code: '663',
    name: 'Minderwaarden op realisatie vaste activa',
    category: 'Uitzonderlijke kosten',
  },
  { code: '664', name: 'Andere uitzonderlijke kosten', category: 'Uitzonderlijke kosten' },

  // ── 67x  Belastingen op het resultaat ──
  { code: '670', name: 'Belastingen op het resultaat van het boekjaar', category: 'Belastingen' },
  { code: '671', name: 'Geactiveerde overschotten van belastingen', category: 'Belastingen' },
  { code: '672', name: 'Belastingen vorige boekjaren', category: 'Belastingen' },

  // ── 70x  Omzet ──
  { code: '700', name: 'Verkopen en dienstprestaties', category: 'Omzet' },
  { code: '701', name: 'Omzet handelsgoederen', category: 'Omzet' },
  { code: '702', name: 'Omzet afgewerkte producten', category: 'Omzet' },
  { code: '703', name: 'Omzet dienstprestaties', category: 'Omzet' },
  { code: '708', name: 'Toegekende kortingen en rabatten', category: 'Omzet' },

  // ── 74x  Andere bedrijfsopbrengsten ──
  {
    code: '740',
    name: 'Bedrijfssubsidies en compenserende bedragen',
    category: 'Andere bedrijfsopbrengsten',
  },
  {
    code: '741',
    name: 'Meerwaarden op courante realisatie vaste activa',
    category: 'Andere bedrijfsopbrengsten',
  },
  { code: '742', name: 'Huurinkomsten', category: 'Andere bedrijfsopbrengsten' },
  { code: '743', name: 'Managementfees en doorrekeningen', category: 'Andere bedrijfsopbrengsten' },
  { code: '744', name: 'Recuperatie kosten', category: 'Andere bedrijfsopbrengsten' },
  { code: '749', name: 'Diverse bedrijfsopbrengsten', category: 'Andere bedrijfsopbrengsten' },

  // ── 75x  Financiële opbrengsten ──
  {
    code: '750',
    name: 'Opbrengsten uit financiële vaste activa',
    category: 'Financiële opbrengsten',
  },
  { code: '751', name: 'Opbrengsten uit vlottende activa', category: 'Financiële opbrengsten' },
  { code: '752', name: 'Andere financiële opbrengsten', category: 'Financiële opbrengsten' },
  { code: '753', name: 'Wisselkoerswinsten', category: 'Financiële opbrengsten' },
  { code: '754', name: 'Interestopbrengsten', category: 'Financiële opbrengsten' },

  // ── 76x  Uitzonderlijke opbrengsten ──
  { code: '760', name: 'Terugneming van afschrijvingen', category: 'Uitzonderlijke opbrengsten' },
  {
    code: '761',
    name: 'Terugneming van waardeverminderingen',
    category: 'Uitzonderlijke opbrengsten',
  },
  { code: '762', name: 'Terugneming van voorzieningen', category: 'Uitzonderlijke opbrengsten' },
  {
    code: '763',
    name: 'Meerwaarden op realisatie vaste activa',
    category: 'Uitzonderlijke opbrengsten',
  },
  {
    code: '764',
    name: 'Andere uitzonderlijke opbrengsten',
    category: 'Uitzonderlijke opbrengsten',
  },
]
