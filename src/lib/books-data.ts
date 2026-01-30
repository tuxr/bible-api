/**
 * Complete Bible book metadata including canonical books and Apocrypha
 * Each book has a unique ID (USFX code), display name, testament, order, chapter count, and aliases
 */

export interface BookData {
  id: string;
  name: string;
  testament: "OT" | "NT" | "AP";
  order: number;
  chapters: number;
  aliases: string[];
}

// Old Testament books (39 books)
const OT_BOOKS: BookData[] = [
  { id: "GEN", name: "Genesis", testament: "OT", order: 1, chapters: 50, aliases: ["Gen", "Ge", "Gn"] },
  { id: "EXO", name: "Exodus", testament: "OT", order: 2, chapters: 40, aliases: ["Exod", "Exo", "Ex"] },
  { id: "LEV", name: "Leviticus", testament: "OT", order: 3, chapters: 27, aliases: ["Lev", "Le", "Lv"] },
  { id: "NUM", name: "Numbers", testament: "OT", order: 4, chapters: 36, aliases: ["Num", "Nu", "Nm", "Nb"] },
  { id: "DEU", name: "Deuteronomy", testament: "OT", order: 5, chapters: 34, aliases: ["Deut", "Deu", "De", "Dt"] },
  { id: "JOS", name: "Joshua", testament: "OT", order: 6, chapters: 24, aliases: ["Josh", "Jos", "Jsh"] },
  { id: "JDG", name: "Judges", testament: "OT", order: 7, chapters: 21, aliases: ["Judg", "Jdg", "Jg", "Jdgs"] },
  { id: "RUT", name: "Ruth", testament: "OT", order: 8, chapters: 4, aliases: ["Rth", "Ru"] },
  { id: "1SA", name: "1 Samuel", testament: "OT", order: 9, chapters: 31, aliases: ["1Sam", "1Sm", "1 Sam", "1 Sm", "I Sam", "I Samuel", "1st Samuel", "First Samuel"] },
  { id: "2SA", name: "2 Samuel", testament: "OT", order: 10, chapters: 24, aliases: ["2Sam", "2Sm", "2 Sam", "2 Sm", "II Sam", "II Samuel", "2nd Samuel", "Second Samuel"] },
  { id: "1KI", name: "1 Kings", testament: "OT", order: 11, chapters: 22, aliases: ["1Kgs", "1Ki", "1 Kgs", "1 Ki", "I Kgs", "I Kings", "1st Kings", "First Kings"] },
  { id: "2KI", name: "2 Kings", testament: "OT", order: 12, chapters: 25, aliases: ["2Kgs", "2Ki", "2 Kgs", "2 Ki", "II Kgs", "II Kings", "2nd Kings", "Second Kings"] },
  { id: "1CH", name: "1 Chronicles", testament: "OT", order: 13, chapters: 29, aliases: ["1Chr", "1Ch", "1 Chr", "1 Ch", "I Chr", "I Chronicles", "1st Chronicles", "First Chronicles"] },
  { id: "2CH", name: "2 Chronicles", testament: "OT", order: 14, chapters: 36, aliases: ["2Chr", "2Ch", "2 Chr", "2 Ch", "II Chr", "II Chronicles", "2nd Chronicles", "Second Chronicles"] },
  { id: "EZR", name: "Ezra", testament: "OT", order: 15, chapters: 10, aliases: ["Ezr", "Ez"] },
  { id: "NEH", name: "Nehemiah", testament: "OT", order: 16, chapters: 13, aliases: ["Neh", "Ne"] },
  { id: "EST", name: "Esther", testament: "OT", order: 17, chapters: 10, aliases: ["Esth", "Est", "Es"] },
  { id: "JOB", name: "Job", testament: "OT", order: 18, chapters: 42, aliases: ["Jb"] },
  { id: "PSA", name: "Psalms", testament: "OT", order: 19, chapters: 150, aliases: ["Psalm", "Psa", "Pss", "Ps", "Psm"] },
  { id: "PRO", name: "Proverbs", testament: "OT", order: 20, chapters: 31, aliases: ["Prov", "Pro", "Prv", "Pr"] },
  { id: "ECC", name: "Ecclesiastes", testament: "OT", order: 21, chapters: 12, aliases: ["Eccl", "Ecc", "Ec", "Qoh", "Qoheleth"] },
  { id: "SNG", name: "Song of Solomon", testament: "OT", order: 22, chapters: 8, aliases: ["Song", "SOS", "Song of Songs", "Canticles", "Cant", "So", "Sg"] },
  { id: "ISA", name: "Isaiah", testament: "OT", order: 23, chapters: 66, aliases: ["Isa", "Is"] },
  { id: "JER", name: "Jeremiah", testament: "OT", order: 24, chapters: 52, aliases: ["Jer", "Je", "Jr"] },
  { id: "LAM", name: "Lamentations", testament: "OT", order: 25, chapters: 5, aliases: ["Lam", "La"] },
  { id: "EZK", name: "Ezekiel", testament: "OT", order: 26, chapters: 48, aliases: ["Ezek", "Eze", "Ezk"] },
  { id: "DAN", name: "Daniel", testament: "OT", order: 27, chapters: 12, aliases: ["Dan", "Da", "Dn"] },
  { id: "HOS", name: "Hosea", testament: "OT", order: 28, chapters: 14, aliases: ["Hos", "Ho"] },
  { id: "JOL", name: "Joel", testament: "OT", order: 29, chapters: 3, aliases: ["Joe", "Jl"] },
  { id: "AMO", name: "Amos", testament: "OT", order: 30, chapters: 9, aliases: ["Am"] },
  { id: "OBA", name: "Obadiah", testament: "OT", order: 31, chapters: 1, aliases: ["Obad", "Oba", "Ob"] },
  { id: "JON", name: "Jonah", testament: "OT", order: 32, chapters: 4, aliases: ["Jon", "Jnh"] },
  { id: "MIC", name: "Micah", testament: "OT", order: 33, chapters: 7, aliases: ["Mic", "Mi"] },
  { id: "NAM", name: "Nahum", testament: "OT", order: 34, chapters: 3, aliases: ["Nah", "Na"] },
  { id: "HAB", name: "Habakkuk", testament: "OT", order: 35, chapters: 3, aliases: ["Hab", "Hb"] },
  { id: "ZEP", name: "Zephaniah", testament: "OT", order: 36, chapters: 3, aliases: ["Zeph", "Zep", "Zp"] },
  { id: "HAG", name: "Haggai", testament: "OT", order: 37, chapters: 2, aliases: ["Hag", "Hg"] },
  { id: "ZEC", name: "Zechariah", testament: "OT", order: 38, chapters: 14, aliases: ["Zech", "Zec", "Zc"] },
  { id: "MAL", name: "Malachi", testament: "OT", order: 39, chapters: 4, aliases: ["Mal", "Ml"] },
];

