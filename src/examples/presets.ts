import type { PhaseId } from '../compiler/types';

export interface Preset {
  id: string;
  title: string;
  group: 'Valid journeys' | 'Lexical errors' | 'Syntax errors' | 'Semantic errors' | 'Optimizer showcases';
  /** phase that should fail (undefined = compiles) and the codes that must appear */
  expect: { failedAt?: PhaseId; codes: string[] };
  source: string;
}

export const PRESETS: Preset[] = [
  // ------------------------------------------------------------ valid
  {
    id: 'sample',
    title: 'Jahangirpuri → Central Secretariat (sample)',
    group: 'Valid journeys',
    expect: { codes: [] },
    source: `// Sample journey from the brief
BOARD Jahangirpuri ON Yellow;
VIA Kashmere Gate;
CHANGE Violet AT Kashmere Gate;
VIA Mandi House;
EXIT Central Secretariat;
`,
  },
  {
    id: 'cross-city',
    title: 'Inderlok → Lajpat Nagar (3 lines)',
    group: 'Valid journeys',
    expect: { codes: [] },
    source: `// Red → Yellow → Violet
BOARD Inderlok ON Red;
VIA Tis Hazari;
CHANGE Yellow AT Kashmere Gate;
VIA New Delhi;
CHANGE Violet AT Central Secretariat;
VIA Khan Market;
EXIT Lajpat Nagar;
`,
  },
  {
    id: 'quoted',
    title: 'Quoted names & aliases',
    group: 'Valid journeys',
    expect: { codes: ['I-S30'] },
    source: `// Quoted names are optional; former names are accepted
BOARD "Race Course" ON Yellow;
VIA "Dilli Haat - INA";
EXIT Hauz Khas;
`,
  },
  {
    id: 'green-branch',
    title: 'Green Line branch via Ashok Park Main',
    group: 'Valid journeys',
    expect: { codes: [] },
    source: `BOARD Karol Bagh ON Blue;
CHANGE Green AT Kirti Nagar;
VIA Satguru Ram Singh Marg;
EXIT Punjabi Bagh;
`,
  },
  // ------------------------------------------------------------ optimizer showcases
  {
    id: 'opt-redundant',
    title: 'Change and change back (redundant transfer)',
    group: 'Optimizer showcases',
    expect: { codes: ['W-S22'] },
    source: `BOARD Jahangirpuri ON Yellow;
VIA Civil Lines;
CHANGE Violet AT Kashmere Gate;
CHANGE Yellow AT Kashmere Gate;
VIA Chandni Chowk;
EXIT Rajiv Chowk;
`,
  },
  {
    id: 'opt-detour',
    title: 'Scenic detour (Dijkstra finds faster)',
    group: 'Optimizer showcases',
    expect: { codes: ['W-S23', 'W-S21'] },
    source: `// Goes round the loop: Yellow → Blue → Violet → Yellow
BOARD Rajiv Chowk ON Yellow;
CHANGE Blue AT Rajiv Chowk;
VIA Barakhamba Road;
CHANGE Violet AT Mandi House;
VIA Janpath;
CHANGE Yellow AT Central Secretariat;
EXIT Kashmere Gate;
`,
  },
  // ------------------------------------------------------------ lexical
  {
    id: 'lex-illegal',
    title: 'Illegal characters (@, #)',
    group: 'Lexical errors',
    expect: { failedAt: 'lexer', codes: ['L01'] },
    source: `BOARD Rajiv Chowk ON Blue;
VIA Mandi House; @
EXIT Yamuna #Bank;
`,
  },
  {
    id: 'lex-unterminated',
    title: 'Unterminated quoted name',
    group: 'Lexical errors',
    expect: { failedAt: 'lexer', codes: ['L02'] },
    source: `BOARD "Rajiv Chowk ON Blue;
EXIT Mandi House;
`,
  },
  {
    id: 'lex-comments',
    title: 'Bad comments (/ and /* */)',
    group: 'Lexical errors',
    expect: { failedAt: 'lexer', codes: ['L04', 'L05'] },
    source: `/* block comments are not allowed */
BOARD Rajiv Chowk ON Blue; / not a comment
EXIT Mandi House;
`,
  },
  // ------------------------------------------------------------ syntax
  {
    id: 'syn-missing-semi',
    title: "Missing ';'",
    group: 'Syntax errors',
    expect: { failedAt: 'parser', codes: ['P04'] },
    source: `BOARD Jahangirpuri ON Yellow
VIA Kashmere Gate;
EXIT Rajiv Chowk;
`,
  },
  {
    id: 'syn-missing-on',
    title: 'Missing ON (words merge into one name)',
    group: 'Syntax errors',
    expect: { failedAt: 'parser', codes: ['P03'] },
    source: `BOARD Rajiv Chowk Blue;
EXIT Mandi House;
`,
  },
  {
    id: 'syn-many',
    title: 'Many syntax errors (panic-mode recovery)',
    group: 'Syntax errors',
    expect: { failedAt: 'parser', codes: ['P02', 'P04', 'P06', 'P11'] },
    source: `board Rajiv Chowk ON Blue;
VIA Mandi House
CHANGE Violet ITO;
EXIT ;
`,
  },
  {
    id: 'syn-structure',
    title: 'Duplicate BOARD, statement after EXIT',
    group: 'Syntax errors',
    expect: { failedAt: 'parser', codes: ['P09', 'P08'] },
    source: `BOARD Rajiv Chowk ON Blue;
BOARD Mandi House ON Violet;
EXIT ITO;
VIA Janpath;
`,
  },
  {
    id: 'syn-no-exit',
    title: 'Missing EXIT',
    group: 'Syntax errors',
    expect: { failedAt: 'parser', codes: ['P07'] },
    source: `BOARD Rajiv Chowk ON Blue;
VIA Mandi House;
`,
  },
  // ------------------------------------------------------------ semantic
  {
    id: 'sem-order',
    title: 'VIA stations out of order',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S10'] },
    source: `// Blue line order: Kirti Nagar … Karol Bagh … Rajiv Chowk … Yamuna Bank
BOARD Kirti Nagar ON Blue;
VIA Rajiv Chowk;
VIA Karol Bagh;
EXIT Yamuna Bank;
`,
  },
  {
    id: 'sem-reverse',
    title: 'Direction reversal',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S11'] },
    source: `BOARD Karol Bagh ON Blue;
VIA Rajiv Chowk;
EXIT Kirti Nagar;
`,
  },
  {
    id: 'sem-names',
    title: 'Unknown / misused names',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S01', 'S02', 'S03'] },
    source: `BOARD Rajiv Chok ON Blue;
VIA mandi house;
CHANGE Green Park AT Mandi House;
CHANGE Pink AT ITO;
EXIT Yellow;
`,
  },
  {
    id: 'sem-change',
    title: 'Bad CHANGE (not an interchange / same line)',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S07', 'S08'] },
    source: `BOARD Rajiv Chowk ON Blue;
CHANGE Blue AT Barakhamba Road;
CHANGE Violet AT Indraprastha;
EXIT ITO;
`,
  },
  {
    id: 'sem-wrong-line',
    title: 'Station not on the line',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S04', 'S05'] },
    source: `BOARD Jahangirpuri ON Violet;
CHANGE Yellow AT Kashmere Gate;
VIA Mandi House;
EXIT Central Secretariat;
`,
  },
  {
    id: 'sem-branch',
    title: 'Different Green Line branches',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S12'] },
    source: `BOARD Inderlok ON Green;
EXIT Kirti Nagar;
`,
  },
  {
    id: 'sem-zero',
    title: 'Zero-length journey',
    group: 'Semantic errors',
    expect: { failedAt: 'semantic', codes: ['S13'] },
    source: `BOARD Rajiv Chowk ON Blue;
EXIT Rajiv Chowk;
`,
  },
];
