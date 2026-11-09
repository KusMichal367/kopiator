// The illustration follows the job, but never holds up its result.
export function createContextFactory(root) {
    const status = root.querySelector("#factory-status");
    const motionButton = root.querySelector("#factory-motion");
    const motionLabel = motionButton.querySelector("span");
    const motionIcon = motionButton.querySelector("use");
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timers = new Set();
    let paused = false;
    let inView = true;
    let startedAt = 0;
    let pendingStart = false;
    let resultReady = false;
    let firstFrame = 0;
    let secondFrame = 0;

    function cancelSequence() {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
        firstFrame = secondFrame = 0;
        pendingStart = false;
        timers.forEach(clearTimeout);
        timers.clear();
    }

    function finishSequence() {
        const printDelay = Math.max(0, 850 - (performance.now() - startedAt));
        later(printDelay, "printing");
        later(printDelay + 550, "done");
    }

    function beginVisibleSequence() {
        if (!pendingStart || document.hidden || !inView || firstFrame || secondFrame) return;
        // Paint the closed parcel before starting a new run, including repeated clicks.
        firstFrame = requestAnimationFrame(() => {
            firstFrame = 0;
            secondFrame = requestAnimationFrame(() => {
                secondFrame = 0;
                if (!pendingStart || document.hidden || !inView) return;
                pendingStart = false;
                startedAt = performance.now();
                root.dataset.phase = "opening";
                later(360, "reading");
                if (resultReady) finishSequence();
            });
        });
    }

    function later(delay, phase) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            root.dataset.phase = phase;
        }, delay);
        timers.add(timer);
    }

    function updateMotion() {
        root.dataset.motion = paused || motionPreference.matches ? "off" : "on";
        root.dataset.visible = inView && !document.hidden ? "yes" : "no";
        motionButton.disabled = motionPreference.matches;
        motionLabel.textContent = motionPreference.matches ? "Bez ruchu" : paused ? "Wznów" : "Wstrzymaj";
        const label = motionPreference.matches
            ? "Animacje wyłączone zgodnie z ustawieniami systemu"
            : paused ? "Wznów animacje" : "Wstrzymaj animacje";
        motionButton.setAttribute("aria-label", label);
        motionButton.title = label;
        motionIcon.setAttribute("href", paused || motionPreference.matches ? "#icon-play" : "#icon-pause");
        if ((paused || motionPreference.matches) && root.dataset.state === "ready") {
            cancelSequence();
            root.dataset.phase = "done";
        } else {
            beginVisibleSequence();
        }
    }

    motionButton.addEventListener("click", () => {
        paused = !paused;
        updateMotion();
    });
    motionPreference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateMotion);
    // Keep the machine still while it is outside the viewport.
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            updateMotion();
        }).observe(root);
    }
    updateMotion();

    return {
        reset(hasFile = false) {
            cancelSequence();
            resultReady = false;
            root.dataset.state = hasFile ? "loaded" : "idle";
            root.dataset.phase = hasFile ? "loaded" : "idle";
            status.textContent = hasFile ? "Paczka czeka na uruchomienie." : "Kopi czeka na paczkę ZIP.";
        },
        start() {
            cancelSequence();
            firstFrame = secondFrame = 0;
            resultReady = false;
            pendingStart = true;
            root.dataset.state = "working";
            root.dataset.phase = "loaded";
            status.textContent = "Kopi otwiera paczkę i czyta pliki.";
            const bounds = root.getBoundingClientRect();
            if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
                root.scrollIntoView({ block: "center", behavior: "instant" });
            }
            beginVisibleSequence();
        },
        complete() {
            resultReady = true;
            root.dataset.state = "ready";
            status.textContent = "Markdown gotowy. Możesz go już skopiować.";
            if (paused || motionPreference.matches) {
                cancelSequence();
                root.dataset.phase = "done";
                return;
            }
            // A fast ZIP still gets a short story. Only the illustration waits.
            if (!pendingStart) finishSequence();
        },
        fail() {
            cancelSequence();
            root.dataset.state = "error";
            root.dataset.phase = "error";
            status.textContent = "Wybierz poprawne archiwum ZIP.";
        }
    };
}
