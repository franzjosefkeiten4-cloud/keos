import "./dashboard.js";

function renderVorgang(vorgang) {
    const container = document.getElementById('loadedVorgang');
    if (!container) return;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value !== undefined && value !== null ? String(value) : '';
    };

    setText('vorgang-titel', vorgang.titel);
    setText('vorgang-status', vorgang.status);
    setText('vorgang-prioritaet', vorgang.prioritaet);
    setText('vorgang-kontext', vorgang.kontext);
    setText('vorgang-verantwortlich', vorgang.verantwortlich);

    const renderList = (id, items) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        if (!Array.isArray(items) || items.length === 0) {
            el.textContent = 'Keine Einträge vorhanden.';
            return;
        }
        items.forEach(item => {
            const p = document.createElement('p');
            if (item === null || item === undefined) {
                p.textContent = '';
            } else if (typeof item === 'string' || typeof item === 'number') {
                p.textContent = String(item);
            } else if (typeof item === 'object') {
                p.textContent = item.text || item.titel || item.name || JSON.stringify(item);
            } else {
                p.textContent = String(item);
            }
            el.appendChild(p);
        });
    };

    const formatTimestamp = (value) => {
        if (!value) return 'Kein Zeitstempel';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Ungültiges Datum';
        return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const timelineTypeConfig = {
        observation: { icon: '👀', title: 'Beobachtung' },
        followup: { icon: '❓', title: 'Rückfrage' },
        insight: { icon: '💡', title: 'Erkenntnis' },
        decision: { icon: '✅', title: 'Entscheidung' },
        experience: { icon: '⭐', title: 'Erfahrung' },
        default: { icon: '🕘', title: 'Ereignis' }
    };

    const guessEventType = (item) => {
        if (!item || typeof item !== 'object') return 'default';
        if (item.type) return item.type;
        if (item.titel && item.titel.toLowerCase().includes('entscheidung')) return 'decision';
        if (item.quelle && item.quelle.toLowerCase().includes('ereignis')) return 'observation';
        return 'observation';
    };

    const normalizeTimelineItem = (item, type, defaults = {}) => {
        const eventType = (item && item.type) || type || guessEventType(item) || 'default';
        return {
            id: item && item.id ? item.id : `TL-${Math.random().toString(36).slice(2, 10)}`,
            timestamp: item && (item.erstelltAm || item.timestamp || item.createdAt || item.datum) ? item.erstelltAm || item.timestamp || item.createdAt || item.datum : null,
            type: eventType,
            headline: item && (item.titel || item.headline || item.name) ? item.titel || item.headline || item.name : defaults.headline || timelineTypeConfig[eventType]?.title || 'Ereignis',
            description: item && (item.text || item.beschreibung || item.description || item.summary) ? item.text || item.beschreibung || item.description || item.summary : defaults.description || '',
            meta: item && item.quelle ? item.quelle : defaults.meta || ''
        };
    };

    const buildTimelineItems = () => {
        const localItems = loadLocal().map((item) => normalizeTimelineItem(item, item.type || 'observation', { headline: item.text || 'Beobachtung', description: item.quelle ? `Quelle: ${item.quelle}` : '' }));
        const eventItems = (vorgang.ereignisse || []).map((item) => normalizeTimelineItem(item, 'observation', { headline: item.text || 'Beobachtung', description: item.beschreibung || item.quelle || '' }));
        const decisionItems = (vorgang.entscheidungen || []).map((item) => normalizeTimelineItem(item, 'decision', { headline: item.titel || 'Entscheidung', description: item.status ? `Status: ${item.status}` : item.quelle || '' }));
        const experienceItems = (vorgang.erfahrungen || []).map((item) => normalizeTimelineItem(item, 'experience', { headline: item.titel || item.text || 'Erfahrung', description: item.beschreibung || item.quelle || '' }));

        return [...eventItems, ...localItems, ...decisionItems, ...experienceItems].sort((a, b) => {
            if (a.timestamp && b.timestamp) {
                return new Date(a.timestamp) - new Date(b.timestamp);
            }
            if (a.timestamp) return -1;
            if (b.timestamp) return 1;
            return 0;
        });
    };

    const renderTimeline = (vorgangData) => {
        const container = document.getElementById('vorgang-timeline');
        if (!container) return;
        const items = buildTimelineItems();
        container.innerHTML = '';
        if (!items.length) {
            container.textContent = 'Keine Timeline-Einträge vorhanden.';
            return;
        }

        items.forEach((item) => {
            const entry = document.createElement('div');
            entry.className = 'timeline-item';

            const icon = document.createElement('div');
            icon.className = 'timeline-icon';
            icon.textContent = timelineTypeConfig[item.type]?.icon || timelineTypeConfig.default.icon;

            const content = document.createElement('div');
            content.className = 'timeline-content';

            const meta = document.createElement('div');
            meta.className = 'timeline-meta';
            meta.textContent = `${timelineTypeConfig[item.type]?.title || timelineTypeConfig.default.title} · ${formatTimestamp(item.timestamp)}`;
            if (item.meta) {
                meta.textContent += ` · ${item.meta}`;
            }

            const headline = document.createElement('h5');
            headline.className = 'timeline-headline';
            headline.textContent = item.headline;

            const description = document.createElement('p');
            description.className = 'timeline-description';
            description.textContent = item.description || 'Keine zusätzliche Beschreibung.';

            content.appendChild(meta);
            content.appendChild(headline);
            content.appendChild(description);
            entry.appendChild(icon);
            entry.appendChild(content);
            container.appendChild(entry);
        });
    };

    // localStorage key for this vorgang
    const localKey = `keosVorgangEvents:${vorgang.id}`;

    const loadLocal = () => {
        try {
            const raw = localStorage.getItem(localKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const saveLocal = (arr) => {
        try {
            localStorage.setItem(localKey, JSON.stringify(arr || []));
        } catch (e) {
            console.error('Speichern im localStorage fehlgeschlagen', e);
        }
    };

    // Merge original Ereignisse with local ones (original first)
    const combinedEreignisse = (vorgang.ereignisse || []).concat(loadLocal());
    renderList('vorgang-ereignisse', combinedEreignisse);
    renderList('vorgang-entscheidungen', vorgang.entscheidungen);
    renderList('vorgang-aktionen', vorgang.aktionen);
    renderList('vorgang-erfahrungen', vorgang.erfahrungen);
    renderTimeline(vorgang);

    // Setup add-event UI (only for Ereignisse)
    const input = document.getElementById('vorgang-ereignis-input');
    const button = document.getElementById('addEreignisButton');
    if (input && button) {
        const addHandler = () => {
            const raw = input.value || '';
            const text = raw.trim();
            if (!text) return;

            const newEvent = {
                id: `ER-${Date.now()}`,
                text: text,
                erstelltAm: new Date().toISOString(),
                quelle: 'manuell'
            };

            const local = loadLocal();
            local.push(newEvent);
            saveLocal(local);

            // Re-render Ereignisse: original + local
            const merged = (vorgang.ereignisse || []).concat(local);
            renderList('vorgang-ereignisse', merged);

            input.value = '';
            input.focus();
        };

        // Replace any existing handlers
        button.onclick = addHandler;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addHandler();
            }
        };
    }
}

async function loadVorgang() {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");

        if (!response.ok) {
            console.error("Vorgang konnte nicht geladen werden:", response.status, response.statusText);
            return;
        }

        const vorgang = await response.json();
        console.log("Vorgang geladen:", vorgang);
        renderVorgang(vorgang);
    } catch (error) {
        console.error("Vorgang konnte nicht geladen werden:", error);
    }
}

