export const DEFAULT_IGNORES = Object.freeze({
    nodeModules: true,
    macosx: true,
    dsStore: true,
    appleDouble: true,
    env: true,
    binary: true
});

const IGNORE_LABELS = {
    nodeModules: "`node_modules`",
    macosx: "`__MACOSX`",
    dsStore: "`.DS_Store`",
    appleDouble: "`._*`",
    env: "`.env`, `.env.*`, `*.env`",
    binary: "pliki binarne"
};

function getDefaultIgnores(filters) {
    return { ...DEFAULT_IGNORES, ...filters.defaultIgnores };
}

const BINARY_EXTENSIONS = new Set([
    ".7z", ".a", ".aac", ".ai", ".apk", ".arj", ".avi", ".avif", ".bin", ".bmp",
    ".class", ".cur", ".db", ".dll", ".dmg", ".doc", ".docm", ".docx", ".ear",
    ".eot", ".eps", ".exe", ".flac", ".flv", ".gif", ".gz", ".heic", ".heif",
    ".ico", ".iso", ".jar", ".jpeg", ".jpg", ".lib", ".m4a", ".m4v", ".mid",
    ".midi", ".mov", ".mp3", ".mp4", ".mpeg", ".mpg", ".o", ".obj", ".ogg",
    ".otf", ".pdf", ".png", ".ppt", ".pptm", ".pptx", ".psd", ".rar", ".so",
    ".tar", ".tif", ".tiff", ".ttf", ".war", ".wav", ".webm", ".webp", ".woff",
    ".woff2", ".xls", ".xlsb", ".xlsm", ".xlsx", ".zip"
]);

const LANGUAGE_BY_EXTENSION = new Map([
    [".bat", "bat"],
    [".c", "c"],
    [".conf", "ini"],
    [".cpp", "cpp"],
    [".cs", "csharp"],
    [".css", "css"],
    [".csv", "csv"],
    [".env", "bash"],
    [".go", "go"],
    [".gradle", "groovy"],
    [".graphql", "graphql"],
    [".groovy", "groovy"],
    [".h", "c"],
    [".hpp", "cpp"],
    [".html", "html"],
    [".ini", "ini"],
    [".java", "java"],
    [".js", "javascript"],
    [".json", "json"],
    [".kt", "kotlin"],
    [".kts", "kotlin"],
    [".md", "markdown"],
    [".php", "php"],
    [".properties", "properties"],
    [".ps1", "powershell"],
    [".py", "python"],
    [".rb", "ruby"],
    [".rs", "rust"],
    [".scss", "scss"],
    [".sh", "bash"],
    [".sql", "sql"],
    [".svg", "xml"],
    [".toml", "toml"],
    [".ts", "typescript"],
    [".tsx", "tsx"],
    [".txt", "text"],
    [".xml", "xml"],
    [".yaml", "yaml"],
    [".yml", "yaml"]
]);

