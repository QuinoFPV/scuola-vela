# Scuola di Vela — versione web

Il simulatore della scuola Sportaction sul Lago d'Iseo, nel browser e per computer. La fisica, il vento, i consigli dell'istruttore, il giro delle boe e la moviola sono gli stessi della versione Mac.

## Novità rispetto al Mac
- **Due barche**, da scegliere nel menu o col tasto V:
  - Sportaction nera, con SPORTACTION.IT sul fiocco;
  - Sportaction bianca ITA 09, con il logo a bandiera e "target" sulla randa, "pegaso" sullo scafo.
- **Base di Castro come nelle foto aeree:**
  - la statale SS469 lungo la riva;
  - il prato con le file di ombrelloni e il punto ristoro;
  - il magazzino con l'insegna, le bandiere SPORTACTION, il pontile con la piattaforma galleggiante e la manica a vento;
  - le case e il capannone Marini Marmi a nord;
  - una ventina di barche all'ormeggio, che si girano col vento. Se ci si urta la barca si ferma.
- **Il gioco parte sempre con le vele regolate in automatico**; col tasto T si passa al manuale.
- **Riduzione della tela** (Z riduce, X aumenta): 1 mano, 2 mani, 2 mani + tormentina.
  - Con i terzaroli la randa diventa più piccola e più bassa; durante la manovra sbatte per 6 secondi.
  - La tormentina arancione sostituisce il fiocco; il cambio dura 10 secondi, durante i quali sbatte il fiocco.
  - Con vento forte l'istruttore suggerisce la riduzione giusta.
- **Vento fino a 30 nodi** (tasti 1–6): 6, 10, 15, 20, 25, 30 nodi.

## Provarlo sul proprio computer
Serve un piccolo server web, perché i browser non caricano i dati da un file aperto con doppio clic:
```
cd "Gaming/Web/Scuola Vela"
python3 serve.py
```
(`python3 -m http.server` a volte rifiuta qualche file, perché tiene in coda solo 5 richieste.)
Poi si apre http://localhost:8765 nel browser.

## Pubblicarlo
È un sito statico: basta copiare tutta la cartella su un qualsiasi hosting, oppure in una sottocartella del sito Sportaction. Pesa circa 3 MB in tutto:
- three.js 0,7 MB;
- dati del lago 2,2 MB;
- codice e pagina il resto.

Non usa servizi esterni.

## Prove automatiche
```
node test/selftest.mjs
```
Controlla polare, virata, prua al vento, strambata, bilanciamento, secche, giro delle boe e moviola.

## Dati
Sono preparati da `Gaming/Mac/Scuola Vela/tools/export_web.py`, a partire da quelli della versione Mac.

Fonti:
- contorno ed edifici © OpenStreetMap contributors (ODbL);
- Sentinel-2 cloudless 2016 di EOX IT Services, s2maps.eu (CC BY 4.0, dati Copernicus);
- quote Terrarium (AWS Open Data).

I crediti compaiono in basso a destra nella pagina.