loadVorgang();

async function createDecisionFromEvent() {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;

        const vorgang = await response.json();

        // load local events (if any)
        const localKey = `keosVorgangEvents:${vorgang.id}`;
        let local = [];
        try {
            const raw = localStorage.getItem(localKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) local = parsed;
            }
        } catch (e) {
            local = [];
        }

        const combined = (vorgang.ereignisse || []).concat(local);
        if (!combined || combined.length === 0) return; // nothing to do

        if (!Array.isArray(vorgang.entscheidungen)) vorgang.entscheidungen = [];

        const neueEntscheidung = {
            id: `DEC-${Date.now()}`,
            titel: "Liegesituation prüfen",
            quelle: "Ereignis",
            status: "offen",
            erstelltAm: new Date().toISOString(),
            type: 'decision'
        };

        vorgang.entscheidungen.push(neueEntscheidung);

        // re-render in-memory vorgang
        renderVorgang(vorgang);
        try { appendSystemLog('Entscheidung erzeugt', vorgang.id, 'Entscheidung "Liegesituation prüfen" erzeugt'); } catch (e) {}
    } catch (e) {
        console.error('Fehler beim Erzeugen der Entscheidung:', e);
    }
}

const createDecisionBtn = document.getElementById('createDecisionFromEvent');
if (createDecisionBtn) createDecisionBtn.onclick = createDecisionFromEvent;

const speechController = (() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let activeSession = null;
    let stopRequested = false;
    let endPromise = null;
    let endResolver = null;
    let state = 'idle';

    const updateUI = (session, status) => {
        if (!session) return;
        const { button, message, stopButton } = session;
        if (button) button.textContent = status === 'capturing' ? '🛑' : '🎙️';
        if (stopButton) stopButton.style.display = status === 'capturing' ? 'inline-block' : 'none';
        if (message) {
            if (status === 'capturing') message.textContent = 'Aufnahme läuft...';
            else if (status === 'stopping') message.textContent = 'Aufnahme wird beendet...';
            else if (status === 'idle') message.textContent = 'Aufnahme beendet.';
        }
    };

    const stopActive = async () => {
        if (!recognition) return;
        if (stopRequested) return endPromise;
        stopRequested = true;
        if (activeSession) updateUI(activeSession, 'stopping');
        try { recognition.stop(); } catch (e) {}
        endPromise = new Promise((resolve) => { endResolver = resolve; });
        return endPromise;
    };

    const createRecognition = (session) => {
        const r = new SpeechRecognition();
        r.lang = 'de-DE';
        r.interimResults = true;
        r.continuous = true;
        r.maxAlternatives = 1;

        let baseText = session.input.value || '';

        r.onstart = () => {
            state = 'capturing';
            updateUI(session, 'capturing');
        };

        r.onresult = (event) => {
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i++) {
                const rItem = event.results[i];
                const t = rItem[0] && rItem[0].transcript ? rItem[0].transcript : '';
                if (rItem.isFinal) finalText += (finalText ? ' ' : '') + t;
                else interimText += (interimText ? ' ' : '') + t;
            }
            const combined = (baseText ? baseText + ' ' : '') + (finalText ? finalText + ' ' : '') + interimText;
            const normalized = combined.trim();
            session.input.value = normalized;
            if (typeof session.onResult === 'function') session.onResult(normalized);
            if (session.message) session.message.textContent = interimText ? 'Ich höre weiter zu …' : 'Erkannter Text wurde übernommen.';
        };

        r.onend = () => {
            const endedSession = activeSession;
            recognition = null;
            activeSession = null;
            const wasStopped = stopRequested;
            stopRequested = false;
            if (wasStopped) {
                state = 'idle';
                updateUI(endedSession, 'idle');
                if (endResolver) {
                    endResolver();
                    endResolver = null;
                }
                return;
            }
            state = 'idle';
            updateUI(endedSession, 'idle');
            if (endedSession && endedSession.autoRestart) {
                setTimeout(async () => {
                    if (!stopRequested && !recognition) {
                        try {
                            await startSession(endedSession);
                        } catch (e) {
                            if (endedSession.message) endedSession.message.textContent = 'Spracherkennung konnte nicht neu gestartet werden.';
                        }
                    }
                }, 300);
            }
        };

        r.onerror = (event) => {
            if (session.message) session.message.textContent = `Spracherkennung fehlgeschlagen: ${event.error || 'unbekannter Fehler'}`;
            state = 'idle';
            updateUI(session, 'idle');
            if (endResolver) {
                endResolver();
                endResolver = null;
            }
            recognition = null;
            activeSession = null;
            stopRequested = false;
        };

        return r;
    };

    const startSession = async (session) => {
        if (!SpeechRecognition) {
            if (session.message) session.message.textContent = 'Spracherkennung wird in diesem Browser nicht unterstützt.';
            if (session.button) session.button.disabled = true;
            if (session.stopButton) session.stopButton.style.display = 'none';
            return null;
        }
        if (recognition) await stopActive();
        activeSession = session;
        stopRequested = false;
        recognition = createRecognition(session);
        try {
            recognition.start();
        } catch (e) {
            state = 'idle';
            updateUI(session, 'idle');
            recognition = null;
            activeSession = null;
            if (session.message) session.message.textContent = 'Spracherkennung konnte nicht gestartet werden.';
            return null;
        }
        return recognition;
    };

    const registerSpeechControl = (button, input, message, stopButton, options = {}) => {
        if (!button || !input) return null;
        const session = {
            button,
            input,
            message,
            stopButton,
            autoRestart: options.autoRestart !== false,
            onResult: options.onResult
        };

        button.onclick = async () => {
            if (activeSession === session && recognition && state === 'capturing') {
                await stopActive();
                return;
            }
            await startSession(session);
        };

        if (stopButton) {
            stopButton.style.display = 'none';
            stopButton.onclick = async () => {
                await stopActive();
            };
        }

        return session;
    };

    return {
        registerSpeechControl,
        startSession,
        stopActive,
        isActive: () => !!recognition,
        isIdle: () => state === 'idle'
    };
})();

