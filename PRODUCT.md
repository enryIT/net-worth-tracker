# Impeccable Design Context — Net Worth Tracker

## Design Context

### Users
Investitori italiani attenti e autonomi che gestiscono in proprio il loro patrimonio — azioni, ETF, BTP, crypto, immobili, conti correnti. Usano l'app regolarmente (almeno mensile) per monitorare performance, dividendi e progresso verso FIRE. Non sono trader: sono accumulatori di lungo periodo, metodici, che vogliono dati affidabili e leggibili senza perdere tempo.

**Job to be done**: "Capire in pochi secondi com'è messa la mia situazione finanziaria, confrontarla col passato, e sentire che sto andando nella giusta direzione."

### Brand Personality
**Elegante · Personale · Essenziale**

L'app è la Apple dei personal tracker finanziari: non lo strumento più ricco di feature, ma quello che ti fa capire la tua situazione nel modo più chiaro, bello e immediato possibile. Come un wealth manager privato su misura — non parla a tutti, parla a te. L'eccellenza si esprime nella semplicità apparente che nasconde profondità reale, non nella complessità mostrata.

### Aesthetic Direction

**Riferimento primario — Apple (Stocks, Wallet, Health)**: il benchmark di qualità del settore. Dati complessi resi effortlessly readable. Whitespace generoso come materiale di design — non spazio sprecato, ma respiro guadagnato. Light mode altrettanto premium del dark. Superfici che sembrano considerate e preziose. Profondità progressiva: l'essenziale a colpo d'occhio, il dettaglio su interazione. L'interfaccia si fa da parte per lasciare parlare i numeri.

**Riferimento primario — Linear / Vercel**: tipografia forte, dark mode eccellente, geometria pulita, microinterazioni fluide, nessun decoro superfluo. La struttura, il ritmo, la pulizia.

**Riferimento primario — Trade Republic**: gerarchia numerica estrema. Il dato primario occupa il massimo spazio fisico e visivo disponibile. Layout verticale netto: numero dominante → variazione chip inline → metadati in label piccole. Liste flat con `divide-y` invece di card-dentro-card. Nessun progress bar decorativo. Nessuna box-within-box. Il chrome visivo è ridotto al minimo strutturale — solo ciò che separa, mai ciò che decora.

I tre riferimenti sono compatibili: condividono zero decorazione, tipografia come struttura, e la convinzione che la semplicità richieda più lavoro della complessità.

