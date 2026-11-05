# ReHestore – Adatvédelmi tájékoztató

*Hatályos: 2026. november 5.*

A ReHestore egy nem hivatalos Chrome-bővítmény, amely a [hestore.hu](https://www.hestore.hu/) webáruház felületét modern megjelenéssel jeleníti meg. Nem áll kapcsolatban a HESTORE Hungary Kft.-vel.

## Milyen adatokat gyűjt?

**Semmilyet.** A bővítmény nem gyűjt, nem rögzít és nem továbbít személyes vagy használati adatot. Nincs benne analitika, követés, hirdetés vagy távoli naplózás.

## Mit tárol a gépeden?

Csak a saját beállításaidat, a böngésző helyi tárhelyén (`chrome.storage.local`):

| Kulcs | Jelentés |
|-------|----------|
| `enabled` | a modern nézet be van-e kapcsolva |
| `theme` | választott téma: világos, sötét vagy rendszer |
| `view` | terméklista nézete: rács vagy lista |

Ezek az adatok nem hagyják el a gépedet, és a bővítmény eltávolításakor törlődnek.

## Sütik, jelszavak, bejelentkezés

- A bővítmény sütiket nem olvas, nem módosít és nem tárol.
- Jelszót és belépési adatot nem ment. A bejelentkezési űrlap az oldal saját űrlapjának küldi tovább a beírt adatokat, közvetlenül a hestore.hu felé, pontosan úgy, mintha az eredeti oldalon lépnél be.
- A meglévő hestore.hu munkamenetet használja, azt nem éri el és nem továbbítja.

## Hálózati forgalom

A bővítmény kizárólag a hestore.hu-val kommunikál, ugyanúgy, ahogy maga az oldal: a megjelenítéshez az oldal saját tartalmát és képeit tölti be. Harmadik félnek semmilyen adatot nem küld, és távoli kódot nem tölt be vagy futtat.

## Engedélyek

- **storage** – a fenti beállítások helyi mentése.
- **activeTab** – a modern nézet ki- vagy bekapcsolásakor az aktív hestore.hu lap újratöltése.
- **hestore.hu oldalak** – a bővítmény csak ezeken az oldalakon fut, és csak a megjelenést cseréli le.

## Változások

Ha ez a tájékoztató változik, a frissített változat ebben a fájlban jelenik meg.

## Kapcsolat

Kérdés vagy hibajelzés: [GitHub Issues](https://github.com/PexoHUN/ReHestore/issues).

---

## English summary

ReHestore is an unofficial Chrome extension that restyles hestore.hu. It **does not collect, store or transmit any personal or usage data**. It only saves its own settings (on/off, theme, list view) locally via `chrome.storage.local`. It does not read or store cookies or passwords, does not send anything to third parties, and does not load or execute remote code. It is not affiliated with HESTORE Hungary Kft.