// New Testament books (27 books)
const NT_BOOKS: BookData[] = [
  { id: "MAT", name: "Matthew", testament: "NT", order: 40, chapters: 28, aliases: ["Matt", "Mt"] },
  { id: "MRK", name: "Mark", testament: "NT", order: 41, chapters: 16, aliases: ["Mrk", "Mar", "Mk", "Mr"] },
  { id: "LUK", name: "Luke", testament: "NT", order: 42, chapters: 24, aliases: ["Luk", "Lk"] },
  { id: "JHN", name: "John", testament: "NT", order: 43, chapters: 21, aliases: ["Jhn", "Jn"] },
  { id: "ACT", name: "Acts", testament: "NT", order: 44, chapters: 28, aliases: ["Act", "Ac"] },
  { id: "ROM", name: "Romans", testament: "NT", order: 45, chapters: 16, aliases: ["Rom", "Ro", "Rm"] },
  { id: "1CO", name: "1 Corinthians", testament: "NT", order: 46, chapters: 16, aliases: ["1Cor", "1Co", "1 Cor", "1 Co", "I Cor", "I Corinthians", "1st Corinthians", "First Corinthians"] },
  { id: "2CO", name: "2 Corinthians", testament: "NT", order: 47, chapters: 13, aliases: ["2Cor", "2Co", "2 Cor", "2 Co", "II Cor", "II Corinthians", "2nd Corinthians", "Second Corinthians"] },
  { id: "GAL", name: "Galatians", testament: "NT", order: 48, chapters: 6, aliases: ["Gal", "Ga"] },
  { id: "EPH", name: "Ephesians", testament: "NT", order: 49, chapters: 6, aliases: ["Eph", "Ephes"] },
  { id: "PHP", name: "Philippians", testament: "NT", order: 50, chapters: 4, aliases: ["Phil", "Php", "Pp"] },
  { id: "COL", name: "Colossians", testament: "NT", order: 51, chapters: 4, aliases: ["Col", "Co"] },
  { id: "1TH", name: "1 Thessalonians", testament: "NT", order: 52, chapters: 5, aliases: ["1Thess", "1Th", "1 Thess", "1 Th", "I Thess", "I Thessalonians", "1st Thessalonians", "First Thessalonians"] },
  { id: "2TH", name: "2 Thessalonians", testament: "NT", order: 53, chapters: 3, aliases: ["2Thess", "2Th", "2 Thess", "2 Th", "II Thess", "II Thessalonians", "2nd Thessalonians", "Second Thessalonians"] },
  { id: "1TI", name: "1 Timothy", testament: "NT", order: 54, chapters: 6, aliases: ["1Tim", "1Ti", "1 Tim", "1 Ti", "I Tim", "I Timothy", "1st Timothy", "First Timothy"] },
  { id: "2TI", name: "2 Timothy", testament: "NT", order: 55, chapters: 4, aliases: ["2Tim", "2Ti", "2 Tim", "2 Ti", "II Tim", "II Timothy", "2nd Timothy", "Second Timothy"] },
  { id: "TIT", name: "Titus", testament: "NT", order: 56, chapters: 3, aliases: ["Tit", "Ti"] },
  { id: "PHM", name: "Philemon", testament: "NT", order: 57, chapters: 1, aliases: ["Philem", "Phm", "Pm"] },
  { id: "HEB", name: "Hebrews", testament: "NT", order: 58, chapters: 13, aliases: ["Heb"] },
  { id: "JAS", name: "James", testament: "NT", order: 59, chapters: 5, aliases: ["Jas", "Jm"] },
  { id: "1PE", name: "1 Peter", testament: "NT", order: 60, chapters: 5, aliases: ["1Pet", "1Pe", "1Pt", "1 Pet", "1 Pe", "I Pet", "I Peter", "1st Peter", "First Peter"] },
  { id: "2PE", name: "2 Peter", testament: "NT", order: 61, chapters: 3, aliases: ["2Pet", "2Pe", "2Pt", "2 Pet", "2 Pe", "II Pet", "II Peter", "2nd Peter", "Second Peter"] },
  { id: "1JN", name: "1 John", testament: "NT", order: 62, chapters: 5, aliases: ["1John", "1Jn", "1 Jn", "I Jn", "I John", "1st John", "First John"] },
  { id: "2JN", name: "2 John", testament: "NT", order: 63, chapters: 1, aliases: ["2John", "2Jn", "2 Jn", "II Jn", "II John", "2nd John", "Second John"] },
  { id: "3JN", name: "3 John", testament: "NT", order: 64, chapters: 1, aliases: ["3John", "3Jn", "3 Jn", "III Jn", "III John", "3rd John", "Third John"] },
  { id: "JUD", name: "Jude", testament: "NT", order: 65, chapters: 1, aliases: ["Jud", "Jd"] },
  { id: "REV", name: "Revelation", testament: "NT", order: 66, chapters: 22, aliases: ["Rev", "Re", "Apocalypse"] },
];

