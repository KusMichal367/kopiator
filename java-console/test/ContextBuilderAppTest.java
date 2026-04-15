import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

public final class ContextBuilderAppTest {

    private ContextBuilderAppTest() {
    }

    public static void main(String[] args) {
        run("normalizePathPattern trims, lowercases and normalizes separators",
                ContextBuilderAppTest::shouldNormalizePathPatterns);
        run("parsePatterns splits comma-separated values and skips blanks",
                ContextBuilderAppTest::shouldParsePatternLists);
        run("normalizeExtension adds missing dot and lowercases values",
                ContextBuilderAppTest::shouldNormalizeExtensions);
        run("extractExtension returns extension only for real suffixes",
                ContextBuilderAppTest::shouldExtractExtensions);
        run("directory exclusion honors forced and configured rules",
                ContextBuilderAppTest::shouldExcludeConfiguredDirectories);
        run("file exclusion honors forced names, prefixes and configured extensions",
                ContextBuilderAppTest::shouldExcludeConfiguredFiles);
        run("binary sniffing detects null bytes and suspicious control-character ratios",
                ContextBuilderAppTest::shouldDetectBinarySamples);
        run("markdown fence expands beyond longest backtick run",
                ContextBuilderAppTest::shouldBuildSafeMarkdownFence);
        run("language resolution matches known extensions case-insensitively",
                ContextBuilderAppTest::shouldResolveLanguages);
        run("output file label keeps folder name in a safe form",
                ContextBuilderAppTest::shouldSanitizeOutputFileLabels);
        run("output file name is stable for the same folder and mode",
                ContextBuilderAppTest::shouldBuildStableOutputFileName);
        run("default output directory points to Downloads in the user home",
                ContextBuilderAppTest::shouldBuildDefaultOutputDirectoryPath);
        run("byte size formatting keeps structure output readable",
                ContextBuilderAppTest::shouldFormatByteSizes);
        run("structure file scope parser accepts report-filtered and all-files modes",
                ContextBuilderAppTest::shouldParseStructureFileScope);
        run("report file filters are optional only for full structure trees",
                ContextBuilderAppTest::shouldApplyReportFileFiltersByMode);

        System.out.println("All ContextBuilderApp unit tests passed.");
    }

    private static void shouldNormalizePathPatterns() {
        assertEquals("folder/sub/file.txt",
                ContextBuilderApp.normalizePathPattern(" ./Folder\\Sub/File.txt/ "));
        assertEquals("", ContextBuilderApp.normalizePathPattern("   "));
    }

    private static void shouldParsePatternLists() {
        Set<String> patterns = ContextBuilderApp.parsePatterns(" README.md, , src\\Generated/ ", false);
        assertEquals(setOf("readme.md", "src/generated"), patterns);

        Set<String> extensions = ContextBuilderApp.parsePatterns(" log, .TMP, ", true);
        assertEquals(setOf(".log", ".tmp"), extensions);
    }

    private static void shouldNormalizeExtensions() {
        assertEquals(".log", ContextBuilderApp.normalizeExtension(" LOG "));
        assertEquals(".tmp", ContextBuilderApp.normalizeExtension(".TMP"));
        assertEquals("", ContextBuilderApp.normalizeExtension(" "));
    }

    private static void shouldExtractExtensions() {
        assertEquals(".java", ContextBuilderApp.extractExtension("ContextBuilderApp.java"));
        assertEquals("", ContextBuilderApp.extractExtension("README"));
        assertEquals("", ContextBuilderApp.extractExtension(".gitignore"));
        assertEquals("", ContextBuilderApp.extractExtension("config."));
    }

    private static void shouldExcludeConfiguredDirectories() {
        Set<String> excludedFolders = setOf("docs/tmp", "build");

        assertTrue(ContextBuilderApp.shouldExcludeDirectoryNameOrPath(
                "node_modules",
                "src/node_modules",
                excludedFolders
        ));
        assertTrue(ContextBuilderApp.shouldExcludeDirectoryNameOrPath(
                "tmp",
                "docs/tmp",
                excludedFolders
        ));
        assertFalse(ContextBuilderApp.shouldExcludeDirectoryNameOrPath(
                "src",
                "docs/src",
                excludedFolders
        ));
    }

    private static void shouldExcludeConfiguredFiles() {
        Set<String> excludedFiles = setOf("readme.md", "docs/secret.txt");
        Set<String> excludedExtensions = setOf(".cache");

        assertTrue(ContextBuilderApp.shouldExcludeFileByMetadata(
                ".ds_store",
                ".ds_store",
                excludedFiles,
                excludedExtensions
        ));
        assertTrue(ContextBuilderApp.shouldExcludeFileByMetadata(
                "._hidden",
                "docs/._hidden",
                excludedFiles,
                excludedExtensions
        ));
        assertTrue(ContextBuilderApp.shouldExcludeFileByMetadata(
                "secret.txt",
                "docs/secret.txt",
                excludedFiles,
                excludedExtensions
        ));
        assertTrue(ContextBuilderApp.shouldExcludeFileByMetadata(
                "debug.cache",
                "logs/debug.cache",
                excludedFiles,
                excludedExtensions
        ));
        assertTrue(ContextBuilderApp.shouldExcludeFileByMetadata(
                "archive.zip",
                "archive.zip",
                Collections.<String>emptySet(),
                Collections.<String>emptySet()
        ));
        assertFalse(ContextBuilderApp.shouldExcludeFileByMetadata(
                "notes.md",
                "docs/notes.md",
                excludedFiles,
                excludedExtensions
        ));
    }

