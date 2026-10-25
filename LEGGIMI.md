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

## Telefono e tablet
Si riconoscono da soli (schermo touch) e si usano in orizzontale; in verticale compare l'invito a girare il dispositivo.
- **Barra del timone** in basso a sinistra: si trascina il dito e la barra resta dove la si lascia; il centro la raddrizza. Con "barra reale" si spinge al contrario, come sulla barca.
- **CAZZA / LASCA** in basso a destra, per randa e fiocco, si tengono premuti. Compaiono solo con le vele manuali; la barretta arancione mostra quanto è cazzata la scotta e la tacca verde la regolazione giusta.
- **Pulsanti in alto:**
  - ☰ apre il menu (vento, raffiche, Ora o Sover, timone, barca, aiuti);
  - VISTA, VELE AUTO/MAN., RIDUCI/AUMENTA, MOVIOLA, PAUSA.
- **Scena:** un dito gira intorno alla barca, due dita avvicinano o allontanano.
- **Telefono:** gli strumenti sono ridotti; toccandoli si vedono tutti i dati.
- **Tablet:** lo schermo è come sul computer.
- **Grafica più leggera:**
  - ombre, riflessi, acqua e alberi vicini semplificati;
  - se i fotogrammi scendono sotto 40 al secondo, la risoluzione cala da sola, e risale quando il dispositivo ce la fa.
- **Schermo intero:**
  - su Android e iPad si passa a tutto schermo quando si esce in mare;
  - sull'iPhone serve "Aggiungi a schermata Home" (icona con le vele nere), poi si apre come un'app.
- **Per provare la versione touch sul computer:** aggiungere `?touch=1` all'indirizzo (`?touch=0` la toglie).

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
