# WLC ↔ English Versification Map

## Design

Each translation preserves its source versification. Stored text and verse numbers are never normalized.

**Scope:** WLC (Hebrew MT) ↔ English (WEB/KJV) for 39 OT books. Greek NT / LXX entries reserved for future extension.

**Extensibility:** Mappings are keyed by book_id with per-verse correspondence entries. Add new translation_id fields when Greek/LXX texts are ingested.

This document reconciles numbering systems; it does **not** alter stored text or verse numbers in the API.

*Generated from local D1 on 2026-06-19T22:35:02.705Z.*

Machine-readable source: [`data/versification-map.json`](../data/versification-map.json)

## Summary

| Metric | Value |
|--------|------:|
| OT books (WLC) | 39 |
| Total WLC verses | 23213 |
| Divergent chapters | 139 |
| Verse-level mapping entries | 1404 |

### Divergence kinds

| Kind | Count | Description |
|------|------:|-------------|
| `chapter_boundary_split` | 240 | Chapter divisions differ between MT and English |
| `english_extra` | 134 | Verse present in English only at this alignment point |
| `superscription_as_v1` | 889 | Hebrew titles counted as verse 1; English omits them |
| `wlc_extra` | 141 | Verse present in WLC only at this alignment point |

## WLC 39-Book Inventory

| Book | Chapters | Verses |
|------|--------:|-------:|
| GEN (Genesis) | 50 | 1533 |
| EXO (Exodus) | 40 | 1213 |
| LEV (Leviticus) | 27 | 859 |
| NUM (Numbers) | 36 | 1289 |
| DEU (Deuteronomy) | 34 | 959 |
| JOS (Joshua) | 24 | 658 |
| JDG (Judges) | 21 | 618 |
| RUT (Ruth) | 4 | 85 |
| 1SA (1 Samuel) | 31 | 811 |
| 2SA (2 Samuel) | 24 | 695 |
| 1KI (1 Kings) | 22 | 817 |
| 2KI (2 Kings) | 25 | 719 |
| 1CH (1 Chronicles) | 29 | 943 |
| 2CH (2 Chronicles) | 36 | 822 |
| EZR (Ezra) | 10 | 280 |
| NEH (Nehemiah) | 13 | 405 |
| EST (Esther) | 10 | 167 |
| JOB (Job) | 42 | 1070 |
| PSA (Psalms) | 150 | 2527 |
| PRO (Proverbs) | 31 | 915 |
| ECC (Ecclesiastes) | 12 | 222 |
| SNG (Song of Solomon) | 8 | 117 |
| ISA (Isaiah) | 66 | 1291 |
| JER (Jeremiah) | 52 | 1364 |
| LAM (Lamentations) | 5 | 154 |
| EZK (Ezekiel) | 48 | 1273 |
| DAN (Daniel) | 12 | 357 |
| HOS (Hosea) | 14 | 197 |
| JOL (Joel) | 4 | 73 |
| AMO (Amos) | 9 | 146 |
| OBA (Obadiah) | 1 | 21 |
| JON (Jonah) | 4 | 48 |
| MIC (Micah) | 7 | 105 |
| NAM (Nahum) | 3 | 47 |
| HAB (Habakkuk) | 3 | 56 |
| ZEP (Zephaniah) | 3 | 53 |
| HAG (Haggai) | 2 | 38 |
| ZEC (Zechariah) | 14 | 211 |
| MAL (Malachi) | 3 | 55 |
| **Total** | | **23213** |

## Divergent Chapters by Book

### 1CH

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 5 | 41 | 26 | 26 |
| 6 | 66 | 81 | 81 |
| 12 | 41 | 40 | 40 |

### 1KI

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 4 | 20 | 34 | 34 |
| 5 | 32 | 18 | 18 |
| 22 | 54 | 53 | 53 |

### 1SA

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 21 | 16 | 15 | 15 |
| 23 | 28 | 29 | 29 |
| 24 | 23 | 22 | 22 |

### 2CH

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 1 | 18 | 17 | 17 |
| 2 | 17 | 18 | 18 |
| 13 | 23 | 22 | 22 |
| 14 | 14 | 15 | 15 |

### 2KI

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 11 | 20 | 21 | 21 |
| 12 | 22 | 21 | 21 |

### 2SA

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 18 | 32 | 33 | 33 |
| 19 | 44 | 43 | 43 |

