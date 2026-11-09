import { DEFAULT_IGNORES, formatByteSize, parseList, processZipArchive } from "./archive.mjs";

const generatorForm = document.querySelector("#generator-form");
const zipFileInput = document.querySelector("#zip-file");
const dropZone = document.querySelector("#drop-zone");
const dropOverlay = document.querySelector("#drop-overlay");
const dragStatus = document.querySelector("#drag-status");
const excludedFilesInput = document.querySelector("#excluded-files");
const excludedFoldersInput = document.querySelector("#excluded-folders");
const excludedExtensionsInput = document.querySelector("#excluded-extensions");
const ignoreInputs = [...document.querySelectorAll("[data-ignore]")];
const structureOptions = document.querySelector("#structure-options");
const statusMessage = document.querySelector("#status-message");
const zipError = document.querySelector("#zip-error");
const resultOutput = document.querySelector("#result-output");
const outputEmpty = document.querySelector("#output-empty");
const outputState = document.querySelector("#output-state");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");
const generateButton = document.querySelector("#generate-button");
const themeToggleButton = document.querySelector("#theme-toggle");
const themeToggleIcon = document.querySelector("#theme-toggle-icon");
const numberFormat = new Intl.NumberFormat("pl-PL");
const THEME_STORAGE_KEY = "kopiator-theme";

let lastGeneratedText = "";
let lastDownloadFileName = "";
let selectedZipFile = null;
let isProcessing = false;

initializeTheme();
// Default exclusions start enabled on every visit, including restored forms.
ignoreInputs.forEach((input) => { input.checked = DEFAULT_IGNORES[input.dataset.ignore]; });
updateModeControls();
updateFilterSummary();

zipFileInput.addEventListener("change", () => selectZipFile(zipFileInput.files?.item(0)));
initializeFileDrop();

generatorForm.addEventListener("input", (event) => {
    if (event.target === zipFileInput) return;
    const hadResult = Boolean(lastGeneratedText);
    clearResult();
    updateModeControls();
    updateFilterSummary();
    if (hadResult) updateStatus("Ustawienia zmienione. Wygeneruj Markdown ponownie.", "neutral");
});

generatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isProcessing) return;
    if (!selectedZipFile) {
        showFileError("Wybierz archiwum ZIP lub przeciągnij je na stronę.");
        return;
    }
    if (!window.JSZip) {
        updateStatus("Nie udało się załadować obsługi ZIP. Sprawdź połączenie i odśwież stronę.", "error");
        return;
    }
    const formData = new FormData(generatorForm);
    const mode = formData.get("mode");
    const structureFileScope = formData.get("structure-files") ?? "report";
    const filters = {
        excludedFiles: parseList(excludedFilesInput.value, false),
        excludedFolders: parseList(excludedFoldersInput.value, false),
        excludedExtensions: parseList(excludedExtensionsInput.value, true),
        defaultIgnores: Object.fromEntries(ignoreInputs.map((input) => [input.dataset.ignore, input.checked]))
    };

    clearResult();
    clearFileError();
    setBusy(true);
    updateStatus("Odczytuję archiwum ZIP…", "neutral");
    outputState.textContent = "Generowanie…";
    try {
        const zip = await window.JSZip.loadAsync(selectedZipFile);
        const processed = await processZipArchive(zip, selectedZipFile.name, mode, filters, structureFileScope,
            (current, total) => updateStatus(`Przetwarzanie wpisów: ${numberFormat.format(current)} / ${numberFormat.format(total)}.`, "neutral"));
        lastGeneratedText = processed.markdown;
        lastDownloadFileName = processed.fileName;
        resultOutput.value = processed.markdown;
        resultOutput.hidden = false;
        outputEmpty.hidden = true;
        document.querySelector("#output-file-name").textContent = processed.fileName;
        document.querySelector("#result-stats").textContent = `Pliki: ${numberFormat.format(processed.stats.files)} · Pominięte: ${numberFormat.format(processed.stats.skippedFiles)}`;
        document.querySelector("#character-count").textContent = `Znaki: ${numberFormat.format([...processed.markdown].length)}`;
        outputState.textContent = "Gotowy";
        updateStatus(processed.stats.files === 0
            ? "Brak plików po filtrowaniu. Zmień filtry lub wybierz inne archiwum."
            : "Markdown gotowy. Skopiuj tekst lub pobierz plik .md.", "success");
        resultOutput.focus();
    } catch (error) {
        console.error(error);
        clearResult();
        showFileError("Nie udało się odczytać ZIP-a. Wybierz poprawne archiwum bez hasła i spróbuj ponownie.");
    } finally {
        setBusy(false);
        if (!zipError.hidden) zipFileInput.focus();
    }
});

