# ReHestore

Modern, világos Chrome-bővítmény skin a [hestore.hu](https://www.hestore.hu/) webáruházhoz: sticky fejléc nagy keresővel, mega-menü, kártyás terméklista szűrőpanellel (rács/lista nézet, végtelen görgetés), kétoszlopos termékoldal, letisztult kosár és bejelentkezés. A nem natívan újrarajzolt oldalak (súgó, cikkek, profil) a régi tartalommal, de az új keretben és tipográfiával jelennek meg.

## Telepítés

1. Nyisd meg: `chrome://extensions`
2. Kapcsold be a **Fejlesztői módot**
3. **Kicsomagolt bővítmény betöltése** → válaszd ki ezt a mappát
4. Nyisd meg a `https://www.hestore.hu/` oldalt

A bővítmény popupjában (eszköztár ikon) kapcsolható ki/be a modern nézet, és itt választható a téma is: **Világos**, **Sötét** vagy **Rendszer** (a Windows/böngésző sötét-mód beállítását követi). A téma a nyitott hestore.hu lapon azonnal, újratöltés nélkül vált; a felső sávban lévő Sötét/Világos gombbal gyorsan is átkapcsolható.

## Fejlesztés

- Fő logika: `src/content.js`
- Boot / legacy CSS: `src/content.css`
- Verzió: `manifest.json` — minden változásnál emeld

```bash
node --check src/content.js
```

A Chrome Web Store-ba feltöltött zipbe csak a `manifest.json`, a `src/` és az `icons/` kell.

## Hogyan működik

- A content script `document_start`-on elrejti az eredeti oldalt, és egy Shadow DOM-os héjban rajzolja újra a tartalmat az eredeti DOM-ból kiolvasott adatokból.
- Minden szerveroldali művelet (kosárba tétel, szűrés, lapozás, bejelentkezés, kosár módosítás) az eredeti rejtett űrlapok/gombok `click()`/`requestSubmit()` hívásával történik, így az oldal saját JS-e végzi a munkát.
- A régi tartalom (cikkek szövege, súgó oldalak) `slot`-olt light DOM-ként jelenik meg, `#rh-host .rh-legacy` felülírásokkal.

## Biztonság

- Meglévő bejelentkezett munkamenetet használ
- Jelszót / sütit nem tárol
- Szerverműveletek az eredeti DOM űrlapjain / gombjain keresztül mennek

Részletek: [PRIVACY.md](PRIVACY.md)

Nem hivatalos projekt, nem áll kapcsolatban a HESTORE Hungary Kft.-vel.