### DAN

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 3 | 33 | 30 | 30 |
| 4 | 34 | 37 | 37 |
| 5 | 30 | 31 | 31 |
| 6 | 29 | 28 | 28 |

### DEU

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 12 | 31 | 32 | 32 |
| 13 | 19 | 18 | 18 |
| 22 | 29 | 30 | 30 |
| 23 | 26 | 25 | 25 |
| 28 | 69 | 68 | 68 |
| 29 | 28 | 29 | 29 |

### ECC

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 4 | 17 | 16 | 16 |
| 5 | 19 | 20 | 20 |

### EXO

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 7 | 29 | 25 | 25 |
| 8 | 28 | 32 | 32 |
| 21 | 37 | 36 | 36 |
| 22 | 30 | 31 | 31 |

### EZK

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 20 | 44 | 49 | 49 |
| 21 | 37 | 32 | 32 |

### GEN

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 31 | 54 | 55 | 55 |
| 32 | 33 | 32 | 32 |

### HOS

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 1 | 9 | 11 | 11 |
| 2 | 25 | 23 | 23 |
| 11 | 11 | 12 | 12 |
| 12 | 15 | 14 | 14 |
| 13 | 15 | 16 | 16 |
| 14 | 10 | 9 | 9 |

### ISA

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 8 | 23 | 22 | 22 |
| 9 | 20 | 21 | 21 |
| 64 | 11 | 12 | 12 |

### JER

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 8 | 23 | 22 | 22 |
| 9 | 25 | 26 | 26 |

### JOB

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 40 | 32 | 24 | 24 |
| 41 | 26 | 34 | 34 |

### JOL

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 2 | 27 | 32 | 32 |
| 3 | 5 | 21 | 21 |
| 4 | 21 | 0 | 0 |

### JON

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 1 | 16 | 17 | 17 |
| 2 | 11 | 10 | 10 |

### LEV

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 5 | 26 | 19 | 19 |
| 6 | 23 | 30 | 30 |

### MAL

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 3 | 24 | 18 | 18 |
| 4 | 0 | 6 | 6 |

### MIC

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 4 | 14 | 13 | 13 |
| 5 | 14 | 15 | 15 |

### NAM

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 1 | 14 | 15 | 15 |
| 2 | 14 | 13 | 13 |

### NEH

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 3 | 38 | 32 | 32 |
| 4 | 17 | 23 | 23 |
| 7 | 72 | 73 | 73 |
| 9 | 37 | 38 | 38 |
| 10 | 40 | 39 | 39 |

### NUM

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 16 | 35 | 50 | 50 |
| 17 | 28 | 13 | 13 |
| 25 | 19 | 18 | 18 |
| 29 | 39 | 40 | 40 |
| 30 | 17 | 16 | 16 |

### PSA

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 3 | 9 | 8 | 8 |
| 4 | 9 | 8 | 8 |
| 5 | 13 | 12 | 12 |
| 6 | 11 | 10 | 10 |
| 7 | 18 | 17 | 17 |
| 8 | 10 | 9 | 9 |
| 9 | 21 | 20 | 20 |
| 12 | 9 | 8 | 8 |
| 18 | 51 | 50 | 50 |
| 19 | 15 | 14 | 14 |
| 20 | 10 | 9 | 9 |
| 21 | 14 | 13 | 13 |
| 22 | 32 | 31 | 31 |
| 30 | 13 | 12 | 12 |
| 31 | 25 | 24 | 24 |
| 34 | 23 | 22 | 22 |
| 36 | 13 | 12 | 12 |
| 38 | 23 | 22 | 22 |
| 39 | 14 | 13 | 13 |
| 40 | 18 | 17 | 17 |
| 41 | 14 | 13 | 13 |
| 42 | 12 | 11 | 11 |
| 44 | 27 | 26 | 26 |
| 45 | 18 | 17 | 17 |
| 46 | 12 | 11 | 11 |
| 47 | 10 | 9 | 9 |
| 48 | 15 | 14 | 14 |
| 49 | 21 | 20 | 20 |
| 51 | 21 | 19 | 19 |
| 52 | 11 | 9 | 9 |
| 53 | 7 | 6 | 6 |
| 54 | 9 | 7 | 7 |
| 55 | 24 | 23 | 23 |
| 56 | 14 | 13 | 13 |
| 57 | 12 | 11 | 11 |
| 58 | 12 | 11 | 11 |
| 59 | 18 | 17 | 17 |
| 60 | 14 | 12 | 12 |
| 61 | 9 | 8 | 8 |
| 62 | 13 | 12 | 12 |
| 63 | 12 | 11 | 11 |
| 64 | 11 | 10 | 10 |
| 65 | 14 | 13 | 13 |
| 67 | 8 | 7 | 7 |
| 68 | 36 | 35 | 35 |
| 69 | 37 | 36 | 36 |
| 70 | 6 | 5 | 5 |
| 75 | 11 | 10 | 10 |
| 76 | 13 | 12 | 12 |
| 77 | 21 | 20 | 20 |
| 80 | 20 | 19 | 19 |
| 81 | 17 | 16 | 16 |
| 83 | 19 | 18 | 18 |
| 84 | 13 | 12 | 12 |
| 85 | 14 | 13 | 13 |
| 88 | 19 | 18 | 18 |
| 89 | 53 | 52 | 52 |
| 92 | 16 | 15 | 15 |
| 102 | 29 | 28 | 28 |
| 108 | 14 | 13 | 13 |
| 140 | 14 | 13 | 13 |
| 142 | 8 | 7 | 7 |