copyButton.addEventListener("click", async () => {
    if (!lastGeneratedText) return;
    try {
        await navigator.clipboard.writeText(lastGeneratedText);
        document.querySelector("#copy-label").textContent = "Skopiowano";
        outputState.textContent = "W schowku";
        updateStatus("Markdown skopiowany do schowka.", "success");
    } catch {
        resultOutput.focus();
        resultOutput.select();
        updateStatus("Kopiowanie niedostępne. Tekst jest zaznaczony — użyj ⌘C lub Ctrl+C.", "error");
    }
});

downloadButton.addEventListener("click", () => {
    if (!lastGeneratedText || !lastDownloadFileName) return;
    const blob = new Blob([lastGeneratedText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = lastDownloadFileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    updateStatus("Rozpoczęto pobieranie pliku Markdown.", "success");
});

function selectZipFile(file) {
    selectedZipFile = null;
    dropZone.classList.remove("has-file");
    clearResult();
    clearFileError();
    document.querySelector("#zip-file-name").textContent = "Wybierz archiwum ZIP";
    document.querySelector("#zip-file-detail").textContent = "lub przeciągnij go na stronę";
    if (!file) {
        updateStatus("Wybierz ZIP, aby rozpocząć.", "neutral");
        return;
    }
    if (!/\.zip$/i.test(file.name)) {
        zipFileInput.value = "";
        showFileError("Ten plik nie ma rozszerzenia .zip. Wybierz archiwum ZIP.");
        return;
    }
    selectedZipFile = file;
    dropZone.classList.add("has-file");
    document.querySelector("#zip-file-name").textContent = file.name;
    document.querySelector("#zip-file-detail").textContent = `${formatByteSize(file.size)} · Wybierz, aby zmienić`;
    updateStatus("Archiwum wybrane. Wygeneruj Markdown.", "neutral");
}

function initializeFileDrop() {
    let dragDepth = 0;
    let dismissed = false;

    const isFileDrag = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const showOverlay = () => {
        if (isProcessing || dismissed || dropOverlay.classList.contains("is-visible")) return;
        dropOverlay.classList.add("is-visible");
        dropZone.classList.add("is-dragging");
        dragStatus.textContent = "Upuść jedno archiwum ZIP w dowolnym miejscu na stronie.";
    };
    const hideOverlay = () => {
        dropOverlay.classList.remove("is-visible");
        dropZone.classList.remove("is-dragging");
        dragStatus.textContent = "";
    };
    const resetDrag = () => {
        dragDepth = 0;
        dismissed = false;
        hideOverlay();
    };

    window.addEventListener("dragenter", (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        dragDepth += 1;
        showOverlay();
    });
    window.addEventListener("dragover", (event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = isProcessing || dismissed ? "none" : "copy";
        showOverlay();
    });
    window.addEventListener("dragleave", (event) => {
        if (!isFileDrag(event) && dragDepth === 0) return;
        dragDepth = Math.max(0, dragDepth - 1);
        const leftWindow = !event.relatedTarget && (
            event.clientX <= 0 || event.clientY <= 0 ||
            event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
        );
        if (leftWindow) {
            resetDrag();
        } else if (dragDepth === 0) {
            // A child may receive dragenter immediately after its parent's dragleave.
            requestAnimationFrame(() => { if (dragDepth === 0) resetDrag(); });
        }
    });
    window.addEventListener("drop", (event) => {
        if (!isFileDrag(event)) return;
        // Prevent the browser from opening a dropped file, including over the editor.
        event.preventDefault();
        const ignoreDrop = isProcessing || dismissed;
        resetDrag();
        if (ignoreDrop) return;
        const files = event.dataTransfer.files;
        zipFileInput.value = "";
        if (files.length !== 1) {
            selectZipFile(null);
            showFileError("Wybierz jedno archiwum ZIP naraz.");
            return;
        }
        selectZipFile(files.item(0));
    });
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !dropOverlay.classList.contains("is-visible")) return;
        dismissed = true;
        hideOverlay();
    });
    window.addEventListener("dragend", resetDrag);
    window.addEventListener("blur", resetDrag);
    // Pointer movement resumes when a native drag ends, even if its source is outside the page.
    window.addEventListener("pointermove", () => {
        if (dismissed || dropOverlay.classList.contains("is-visible")) resetDrag();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) resetDrag(); });
}

