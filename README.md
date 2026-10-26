# Scuola di Vela · Sportaction

Simulatore di vela nel browser, per la scuola **Sportaction** sul Lago d'Iseo (base di Castro).

**Provalo:** https://quinofpv.github.io/scuola-vela/ (computer, telefono o tablet; Chrome, Safari, Edge o Firefox)

- Fisica a forze vere: vento apparente, vele, chiglia, timone, sbandamento, virate, strambate, prua al vento.
- La barca è una Protagonist 7.50, tarata sulla sua polare ORC dalla bolina al traverso (lo spinnaker non c'è).
- Lago d'Iseo reale: montagne, foto satellitare, boschi, paesi; base Sportaction con statale, ombrelloni, pontile e barche all'ormeggio.
- Venti del Sebino: Ora (da sud) e Sover (da nord), da 6 a 30 nodi, con raffiche e salti.
- Istruttore virtuale: consigli su timone e vele, filetti del fiocco, moviola.
- Giro delle boe da regata (gonfiabili gialle SPORTACTION) in senso antiorario, lasciandole a sinistra, con le frecce sull'acqua.
- Due barche: Sportaction nera (SPORTACTION.IT sul fiocco) e bianca ITA 09.
- Riduzione della tela: 1 mano, 2 mani di terzaroli, 2 mani + tormentina; vele in bando.
- Andatura a farfalla in poppa: il fiocco sul tangone dalla parte opposta alla randa (in poppa piena il fiocco coperto rende poco).
- Esercizio della randa scontrata: da fermi prua al vento si spinge fuori il boma e si va in retromarcia, col timone al contrario.
- Da accendere nel menu: il triangolo dei venti (reale, apparente, velocità della barca) e l'aria sporca sottovento.

Comandi principali: ← → barra · Q/A randa · W/S fiocco · T vele automatiche · SPAZIO vele in bando · K randa scontrata · Y farfalla ·
Z/X terzaroli e tormentina · F triangolo dei venti · O aria sporca · C vista · R moviola · P pausa · H tutti i comandi.

Su telefono e tablet, in orizzontale: barra del timone in basso a sinistra, CAZZA/LASCA in basso a destra,
pulsanti in alto; un dito sulla scena gira la vista, due dita la avvicinano. Con "Aggiungi a schermata Home"
si apre a tutto schermo come un'app.

## In locale
```
python3 serve.py
```
e poi http://localhost:8765. Prove automatiche della fisica: `node test/selftest.mjs`.

## Crediti e licenze
Vedi [LICENZE.md](LICENZE.md).