// Apocrypha / Deuterocanonical books (varies by tradition, ~15-20 books)
const AP_BOOKS: BookData[] = [
  { id: "TOB", name: "Tobit", testament: "AP", order: 67, chapters: 14, aliases: ["Tob", "Tb"] },
  { id: "JDT", name: "Judith", testament: "AP", order: 68, chapters: 16, aliases: ["Jdt", "Jth"] },
  { id: "ESG", name: "Esther (Greek)", testament: "AP", order: 69, chapters: 16, aliases: ["AddEsth", "Add Esth", "Additions to Esther", "Rest of Esther"] },
  { id: "WIS", name: "Wisdom of Solomon", testament: "AP", order: 70, chapters: 19, aliases: ["Wis", "Wisdom", "Ws"] },
  { id: "SIR", name: "Sirach", testament: "AP", order: 71, chapters: 51, aliases: ["Sir", "Ecclesiasticus", "Ecclus"] },
  { id: "BAR", name: "Baruch", testament: "AP", order: 72, chapters: 6, aliases: ["Bar"] },
  { id: "LJE", name: "Letter of Jeremiah", testament: "AP", order: 73, chapters: 1, aliases: ["LtrJer", "Ltr Jer", "Epistle of Jeremiah", "Ep Jer"] },
  { id: "S3Y", name: "Prayer of Azariah", testament: "AP", order: 74, chapters: 1, aliases: ["PrAzar", "Pr Azar", "Song of Three Youths", "Song of Three", "Song of the Three Holy Children"] },
  { id: "SUS", name: "Susanna", testament: "AP", order: 75, chapters: 1, aliases: ["Sus"] },
  { id: "BEL", name: "Bel and the Dragon", testament: "AP", order: 76, chapters: 1, aliases: ["Bel"] },
  { id: "1MA", name: "1 Maccabees", testament: "AP", order: 77, chapters: 16, aliases: ["1Macc", "1Mac", "1 Macc", "1 Mac", "I Macc", "I Maccabees", "1st Maccabees", "First Maccabees"] },
  { id: "2MA", name: "2 Maccabees", testament: "AP", order: 78, chapters: 15, aliases: ["2Macc", "2Mac", "2 Macc", "2 Mac", "II Macc", "II Maccabees", "2nd Maccabees", "Second Maccabees"] },
  { id: "3MA", name: "3 Maccabees", testament: "AP", order: 79, chapters: 7, aliases: ["3Macc", "3Mac", "3 Macc", "3 Mac", "III Macc", "III Maccabees", "3rd Maccabees", "Third Maccabees"] },
  { id: "4MA", name: "4 Maccabees", testament: "AP", order: 80, chapters: 18, aliases: ["4Macc", "4Mac", "4 Macc", "4 Mac", "IV Macc", "IV Maccabees", "4th Maccabees", "Fourth Maccabees"] },
  { id: "1ES", name: "1 Esdras", testament: "AP", order: 81, chapters: 9, aliases: ["1Esd", "1 Esd", "I Esd", "I Esdras", "1st Esdras", "First Esdras", "3 Ezra", "Greek Ezra"] },
  { id: "2ES", name: "2 Esdras", testament: "AP", order: 82, chapters: 16, aliases: ["2Esd", "2 Esd", "II Esd", "II Esdras", "2nd Esdras", "Second Esdras", "4 Ezra", "Latin Esdras"] },
  { id: "MAN", name: "Prayer of Manasseh", testament: "AP", order: 83, chapters: 1, aliases: ["PrMan", "Pr Man", "Man"] },
  { id: "PS2", name: "Psalm 151", testament: "AP", order: 84, chapters: 1, aliases: ["Ps151", "Ps 151", "AddPs"] },
  { id: "ODA", name: "Odes", testament: "AP", order: 85, chapters: 14, aliases: ["Ode"] },
  { id: "PSS", name: "Psalms of Solomon", testament: "AP", order: 86, chapters: 18, aliases: ["PsSol", "Ps Sol", "PssSol"] },
];