function showFileError(message) {
    dropZone.classList.remove("has-file");
    zipError.hidden = false;
    zipError.textContent = message;
    zipFileInput.setAttribute("aria-invalid", "true");
    updateStatus(message, "error");
    zipFileInput.focus();
}

function clearFileError() {
    zipError.hidden = true;
    zipError.textContent = "";
    zipFileInput.removeAttribute("aria-invalid");
}

function clearResult() {
    lastGeneratedText = "";
    lastDownloadFileName = "";
    resultOutput.value = "";
    resultOutput.hidden = true;
    outputEmpty.hidden = false;
    copyButton.disabled = true;
    downloadButton.disabled = true;
    document.querySelector("#copy-label").textContent = "Kopiuj";
    document.querySelector("#output-file-name").textContent = "wynik.md";
    document.querySelector("#result-stats").textContent = "Pliki: 0 · Pominięte: 0";
    document.querySelector("#character-count").textContent = "Znaki: 0";
    outputState.textContent = "Brak wyniku";
}

function updateModeControls() {
    const isStructure = generatorForm.querySelector('[name="mode"]:checked').value === "structure";
    const allFiles = isStructure && generatorForm.querySelector('[name="structure-files"]:checked').value === "all";
    structureOptions.hidden = !isStructure;
    structureOptions.disabled = isProcessing || !isStructure;
    excludedFilesInput.disabled = isProcessing || allFiles;
    excludedExtensionsInput.disabled = isProcessing || allFiles;
    document.querySelector("#custom-scope-note").hidden = !allFiles;
    document.querySelector("#binary-note").hidden = isStructure || document.querySelector("#ignore-binary").checked;
    document.querySelector("#mode-description").textContent = isStructure
        ? "Drzewo katalogów z nazwami i rozmiarami plików."
        : "Treść plików tekstowych w jednym dokumencie.";
}

function updateFilterSummary() {
    const enabled = ignoreInputs.filter((input) => input.checked).length;
    document.querySelector("#ignore-count").textContent = `${enabled}/${ignoreInputs.length}`;
    const customCount = [excludedFilesInput, excludedFoldersInput, excludedExtensionsInput]
        .filter((input) => !input.disabled)
        .reduce((total, input) => total + parseList(input.value, input === excludedExtensionsInput).size, 0);
    document.querySelector("#custom-filter-count").textContent = customCount ? `Wpisy: ${numberFormat.format(customCount)}` : "Opcjonalne";
}

function setBusy(busy) {
    isProcessing = busy;
    generateButton.disabled = busy;
    generatorForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = busy; });
    generatorForm.setAttribute("aria-busy", String(busy));
    document.querySelector("#editor").setAttribute("aria-busy", String(busy));
    document.querySelector("#generate-label").textContent = busy ? "Generowanie…" : "Generuj Markdown";
    copyButton.disabled = busy || !lastGeneratedText;
    downloadButton.disabled = busy || !lastGeneratedText;
    updateModeControls();
}

function updateStatus(message, state) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle("is-error", state === "error");
    statusMessage.classList.toggle("is-success", state === "success");
}

function initializeTheme() {
    let storedTheme;
    try { storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY); } catch { /* Storage is optional. */ }
    applyTheme(storedTheme === "light" ? "light" : "dark");
    themeToggleButton.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
        try { window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch { /* Keep the session theme. */ }
    });
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.add("theme-changing");
    root.dataset.theme = theme;
    themeToggleIcon.setAttribute("href", theme === "dark" ? "#icon-sun" : "#icon-moon");
    const label = theme === "dark" ? "Włącz jasny motyw" : "Włącz ciemny motyw";
    themeToggleButton.setAttribute("aria-label", label);
    themeToggleButton.title = label;
    // Flush the new theme with transitions suppressed, then restore feedback.
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove("theme-changing"));
}