const initSpeechRecognitionInput = () => {
    const input = document.getElementById('vorgang-ereignis-input');
    const button = document.getElementById('speechInputButton');
    const message = document.getElementById('speechSupportMessage');
    const stopBtn = document.getElementById('speechStopButton');
    if (!button || !input || !message) return;
    speechController.registerSpeechControl(button, input, message, stopBtn, { autoRestart: true });
};

window.addEventListener('load', initSpeechRecognitionInput);

const pilotFeedbackKey = 'keosPilotFeedback';
const initPilotFeedback = () => {
    const button = document.getElementById('pilotFeedbackButton');
    const dialog = document.getElementById('pilotFeedbackDialog');
    const send = document.getElementById('pilotFeedbackSend');
    const cancel = document.getElementById('pilotFeedbackCancel');
    const liked = document.getElementById('pilotFeedbackLiked');
    const unclear = document.getElementById('pilotFeedbackUnclear');
    const idea = document.getElementById('pilotFeedbackIdea');
    if (!button || !dialog || !send || !cancel || !liked || !unclear || !idea) return;

    button.onclick = () => {
        dialog.style.display = 'flex';
    };
    cancel.onclick = () => {
        dialog.style.display = 'none';
        liked.value = '';
        unclear.value = '';
        idea.value = '';
    };
    send.onclick = () => {
        const feedback = {
            timestamp: new Date().toISOString(),
            liked: liked.value.trim(),
            unclear: unclear.value.trim(),
            idea: idea.value.trim()
        };
        try {
            const raw = localStorage.getItem(pilotFeedbackKey);
            const stored = raw ? JSON.parse(raw) : [];
            const list = Array.isArray(stored) ? stored : [];
            list.push(feedback);
            localStorage.setItem(pilotFeedbackKey, JSON.stringify(list));
        } catch (e) {
            console.error('Feedback konnte nicht gespeichert werden', e);
        }
        console.log('Pilot-Feedback:', feedback);
        dialog.style.display = 'none';
        liked.value = '';
        unclear.value = '';
        idea.value = '';
    };

    document.body.style.paddingBottom = '64px';
};

window.addEventListener('load', initPilotFeedback);

let workplaceMode = null;
let captureType = null;
const setCaptureType = (type) => {
    captureType = type;
    const captureButtons = [
        document.getElementById('captureObservation'),
        document.getElementById('captureIdea'),
        document.getElementById('captureProblem'),
        document.getElementById('captureDecision')
    ];
    captureButtons.forEach((btn) => {
        if (!btn) return;
        btn.className = btn.id === `capture${type.charAt(0).toUpperCase() + type.slice(1)}` ? 'primary' : 'secondary';
    });
    const modePicker = document.getElementById('workplaceModePicker');
    if (modePicker) {
        modePicker.style.display = captureType ? 'block' : 'none';
        if (captureType) {
            setTimeout(() => {
                const firstModeBtn = document.getElementById('workplaceModeFree');
                if (firstModeBtn) firstModeBtn.focus();
            }, 0);
        }
    }
    setWorkplaceMode(null);
};

const setWorkplaceMode = (mode) => {
    workplaceMode = mode === 'guided' ? 'guided' : mode === 'free' ? 'free' : null;
    const freeBtn = document.getElementById('workplaceModeFree');
    const guidedBtn = document.getElementById('workplaceModeGuided');
    const hint = document.getElementById('workplaceModeHint');
    const freeArea = document.getElementById('workplaceFreeArea');
    const guidedArea = document.getElementById('workplaceGuidedArea');

    if (freeBtn && guidedBtn) {
        if (workplaceMode === 'free') {
            freeBtn.className = 'primary';
            guidedBtn.className = 'secondary';
        } else if (workplaceMode === 'guided') {
            freeBtn.className = 'secondary';
            guidedBtn.className = 'primary';
        } else {
            freeBtn.className = 'secondary';
            guidedBtn.className = 'secondary';
        }
    }
    if (freeArea) {
        freeArea.style.display = workplaceMode === 'free' ? 'block' : 'none';
    }
    if (guidedArea) {
        guidedArea.style.display = workplaceMode === 'guided' ? 'block' : 'none';
    }
    if (hint) {
        if (workplaceMode === 'free') {
            hint.textContent = 'Erzähle einfach in deinen eigenen Worten. Ich höre zunächst nur zu.';
        } else if (workplaceMode === 'guided') {
            hint.textContent = 'Ich stelle dir einige Fragen und strukturiere deine Beobachtung.';
        } else {
            hint.textContent = 'Wähle einen Modus, um mit deiner Beobachtung zu beginnen.';
        }
    }
    if (workplaceMode === 'free') {
        setTimeout(() => {
            const input = document.getElementById('workplaceInput');
            if (input) input.focus();
        }, 0);
    }
    if (workplaceMode === 'guided') {
        setTimeout(() => {
            const startInterviewBtn = document.getElementById('workplaceStartInterview');
            if (startInterviewBtn) startInterviewBtn.focus();
        }, 0);
    }
};

// Beobachtungen: Interview und Anzeige (keine bestehenden Funktionen ändern)

// --- Internes System-Log (lokal) ---
const systemLogKey = 'keosSystemLog';
const appendSystemLog = (eventType, vorgangId, description) => {
    try {
        const entry = {
            timestamp: new Date().toISOString(),
            eventType: String(eventType),
            vorgangId: String(vorgangId || ''),
            description: String(description || '')
        };
        const raw = localStorage.getItem(systemLogKey);
        let arr = [];
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                arr = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                arr = [];
            }
        }
        arr.push(entry);
        localStorage.setItem(systemLogKey, JSON.stringify(arr));
    } catch (e) {
        // fallback: write minimal console log
        console.warn('SystemLog konnte nicht geschrieben werden', e);
    }
};

