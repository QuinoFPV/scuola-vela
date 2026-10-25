# Scuola di Vela · Sportaction

Simulatore di vela nel browser, per la scuola **Sportaction** sul Lago d'Iseo (base di Castro).

**Provalo:** https://quinofpv.github.io/scuola-vela/ (computer con tastiera e mouse; Chrome, Safari, Edge o Firefox)

- Fisica a forze vere: vento apparente, vele, chiglia, timone, sbandamento, virate, strambate, prua al vento.
- Lago d'Iseo reale: montagne, foto satellitare, boschi, paesi; base Sportaction con statale, ombrelloni, pontile e barche all'ormeggio.
- Venti del Sebino: Ora (da sud) e Sover (da nord), da 6 a 30 nodi, con raffiche e salti.
- Istruttore virtuale: consigli su timone e vele, filetti del fiocco, giro delle boe, moviola.
- Due barche: Sportaction nera (SPORTACTION.IT sul fiocco) e bianca ITA 09.
- Riduzione della tela: 1 mano, 2 mani di terzaroli, 2 mani + tormentina.

Comandi principali: ← → barra · Q/A randa · W/S fiocco · T vele automatiche · Z/X terzaroli e tormentina ·
C vista · R moviola · P pausa · H tutti i comandi.

## In locale
```
python3 serve.py
```
e poi http://localhost:8765. Prove automatiche della fisica: `node test/selftest.mjs`.

## Crediti e licenze
Vedi [LICENZE.md](LICENZE.md).