    private static void shouldDetectBinarySamples() {
        assertFalse(ContextBuilderApp.isLikelyBinarySample(
                "plain utf-8 text".getBytes(StandardCharsets.UTF_8),
                "plain utf-8 text".length()
        ));
        assertTrue(ContextBuilderApp.isLikelyBinarySample(
                new byte[] {65, 0, 66},
                3
        ));
        assertTrue(ContextBuilderApp.isLikelyBinarySample(
                new byte[] {1, 2, 3, 4, 5, 65, 66, 67},
                8
        ));
    }

    private static void shouldBuildSafeMarkdownFence() {
        assertEquals("```", ContextBuilderApp.buildFence("plain text"));
        assertEquals("`````", ContextBuilderApp.buildFence("value with ```` inside"));
    }

    private static void shouldResolveLanguages() {
        assertEquals("javascript", ContextBuilderApp.resolveLanguage("docs/APP.JS"));
        assertEquals("markdown", ContextBuilderApp.resolveLanguage("README.md"));
        assertEquals("", ContextBuilderApp.resolveLanguage("Makefile"));
    }

    private static void shouldSanitizeOutputFileLabels() {
        assertEquals("my-project", ContextBuilderApp.sanitizeFileNamePart("My Project"));
        assertEquals("raport_2026", ContextBuilderApp.sanitizeFileNamePart(" raport_2026 "));
        assertEquals("source", ContextBuilderApp.sanitizeFileNamePart("..."));
    }

    private static void shouldBuildStableOutputFileName() {
        assertEquals(
                "context-report-my-project.md",
                ContextBuilderApp.buildOutputFileName(Paths.get("/tmp/My Project"), ContextBuilderApp.Mode.REPORT)
        );
        assertEquals(
                "context-structure-my-project.md",
                ContextBuilderApp.buildOutputFileName(Paths.get("/tmp/My Project"), ContextBuilderApp.Mode.STRUCTURE)
        );
    }

    private static void shouldBuildDefaultOutputDirectoryPath() {
        assertEquals(
                Paths.get("/Users/test/Downloads").toString(),
                ContextBuilderApp.buildDefaultOutputDirectoryPath(Paths.get("/Users/test")).toString()
        );
    }

    private static void shouldFormatByteSizes() {
        assertEquals("0 B", ContextBuilderApp.formatByteSize(0L));
        assertEquals("842 B", ContextBuilderApp.formatByteSize(842L));
        assertEquals("1.0 KB", ContextBuilderApp.formatByteSize(1024L));
        assertEquals("1.5 KB", ContextBuilderApp.formatByteSize(1536L));
        assertEquals("10 KB", ContextBuilderApp.formatByteSize(10L * 1024L));
        assertEquals("1.0 MB", ContextBuilderApp.formatByteSize(1024L * 1024L));
    }

    private static void shouldParseStructureFileScope() {
        assertEquals(
                ContextBuilderApp.StructureFileScope.REPORT_FILTERS,
                ContextBuilderApp.parseStructureFileScope("report")
        );
        assertEquals(
                ContextBuilderApp.StructureFileScope.REPORT_FILTERS,
                ContextBuilderApp.parseStructureFileScope("filtrowane")
        );
        assertEquals(
                ContextBuilderApp.StructureFileScope.ALL_FILES,
                ContextBuilderApp.parseStructureFileScope("all")
        );
        assertEquals(
                ContextBuilderApp.StructureFileScope.ALL_FILES,
                ContextBuilderApp.parseStructureFileScope("wszystkie")
        );
    }

    private static void shouldApplyReportFileFiltersByMode() {
        assertTrue(ContextBuilderApp.shouldApplyReportFileFilters(
                ContextBuilderApp.Mode.REPORT,
                ContextBuilderApp.StructureFileScope.ALL_FILES
        ));
        assertTrue(ContextBuilderApp.shouldApplyReportFileFilters(
                ContextBuilderApp.Mode.STRUCTURE,
                ContextBuilderApp.StructureFileScope.REPORT_FILTERS
        ));
        assertFalse(ContextBuilderApp.shouldApplyReportFileFilters(
                ContextBuilderApp.Mode.STRUCTURE,
                ContextBuilderApp.StructureFileScope.ALL_FILES
        ));
    }

    private static Set<String> setOf(String... values) {
        Set<String> items = new LinkedHashSet<String>();
        for (String value : values) {
            items.add(value);
        }
        return items;
    }

    private static void run(String name, TestCase testCase) {
        try {
            testCase.run();
            System.out.println("[PASS] " + name);
        } catch (AssertionError error) {
            System.err.println("[FAIL] " + name + ": " + error.getMessage());
            throw error;
        } catch (Exception error) {
            System.err.println("[FAIL] " + name + ": " + error.getMessage());
            throw new RuntimeException(error);
        }
    }

    private static void assertEquals(String expected, String actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("Expected '" + expected + "' but was '" + actual + "'.");
        }
    }

    private static void assertEquals(Set<String> expected, Set<String> actual) {
        if (!expected.equals(actual)) {
            throw new AssertionError("Expected '" + expected + "' but was '" + actual + "'.");
        }
    }

    private static void assertEquals(
            ContextBuilderApp.StructureFileScope expected,
            ContextBuilderApp.StructureFileScope actual
    ) {
        if (expected != actual) {
            throw new AssertionError("Expected '" + expected + "' but was '" + actual + "'.");
        }
    }

    private static void assertTrue(boolean condition) {
        if (!condition) {
            throw new AssertionError("Expected condition to be true.");
        }
    }

    private static void assertFalse(boolean condition) {
        if (condition) {
            throw new AssertionError("Expected condition to be false.");
        }
    }

    private interface TestCase {
        void run() throws Exception;
    }
}