const loadSystemLog = () => {
    try {
        const raw = localStorage.getItem(systemLogKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

// Bind the workplace mode selection and controls
window.addEventListener('load', () => {
    const intentCapture = document.getElementById('intentCapture');
    const intentLookup = document.getElementById('intentLookup');
    const intentContinue = document.getElementById('intentContinue');
    const intentOrganize = document.getElementById('intentOrganize');
    const intentCaptureArea = document.getElementById('intentCaptureArea');
    const captureObservation = document.getElementById('captureObservation');
    const captureIdea = document.getElementById('captureIdea');
    const captureProblem = document.getElementById('captureProblem');
    const captureDecision = document.getElementById('captureDecision');
    const freeModeBtn = document.getElementById('workplaceModeFree');
    const guidedModeBtn = document.getElementById('workplaceModeGuided');
    const speechBtn = document.getElementById('workplaceSpeechButton');
    const workplaceInput = document.getElementById('workplaceInput');
    const workplaceStop = document.getElementById('workplaceStopRecording');
    const workplaceMsg = document.getElementById('workplaceSpeechMessage');
    const finishBtn = document.getElementById('workplaceFinish');
    const startInterviewBtn = document.getElementById('workplaceStartInterview');

    if (intentCapture && intentCaptureArea) {
        intentCapture.onclick = () => {
            intentCaptureArea.style.display = 'block';
            intentCapture.className = 'primary';
            if (intentLookup) intentLookup.className = 'secondary';
            if (intentContinue) intentContinue.className = 'secondary';
            if (intentOrganize) intentOrganize.className = 'secondary';
            if (captureObservation) captureObservation.focus();
        };
    }
    if (intentLookup) {
        intentLookup.onclick = () => {
            intentLookup.className = 'primary';
            if (intentCapture) intentCapture.className = 'secondary';
            if (intentContinue) intentContinue.className = 'secondary';
            if (intentOrganize) intentOrganize.className = 'secondary';
        };
    }
    if (intentContinue) {
        intentContinue.onclick = () => {
            intentContinue.className = 'primary';
            if (intentCapture) intentCapture.className = 'secondary';
            if (intentLookup) intentLookup.className = 'secondary';
            if (intentOrganize) intentOrganize.className = 'secondary';
        };
    }
    if (intentOrganize) {
        intentOrganize.onclick = () => {
            intentOrganize.className = 'primary';
            if (intentCapture) intentCapture.className = 'secondary';
            if (intentLookup) intentLookup.className = 'secondary';
            if (intentContinue) intentContinue.className = 'secondary';
        };
    }

    const setCaptureButtons = () => {
        const buttons = [captureObservation, captureIdea, captureProblem, captureDecision];
        buttons.forEach((btn) => {
            if (!btn) return;
            btn.className = 'secondary';
            btn.onclick = () => {
                const type = btn.id.replace('capture', '').toLowerCase();
                setCaptureType(type);
                btn.className = 'primary';
            };
        });
    };

    setCaptureButtons();

    if (freeModeBtn) freeModeBtn.onclick = () => {
        setWorkplaceMode('free');
    };
    if (guidedModeBtn) guidedModeBtn.onclick = () => {
        setWorkplaceMode('guided');
    };

    if (speechBtn && workplaceInput) {
        speechController.registerSpeechControl(speechBtn, workplaceInput, workplaceMsg, workplaceStop, { autoRestart: true });
    }

    if (finishBtn) {
        finishBtn.onclick = () => {
            if (typeof startFreeMode === 'function') startFreeMode();
        };
    }

    if (startInterviewBtn) {
        startInterviewBtn.onclick = () => {
            if (typeof enhancedStartObservationInterviewWithConfirmation === 'function') {
                enhancedStartObservationInterviewWithConfirmation();
            } else if (typeof enhancedStartObservationInterview === 'function') {
                enhancedStartObservationInterview();
            }
        };
    }
});
const observationsKeyFor = (vorgangId) => `keosVorgangObservations:${vorgangId || 'unassigned'}`;

const DEFAULT_OBSERVATION_USER = 'lokal';

const loadObservationsLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(observationsKeyFor(vorgangId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

const saveObservationsLocal = (vorgangId, arr) => {
    try {
        localStorage.setItem(observationsKeyFor(vorgangId), JSON.stringify(arr || []));
    } catch (e) {
        console.error('Speichern der Beobachtungen fehlgeschlagen', e);
    }
};

const updateObservationLocal = (vorgangId, updatedObs) => {
    try {
        const observations = loadObservationsLocal(vorgangId);
        const idx = observations.findIndex((item) => item.id === updatedObs.id);
        if (idx >= 0) {
            observations[idx] = updatedObs;
            saveObservationsLocal(vorgangId, observations);
        }
    } catch (e) {
        console.error('Aktualisieren der Beobachtung fehlgeschlagen', e);
    }
};

const applyObservationConfirmation = (vorgang, obsId, confirmedText) => {
    const observations = loadObservationsLocal(vorgang?.id);
    const idx = observations.findIndex((item) => item.id === obsId);
    if (idx < 0) return null;
    const obs = observations[idx];
    obs.type = 'observation';
    obs.confirmedText = confirmedText;
    obs.rawInput = obs.rawInput || obs.wasIstPassiert || '';
    obs.createdBy = obs.createdBy || DEFAULT_OBSERVATION_USER;
    obs.processId = obs.processId !== undefined ? obs.processId : (vorgang?.id || null);
    obs.status = obs.status || (vorgang?.id ? 'documented' : 'unassigned');
    obs.nextStepType = obs.nextStepType || null;
    observations[idx] = obs;
    saveObservationsLocal(vorgang?.id, observations);
    return obs;
};

const updateObservationNextStep = (vorgang, obsId, nextStepType, status) => {
    const observations = loadObservationsLocal(vorgang?.id);
    const idx = observations.findIndex((item) => item.id === obsId);
    if (idx < 0) return null;
    const obs = observations[idx];
    obs.nextStepType = nextStepType;
    obs.status = status;
    saveObservationsLocal(vorgang?.id, observations);
    return obs;
};

const renderBeobachtungen = (vorgang) => {
    const el = document.getElementById('vorgang-beobachtungen');
    if (!el) return;
    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    const local = loadObservationsLocal(vorgang.id);
    const merged = originals.concat(local);
    el.innerHTML = '';
    if (!Array.isArray(merged) || merged.length === 0) {
        el.textContent = 'Keine Einträge vorhanden.';
        return;
    }
    merged.forEach(obs => {
        const container = document.createElement('div');
        container.className = 'beobachtung-item';
        const h = document.createElement('p');
        h.textContent = `ID: ${obs.id}`;
        container.appendChild(h);
        const q1 = document.createElement('p');
        q1.textContent = `1) Was ist passiert? ${obs.wasIstPassiert || ''}`;
        container.appendChild(q1);
        const q2 = document.createElement('p');
        q2.textContent = `2) Warum ist das wichtig? ${obs.warumWichtig || ''}`;
        container.appendChild(q2);
        const q3 = document.createElement('p');
        q3.textContent = `3) Welche Auswirkung hat das? ${obs.auswirkung || ''}`;
        container.appendChild(q3);
        const q4 = document.createElement('p');
        q4.textContent = `4) Was ist sicher? ${obs.wasIstSicher || ''}`;
        container.appendChild(q4);
        const q5 = document.createElement('p');
        q5.textContent = `5) Was vermutest du? ${obs.wasVermutestDu || ''}`;
        container.appendChild(q5);
        if (obs.werIstBetroffen) {
            const q6 = document.createElement('p');
            q6.textContent = `Wer betroffen: ${obs.werIstBetroffen}`;
            container.appendChild(q6);
        }
        if (obs.entscheidung) {
            const q7 = document.createElement('p');
            q7.textContent = `Entscheidung: ${obs.entscheidung}`;
            container.appendChild(q7);
        }
        // show recap/meta if available
        const metaStore = loadObservationsMetaLocal(vorgang.id);
        const meta = metaStore && metaStore[obs.id] ? metaStore[obs.id] : null;
        if (meta) {
            if (meta.confirmed && meta.confirmedRecap) {
                const conf = document.createElement('p');
                conf.textContent = `Bestätigte Rekapitulation: ${meta.confirmedRecap}`;
                container.appendChild(conf);
            } else if (meta.recap) {
                const pre = document.createElement('p');
                pre.textContent = `Vorläufige Rekapitulation: ${meta.recap}`;
                container.appendChild(pre);
            }
        }
        el.appendChild(container);
    });
};

const startObservationInterview = () => {
    return new Promise(async (resolve) => {
        try {
            const response = await fetch("../data/vorgaenge/VG-0001.json");
            if (!response.ok) return resolve(null);
            const vorgang = await response.json();

            const questions = [
                'Was ist passiert?',
                'Warum ist das wichtig?',
                'Welche Auswirkung hat das?',
                'Was ist sicher?',
                'Was vermutest du?'
            ];

            const modal = document.getElementById('observationModal');
            const questionEl = document.getElementById('modalQuestion');
            const progressEl = document.getElementById('modalProgress');
            const input = document.getElementById('modalInput');
            const mic = document.getElementById('modalMic');
            const modalStop = document.getElementById('modalStopRecording');
            const speechMsg = document.getElementById('modalSpeechMessage');
            const reactionEl = document.getElementById('modalReaction');
            const nextBtn = document.getElementById('modalNext');
            const cancelBtn = document.getElementById('modalCancel');
            if (!modal || !questionEl || !progressEl || !input || !mic || !nextBtn || !cancelBtn) {
                console.error('Interview Modal Elemente fehlen');
                return resolve(null);
            }

            let current = 0;
            const answers = Array(questions.length).fill('');

            const openModal = () => {
                modal.style.display = 'flex';
                updateView();
            };

            const closeModal = () => {
                modal.style.display = 'none';
            };

            const updateView = async () => {
                questionEl.textContent = questions[current];
                progressEl.textContent = `Frage ${current + 1} von ${questions.length}`;
                input.value = answers[current] || '';
                if (speechMsg) speechMsg.textContent = '';
                if (reactionEl) reactionEl.textContent = '';
                await speechController.startSession({
                    button: mic,
                    input,
                    message: speechMsg,
                    stopButton: modalStop,
                    autoRestart: true,
                    onResult: (text) => { input.value = text; }
                });
                nextBtn.disabled = false;
                setTimeout(() => {
                    input.focus();
                }, 0);
            };

            const cleanupHandlers = async () => {
                await speechController.stopActive();
                nextBtn.onclick = null;
                cancelBtn.onclick = null;
            };

            const abort = async () => {
                await cleanupHandlers();
                closeModal();
            };

            const handleKeydown = async (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    await abort();
                    document.removeEventListener('keydown', handleKeydown);
                    return resolve(null);
                }
                if (event.key === 'Enter' && document.activeElement === input) {
                    event.preventDefault();
                    nextBtn.click();
                }
            };

            openModal();
            setTimeout(() => input.focus(), 0);
            document.addEventListener('keydown', handleKeydown);

            cancelBtn.onclick = async () => {
                await abort();
                document.removeEventListener('keydown', handleKeydown);
                return resolve(null);
            };

            nextBtn.onclick = async () => {
                answers[current] = (input.value || '').trim();
                await speechController.stopActive();
                if (current === questions.length - 1) {
                    const anyNonEmpty = answers.some(a => a && a.length > 0);
                    if (!anyNonEmpty) {
                        await cleanupHandlers(); closeModal(); return resolve(null);
                    }
                    const obs = {
                        id: `BE-${Date.now()}`,
                        wasIstPassiert: answers[0],
                        warumWichtig: answers[1],
                        auswirkung: answers[2],
                        wasIstSicher: answers[3],
                        wasVermutestDu: answers[4],
                        erstelltAm: new Date().toISOString(),
                        quelle: 'manuell'
                    };
                    const local = loadObservationsLocal(vorgang.id);
                    local.push(obs);
                    saveObservationsLocal(vorgang.id, local);
                    try { appendSystemLog('Beobachtung erstellt', vorgang.id, `Beobachtung ${obs.id} erstellt`); } catch (e) {}
                    await cleanupHandlers(); document.removeEventListener('keydown', handleKeydown); closeModal(); renderBeobachtungen(vorgang);
                    return resolve(obs);
                }
                const reactions = [
                    'Danke.',
                    'Verstanden.',
                    'Das habe ich notiert.',
                    'Ich glaube, ich verstehe.'
                ];
                const pick = reactions[Math.floor(Math.random() * reactions.length)];
                if (reactionEl) reactionEl.textContent = pick;
                nextBtn.disabled = true;
                setTimeout(() => {
                    current += 1;
                    updateView();
                }, 900);
            };

        } catch (e) {
            console.error('Beobachtungs-Interview fehlgeschlagen', e);
            return resolve(null);
        }
    });
};

const startFreeMode = () => {
    return new Promise(async (resolve) => {
        try {
            const response = await fetch("../data/vorgaenge/VG-0001.json");
            if (!response.ok) return resolve(null);
            const vorgang = await response.json();

            const input = document.getElementById('workplaceInput');
            const msg = document.getElementById('workplaceSpeechMessage');
            if (!input) return resolve(null);

            await speechController.stopActive();
            const text = (input.value || '').trim();
            if (!text) {
                if (msg) msg.textContent = 'Bitte erzähle zuerst etwas, bevor du fertig bist.';
                return resolve(null);
            }

            const obs = {
                id: `BE-${Date.now()}`,
                wasIstPassiert: text,
                warumWichtig: '',
                auswirkung: '',
                wasIstSicher: '',
                wasVermutestDu: '',
                werIstBetroffen: '',
                entscheidung: '',
                erstelltAm: new Date().toISOString(),
                quelle: 'frei'
            };
            const local = loadObservationsLocal(vorgang.id);
            local.push(obs);
            saveObservationsLocal(vorgang.id, local);
            try { appendSystemLog('Beobachtung erstellt (frei)', vorgang.id, `Beobachtung ${obs.id} erstellt (frei)`); } catch (e) {}
            const followUps = generateFollowUpQuestions(obs);
            if (followUps.length > 0) {
                await askMissingInfoFollowUpQuestions(vorgang, obs, followUps);
            }
            renderBeobachtungen(vorgang);
            const gen = generateSummaryFromAnswers([
                obs.wasIstPassiert,
                obs.warumWichtig,
                obs.auswirkung,
                obs.wasIstSicher,
                obs.wasVermutestDu,
                obs.werIstBetroffen,
                obs.entscheidung
            ]);
            showGeneratedSummary(gen, vorgang);
            showRecapUI(vorgang, gen, obs.id);
            return resolve(obs);
        } catch (e) {
            console.error('Freier Modus fehlgeschlagen', e);
            return resolve(null);
        }
    });
};

const obsBtn = document.getElementById('startObservationInterview');

// --- Summary generation and local save (rule-based, no AI) ---
const summaryKeyFor = (vorgangId) => `keosVorgangSummary:${vorgangId}`;
const loadSummaryLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(summaryKeyFor(vorgangId));
        if (!raw) return null;
        return String(raw);
    } catch (e) {
        return null;
    }
};
const saveSummaryLocal = (vorgangId, text) => {
    try {
        localStorage.setItem(summaryKeyFor(vorgangId), String(text || ''));
    } catch (e) {
        console.error('Speichern der Zusammenfassung fehlgeschlagen', e);
    }
};

const renderSummary = (vorgang) => {
    const display = document.getElementById('summaryDisplay');
    const actions = document.getElementById('summaryActions');
    const editor = document.getElementById('summaryEditor');
    const textarea = document.getElementById('summaryTextarea');
    if (!display) return;

    const saved = loadSummaryLocal(vorgang.id);
    if (saved) {
        display.textContent = saved;
        if (actions) actions.style.display = 'block';
    } else {
        display.textContent = 'Keine Zusammenfassung vorhanden.';
        if (actions) actions.style.display = 'none';
    }
    if (editor) editor.style.display = 'none';
    if (textarea) textarea.value = '';

    // wire action buttons
    const adoptBtn = document.getElementById('summaryAdopt');
    const editBtn = document.getElementById('summaryEdit');
    const saveBtn = document.getElementById('summarySave');
    const cancelBtn = document.getElementById('summaryCancel');

    if (adoptBtn) {
        adoptBtn.onclick = () => {
            const current = display.textContent || '';
            if (current && current !== 'Keine Zusammenfassung vorhanden.') {
                saveSummaryLocal(vorgang.id, current);
                try { appendSystemLog('Zusammenfassung bestätigt', vorgang.id, 'Zusammenfassung übernommen'); } catch (e) {}
                renderSummary(vorgang);
            }
        };
    }

    if (editBtn) {
        editBtn.onclick = () => {
            if (!editor || !textarea) return;
            textarea.value = display.textContent === 'Keine Zusammenfassung vorhanden.' ? '' : display.textContent;
            editor.style.display = 'block';
            if (actions) actions.style.display = 'none';
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            if (!textarea) return;
            const txt = textarea.value.trim();
            if (!txt) return;
            saveSummaryLocal(vorgang.id, txt);
            try { appendSystemLog('Zusammenfassung bestätigt', vorgang.id, 'Zusammenfassung übernommen'); } catch (e) {}
            renderSummary(vorgang);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (editor) editor.style.display = 'none';
            if (actions) actions.style.display = saved ? 'block' : 'none';
        };
    }
};

const generateSummaryFromAnswers = (answers) => {
    // simple rule-based concatenation from the known observation fields
    const a = Array.isArray(answers) ? answers.map(x => x ? x.trim() : '') : [];
    const parts = [];
    if (a[0]) parts.push(`Beobachtung: ${a[0]}.`);
    if (a[1]) parts.push(`Wichtigkeit: ${a[1]}.`);
    if (a[2]) parts.push(`Auswirkung: ${a[2]}.`);
    if (a[3]) parts.push(`Sicher ist: ${a[3]}.`);
    if (a[4]) parts.push(`Vermutung: ${a[4]}.`);
    if (a[5]) parts.push(`Betroffene: ${a[5]}.`);
    if (a[6]) parts.push(`Entscheidung: ${a[6]}.`);
    return parts.join(' ');
};

const hasAffectedEntityInText = (text) => {
    return /\b(Mitarbeiter|Kollege|Kollegin|Kunde|Gast|Bewohner|Team|Abteilung|Person|Eltern|Kind|Patient|Firma|Chef|Mann|Frau|Familie|Nachbar)\b/i.test(text);
};

const hasImportancePhraseInText = (text) => {
    return /\b(wichtig|dringend|relevant|bedeutend|entscheidend|wesentlich|notwendig|muss|sollte)\b/i.test(text);
};

const hasImpactPhraseInText = (text) => {
    return /\b(Auswirkung|Folge|Folgen|dadurch|deshalb|daher|darum|deswegen|führt|verursacht|beeinträchtigt|stört|gefährdet|Problem|Schäden|Konsequenz|Risiko)\b/i.test(text);
};

const hasDecisionPhraseInText = (text) => {
    return /\b(entschieden|beschlossen|wir haben|ich habe|ich werde|wir werden|entscheiden|Entscheidung|Beschluss|vorgesehen|geplant|veranlasst|sollte)\b/i.test(text);
};

const generateFollowUpQuestions = (obs) => {
    const text = String(obs.wasIstPassiert || '').trim();
    const questions = [];
    if (!obs.werIstBetroffen && !hasAffectedEntityInText(text)) {
        questions.push({ field: 'werIstBetroffen', question: 'Wer war betroffen?' });
    }
    if (!text) {
        questions.push({ field: 'wasIstPassiert', question: 'Was wurde beobachtet?' });
    }
    if (!obs.warumWichtig && !hasImportancePhraseInText(text)) {
        questions.push({ field: 'warumWichtig', question: 'Warum ist dir das wichtig?' });
    }
    if (!obs.auswirkung && !hasImpactPhraseInText(text)) {
        questions.push({ field: 'auswirkung', question: 'Welche Auswirkung hatte das?' });
    }
    if (!obs.entscheidung && !hasDecisionPhraseInText(text)) {
        questions.push({ field: 'entscheidung', question: 'Welche Entscheidung wurde getroffen?' });
    }
    return questions.slice(0, 3);
};

const askMissingInfoFollowUpQuestions = (vorgang, obs, followUps) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('observationModal');
        const questionEl = document.getElementById('modalQuestion');
        const progressEl = document.getElementById('modalProgress');
        const input = document.getElementById('modalInput');
        const mic = document.getElementById('modalMic');
        const modalStop = document.getElementById('modalStopRecording');
        const speechMsg = document.getElementById('modalSpeechMessage');
        const reactionEl = document.getElementById('modalReaction');
        const nextBtn = document.getElementById('modalNext');
        const cancelBtn = document.getElementById('modalCancel');
        if (!modal || !questionEl || !progressEl || !input || !mic || !nextBtn || !cancelBtn) {
            return resolve();
        }

        let current = 0;

        const openModal = () => {
            modal.style.display = 'flex';
            updateView();
        };

        const closeModal = () => {
            modal.style.display = 'none';
        };

        const updateView = async () => {
            const currentQuestion = followUps[current];
            questionEl.textContent = currentQuestion ? currentQuestion.question : '';
            progressEl.textContent = `Rückfrage ${current + 1} von ${followUps.length}`;
            input.value = '';
            if (speechMsg) speechMsg.textContent = '';
            if (reactionEl) reactionEl.textContent = '';
            await speechController.startSession({
                button: mic,
                input,
                message: speechMsg,
                stopButton: modalStop,
                autoRestart: true,
                onResult: (text) => { input.value = text; }
            });
            nextBtn.disabled = false;
        };

        const cleanup = async () => {
            await speechController.stopActive();
            if (nextBtn) nextBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            document.removeEventListener('keydown', handleKeydown);
        };

        const handleKeydown = async (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                await cleanup();
                closeModal();
                return resolve();
            }
            if (event.key === 'Enter' && document.activeElement === input) {
                event.preventDefault();
                nextBtn.click();
            }
        };

        openModal();
        setTimeout(() => input.focus(), 0);
        document.addEventListener('keydown', handleKeydown);

        cancelBtn.onclick = async () => {
            await cleanup();
            closeModal();
            resolve();
        };

        nextBtn.onclick = async () => {
            const currentQuestion = followUps[current];
            if (currentQuestion) {
                obs[currentQuestion.field] = (input.value || '').trim();
                updateObservationLocal(vorgang.id, obs);
            }
            await speechController.stopActive();
            if (current === followUps.length - 1) {
                await cleanup();
                closeModal();
                return resolve();
            }
            const reactions = [
                'Danke.',
                'Verstanden.',
                'Das habe ich notiert.',
                'Ich glaube, ich verstehe.'
            ];
            const pick = reactions[Math.floor(Math.random() * reactions.length)];
            if (reactionEl) reactionEl.textContent = pick;
            nextBtn.disabled = true;
            setTimeout(() => {
                current += 1;
                updateView();
            }, 900);
        };
    });
};