export async function processZipArchive(zip, originalFileName, mode, filters, structureFileScope = "report", onProgress = () => {}) {
    const rootLabel = stripZipExtension(originalFileName);
    const treeRoot = createTreeNode(rootLabel, true);
    const explicitDirectories = new Set();
    const includedFiles = [];
    const useReportFileFilters = shouldUseReportFileFilters(mode, structureFileScope);
    const defaultIgnores = getDefaultIgnores(filters);
    let skippedFiles = 0;
    const zipEntries = Object.values(zip.files)
        .filter((entry) => entry.name)
        .sort((first, second) => compareEntryNames(first.name, second.name));

    for (let index = 0; index < zipEntries.length; index += 1) {
        const entry = zipEntries[index];
        const normalizedPath = normalizeEntryName(entry.name);

        if (!normalizedPath) {
            continue;
        }

        if (entry.dir) {
            if (shouldExcludeDirectoryPath(normalizedPath, filters)) {
                continue;
            }
            explicitDirectories.add(normalizedPath);
        } else {
            if (shouldExcludeFilePath(normalizedPath, filters, useReportFileFilters)) {
                skippedFiles += 1;
                continue;
            }

            const bytes = await entry.async("uint8array");
            const binary = BINARY_EXTENSIONS.has(extractExtension(normalizedPath)) || isLikelyBinary(bytes);
            if (defaultIgnores.binary && binary) {
                skippedFiles += 1;
                continue;
            }

            includedFiles.push({
                path: normalizedPath,
                bytes,
                binary,
                sizeBytes: bytes.length
            });
        }

        if ((index + 1) % 20 === 0) {
            onProgress(index + 1, zipEntries.length);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    for (const directoryPath of explicitDirectories) {
        addPathToTree(treeRoot, directoryPath, true);
    }

    for (const file of includedFiles) {
        addPathToTree(treeRoot, file.path, false, file.sizeBytes);
    }

    sortTree(treeRoot);

    const stats = {
        directories: countTreeDirectories(treeRoot),
        files: includedFiles.length,
        skippedFiles
    };

    const markdown = mode === "structure"
        ? buildStructureMarkdown(rootLabel, filters, treeRoot, stats, structureFileScope)
        : buildReportMarkdown(rootLabel, filters, includedFiles, stats);

    const sourceLabel = sanitizeFileNamePart(rootLabel);

    return {
        markdown,
        fileName: `${mode === "structure" ? "structure" : "report"}-${sourceLabel}-${timestampForFileName()}.md`,
        stats
    };
}

function shouldUseReportFileFilters(mode, structureFileScope) {
    return mode === "report" || structureFileScope === "report";
}

function shouldExcludeDirectoryPath(directoryPath, filters) {
    const normalizedPath = normalizePathPattern(directoryPath);
    const segments = normalizedPath.split("/").filter(Boolean);
    const ignores = getDefaultIgnores(filters);

    let progressivePath = "";
    for (const segment of segments) {
        const normalizedSegment = normalizePathPattern(segment);
        progressivePath = progressivePath ? `${progressivePath}/${normalizedSegment}` : normalizedSegment;

        if ((ignores.nodeModules && normalizedSegment === "node_modules") ||
            (ignores.macosx && normalizedSegment === "__macosx")) {
            return true;
        }
        if (filters.excludedFolders.has(normalizedSegment) || filters.excludedFolders.has(progressivePath)) {
            return true;
        }
    }

    return false;
}

function shouldExcludeFilePath(filePath, filters, useCustomFileFilters = true) {
    const normalizedPath = normalizePathPattern(filePath);
    const segments = normalizedPath.split("/").filter(Boolean);
    const fileName = segments.at(-1);
    const fileExtension = extractExtension(fileName);
    const ignores = getDefaultIgnores(filters);

    if (segments.length > 1) {
        const directoryPath = segments.slice(0, -1).join("/");
        if (shouldExcludeDirectoryPath(directoryPath, filters)) {
            return true;
        }
    }

    if (ignores.dsStore && fileName === ".ds_store") {
        return true;
    }
    if (ignores.appleDouble && fileName.startsWith("._")) {
        return true;
    }
    if (ignores.env && (fileName === ".env" || fileName.startsWith(".env.") || fileName.endsWith(".env"))) {
        return true;
    }
    if (useCustomFileFilters && (filters.excludedFiles.has(fileName) || filters.excludedFiles.has(normalizedPath))) {
        return true;
    }
    if (fileExtension && ((ignores.binary && BINARY_EXTENSIONS.has(fileExtension)) ||
        (useCustomFileFilters && filters.excludedExtensions.has(fileExtension)))) {
        return true;
    }

    return false;
}

function buildReportMarkdown(rootLabel, filters, includedFiles, stats) {
    const parts = [];
    appendMetadata(parts, "Raport kontekstu", rootLabel, "Raport", filters, stats);

    if (includedFiles.length === 0) {
        parts.push("_Brak plików tekstowych po zastosowaniu filtrów._");
        return `${parts.join("\n")}\n`;
    }

    for (const file of includedFiles) {
        if (file.binary) {
            parts.push(`## ${file.path}`, "", `_Plik binarny (${formatByteSize(file.sizeBytes)}). Zawartość pominięta w raporcie tekstowym._`, "");
            continue;
        }
        const content = decodeTextBytes(file.bytes);
        const fence = buildFence(content);
        const language = LANGUAGE_BY_EXTENSION.get(extractExtension(file.path)) ?? "";

        parts.push(`## ${file.path}`);
        parts.push("");
        parts.push(`${fence}${language}`);
        parts.push(content.endsWith("\n") ? content.slice(0, -1) : content);
        parts.push(fence);
        parts.push("");
    }

    return `${parts.join("\n").trimEnd()}\n`;
}

function buildStructureMarkdown(rootLabel, filters, treeRoot, stats, structureFileScope) {
    const parts = [];
    appendMetadata(parts, "Struktura katalogów", rootLabel, "Struktura", filters, stats, structureFileScope);
    parts.push("```text");
    parts.push(renderTree(treeRoot).trimEnd());
    parts.push("```");
    return `${parts.join("\n")}\n`;
}

function appendMetadata(parts, title, rootLabel, modeLabel, filters, stats, structureFileScope = "report") {
    const useReportFileFilters = modeLabel !== "Struktura" || structureFileScope === "report";

    parts.push(`# ${title}`);
    parts.push("");
    parts.push(`- Źródło: \`${rootLabel}.zip\``);
    parts.push(`- Wygenerowano: \`${timestampForHumans()}\``);
    parts.push(`- Tryb: \`${modeLabel}\``);
    if (modeLabel === "Struktura") {
        parts.push(`- Zakres plików w strukturze: \`${formatStructureFileScope(structureFileScope)}\``);
    }
    parts.push(`- Uwzględnione katalogi: \`${stats.directories}\``);
    parts.push(`- Uwzględnione pliki: \`${stats.files}\``);
    const enabledIgnores = Object.entries(getDefaultIgnores(filters))
        .filter(([, enabled]) => enabled)
        .map(([key]) => IGNORE_LABELS[key]);
    parts.push(`- Domyślne ignorowanie (włączone): ${enabledIgnores.join(", ") || "brak"}`);
    if (useReportFileFilters) {
        parts.push(`- Wykluczenia plików: \`${formatFilterList(filters.excludedFiles)}\``);
        parts.push(`- Wykluczenia rozszerzeń: \`${formatFilterList(filters.excludedExtensions)}\``);
    } else {
        parts.push("- Wykluczenia plików: `nie dotyczy pełnej struktury`");
        parts.push("- Wykluczenia rozszerzeń: `nie dotyczy pełnej struktury`");
    }
    parts.push(`- Wykluczenia folderów: \`${formatFilterList(filters.excludedFolders)}\``);
    parts.push("");
}

function formatStructureFileScope(structureFileScope) {
    return structureFileScope === "all"
        ? "wszystkie pliki z uwzględnionych folderów"
        : "takie same ograniczenia jak raport";
}

function formatFilterList(values) {
    return values.size === 0 ? "brak" : Array.from(values).join(", ");
}

function addPathToTree(rootNode, relativePath, directoryOnly, sizeBytes = 0) {
    const segments = normalizeDisplayPath(relativePath).split("/").filter(Boolean);
    let currentNode = rootNode;

    segments.forEach((segment, index) => {
        const isDirectory = directoryOnly || index < segments.length - 1;
        let child = currentNode.children.find(
            (node) => node.name === segment && node.directory === isDirectory
        );

        if (!child) {
            child = createTreeNode(segment, isDirectory, isDirectory ? 0 : sizeBytes);
            currentNode.children.push(child);
        } else if (!isDirectory) {
            child.sizeBytes = sizeBytes;
        }

        currentNode = child;
    });
}

function sortTree(node) {
    node.children.sort((first, second) => {
        if (first.directory !== second.directory) {
            return first.directory ? -1 : 1;
        }
        return first.name.localeCompare(second.name, undefined, { sensitivity: "accent" });
    });

    node.children.forEach(sortTree);
}

function renderTree(rootNode) {
    const lines = [`${rootNode.name}/`];

    rootNode.children.forEach((child, index) => {
        appendTreeLine(lines, child, "", index === rootNode.children.length - 1);
    });

    return `${lines.join("\n")}\n`;
}

function appendTreeLine(lines, node, prefix, isLast) {
    const label = node.directory
        ? `${node.name}/`
        : `${node.name} (${formatByteSize(node.sizeBytes)})`;

    lines.push(`${prefix}${isLast ? "└── " : "├── "}${label}`);
    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;

    node.children.forEach((child, index) => {
        appendTreeLine(lines, child, childPrefix, index === node.children.length - 1);
    });
}

function countTreeDirectories(rootNode) {
    let count = 0;
    rootNode.children.forEach((child) => {
        if (child.directory) {
            count += 1;
        }
        count += countTreeDirectories(child);
    });
    return count;
}

function createTreeNode(name, directory, sizeBytes = 0) {
    return {
        name,
        directory,
        sizeBytes,
        children: []
    };
}

function isLikelyBinary(bytes) {
    if (!bytes || bytes.length === 0) {
        return false;
    }

    let suspiciousBytes = 0;
    const sampleSize = Math.min(bytes.length, 4096);

    for (let index = 0; index < sampleSize; index += 1) {
        const value = bytes[index];
        if (value === 0) {
            return true;
        }
        if ((value < 0x09) || (value > 0x0d && value < 0x20)) {
            suspiciousBytes += 1;
        }
    }

    return suspiciousBytes / sampleSize > 0.30;
}

function decodeTextBytes(bytes) {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

    try {
        return normalizeLineEndings(stripBom(utf8Decoder.decode(bytes)));
    } catch (error) {
        const fallbackDecoder = new TextDecoder();
        return normalizeLineEndings(stripBom(fallbackDecoder.decode(bytes)));
    }
}

function buildFence(content) {
    let longestRun = 0;
    let currentRun = 0;

    for (const character of content) {
        if (character === "`") {
            currentRun += 1;
            longestRun = Math.max(longestRun, currentRun);
        } else {
            currentRun = 0;
        }
    }

    return "`".repeat(Math.max(3, longestRun + 1));
}

function stripBom(value) {
    return value.startsWith("\uFEFF") ? value.slice(1) : value;
}

function normalizeLineEndings(value) {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function parseList(value, extensionMode) {
    return new Set(
        value
            .split(/[,\n\r]+/)
            .map((item) => extensionMode ? normalizeExtension(item) : normalizePathPattern(item))
            .filter(Boolean)
    );
}

function normalizeEntryName(value) {
    return normalizeDisplayPath(value);
}

function normalizeDisplayPath(value) {
    return (value ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^(\.\/)+/g, "")
        .replace(/\/+$/g, "");
}

function normalizePathPattern(value) {
    let normalized = (value ?? "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }

    normalized = normalized.replace(/\\/g, "/");
    normalized = normalized.replace(/^(\.\/)+/g, "");
    normalized = normalized.replace(/\/+$/g, "");
    return normalized;
}

function normalizeExtension(value) {
    const normalized = normalizePathPattern(value);
    if (!normalized) {
        return "";
    }
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

function extractExtension(filePath) {
    const fileName = normalizePathPattern(filePath).split("/").filter(Boolean).at(-1) ?? "";
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === fileName.length - 1) {
        return "";
    }
    return fileName.slice(lastDot);
}

export function formatByteSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = -1;

    do {
        value /= 1024;
        unitIndex += 1;
    } while (value >= 1024 && unitIndex < units.length - 1);

    const digits = value < 10 ? 1 : 0;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function compareEntryNames(first, second) {
    const firstValue = normalizeEntryName(first).toLowerCase();
    const secondValue = normalizeEntryName(second).toLowerCase();
    return firstValue.localeCompare(secondValue, undefined, { sensitivity: "accent" });
}

function stripZipExtension(fileName) {
    return fileName.replace(/\.zip$/i, "") || "archiwum";
}

function sanitizeFileNamePart(value) {
    const normalized = String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .toLowerCase();

    return normalized || "source";
}

function timestampForFileName() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ].join("") + "-" + [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0")
    ].join("");
}

function timestampForHumans() {
    return new Intl.DateTimeFormat("pl-PL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(new Date());
}

