import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Konsolowe narzędzie do budowania kontekstu dla modeli językowych.
 *
 * <p>Aplikacja skanuje wskazany katalog, wymusza ignorowanie binariów i artefaktów
 * macOS, a następnie zapisuje wynik domyślnie do folderu Downloads
 * w katalogu domowym użytkownika.</p>
 */
public final class ContextBuilderApp {

    private static final String DEFAULT_OUTPUT_DIRECTORY_NAME = "Downloads";
    private static final DateTimeFormatter HUMAN_TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int BINARY_SNIFF_LIMIT = 4 * 1024;

    private static final Set<String> FORCED_FOLDER_EXCLUDES = lowerCaseSet(
            "node_modules",
            "__MACOSX"
    );

    private static final Set<String> FORCED_FILE_EXCLUDES = lowerCaseSet(
            ".DS_Store"
    );

    private static final Set<String> FORCED_FILE_PREFIX_EXCLUDES = lowerCaseSet(
            "._"
    );

    private static final Set<String> FORCED_BINARY_EXTENSIONS = lowerCaseSet(
            ".7z", ".a", ".aac", ".ai", ".apk", ".arj", ".avi", ".avif", ".bin", ".bmp",
            ".class", ".cur", ".db", ".dll", ".dmg", ".doc", ".docm", ".docx", ".ear",
            ".eot", ".eps", ".exe", ".flac", ".flv", ".gif", ".gz", ".heic", ".heif",
            ".ico", ".iso", ".jar", ".jpeg", ".jpg", ".lib", ".m4a", ".m4v", ".mid",
            ".midi", ".mov", ".mp3", ".mp4", ".mpeg", ".mpg", ".o", ".obj", ".ogg",
            ".otf", ".pdf", ".png", ".ppt", ".pptm", ".pptx", ".psd", ".rar", ".so",
            ".tar", ".tif", ".tiff", ".ttf", ".war", ".wav", ".webm", ".webp", ".woff",
            ".woff2", ".xls", ".xlsb", ".xlsm", ".xlsx", ".zip"
    );

    private static final Map<String, String> LANGUAGE_BY_EXTENSION = createLanguageMap();