const showGeneratedSummary = (text, vorgang) => {
    const display = document.getElementById('summaryDisplay');
    const actions = document.getElementById('summaryActions');
    const editor = document.getElementById('summaryEditor');
    const textarea = document.getElementById('summaryTextarea');
    if (!display) return;
    display.textContent = text || '';
    if (actions) actions.style.display = text ? 'block' : 'none';
    if (editor) editor.style.display = 'none';

    // adopt button should save this generated text
    const adoptBtn = document.getElementById('summaryAdopt');
    if (adoptBtn) adoptBtn.onclick = () => {
        if (text) saveSummaryLocal(vorgang.id, text);
        renderSummary(vorgang);
    };

    const editBtn = document.getElementById('summaryEdit');
    if (editBtn) editBtn.onclick = () => {
        if (!editor || !textarea) return;
        textarea.value = text || '';
        editor.style.display = 'block';
        if (actions) actions.style.display = 'none';
    };

    const saveBtn = document.getElementById('summarySave');
    const cancelBtn = document.getElementById('summaryCancel');
    if (saveBtn) saveBtn.onclick = () => {
        if (!textarea) return;
        const txt = textarea.value.trim();
        if (!txt) return;
        saveSummaryLocal(vorgang.id, txt);
        renderSummary(vorgang);
    };
    if (cancelBtn) cancelBtn.onclick = () => {
        if (editor) editor.style.display = 'none';
        if (actions) actions.style.display = 'block';
    };
};