### SNG

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 6 | 12 | 13 | 13 |
| 7 | 14 | 13 | 13 |

### ZEC

| Chapter | WLC | WEB | KJV |
|--------:|----:|----:|----:|
| 1 | 17 | 21 | 21 |
| 2 | 17 | 13 | 13 |

## Notable Correspondences

| WLC | English (WEB) | Kind |
|-----|---------------|------|
| PSA 3:1 | — | `superscription_as_v1` |
| PSA 3:2 | PSA 3:1 | `superscription_as_v1` |
| — | JOL 2:28 | `english_extra` |
| — | MAL 4:1 | `english_extra` |

## Textbook Cross-Check

Confirmed (9): psalm_superscription, joel_chapter_split, malachi_chapter_split, job_40_41_split, daniel_chapter_numbering, exodus_versification, leviticus_versification, numbers_versification, genesis_31_32

**Not found in this corpus** (textbook expected but data shows no divergence):

- `1samuel_17_18`: 1 Samuel 17–18: verse renumbering (David/Goliath) — same counts in this corpus

## WLC Golden Verses (pointed text)

Exact `text` column strings confirming niqqud and cantillation are preserved:

- **Genesis 1:1** — Creation opening with full niqqud
  `בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃`
- **Ecclesiastes 1:2** — Vanity verse with cantillation
  `הֲבֵ֤ל הֲבָלִים֙ אָמַ֣ר קֹהֶ֔לֶת הֲבֵ֥ל הֲבָלִ֖ים הַכֹּ֥ל הָֽבֶל׃`
- **Psalm 23:2** — Post-superscription content verse
  `בִּנְא֣וֹת דֶּ֭שֶׁא יַרְבִּיצֵ֑נִי עַל־מֵ֖י מְנֻח֣וֹת יְנַהֲלֵֽנִי׃`
- **Isaiah 9:6** — Messianic verse pointed text
  `לםרבה הַמִּשְׂרָ֜ה וּלְשָׁל֣וֹם אֵֽין־קֵ֗ץ עַל־כִּסֵּ֤א דָוִד֙ וְעַל־מַמְלַכְתּ֔וֹ לְהָכִ֤ין אֹתָהּ֙ וּֽלְסַעֲדָ֔הּ בְּמִשְׁפָּ֖ט וּבִצְדָקָ֑ה מֵעַתָּה֙ וְעַד־עוֹלָ֔ם קִנְאַ֛ת יְהוָ֥ה צְבָא֖וֹת תַּעֲשֶׂה־זֹּֽאת׃ ס`
- **Joel 3:1 (WLC) / Joel 2:28 (English)** — Chapter-boundary divergence anchor
  `וְהָיָ֣ה אַֽחֲרֵי־כֵ֗ן אֶשְׁפּ֤וֹךְ אֶת־רוּחִי֙ עַל־כָּל־בָּשָׂ֔ר וְנִבְּא֖וּ בְּנֵיכֶ֣ם וּבְנֽוֹתֵיכֶ֑ם זִקְנֵיכֶם֙ חֲלֹמ֣וֹת יַחֲלֹמ֔וּן בַּח֣וּרֵיכֶ֔ם חֶזְיֹנ֖וֹת יִרְאֽוּ׃`
