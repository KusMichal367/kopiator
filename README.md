# Kopiator

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