// Wrapper: call existing interview then generate summary from last observation
const enhancedStartObservationInterview = async () => {
    // call original interview flow
    await startObservationInterview();
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        const local = loadObservationsLocal(vorgang.id);
        if (!local || local.length === 0) return;
        const last = local[local.length - 1];
        const answers = [last.wasIstPassiert, last.warumWichtig, last.auswirkung, last.wasIstSicher, last.wasVermutestDu];
        const gen = generateSummaryFromAnswers(answers);
        showGeneratedSummary(gen, vorgang);
    } catch (e) {
        // ignore
    }
};

// (rebindings happen later) keep single final binding

// --- Recap confirmation / correction loop ---
const observationsMetaKeyFor = (vorgangId) => `keosVorgangObservationsMeta:${vorgangId}`;
const loadObservationsMetaLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(observationsMetaKeyFor(vorgangId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
};
const saveObservationsMetaLocal = (vorgangId, obj) => {
    try {
        localStorage.setItem(observationsMetaKeyFor(vorgangId), JSON.stringify(obj || {}));
    } catch (e) {
        console.error('Speichern der Beobachtungs-Meta fehlgeschlagen', e);
    }
};

const showRecapUI = (vorgang, recapText, obsId) => {
    const wrapper = document.getElementById('recapConfirmation');
    const recapEl = document.getElementById('recapText');
    const structurePreview = document.getElementById('recapStructurePreview');
    const question = document.getElementById('recapQuestion');
    const yesBtn = document.getElementById('recapYes');
    const noBtn = document.getElementById('recapNo');
    const correctionDiv = document.getElementById('recapCorrection');
    const correctionInput = document.getElementById('recapCorrectionInput');
    const sendCorr = document.getElementById('recapSendCorrection');
    const cancelCorr = document.getElementById('recapCancelCorrection');
    if (!wrapper || !recapEl || !structurePreview) return;
    wrapper.style.display = 'block';
    recapEl.textContent = recapText || '';
    question.textContent = 'Habe ich dich richtig verstanden, dass ...?';
    if (correctionDiv) correctionDiv.style.display = 'none';
    structurePreview.innerHTML = buildStructurePreview(vorgang, obsId);

    const meta = loadObservationsMetaLocal(vorgang.id);

    const cleanup = () => {
        wrapper.style.display = 'none';
        if (correctionDiv) correctionDiv.style.display = 'none';
        if (correctionInput) correctionInput.value = '';
        // remove handlers
        if (yesBtn) yesBtn.onclick = null;
        if (noBtn) noBtn.onclick = null;
        if (sendCorr) sendCorr.onclick = null;
        if (cancelCorr) cancelCorr.onclick = null;
    };

    if (yesBtn) yesBtn.onclick = () => {
        // mark confirmed recap for this obs (use current displayed recap)
        const currentRecap = recapEl.textContent || '';
        meta[obsId] = meta[obsId] || {};
        meta[obsId].recap = currentRecap;
        meta[obsId].confirmedRecap = currentRecap;
        meta[obsId].confirmed = true;
        saveObservationsMetaLocal(vorgang.id, meta);
        try { appendSystemLog('Rekapitulation bestätigt', vorgang.id, `Rekapitulation für ${obsId} bestätigt`); } catch (e) {}
        cleanup();
        // re-render Beobachtungen to show confirmation badge
        renderBeobachtungen(vorgang);
    };

    if (noBtn) noBtn.onclick = () => {
        if (correctionDiv) correctionDiv.style.display = 'block';
    };

    if (sendCorr) sendCorr.onclick = () => {
        const corr = correctionInput ? correctionInput.value.trim() : '';
        if (!corr) return;
        // create new recap from correction (do not overwrite original answers)
        const newRecap = corr;
        meta[obsId] = meta[obsId] || {};
        meta[obsId].recap = newRecap;
        meta[obsId].confirmed = false;
        saveObservationsMetaLocal(vorgang.id, meta);
        // replace recap text and ask again
        recapEl.textContent = newRecap;
        if (correctionDiv) correctionDiv.style.display = 'none';
        question.textContent = 'Habe ich dich jetzt richtig verstanden?';
        // next yes will confirm
        try { appendSystemLog('Beobachtung geändert', vorgang.id, `Rekapitulation für ${obsId} korrigiert`); } catch (e) {}
    };

    if (cancelCorr) cancelCorr.onclick = () => {
        if (correctionDiv) correctionDiv.style.display = 'none';
    };
};

const buildStructurePreview = (vorgang, obsId) => {
    const observations = loadObservationsLocal(vorgang.id) || [];
    const obs = observations.find((item) => item.id === obsId) || {};
    const sections = [
        { title: '👤 Betroffene', value: obs.werIstBetroffen, placeholder: 'Noch keine Informationen' },
        { title: '👀 Beobachtungen', value: obs.wasIstPassiert, placeholder: 'Noch keine Informationen' },
        { title: '💡 Erkenntnisse', value: [obs.warumWichtig, obs.auswirkung, obs.wasVermutestDu].filter(Boolean).join('\n'), placeholder: 'Noch keine Informationen' },
        { title: '📌 Offene Punkte', value: obs.offenePunkte, placeholder: 'Noch keine Informationen' }
    ];

    return sections.map((section) => {
        const text = String(section.value || '').trim();
        if (!text) {
            return `<div class="recap-card recap-card-empty"><strong>${section.title}</strong><p>${section.placeholder}</p></div>`;
        }
        const lines = text.split(/\n+/).filter(Boolean);
        const content = lines.length > 1 ? `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>` : `<p>${lines[0]}</p>`;
        return `<div class="recap-card"><strong>${section.title}</strong>${content}</div>`;
    }).join('');
};

// New wrapper with confirmation loop
const enhancedStartObservationInterviewWithConfirmation = async () => {
    await startObservationInterview();
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        const local = loadObservationsLocal(vorgang.id);
        if (!local || local.length === 0) return;
        const last = local[local.length - 1];
        const answers = [last.wasIstPassiert, last.warumWichtig, last.auswirkung, last.wasIstSicher, last.wasVermutestDu];
        const gen = generateSummaryFromAnswers(answers);
        // show recap UI and let user confirm/correct
        showRecapUI(vorgang, gen, last.id);
        // also show generated summary as before
        showGeneratedSummary(gen, vorgang);
    } catch (e) {
        // ignore
    }
};