**La legge che li unisce — la forma segue la funzione.** Sotto i tre riferimenti c'è una sola convinzione, quella che Jony Ive eredita dalla tradizione modernista: *form follows function*. Ogni proprietà visiva di ogni elemento — dimensione, peso, colore, posizione, movimento, persino il raggio degli angoli — è una *conseguenza* di ciò che quell'elemento fa, mai un costume applicato dopo. Un numero è grande perché è il fatto più importante sullo schermo, non perché "grande" impressiona. Un bordo è 1px al 10% di opacità perché è esattamente il contrasto che serve a separare, niente di più. Quando forma e decorazione sono in disaccordo, vince la funzione. Tre corollari, nella lettura di Ive: **onestà** — una superficie non finge profondità, materiali o stati che non ha (niente finto vetro, niente gerarchie d'ombra inventate); **deferenza** — l'interfaccia è uno strumento silenzioso che si ritira per lasciar parlare i dati; **inevitabilità** — un elemento ben risolto sembra l'unica risposta possibile, come se non potesse essere altrimenti.

**Visual tone**: Ultra-clean · Premium feeling · Personale. Whitespace generoso come lusso. Superfici che hanno materiale e profondità. Gerarchia tipografica limpida. Dati che respirano. Animazioni che rivelano struttura, non intrattengono.

**Layout vocabulary**: La pagina Panoramica definisce il vocabolario di layout per tutte le pagine:
- **Hero asimmetrico** `desktop:grid-cols-[2fr_1fr]` in cima: numero dominante a sinistra, card di contesto (breakdown patrimoniale) a destra. L'asimmetria 2:1 comunica gerarchia attraverso lo spazio, non solo la tipografia.
- **KPI Chip Grid** full-width: sotto l'hero, una sezione a larghezza piena con `grid grid-cols-2 desktop:grid-cols-4 gap-3` di sub-tile `bg-muted/40 rounded-xl`. Quattro metriche di pari peso (Entrate / Spese / Risparmio / Rapporto) con sub-hero value `text-[22px]` + delta annotation `text-[12px] font-mono`. Seguita da category bar breakdown.
- **Card Sticky Footer**: l'hero card usa `flex flex-col h-full` + `mt-auto` per ancorare il blocco TER/Costo al fondo della card, visivamente allineato col bordo inferiore della companion card.
- **Responsive duplication**: i blocchi TER/Costo compaiono sia nel footer dell'hero card (desktop, `hidden desktop:grid`) sia come standalone `grid-cols-2` sotto l'hero (mobile, `desktop:hidden`). Lo stesso dato, due posizioni diverse — preferibile alla logica condizionale convoluta.
- **Sezioni secondarie** collassabili (Radix Collapsible + Framer Motion height:auto) per non sovraccaricare la fold.
- **Separatori** `border-t border-border/40` tra capitoli. I grafici sono deferiti via `requestIdleCallback` fino al completamento dell'animazione hero, per non competere sul frame budget.

**Direzione**: Premium Craft — la semplicità richiede più ingegneria della complessità. Ogni interazione è considerata, ogni transizione è giustificata, ogni dato ha il suo spazio. Tecnicamente ambiziosi in servizio della chiarezza, non della dimostrazione. Fisica spring su dialog, counter animati, sparkline edge-to-edge, transizioni circle-reveal — ma sempre in funzione della comprensione, non dell'effetto.

**Anti-riferimenti**: Bloomberg terminal (troppo freddo/denso), consumer fintech colorato alla Revolut (troppo leggero per dati seri), Material Design (troppo generico), **complessità ostentata** (UI che dimostra quanto è difficile il dominio invece di nasconderla dietro una superficie calma).

**Tema**: Dark mode come esperienza primaria. Light mode pienamente supportata.

### Design Principles

> **Principio fondante — la forma segue la funzione.** Gli otto principi qui sotto sono otto modi di applicare un'unica legge: la forma di ogni elemento deriva dalla sua funzione. Onestà invece di illusione, deferenza invece di decorazione, inevitabilità invece di ornamento. Se una proprietà visiva non svolge un compito, è decoro — e va tolta.

1. **Dati prima, chrome mai** — ogni elemento visivo guadagna il suo spazio comunicando un'informazione. Se togliendolo la pagina è più chiara, va tolto. Box decorative, progress bar estetiche, divisori ridondanti: fuori. Il donut SVG animato nella Liquid card è stato sostituito da un semplice breakdown flat a 3 righe — tre valori espliciti comunicano più di una forma geometrica animata.

2. **Il numero comanda** — il dato primario di ogni schermata occupa il massimo spazio fisico e visivo disponibile. Gerarchia Trade Republic: valore in `text-[44px] desktop:text-[54px] font-bold font-mono` per hero di pagina, `text-[36px]` per hero di sezione, `text-[22px]` per valori secondari accoppiati. Eyebrow label `text-[10px] uppercase tracking-[0.1em]` sopra il numero. Variazione come chip `text-[15px] font-semibold font-mono rounded-[9px] px-[13px] py-[6px]` sotto il numero. L'utente capisce il numero più importante in meno di 2 secondi, senza cercare.

3. **Sezioni che respirano** — lo spazio bianco è un materiale di design, non spazio vuoto. Padding generoso tra sezioni. Separatori `divide-y` invece di nested card. Liste piatte invece di griglie di box. La densità è una feature solo quando è leggibile — un dato affogato nel rumore visivo non è un dato.

4. **Mobile-first, desktop-elevated** — il layout base è progettato per 390px. Il desktop aggiunge colonne, tabelle e sidebar — non è una versione semplificata di un layout desktop. Il breakpoint primario è `desktop:` (1440px). Mai `lg:` per layout wide-screen (iPad Mini in landscape = 1024px, trattato come mobile per design).

5. **Movimento con intenzione** — le animazioni rivelano struttura e relazioni, non distraggono. Fisica spring come standard (stiffness 400, damping 35). Rispetta sempre `prefers-reduced-motion` via `useReducedMotion()`. Le animazioni di montaggio (count-up, ring chart, donut) si eseguono **una volta sola** alla prima visualizzazione — non si riavviano su ogni re-render del padre. Grafici pesanti vengono deferiti via `requestIdleCallback` per non competere con l'animazione hero.

6. **Fiducia attraverso la precisione** — font monospaziato per valori (`font-mono` + `tnum`), allineamento decimale, consistenza nei formati. Il dato deve sembrare assolutamente affidabile.

7. **Profondità progressiva** — l'essenziale è visibile a colpo d'occhio; il dettaglio è a un tap di distanza. Hero numbers in apertura, collapsible per i parametri avanzati, drill-down su richiesta. Non nascondere dati utili, ma non obbligare l'utente a vederli tutti in una volta. L'app deve sembrare semplice al primo sguardo e potente al secondo.

8. **Personalità nei dettagli** — i momenti di piacere vengono dai piccoli dettagli curati: counter animati che contano dal valore precedente (mai da zero), sparkline per-asset, stati vuoti che raccontano qualcosa, transizioni che sembrano naturali. Come Apple: non si notano quando ci sono, si notano quando mancano.

---

## Tech Stack Design Notes
- Tailwind v4 + shadcn/ui (stile "new-york"), base color neutral, OKLCH color space
- Breakpoint custom `desktop:` a 1440px (non usare `lg:`)
- Geist Sans (UI) + Geist Mono (valori numerici)
- Framer Motion già integrato — usare per animazioni avanzate
- Recharts (grafici) + @nivo/sankey
- Dark/light/system theme con CSS variables semantiche