    private final BufferedReader console =
            new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));

    public static void main(String[] args) {
        try {
            new ContextBuilderApp().run();
        } catch (IOException exception) {
            System.err.println("Nie udało się zakończyć pracy programu: " + exception.getMessage());
            System.exit(1);
        }
    }

    private void run() throws IOException {
        printHeader();

        Path outputDirectory = createOutputDirectory();
        ScanConfig config = new ScanConfig(
                askForDirectory(),
                askForPatterns(
                        "Wykluczenia plików (opcjonalnie, oddziel przecinkami; nazwa pliku lub ścieżka względna): ",
                        false
                ),
                askForPatterns(
                        "Wykluczenia folderów (opcjonalnie, oddziel przecinkami; nazwa folderu lub ścieżka względna): ",
                        false
                ),
                askForPatterns(
                        "Wykluczenia rozszerzeń (opcjonalnie, np. .log, tmp, .cache): ",
                        true
                ),
                askForMode()
        );

        boolean runAgain;
        do {
            ScanResult result = scanDirectory(config);
            Path outputFile = outputDirectory.resolve(buildOutputFileName(config.rootDirectory, config.mode));
            boolean overwritingExistingFile = Files.exists(outputFile);
            writeOutputFile(outputDirectory, config, result);
            printRunSummary(outputDirectory, outputFile, result, overwritingExistingFile);
            runAgain = askToRepeatWithSameConfig();
        } while (runAgain);
    }

    private void printRunSummary(
            Path outputDirectory,
            Path outputFile,
            ScanResult result,
            boolean overwritingExistingFile
    ) {
        System.out.println();
        System.out.println("Zakończono.");
        System.out.println((overwritingExistingFile ? "Wynik nadpisano w: " : "Wynik zapisano w: ")
                + outputFile.toAbsolutePath());
        System.out.println("Folder wynikowy: " + outputDirectory.toAbsolutePath());

        if (!result.warnings.isEmpty()) {
            System.out.println();
            System.out.println("Ostrzeżenia:");
            for (String warning : result.warnings) {
                System.out.println(" - " + warning);
            }
        }
    }

    private boolean askToRepeatWithSameConfig() throws IOException {
        while (true) {
            System.out.println();
            System.out.print("Wykonać raport ponownie dla tych samych parametrów? (t/n): ");
            String input = readRequiredLine().trim().toLowerCase(Locale.ROOT);

            if ("t".equals(input) || "tak".equals(input) || "y".equals(input) || "yes".equals(input)) {
                return true;
            }
            if ("n".equals(input) || "nie".equals(input) || "no".equals(input)) {
                return false;
            }

            System.out.println("Nieprawidłowa odpowiedź. Wpisz t albo n.");
        }
    }

    private void printHeader() {
        System.out.println("=== Kopiator kontekstu dla modeli językowych ===");
        System.out.println("Domyślnie ignorowane są: node_modules, pliki binarne, __MACOSX, .DS_Store oraz pliki AppleDouble.");
        System.out.println();
    }

    private Path askForDirectory() throws IOException {
        while (true) {
            System.out.print("Podaj ścieżkę do katalogu źródłowego: ");
            String input = readRequiredLine();
            Path directory = Paths.get(input.trim()).toAbsolutePath().normalize();

            if (!Files.exists(directory)) {
                System.out.println("Podana ścieżka nie istnieje. Spróbuj ponownie.");
                continue;
            }
            if (!Files.isDirectory(directory)) {
                System.out.println("Podana ścieżka nie wskazuje katalogu. Spróbuj ponownie.");
                continue;
            }
            return directory;
        }
    }

    private Set<String> askForPatterns(String prompt, boolean extensionsOnly) throws IOException {
        System.out.print(prompt);
        String input = console.readLine();
        if (input == null || input.trim().isEmpty()) {
            return Collections.emptySet();
        }

        Set<String> patterns = new LinkedHashSet<String>();
        String[] rawItems = input.split(",");
        for (String rawItem : rawItems) {
            String normalized = extensionsOnly
                    ? normalizeExtension(rawItem)
                    : normalizePathPattern(rawItem);
            if (!normalized.isEmpty()) {
                patterns.add(normalized);
            }
        }
        return patterns;
    }

    private Mode askForMode() throws IOException {
        while (true) {
            System.out.println();
            System.out.println("Wybierz tryb działania:");
            System.out.println("1 - Raport (zawartość plików w jednym pliku Markdown)");
            System.out.println("2 - Struktura (wyłącznie drzewo katalogów)");
            System.out.print("Twój wybór: ");

            String input = readRequiredLine().trim();
            if ("1".equals(input)) {
                return Mode.REPORT;
            }
            if ("2".equals(input)) {
                return Mode.STRUCTURE;
            }
            System.out.println("Nieprawidłowy wybór. Wpisz 1 albo 2.");
        }
    }

    private String readRequiredLine() throws IOException {
        String line = console.readLine();
        if (line == null) {
            throw new IOException("Strumień wejściowy został zamknięty.");
        }
        return line;
    }

    private ScanResult scanDirectory(ScanConfig config) {
        TreeNode rootNode = new TreeNode(resolveRootLabel(config.rootDirectory), true);
        ScanResult result = new ScanResult(rootNode);
        walkDirectory(config.rootDirectory, rootNode, config, result);
        return result;
    }

    private void walkDirectory(Path currentDirectory, TreeNode currentNode, ScanConfig config, ScanResult result) {
        List<Path> children;
        try (Stream<Path> stream = Files.list(currentDirectory)) {
            children = stream
                    .sorted(createPathComparator())
                    .collect(Collectors.toList());
        } catch (IOException exception) {
            result.warnings.add("Nie udało się odczytać katalogu: " + currentDirectory + " (" + exception.getMessage() + ")");
            return;
        }

        for (Path child : children) {
            Path relativePath = config.rootDirectory.relativize(child);

            if (Files.isSymbolicLink(child)) {
                result.warnings.add("Pominięto dowiązanie symboliczne: " + displayRelativePath(relativePath));
                continue;
            }

            boolean isDirectory = Files.isDirectory(child, LinkOption.NOFOLLOW_LINKS);
            if (isDirectory) {
                if (shouldExcludeDirectory(child, relativePath, config)) {
                    continue;
                }

                TreeNode directoryNode = new TreeNode(child.getFileName().toString(), true);
                currentNode.children.add(directoryNode);
                result.directoryCount++;
                walkDirectory(child, directoryNode, config, result);
                continue;
            }

            if (shouldExcludeFile(child, relativePath, config)) {
                continue;
            }

            TreeNode fileNode = new TreeNode(child.getFileName().toString(), false);
            currentNode.children.add(fileNode);
            result.fileCount++;
            result.includedFiles.add(child);
        }
    }

    private Comparator<Path> createPathComparator() {
        return new Comparator<Path>() {
            @Override
            public int compare(Path first, Path second) {
                boolean firstDirectory = Files.isDirectory(first, LinkOption.NOFOLLOW_LINKS);
                boolean secondDirectory = Files.isDirectory(second, LinkOption.NOFOLLOW_LINKS);
                if (firstDirectory != secondDirectory) {
                    return firstDirectory ? -1 : 1;
                }
                return first.getFileName().toString()
                        .compareToIgnoreCase(second.getFileName().toString());
            }
        };
    }

    private boolean shouldExcludeDirectory(Path directory, Path relativePath, ScanConfig config) {
        String name = lowerCase(directory.getFileName().toString());
        String normalizedRelativePath = normalizeRelativePath(relativePath);
        return shouldExcludeDirectoryNameOrPath(name, normalizedRelativePath, config.excludedFolders);
    }

    private boolean shouldExcludeFile(Path file, Path relativePath, ScanConfig config) {
        String fileName = lowerCase(file.getFileName().toString());
        String normalizedRelativePath = normalizeRelativePath(relativePath);
        if (shouldExcludeFileByMetadata(
                fileName,
                normalizedRelativePath,
                config.excludedFiles,
                config.excludedExtensions
        )) {
            return true;
        }

        try {
            return isLikelyBinary(file);
        } catch (IOException exception) {
            return true;
        }
    }

    static boolean shouldExcludeDirectoryNameOrPath(
            String name,
            String normalizedRelativePath,
            Set<String> excludedFolders
    ) {
        return FORCED_FOLDER_EXCLUDES.contains(name)
                || matchesPattern(excludedFolders, name, normalizedRelativePath);
    }

    static boolean shouldExcludeFileByMetadata(
            String fileName,
            String normalizedRelativePath,
            Set<String> excludedFiles,
            Set<String> excludedExtensions
    ) {
        String extension = extractExtension(fileName);

        if (FORCED_FILE_EXCLUDES.contains(fileName)) {
            return true;
        }
        if (startsWithAny(fileName, FORCED_FILE_PREFIX_EXCLUDES)) {
            return true;
        }
        if (matchesPattern(excludedFiles, fileName, normalizedRelativePath)) {
            return true;
        }
        return !extension.isEmpty()
                && (FORCED_BINARY_EXTENSIONS.contains(extension) || excludedExtensions.contains(extension));
    }

    private static boolean matchesPattern(Set<String> patterns, String name, String normalizedRelativePath) {
        return patterns.contains(name) || patterns.contains(normalizedRelativePath);
    }

    private static boolean startsWithAny(String value, Set<String> prefixes) {
        for (String prefix : prefixes) {
            if (value.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private boolean isLikelyBinary(Path file) throws IOException {
        long fileSize = Files.size(file);
        if (fileSize == 0L) {
            return false;
        }

        byte[] sample = new byte[BINARY_SNIFF_LIMIT];
        int bytesRead;
        try (InputStream inputStream = Files.newInputStream(file)) {
            bytesRead = inputStream.read(sample);
        }

        if (bytesRead <= 0) {
            return false;
        }

        return isLikelyBinarySample(sample, bytesRead);
    }

    private Path createOutputDirectory() throws IOException {
        Path outputDirectory = buildDefaultOutputDirectoryPath(Paths.get(System.getProperty("user.home")));
        return Files.createDirectories(outputDirectory);
    }

    static Path buildDefaultOutputDirectoryPath(Path homeDirectory) {
        Path normalizedHomeDirectory = homeDirectory.toAbsolutePath().normalize();
        return normalizedHomeDirectory.resolve(DEFAULT_OUTPUT_DIRECTORY_NAME);
    }

    private Path writeOutputFile(Path outputDirectory, ScanConfig config, ScanResult result) throws IOException {
        Path outputFile = outputDirectory.resolve(buildOutputFileName(config.rootDirectory, config.mode));

        String markdown = config.mode == Mode.REPORT
                ? buildReportMarkdown(config, result)
                : buildStructureMarkdown(config, result);

        Files.writeString(outputFile, markdown, StandardCharsets.UTF_8);
        return outputFile;
    }

    private String buildReportMarkdown(ScanConfig config, ScanResult result) throws IOException {
        StringBuilder markdown = new StringBuilder(8 * 1024);
        appendDocumentHeader(markdown, "Raport kontekstu", config, result);

        if (result.includedFiles.isEmpty()) {
            markdown.append("_Brak plików tekstowych po zastosowaniu filtrów._\n");
            return markdown.toString();
        }

        for (Path file : result.includedFiles) {
            Path relativePath = config.rootDirectory.relativize(file);
            String content = readTextFile(file);
            String fence = buildFence(content);
            String displayPath = displayRelativePath(relativePath);
            String language = resolveLanguage(displayPath);

            markdown.append("## ").append(displayPath).append("\n\n");
            markdown.append(fence).append(language).append("\n");
            markdown.append(content);
            if (!content.endsWith("\n")) {
                markdown.append("\n");
            }
            markdown.append(fence).append("\n\n");
        }
        return markdown.toString();
    }

    private String buildStructureMarkdown(ScanConfig config, ScanResult result) {
        StringBuilder markdown = new StringBuilder(4 * 1024);
        appendDocumentHeader(markdown, "Struktura katalogów", config, result);
        markdown.append("```text\n");
        markdown.append(renderTree(result.rootNode));
        markdown.append("```\n");
        return markdown.toString();
    }

    private void appendDocumentHeader(StringBuilder markdown, String title, ScanConfig config, ScanResult result) {
        markdown.append("# ").append(title).append("\n\n");
        markdown.append("- Katalog źródłowy: `").append(config.rootDirectory).append("`\n");
        markdown.append("- Wygenerowano: `").append(HUMAN_TIMESTAMP.format(LocalDateTime.now())).append("`\n");
        markdown.append("- Tryb: `").append(config.mode.displayName).append("`\n");
        markdown.append("- Uwzględnione katalogi: `").append(result.directoryCount).append("`\n");
        markdown.append("- Uwzględnione pliki: `").append(result.fileCount).append("`\n");
        markdown.append("- Wymuszone ignorowanie: `node_modules`, `__MACOSX`, `.DS_Store`, `._*`, binaria\n");
        markdown.append("- Wykluczenia plików: `").append(formatPatternList(config.excludedFiles)).append("`\n");
        markdown.append("- Wykluczenia folderów: `").append(formatPatternList(config.excludedFolders)).append("`\n");
        markdown.append("- Wykluczenia rozszerzeń: `").append(formatPatternList(config.excludedExtensions)).append("`\n\n");
    }

    private String formatPatternList(Set<String> patterns) {
        if (patterns.isEmpty()) {
            return "brak";
        }
        return String.join(", ", patterns);
    }

    private String renderTree(TreeNode rootNode) {
        StringBuilder tree = new StringBuilder(4 * 1024);
        tree.append(rootNode.name).append("/\n");

        for (int index = 0; index < rootNode.children.size(); index++) {
            TreeNode child = rootNode.children.get(index);
            boolean isLast = index == rootNode.children.size() - 1;
            appendTreeNode(tree, child, "", isLast);
        }
        return tree.toString();
    }

    private void appendTreeNode(StringBuilder tree, TreeNode node, String prefix, boolean isLast) {
        tree.append(prefix);
        tree.append(isLast ? "└── " : "├── ");
        tree.append(node.name);
        if (node.directory) {
            tree.append("/");
        }
        tree.append("\n");

        String childPrefix = prefix + (isLast ? "    " : "│   ");
        for (int index = 0; index < node.children.size(); index++) {
            TreeNode child = node.children.get(index);
            boolean childIsLast = index == node.children.size() - 1;
            appendTreeNode(tree, child, childPrefix, childIsLast);
        }
    }

    private String readTextFile(Path file) throws IOException {
        byte[] bytes = readAllBytes(file);
        String text = tryDecode(bytes, StandardCharsets.UTF_8);
        if (text == null) {
            text = tryDecode(bytes, Charset.defaultCharset());
        }
        if (text == null) {
            text = new String(bytes, StandardCharsets.UTF_8);
        }
        if (!text.isEmpty() && text.charAt(0) == '\uFEFF') {
            text = text.substring(1);
        }
        return text.replace("\r\n", "\n").replace('\r', '\n');
    }

    private byte[] readAllBytes(Path file) throws IOException {
        try (InputStream inputStream = Files.newInputStream(file);
             ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                outputStream.write(buffer, 0, read);
            }
            return outputStream.toByteArray();
        }
    }

    private String tryDecode(byte[] bytes, Charset charset) {
        CharsetDecoder decoder = charset.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try {
            return decoder.decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException exception) {
            return null;
        }
    }

    static boolean isLikelyBinarySample(byte[] sample, int bytesRead) {
        int suspiciousBytes = 0;
        for (int index = 0; index < bytesRead; index++) {
            int value = sample[index] & 0xFF;
            if (value == 0) {
                return true;
            }
            if ((value < 0x09) || (value > 0x0D && value < 0x20)) {
                suspiciousBytes++;
            }
        }

        double suspiciousRatio = (double) suspiciousBytes / (double) bytesRead;
        return suspiciousRatio > 0.30d;
    }

    static String buildFence(String content) {
        int longestRun = 0;
        int currentRun = 0;

        for (int index = 0; index < content.length(); index++) {
            if (content.charAt(index) == '`') {
                currentRun++;
                longestRun = Math.max(longestRun, currentRun);
            } else {
                currentRun = 0;
            }
        }

        int fenceLength = Math.max(3, longestRun + 1);
        return repeatCharacter('`', fenceLength);
    }

    static String resolveLanguage(String relativePath) {
        String extension = extractExtension(lowerCase(relativePath));
        String language = LANGUAGE_BY_EXTENSION.get(extension);
        return language == null ? "" : language;
    }

    private static String resolveRootLabel(Path rootDirectory) {
        Path fileName = rootDirectory.getFileName();
        return fileName == null ? rootDirectory.toString() : fileName.toString();
    }

    static String sanitizeFileNamePart(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            return "source";
        }

        normalized = normalized
                .replaceAll("[^\\p{IsAlphabetic}\\p{IsDigit}._-]+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^[-.]+|[-.]+$", "")
                .toLowerCase(Locale.ROOT);

        return normalized.isEmpty() ? "source" : normalized;
    }

    static String buildOutputFileName(Path rootDirectory, Mode mode) {
        String sourceLabel = sanitizeFileNamePart(resolveRootLabel(rootDirectory));
        String filePrefix = mode == Mode.REPORT ? "context-report-" : "context-structure-";
        return filePrefix + sourceLabel + ".md";
    }

    private static Map<String, String> createLanguageMap() {
        Map<String, String> languages = new HashMap<String, String>();
        languages.put(".bat", "bat");
        languages.put(".c", "c");
        languages.put(".conf", "ini");
        languages.put(".cpp", "cpp");
        languages.put(".cs", "csharp");
        languages.put(".css", "css");
        languages.put(".csv", "csv");
        languages.put(".env", "bash");
        languages.put(".go", "go");
        languages.put(".gradle", "groovy");
        languages.put(".graphql", "graphql");
        languages.put(".groovy", "groovy");
        languages.put(".h", "c");
        languages.put(".hpp", "cpp");
        languages.put(".html", "html");
        languages.put(".ini", "ini");
        languages.put(".java", "java");
        languages.put(".js", "javascript");
        languages.put(".json", "json");
        languages.put(".kt", "kotlin");
        languages.put(".kts", "kotlin");
        languages.put(".md", "markdown");
        languages.put(".php", "php");
        languages.put(".properties", "properties");
        languages.put(".ps1", "powershell");
        languages.put(".py", "python");
        languages.put(".rb", "ruby");
        languages.put(".rs", "rust");
        languages.put(".scss", "scss");
        languages.put(".sh", "bash");
        languages.put(".sql", "sql");
        languages.put(".svg", "xml");
        languages.put(".toml", "toml");
        languages.put(".ts", "typescript");
        languages.put(".tsx", "tsx");
        languages.put(".txt", "text");
        languages.put(".xml", "xml");
        languages.put(".yaml", "yaml");
        languages.put(".yml", "yaml");
        return languages;
    }

    private static Set<String> lowerCaseSet(String... values) {
        return new HashSet<String>(Arrays.stream(values)
                .map(ContextBuilderApp::lowerCase)
                .collect(Collectors.toList()));
    }

    private static String lowerCase(String value) {
        return value.toLowerCase(Locale.ROOT);
    }

    static String normalizePathPattern(String rawPattern) {
        String normalized = rawPattern == null ? "" : rawPattern.trim();
        if (normalized.isEmpty()) {
            return "";
        }
        normalized = normalized.replace('\\', '/');
        while (normalized.startsWith("./")) {
            normalized = normalized.substring(2);
        }
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return lowerCase(normalized);
    }

    static String normalizeExtension(String rawExtension) {
        String normalized = rawExtension == null ? "" : rawExtension.trim();
        if (normalized.isEmpty()) {
            return "";
        }
        normalized = lowerCase(normalized);
        return normalized.startsWith(".") ? normalized : "." + normalized;
    }

    static String extractExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot <= 0 || lastDot == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(lastDot);
    }

    private static String normalizeRelativePath(Path path) {
        return normalizePathPattern(path.toString());
    }

    private static String displayRelativePath(Path path) {
        return path.toString().replace('\\', '/');
    }

    private static String repeatCharacter(char character, int count) {
        StringBuilder builder = new StringBuilder(count);
        for (int index = 0; index < count; index++) {
            builder.append(character);
        }
        return builder.toString();
    }

    enum Mode {
        REPORT("Raport"),
        STRUCTURE("Struktura");

        private final String displayName;

        Mode(String displayName) {
            this.displayName = displayName;
        }
    }

    private static final class ScanConfig {
        private final Path rootDirectory;
        private final Set<String> excludedFiles;
        private final Set<String> excludedFolders;
        private final Set<String> excludedExtensions;
        private final Mode mode;

        private ScanConfig(
                Path rootDirectory,
                Set<String> excludedFiles,
                Set<String> excludedFolders,
                Set<String> excludedExtensions,
                Mode mode
        ) {
            this.rootDirectory = rootDirectory;
            this.excludedFiles = excludedFiles;
            this.excludedFolders = excludedFolders;
            this.excludedExtensions = excludedExtensions;
            this.mode = mode;
        }
    }

    private static final class ScanResult {
        private final TreeNode rootNode;
        private final List<Path> includedFiles = new ArrayList<Path>();
        private final List<String> warnings = new ArrayList<String>();
        private int directoryCount;
        private int fileCount;

        private ScanResult(TreeNode rootNode) {
            this.rootNode = rootNode;
        }
    }

    private static final class TreeNode {
        private final String name;
        private final boolean directory;
        private final List<TreeNode> children = new ArrayList<TreeNode>();

        private TreeNode(String name, boolean directory) {
            this.name = name;
            this.directory = directory;
        }
    }
}
