# MetroCC: a six-phase compiler for Delhi Metro journeys

MetroCC is an interactive web app that compiles a small domain-specific language (DSL) for metro journeys into a verified, optimised itinerary. Each of the six classic compiler phases has its own visualisation and a theory panel linking it to automata theory:

| # | Phase | What you see |
|---|-------|--------------|
| 1 | Lexical analysis | Animated scanner DFA, input tape with read head, raw and screened token tables |
| 2 | Syntax analysis | LL(1) PDA trace (stack / input / action, INIT → ACCEPT), parse tree and AST, FIRST/FOLLOW sets, LL(1) table |
| 3 | Semantic analysis | Pass/fail checklist per statement, annotated (attributed) tree, symbol table |
| 4 | Intermediate code | Numbered three-address IR, basic blocks / control-flow graph |
| 5 | Optimization | Toggleable passes, before/after IR diff, metrics, Dijkstra route suggestion |
| 6 | Code generation | Human-readable itinerary, animated schematic metro map |

The compiler is pure TypeScript in [src/compiler/](src/compiler/). It has no backend and uses no parser generator: the lexer and parser are hand-written. Every phase is a pure function that returns `{ ok, result, steps, diagnostics }`; the UI animates the `steps`.

---

## Running it

Requirements: Node 18+ (tested on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 104 unit tests (vitest)
npm run build      # type-check + production build into dist/
```

### Controls

| Control | Action |
|---|---|
| **▶ Compile** / `Ctrl+Enter` | Recompile and animate all phases from the start |
| `←` / `→` | Step back / forward within the current phase |
| `Space` | Play / pause (auto-play moves on to the next phase) |
| ⏮ / ⏭ | Jump to the first step / show the whole phase instantly |
| Speed slider | 1–30 steps per second |
| Pipeline stepper | Click a phase. Phases after an error are greyed out. |
| Hover | Hovering a token, tree node, check, IR line or itinerary step highlights its source. Hovering the source highlights the matching items. |
| Problems panel | Click a problem to jump to it in the editor |
| ☀️ / 🌙 | Light / dark theme |

The editor compiles live as you type and shows squiggles for every diagnostic. The preset menu has valid journeys, optimizer showcases, and deliberately invalid programs for each phase.

---

## The language

```
// Sample journey
BOARD Jahangirpuri ON Yellow;
VIA Kashmere Gate;
CHANGE Violet AT Kashmere Gate;
VIA Mandi House;
EXIT Central Secretariat;
```

### Tokens

| Token | Definition |
|---|---|
| `BOARD` `ON` `VIA` `CHANGE` `AT` `EXIT` | Reserved, upper-case, case-sensitive keywords |
| `NAME` | One or more words joined by spaces/tabs on one line, e.g. `Kashmere Gate`, `Sector 18`; or a double-quoted string such as `"Dilli Haat - INA"` |
| `SEMI` | `;` |
| `EOF` | End of input (`$`) |
| *(skipped)* | Whitespace and `//` comments to end of line |

**How multi-word names are handled: scanner + screener (Dragon Book §3.4.3).**
1. The DFA in [dfa.ts](src/compiler/lexer/dfa.ts) recognises `WORD = [A-Za-z0-9][A-Za-z0-9'.-]*` with maximal munch.
2. A screener then marks reserved keywords and merges adjacent non-keyword words on the same line into a single `NAME`.

Why this design:
- The lexer stays a pure finite automaton and never needs the station table.
- Whether a name is a real station or line is decided by the semantic phase, where the symbol table can offer "did you mean …?" hints.
- Names never merge across a newline, so a missing `;` is reported on the right line.
- Quotes are an optional escape hatch, which is also what makes the "unterminated name" error possible.

### Grammar (BNF, LL(1))

```
<program>     ::= <board_stmt> <route_list> <exit_stmt>
<board_stmt>  ::= BOARD <station> ON <line> ";"
<route_list>  ::= <route_stmt> <route_list> | ε
<route_stmt>  ::= <via_stmt> | <change_stmt>
<via_stmt>    ::= VIA <station> ";"
<change_stmt> ::= CHANGE <line> AT <station> ";"
<exit_stmt>   ::= EXIT <station> ";"
<station>     ::= NAME
<line>        ::= NAME
```

- `route_stmt*` is rewritten as the right-recursive `route_list` with an ε-production. Left recursion would break top-down parsing.
- No left-factoring is needed, because every alternative starts with a different keyword.
- "BOARD first, EXIT last, exactly once" is enforced by the grammar itself.

| Non-terminal | FIRST | FOLLOW |
|---|---|---|
| program | { BOARD } | { $ } |
| board_stmt | { BOARD } | { VIA, CHANGE, EXIT } |
| route_list | { VIA, CHANGE, ε } | { EXIT } |
| route_stmt | { VIA, CHANGE } | { VIA, CHANGE, EXIT } |
| via_stmt | { VIA } | { VIA, CHANGE, EXIT } |
| change_stmt | { CHANGE } | { VIA, CHANGE, EXIT } |
| exit_stmt | { EXIT } | { $ } |

**LL(1) check:** FIRST(route_stmt route_list) ∩ FOLLOW(route_list) = {VIA, CHANGE} ∩ {EXIT} = ∅.

The sets and the table are computed in code ([firstFollow.ts](src/compiler/parser/firstFollow.ts), [ll1Table.ts](src/compiler/parser/ll1Table.ts)). A unit test asserts the table has zero conflicts.

The parser ([parser.ts](src/compiler/parser/parser.ts)) is a table-driven PDA:
- **Start configuration:** `([$ program], tokens $)`
- **Accepting configuration:** `([$], $)`
- **Error recovery (panic mode):**
  - pop a missing terminal as if it had been inserted;
  - pop A when `a ∈ FOLLOW(A)`;
  - otherwise skip tokens up to the next `;`.
- **Cascade suppression:** later errors are not reported until the next successful match.

---

## Error catalogue

Each phase reports *all* of its errors (capped at 25 per phase), and the pipeline stops after the first phase that has errors. Every message gives the line:column and a hint.

**Lexical (L)**

| Code | Error |
|---|---|
| L01 | Illegal character (`@`, `#`, `,` …) |
| L02 | Unterminated quoted name |
| L03 | Empty quoted name `""` |
| L04 | Lone `/` (comments are `//`) |
| L05 | Block comment `/* */` or stray `*/` |

Lexical warnings:

| Code | Warning |
|---|---|
| W-L01 | Byte-order mark (BOM) at the start of the file |
| W-L02 | Non-breaking space |
| W-L10 | Lowercase keyword (`board`) |
| W-L11 | Misspelled keyword (`BORD`) |

**Syntax (P)**

| Code | Error |
|---|---|
| P01 | Empty program |
| P02 | Missing BOARD / journey doesn't start with BOARD |
| P03 | Missing `ON` (with the hint "words merged into one name") |
| P04 | Missing `;` (reported at the end of the previous token) |
| P05 | Stray `;` |
| P06 | Missing `AT` |
| P07 | Missing EXIT |
| P08 | Statements after EXIT |
| P09 | Duplicate BOARD |
| P10 | Duplicate EXIT |
| P11 | Keyword where a name was expected |
| P12 | Unexpected token / name split across lines / statement without keyword |

**Semantic (S)**

| Code | Error |
|---|---|
| S01 | Unknown station (with "did you mean", case-insensitive match) |
| S02 | Unknown line (including real-but-unmodelled lines like Pink) |
| S03 | Station used as a line, or line used as a station |
| S04 | Boarding station not on the boarding line |
| S05 | VIA station not on the current line (with a suggested `CHANGE`) |
| S06 | CHANGE station not reachable on the current line |
| S07 | CHANGE at a station that isn't an interchange for the target line (lists valid interchanges) |
| S08 | CHANGE to the same line |
| S09 | EXIT station not on the current line |
| S10 | VIA stations out of travel order |
| S11 | Direction reversal |
| S12 | Stations on different branches of the Green Line |
| S13 | Zero-length journey |

Semantic warnings and notes:

| Code | Meaning |
|---|---|
| W-S20 | Repeated stop |
| W-S21 | Route loops back through a station |
| W-S22 | Change and immediately change back |
| W-S23 | Change at the boarding station |
| W-S24 | Two transfers in a row at one station |
| I-S30 | Alias / former name resolved (e.g. Race Course → Lok Kalyan Marg) |

---

## Metro data

[src/compiler/data/metro.ts](src/compiler/data/metro.ts) is **the single file to verify**. It holds:
- 5 lines, 56 stations and 6 modelled interchanges;
- ordered station lists (the order is the direction of travel);
- the real termini used for "towards …";
- approximate inter-station kilometres;
- schematic map coordinates;
- the DMRC fare slabs (₹11 / 21 / 32 / 43 / 54 / 64).

| Line | Stations modelled |
|---|---|
| Yellow | Jahangirpuri → Hauz Khas (22) |
| Red | Inderlok → Welcome (9) |
| Blue | Kirti Nagar → Yamuna Bank (13) |
| Violet | Kashmere Gate → Lajpat Nagar (12) |
| Green | Inderlok → Madipur, plus the Kirti Nagar → Ashok Park Main branch |

**Interchanges:** Kashmere Gate (Y/R/V), Rajiv Chowk (Y/B), Central Secretariat (Y/V), Mandi House (B/V), Inderlok (R/G), Kirti Nagar (B/G).

**Time model:**
- Each hop takes about 1.5 min per km plus 0.6 min dwell, rounded.
- Each interchange adds 5 min.
- The fare follows DMRC practice and is charged on the shortest-distance path.

The graph ([graph.ts](src/compiler/data/graph.ts)) has one node per line-copy of a station. Edges join adjacent stations on a line, and interchange edges join the copies of the same station. Dijkstra runs over this graph.

---

## Project structure

```
src/
  compiler/                     pure TypeScript, no UI imports
    types.ts, diagnostics.ts    shared types, error sink, Levenshtein suggestions
    data/metro.ts, graph.ts     metro data, graph, Dijkstra, fares
    lexer/dfa.ts, lexer.ts      phase 1: DFA (also drawn by the UI) + scanner/screener
    parser/                     phase 2: grammar, FIRST/FOLLOW, LL(1) table, PDA parser, AST
    semantic/                   phase 3: symbol table, L-attributed checks, annotated tree
    ir/irgen.ts                 phase 4: three-address IR, basic blocks, metrics
    optimizer/                  phase 5: four passes + driver
    codegen/codegen.ts          phase 6: itinerary + animation path
    pipeline.ts                 runs the phases, stops at the first failing one
    __tests__/                  one test file per phase + presets + data integrity
  examples/presets.ts           demo programs (valid and invalid), also run as tests
  ui/                           React components (store, editor, phase views, map, tree)
```

---

## Viva demo script

Pick each program from the preset menu, press **▶ Compile** (or `Ctrl+Enter`) to animate, and use `←` / `→` to step.

**1. Valid journey: "Jahangirpuri → Central Secretariat (sample)"**
- *Lexer:* step through the DFA as q0 → q1 loops on letters. When the scanner halts on a space, the accepting state flashes and WORD is emitted. Switch to *After screener* to show `Kashmere` `Gate` merged into one NAME.
- *Parser:* the first row is INIT `[$ program]`. Point out an `M[route_list, EXIT] = route_list → ε` row, then the green ACCEPT row `[$]`. Open *Grammar · FIRST/FOLLOW* and the *LL(1) table*; the used cell is highlighted. Toggle Parse tree ↔ AST.
- *Semantic:* the checklist and the annotated tree, where `line.in`/`pos.in` are inherited and `stops`/`dir` are synthesised.
- *IR:* 8 instructions in 2 basic blocks (Yellow, Violet).
- *Optimizer:* dead-VIA removal, then segment merging (8 → 5 instructions). Dijkstra suggests staying on Yellow: 34 min instead of 45. This is a suggestion only; the program is not rewritten.
- *Codegen:* the itinerary "towards Millennium City Centre Gurugram…", ₹43, and the train running on the map.

**2. Lexical errors: "Bad comments (/ and /* */)"**
- Both L05 and L04 are reported in one run.
- Every later phase is greyed out.

**3. Syntax errors: "Many syntax errors (panic-mode recovery)"**
- Four independent errors:
  - P02, with the hint "keywords are case-sensitive";
  - P04, missing `;`;
  - P06, missing AT, with the hint "words merged into one name";
  - P11.
- The PDA trace shows the red POP / SKIP recovery rows and ends in REJECT.
- Talking point: the stack is what makes this a PDA rather than a DFA.

**4. Order check: "VIA stations out of order"**
- S10: riding Blue towards Noida, Karol Bagh comes before Rajiv Chowk.
- The hint gives the correct order.
- Compare with "Direction reversal" (S11), where the station lies behind the boarding point.

**5. Names and cascade suppression: "Unknown / misused names"**
- One run reports S01 ("Rajiv Chok" → did you mean Rajiv Chowk?), S03 ("Green Park is a station, not a line") and S02 (Pink isn't modelled).
- Later checks that depend on an unknown line are marked "skipped" instead of producing more errors.

**6. Optimizer: "Change and change back"**
- Redundant-transfer elimination removes `TRANSFER Yellow→Violet; TRANSFER Violet→Yellow`, and segment merging then fuses the rides.
- Untick *Dead-VIA removal* to show pass ordering: merging is blocked by the PASS instruction between the rides.
- "Scenic detour" shows Dijkstra finding a much faster route.

Bonus: "Different Green Line branches" (S12) shows why direction checks need route branches and not just a single ordered list.