// rebind observation button to new enhanced wrapper with confirmation
if (obsBtn) obsBtn.onclick = enhancedStartObservationInterviewWithConfirmation;

// ensure summary rendered after initial load
window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        renderSummary(vorgang);
    } catch (e) {
        // ignore
    }
});

// --- Arbeitshypothese: rule-based generation from summary ---
const hypothesisKeyFor = (vorgangId) => `keosVorgangHypothesis:${vorgangId}`;
const loadHypothesisLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(hypothesisKeyFor(vorgangId));
        if (!raw) return null;
        return String(raw);
    } catch (e) {
        return null;
    }
};
const saveHypothesisLocal = (vorgangId, text) => {
    try {
        localStorage.setItem(hypothesisKeyFor(vorgangId), String(text || ''));
    } catch (e) {
        console.error('Speichern der Arbeitshypothese fehlgeschlagen', e);
    }
};

const generateHypothesisFromSummary = (summary) => {
    if (!summary || !String(summary).trim()) return '';
    const s = String(summary).trim();
    // Ensure explicit phrasing and mark as prüfbare Annahme
    return `Auf Basis der bisher vorliegenden Informationen ergibt sich folgende Arbeitshypothese: (Prüfbare Annahme) ${s}`;
};

const renderHypothesis = async (vorgang) => {
    const display = document.getElementById('hypothesisDisplay');
    const actions = document.getElementById('hypothesisActions');
    const editor = document.getElementById('hypothesisEditor');
    const textarea = document.getElementById('hypothesisTextarea');
    if (!display) return;

    const saved = loadHypothesisLocal(vorgang.id);
    if (saved) {
        display.textContent = saved;
        if (actions) actions.style.display = 'block';
    } else {
        // if no saved hypothesis, but summary exists (either saved or generated in DOM), generate one
        const summaryEl = document.getElementById('summaryDisplay');
        const summaryText = summaryEl ? summaryEl.textContent : '';
        if (summaryText && summaryText !== 'Keine Zusammenfassung vorhanden.') {
            const gen = generateHypothesisFromSummary(summaryText);
            display.textContent = gen;
            if (actions) actions.style.display = 'block';
        } else {
            display.textContent = 'Keine Arbeitshypothese vorhanden.';
            if (actions) actions.style.display = 'none';
        }
    }
    if (editor) editor.style.display = 'none';
    if (textarea) textarea.value = '';

    // wire buttons
    const adoptBtn = document.getElementById('hypothesisAdopt');
    const editBtn = document.getElementById('hypothesisEdit');
    const saveBtn = document.getElementById('hypothesisSave');
    const cancelBtn = document.getElementById('hypothesisCancel');

    if (adoptBtn) adoptBtn.onclick = () => {
        const cur = display.textContent || '';
        if (cur && cur !== 'Keine Arbeitshypothese vorhanden.') {
            saveHypothesisLocal(vorgang.id, cur);
            try { appendSystemLog('Arbeitshypothese übernommen', vorgang.id, 'Arbeitshypothese übernommen'); } catch (e) {}
            renderHypothesis(vorgang);
        }
    };

    if (editBtn) editBtn.onclick = () => {
        if (!editor || !textarea) return;
        textarea.value = display.textContent === 'Keine Arbeitshypothese vorhanden.' ? '' : display.textContent;
        editor.style.display = 'block';
        if (actions) actions.style.display = 'none';
    };

    if (saveBtn) saveBtn.onclick = () => {
        if (!textarea) return;
        const txt = textarea.value.trim();
        if (!txt) return;
        saveHypothesisLocal(vorgang.id, txt);
        try { appendSystemLog('Arbeitshypothese übernommen', vorgang.id, 'Arbeitshypothese übernommen'); } catch (e) {}
        renderHypothesis(vorgang);
    };

    if (cancelBtn) cancelBtn.onclick = () => {
        if (editor) editor.style.display = 'none';
        if (actions) actions.style.display = saved ? 'block' : 'none';
    };
};

// Observe summary changes in DOM to update hypothesis (covers generated summaries)
const summaryEl = document.getElementById('summaryDisplay');
if (summaryEl) {
    const mo = new MutationObserver(async () => {
        try {
            const response = await fetch("../data/vorgaenge/VG-0001.json");
            if (!response.ok) return;
            const vorgang = await response.json();
            await renderHypothesis(vorgang);
        } catch (e) {
            // ignore
        }
    });
    mo.observe(summaryEl, { childList: true, characterData: true, subtree: true });
}

// ensure hypothesis rendered after initial load
window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        await renderHypothesis(vorgang);
    } catch (e) {
        // ignore
    }
});

window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        renderBeobachtungen(vorgang);
    } catch (e) {
        // ignore
    }
});