// All books combined
export const ALL_BOOKS: BookData[] = [...OT_BOOKS, ...NT_BOOKS, ...AP_BOOKS];

// Lookup maps for efficient access
export const BOOKS_BY_ID = new Map<string, BookData>(ALL_BOOKS.map((b) => [b.id, b]));

// Build alias lookup map (case-insensitive)
const aliasMap = new Map<string, BookData>();
for (const book of ALL_BOOKS) {
  // Add main name
  aliasMap.set(book.name.toLowerCase(), book);
  // Add ID
  aliasMap.set(book.id.toLowerCase(), book);
  // Add all aliases
  for (const alias of book.aliases) {
    aliasMap.set(alias.toLowerCase(), book);
  }
}
export const BOOKS_BY_ALIAS = aliasMap;

/**
 * Find a book by name, ID, or alias (case-insensitive)
 */
export function findBook(nameOrAlias: string): BookData | undefined {
  return BOOKS_BY_ALIAS.get(nameOrAlias.toLowerCase());
}

/**
 * Get books by testament
 */
export function getBooksByTestament(testament: "OT" | "NT" | "AP"): BookData[] {
  return ALL_BOOKS.filter((b) => b.testament === testament);
}

/**
 * Navigation target with testament info for client-side filtering
 */
export interface ChapterNavigationTarget {
  book: string;
  chapter: number;
  testament: "OT" | "NT" | "AP";
}

/**
 * Get navigation (previous/next chapter) for a given book and chapter.
 * Includes testament so clients can decide whether to cross testament boundaries.
 */
export function getChapterNavigation(
  book: BookData,
  chapter: number
): { previous: ChapterNavigationTarget | null; next: ChapterNavigationTarget | null } {
  let previous: ChapterNavigationTarget | null = null;
  let next: ChapterNavigationTarget | null = null;

  // Previous chapter
  if (chapter > 1) {
    // Previous chapter in same book
    previous = { book: book.id, chapter: chapter - 1, testament: book.testament };
  } else {
    // First chapter - go to previous book's last chapter
    const prevBook = ALL_BOOKS.find((b) => b.order === book.order - 1);
    if (prevBook) {
      previous = { book: prevBook.id, chapter: prevBook.chapters, testament: prevBook.testament };
    }
  }

  // Next chapter
  if (chapter < book.chapters) {
    // Next chapter in same book
    next = { book: book.id, chapter: chapter + 1, testament: book.testament };
  } else {
    // Last chapter - go to next book's first chapter
    const nextBook = ALL_BOOKS.find((b) => b.order === book.order + 1);
    if (nextBook) {
      next = { book: nextBook.id, chapter: 1, testament: nextBook.testament };
    }
  }

  return { previous, next };
}
