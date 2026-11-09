# Kopiator

## Wersja przeglądarkowa (GitHub Pages)

Strona w `docs/` zamienia archiwum ZIP w raport Markdown lub drzewo katalogów.
Przetwarzanie odbywa się lokalnie w przeglądarce. Archiwum można wybrać z dysku
lub przeciągnąć w dowolne miejsce na stronie. Podczas przeciągania pojawia się
duża strefa upuszczania, zamykana po upuszczeniu pliku, opuszczeniu okna lub
naciśnięciu Escape. Animacje uwzględniają systemowe ustawienie ograniczonego ruchu.

Nad podglądem działa mała fabryka kontekstu: robocik Kopi otwiera paczkę ZIP,
czyta pliki i podaje Markdown z drukarki. Przypomina mały komputer w sześciennej,
biało-srebrnej obudowie: ma ekran z twarzą, przycisk zasilania i proste rączki.
Oczy śledzą ZIP, a druga ręka zapisuje Markdown za bokiem obudowy.
Ilustracja korzysta z SVG i CSS,
nie pobiera dodatkowych bibliotek i nie opóźnia udostępnienia wyniku.
Ruch można zatrzymać przyciskiem przy fabryce; jest też zatrzymywany poza
widocznym obszarem strony i wyłączany przy systemowym ograniczeniu ruchu.

Sekcja **Domyślnie ignorowane** zawiera sześć niezależnych przełączników,
wszystkie włączone przy otwarciu strony:

- `node_modules` — zainstalowane zależności,
- `__MACOSX` — metadane archiwum,
- `.DS_Store` — ustawienia folderów macOS,
- `._*` — pliki pomocnicze macOS,
- `.env` i warianty — także `.env.local`, `.env.production` oraz `*.env`,
- pliki binarne — rozpoznawane po rozszerzeniu i zawartości.

Wyłączenie przełącznika pozwala uwzględnić daną grupę. Binaria są zapisywane
w raporcie jako nazwy i rozmiary, bez ich zawartości. Przełączniki działają
w obu trybach, również w strukturze bez własnych filtrów plików. W tym wariancie
nadal obowiązują własne wykluczenia folderów. Zmiana ustawień czyści poprzedni wynik.

Własne wykluczenia można wpisywać po przecinku lub po jednym w wierszu.
Wynik można skopiować do schowka albo pobrać jako plik `.md`.

Podgląd lokalny (otwórz `http://localhost:8000/docs/`):

```bash
python3 -m http.server 8000
```

Testy filtrowania wersji przeglądarkowej (Node.js 22 lub nowszy):

```bash
node --test test/archive.test.mjs
```

## Uruchamianie konsolowe

Aplikacje konsolowa mozna uruchomic skryptem:

```bash
./scripts/run-kopiator.sh
```

Skrypt kompiluje aktualna wersje `java-console/src/ContextBuilderApp.java`
do katalogu `out/app`, a nastepnie uruchamia program.

## Skróty macOS

Kopiatora można uruchamiać z aplikacji Skróty na macOS przez akcję
`Run Shell Script`.

Jeśli macOS blokuje skrypty w aplikacji Skróty, włącz `Allow Running Scripts`
w ustawieniach zaawansowanych aplikacji Skróty.

Najprostszy skrót:

1. Skopiuj ścieżkę folderu do schowka.
2. Uruchom skrót.

Konfiguracja skrótu:

1. Dodaj akcję `Uruchom skrypt powłoki`.
2. Wklej polecenie:

```bash
/Users/michal/Documents/Programy/Kopiator/scripts/run-kopiator-shortcuts.sh
```

Przykład ścieżki w schowku:

```text
/Users/michal/Desktop/Moj projekt
```

Kopiator automatycznie wygeneruje raport i zapisze go w `~/Downloads`.

Opcjonalnie tryb i filtry można ustawić zmiennymi środowiskowymi w akcji
`Run Shell Script`, np.:

```bash
KOPIATOR_MODE=structure \
KOPIATOR_STRUCTURE_FILES=all \
KOPIATOR_EXCLUDE_FOLDERS="dist,build,coverage" \
/Users/michal/Documents/Programy/Kopiator/scripts/run-kopiator-shortcuts.sh
```

Obsługiwane zmienne:

- `KOPIATOR_MODE`: `report` albo `structure`
- `KOPIATOR_STRUCTURE_FILES`: `report` albo `all`
- `KOPIATOR_OUTPUT_DIR`: katalog wynikowy
- `KOPIATOR_EXCLUDE_FILES`: wykluczenia plików oddzielone przecinkami
- `KOPIATOR_EXCLUDE_FOLDERS`: wykluczenia folderów oddzielone przecinkami
- `KOPIATOR_EXCLUDE_EXTENSIONS`: wykluczenia rozszerzeń oddzielone przecinkami

Tryb `structure` zapisuje drzewo katalogów z nazwami plików i ich rozmiarami.
Domyślnie pokazuje pliki z takimi samymi ograniczeniami jak raport. Wartość
`KOPIATOR_STRUCTURE_FILES=all` pokazuje wszystkie pliki z uwzględnionych folderów.

## Testy jednostkowe

Testy dla aplikacji konsolowej znajduja sie w `java-console/test` i mozna je uruchomic skryptem:

```bash
./scripts/run-java-tests.sh
```

Workflow GitHub Actions uruchamia te testy automatycznie przy kazdym `push` i `pull request`.
