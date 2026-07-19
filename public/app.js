import "./dashboard.js";

function buildVorgangFocus(vorgang) {
    const status = String(vorgang.status || '').toLowerCase();
    const hasEvents = Array.isArray(vorgang.ereignisse) && vorgang.ereignisse.length > 0;
    const hasDecisions = Array.isArray(vorgang.entscheidungen) && vorgang.entscheidungen.length > 0;
    const priority = Number(vorgang.prioritaet || 0);
    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    let local = [];
    try {
        const raw = localStorage.getItem(observationsKeyFor(vorgang.id));
        local = raw ? JSON.parse(raw) : [];
    } catch (e) {
        local = [];
    }
    const allObservations = originals.concat(Array.isArray(local) ? local : []);
    const openEntries = allObservations.filter(obs => !isProcessedEntry(obs));

    let recommendation = 'Dokumentiere den ersten nächsten Schritt für diesen Vorgang.';
    let reason = 'Der Vorgang enthält derzeit keine klaren Hinweise für den nächsten Schritt.';
    let primaryAction = 'Jetzt erledigen';
    let secondaryAction = 'Anderen Schritt wählen';

    if (openEntries.length === 0) {
        recommendation = 'Keine offenen Eingänge mehr vorhanden. Vorgang abschließen oder dokumentieren.';
        reason = 'Der Vorgang ist aktuell auf dem neuesten Stand und wartet nur noch auf Abschluss.';
    } else if (openEntries.length === 1) {
        const entry = openEntries[0];
        recommendation = 'Eingang abschließen und als verarbeitet markieren.';
        reason = `Ein offener Eingang wartet noch auf Abschluss: ${summarizeText(getObservationSummary(entry), 100)}`;
    } else {
        recommendation = `Noch ${openEntries.length} offene Eingänge prüfen und abschließen.`;
        reason = 'Mehrere Eingänge sind offen. Schließe den nächsten Eingang ab, um den Vorgang voranzubringen.';
    }

    if (status === 'offen' && openEntries.length > 0) {
        primaryAction = 'Eingang abschließen';
    }

    if (status === 'geschlossen' && openEntries.length === 0) {
        recommendation = 'Vorgang überprüfen und abschließen.';
        reason = 'Es liegen keine offenen Eingänge mehr vor. Du kannst den Vorgang finalisieren.';
    }

    if (status === 'offen' && openEntries.length === 0) {
        recommendation = 'Vorgang prüfen und nächste Entscheidung treffen.';
        reason = 'Es sind keine offenen Eingänge mehr vorhanden; der Fokus liegt auf der nächsten Aufgabe im Vorgang.';
    }

    return {
        recommendation,
        reason,
        primaryAction,
        secondaryAction
    };
}

function renderVorgangFocus(vorgang) {
    const focusCard = document.getElementById('vorgangFocusCard');
    if (!focusCard) return;

    const focus = buildVorgangFocus(vorgang);
    focusCard.innerHTML = `
        <div class="focus-card-title">Nächster sinnvoller Schritt</div>
        <div class="focus-card-recommendation">${focus.recommendation}</div>
        <div class="focus-card-reason"><strong>Begründung:</strong><p>${focus.reason}</p></div>
        <div class="focus-card-actions">
            <button id="focusPrimaryAction" class="primary">${focus.primaryAction}</button>
            <button id="focusSecondaryAction" class="secondary">${focus.secondaryAction}</button>
        </div>
    `;

    const primaryBtn = document.getElementById('focusPrimaryAction');
    const secondaryBtn = document.getElementById('focusSecondaryAction');

    if (primaryBtn) {
        primaryBtn.onclick = () => {
            const interviewBtn = document.getElementById('startObservationInterview');
            const decisionBtn = document.getElementById('createDecisionFromEvent');
            if (interviewBtn) {
                interviewBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                interviewBtn.focus();
                return;
            }
            if (decisionBtn) {
                decisionBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                decisionBtn.focus();
                return;
            }
        };
    }

    if (secondaryBtn) {
        secondaryBtn.onclick = () => {
            const organizeBtn = document.getElementById('intentOrganize');
            const continueBtn = document.getElementById('intentContinue');
            if (organizeBtn) {
                organizeBtn.focus();
            } else if (continueBtn) {
                continueBtn.focus();
            }
        };
    }
}

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

    renderVorgangFocus(vorgang);

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

    const toggleProcessedBtn = document.getElementById('toggleProcessedEntries');
    if (toggleProcessedBtn) {
        toggleProcessedBtn.onclick = () => {
            toggleProcessedVisibility();
            if (currentVorgang) renderBeobachtungen(currentVorgang);
        };
    }
});
const observationsKeyFor = (vorgangId) => `keosVorgangObservations:${vorgangId || 'unassigned'}`;

const DEFAULT_OBSERVATION_USER = 'lokal';
let showProcessedEntries = false;
let currentVorgang = null;

const isProcessedEntry = (obs) => {
    if (!obs) return false;
    if (obs.processedAt) return true;
    if (obs.status && obs.status !== 'neu' && obs.status !== 'open') return true;
    return false;
};

const processOptions = [
    { value: 'task', label: 'Aufgabe erstellt' },
    { value: 'hero', label: 'Zu Hero übernommen' },
    { value: 'saved', label: 'Im Vorgang gespeichert' },
    { value: 'delegated', label: 'Delegiert' },
    { value: 'documented', label: 'Nur dokumentiert' }
];

const formatProcessedDate = (iso) => {
    if (!iso) return 'unbekannt';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'ungültig';
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const openProcessModal = (vorgang, obsId) => {
    const modal = document.getElementById('entryProcessModal');
    const optionContainer = document.getElementById('entryProcessOptions');
    const cancelBtn = document.getElementById('entryProcessCancel');
    if (!modal || !optionContainer || !cancelBtn) return;
    optionContainer.innerHTML = '';
    const obs = loadObservationsLocal(vorgang.id).find((item) => item.id === obsId);
    if (!obs) return;
    processOptions.forEach((option) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'secondary';
        btn.textContent = option.label;
        btn.style.width = '100%';
        btn.onclick = () => {
            obs.processedAt = new Date().toISOString();
            obs.processedBy = DEFAULT_OBSERVATION_USER;
            obs.processedReason = option.label;
            obs.status = 'processed';
            updateObservationLocal(vorgang.id, obs);
            modal.style.display = 'none';
            renderBeobachtungen(vorgang);
        };
        optionContainer.appendChild(btn);
    });
    cancelBtn.onclick = () => {
        modal.style.display = 'none';
    };
    modal.style.display = 'flex';
};

const toggleProcessedVisibility = () => {
    showProcessedEntries = !showProcessedEntries;
    const toggle = document.getElementById('toggleProcessedEntries');
    if (toggle) {
        toggle.textContent = showProcessedEntries ? 'Nur offene anzeigen' : 'Verarbeitete anzeigen';
    }
};

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
    obs.status = obs.status || 'open';
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

const summarizeText = (text, maxLength = 120) => {
    if (!text) return 'Keine Zusammenfassung verfügbar.';
    const normalized = String(text).trim().replace(/\s+/g, ' ');
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength).trim()}…`;
};

const generateEntryTitle = (obs) => {
    const source = String(obs.wasIstPassiert || obs.warumWichtig || obs.auswirkung || obs.wasIstSicher || obs.wasVermutestDu || obs.entscheidung || '').trim().replace(/\s+/g, ' ');
    if (!source) return `Eingang ${obs.id}`;
    const words = source.split(' ').slice(0, 8);
    return words.join(' ') + (words.length < source.split(' ').length ? '…' : '');
};

const formatEntryDate = (iso) => {
    if (!iso) return 'Unbekanntes Datum';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Ungültiges Datum';
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatStatusLabel = (status) => {
    switch (status) {
        case 'in-bearbeitung': return 'In Bearbeitung';
        case 'delegiert': return 'Delegiert';
        case 'erledigt': return 'Erledigt';
        case 'neu':
        default:
            return 'Neu';
    }
};

const getObservationSummary = (obs) => {
    if (obs.wasIstPassiert) return summarizeText(obs.wasIstPassiert, 140);
    return summarizeText(obs.warumWichtig || obs.auswirkung || obs.wasIstSicher || obs.wasVermutestDu || obs.entscheidung, 140);
};

const renderObservationDetails = (obs) => {
    const fields = [
        { label: 'Was ist passiert?', value: obs.wasIstPassiert },
        { label: 'Warum ist das wichtig?', value: obs.warumWichtig },
        { label: 'Welche Auswirkung hat das?', value: obs.auswirkung },
        { label: 'Was ist sicher?', value: obs.wasIstSicher },
        { label: 'Was vermutest du?', value: obs.wasVermutestDu },
        { label: 'Wer ist betroffen?', value: obs.werIstBetroffen },
        { label: 'Entscheidung', value: obs.entscheidung }
    ];
    return fields.filter(item => item.value).map(item => `<p><strong>${item.label}</strong><br>${String(item.value).trim()}</p>`).join('');
};

const renderBeobachtungen = (vorgang) => {
    currentVorgang = vorgang;
    const el = document.getElementById('vorgang-eingaenge');
    if (!el) return;
    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    const local = loadObservationsLocal(vorgang.id);
    const merged = originals.concat(local);
    el.innerHTML = '';
    const visibleItems = merged.filter((obs) => {
        if (showProcessedEntries) return true;
        return !isProcessedEntry(obs);
    });
    if (!Array.isArray(visibleItems) || visibleItems.length === 0) {
        el.textContent = showProcessedEntries ? 'Keine verarbeiteten Eingänge vorhanden.' : 'Keine offenen Eingänge vorhanden.';
        return;
    }
    visibleItems.forEach(obs => {
        const card = document.createElement('article');
        card.className = 'entry-card';

        const header = document.createElement('div');
        header.className = 'entry-card-head';
        const title = document.createElement('h4');
        title.textContent = generateEntryTitle(obs);
        header.appendChild(title);
        const badge = document.createElement('span');
        badge.className = `entry-badge entry-badge-${obs.status || 'neu'}`;
        badge.textContent = formatStatusLabel(obs.status || 'neu');
        header.appendChild(badge);
        card.appendChild(header);

        const meta = document.createElement('div');
        meta.className = 'entry-meta';
        const dateEl = document.createElement('span');
        dateEl.textContent = `Erstellt: ${formatEntryDate(obs.erstelltAm || obs.createdAt)}`;
        meta.appendChild(dateEl);
        const processEl = document.createElement('span');
        processEl.textContent = obs.processId ? `Vorgang: ${obs.processId}` : 'Noch nicht zugeordnet';
        meta.appendChild(processEl);
        card.appendChild(meta);

        const summary = document.createElement('p');
        summary.className = 'entry-summary';
        summary.textContent = getObservationSummary(obs);
        card.appendChild(summary);

        const actionRow = document.createElement('div');
        actionRow.className = 'entry-actions';

        const detailButton = document.createElement('button');
        detailButton.type = 'button';
        detailButton.className = 'secondary';
        detailButton.textContent = 'Details anzeigen';
        actionRow.appendChild(detailButton);

        if (!isProcessedEntry(obs)) {
            const processButton = document.createElement('button');
            processButton.type = 'button';
            processButton.className = 'primary';
            processButton.textContent = 'Verarbeiten';
            processButton.onclick = () => openProcessModal(vorgang, obs.id);
            actionRow.appendChild(processButton);
        }
        card.appendChild(actionRow);

        const detailsEl = document.createElement('details');
        detailsEl.className = 'entry-details';
        const summaryEl = document.createElement('summary');
        summaryEl.textContent = 'Verlauf anzeigen';
        detailsEl.appendChild(summaryEl);
        const detailsBody = document.createElement('div');
        detailsBody.className = 'entry-detail-body';
        detailsBody.innerHTML = renderObservationDetails(obs);
        detailsEl.appendChild(detailsBody);
        card.appendChild(detailsEl);

        detailButton.onclick = () => {
            detailsEl.open = !detailsEl.open;
        };

        if (obs.processedAt) {
            const processedInfo = document.createElement('p');
            processedInfo.style.margin = '10px 0 0 0';
            processedInfo.style.color = '#555';
            processedInfo.textContent = `Verarbeitet am ${formatProcessedDate(obs.processedAt)} · Grund: ${obs.processedReason || 'Keine Angabe'} · von ${obs.processedBy || 'unbekannt'}`;
            card.appendChild(processedInfo);
        }

        el.appendChild(card);
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

            hideObservationCompletion();
            const answeredCardsContainer = document.getElementById('modalAnsweredCards');
            const answeredItems = [];
            const renderAnsweredCards = () => {
                if (!answeredCardsContainer) return;
                answeredCardsContainer.innerHTML = '';
                if (answeredItems.length === 0) {
                    answeredCardsContainer.style.display = 'none';
                    return;
                }
                answeredCardsContainer.style.display = 'grid';
                answeredItems.forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'answered-card';
                    const header = document.createElement('div');
                    header.className = 'answered-card-header';
                    const label = document.createElement('strong');
                    label.textContent = `✓ ${item.question}`;
                    header.appendChild(label);
                    card.appendChild(header);
                    const answer = document.createElement('p');
                    answer.textContent = item.answer || 'Keine Antwort angegeben.';
                    card.appendChild(answer);
                    answeredCardsContainer.appendChild(card);
                });
            };

            const openModal = () => {
                modal.style.display = 'flex';
                renderAnsweredCards();
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
                answeredItems.push({ question: questions[current], answer: answers[current] });
                renderAnsweredCards();
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

            hideObservationCompletion();
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

const proposalKeyFor = (vorgangId) => `keosVorgangProposal:${vorgangId}`;
const loadProposalLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(proposalKeyFor(vorgangId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
        return null;
    }
};
const saveProposalLocal = (vorgangId, obj) => {
    try {
        localStorage.setItem(proposalKeyFor(vorgangId), JSON.stringify(obj || {}));
    } catch (e) {
        console.error('Speichern des Arbeitsvorschlags fehlgeschlagen', e);
    }
};

const buildProposalFromSummary = (summary) => {
    const cleaned = String(summary || '').trim();
    if (!cleaned) return null;
    const sentences = cleaned.split(/\.(\s|$)/).map(s => s.trim()).filter(Boolean);
    const firstSentence = sentences[0] || cleaned;
    const factLines = [firstSentence];
    if (sentences.length > 1) {
        factLines.push(sentences[1]);
    }
    const suggestions = [];
    const assumptions = [];
    if (/\b(vermut|könnte|möglich|wahrscheinlich|scheint|wahrschlich)\b/i.test(cleaned)) {
        assumptions.push('Es ist anzunehmen, dass die Lage noch nicht abschließend geklärt ist.');
    } else {
        assumptions.push('Es ist anzunehmen, dass diese Beobachtung Handlungsbedarf signalisiert.');
    }
    if (/\b(Entscheidung|beschlossen|entschieden|geplant|veranlasst)\b/i.test(cleaned)) {
        suggestions.push('Dokumentiere die Entscheidung im Vorgang und kläre die Umsetzung.');
    } else if (/\b(Auswirkung|Risiko|Problem|Gefahr|Störung|Behinderung)\b/i.test(cleaned)) {
        suggestions.push('Lege den Fall als offenen Vorgangspunkt an und prüfe die Nachverfolgung.');
    } else {
        suggestions.push('Fasse die Beobachtung als offenen Punkt zusammen und priorisiere die nächste Aktion.');
    }
    return {
        text: `${suggestions[0]}`,
        recommendation: suggestions[0],
        facts: factLines,
        assumptions,
        createdAt: new Date().toISOString(),
        accepted: false,
        documented: false
    };
};

const renderProposal = (vorgang) => {
    const display = document.getElementById('proposalDisplay');
    const actions = document.getElementById('proposalActions');
    const editor = document.getElementById('proposalEditor');
    const textarea = document.getElementById('proposalTextarea');
    const adoptBtn = document.getElementById('proposalAdopt');
    const editBtn = document.getElementById('proposalEdit');
    const documentBtn = document.getElementById('proposalDocument');
    const saveBtn = document.getElementById('proposalSave');
    const cancelBtn = document.getElementById('proposalCancel');
    if (!display) return;

    let proposal = loadProposalLocal(vorgang.id);
    let summaryText = loadSummaryLocal(vorgang.id);
    if (!summaryText) {
        const summaryDisplay = document.getElementById('summaryDisplay');
        summaryText = summaryDisplay ? summaryDisplay.textContent : '';
    }
    if (!proposal && summaryText && summaryText !== 'Keine Zusammenfassung vorhanden.') {
        proposal = buildProposalFromSummary(summaryText);
        if (proposal) {
            saveProposalLocal(vorgang.id, proposal);
        }
    }

    if (!proposal) {
        display.textContent = 'Noch kein Vorschlag vorhanden.';
        if (actions) actions.style.display = 'none';
        if (editor) editor.style.display = 'none';
        if (textarea) textarea.value = '';
        return;
    }

    const proposalHtml = [
        `<div class="proposal-card">`,
        `<div class="proposal-section"><strong>Empfehlung</strong><p>${proposal.recommendation || proposal.text}</p></div>`,
        `<div class="proposal-section"><strong>Fakten</strong><ul>${proposal.facts.map(item => `<li>${item}</li>`).join('')}</ul></div>`,
        `<div class="proposal-section"><strong>Annahmen</strong><ul>${proposal.assumptions.map(item => `<li>${item}</li>`).join('')}</ul></div>`,
        `<div class="proposal-section"><strong>Mögliche Aktionen</strong><ul><li>Vorschlag übernehmen</li><li>Vorschlag bearbeiten</li><li>Nur dokumentieren</li></ul></div>`,
        proposal.accepted ? `<p class="proposal-status">Vorschlag übernommen am ${formatProcessedDate(proposal.acceptedAt)}</p>` : proposal.documented ? `<p class="proposal-status">Nur dokumentiert am ${formatProcessedDate(proposal.documentedAt)}</p>` : '<p class="proposal-status">Der Vorschlag wartet auf Bestätigung.</p>',
        `</div>`
    ].join('');
    display.innerHTML = proposalHtml;
    if (actions) actions.style.display = 'flex';
    if (editor) editor.style.display = 'none';
    if (textarea) textarea.value = proposal.text || '';

    if (adoptBtn) {
        adoptBtn.onclick = () => {
            proposal.accepted = true;
            proposal.acceptedAt = new Date().toISOString();
            proposal.documented = false;
            saveProposalLocal(vorgang.id, proposal);
            renderProposal(vorgang);
            completeProposalLifecycle(vorgang, 'Arbeitsvorschlag übernommen', 'Arbeitsvorschlag übernommen');
        };
    }

    if (documentBtn) {
        documentBtn.onclick = () => {
            proposal.documented = true;
            proposal.documentedAt = new Date().toISOString();
            proposal.accepted = false;
            saveProposalLocal(vorgang.id, proposal);
            renderProposal(vorgang);
            completeProposalLifecycle(vorgang, 'Dokumentiert', 'Nur dokumentiert');
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            if (!textarea) return;
            const text = textarea.value.trim();
            if (!text) return;
            proposal.text = text;
            proposal.recommendation = text;
            proposal.accepted = false;
            proposal.documented = false;
            saveProposalLocal(vorgang.id, proposal);
            renderProposal(vorgang);
            completeProposalLifecycle(vorgang, 'Bearbeitet übernommen', 'Bearbeitet übernommen');
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (editor) editor.style.display = 'none';
            if (actions) actions.style.display = 'flex';
        };
    }
};

const findFirstOpenObservation = (vorgang) => {
    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    let local = [];
    try {
        const raw = localStorage.getItem(observationsKeyFor(vorgang.id));
        local = raw ? JSON.parse(raw) : [];
    } catch (e) {
        local = [];
    }
    const merged = originals.concat(Array.isArray(local) ? local : []);
    return merged.find(obs => !isProcessedEntry(obs));
};

const completeObservationLifecycle = (vorgang, obs, reason) => {
    if (!vorgang || !obs) return;
    obs.processedAt = new Date().toISOString();
    obs.processedBy = DEFAULT_OBSERVATION_USER;
    obs.processedReason = reason;
    obs.status = 'processed';

    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    const local = loadObservationsLocal(vorgang.id);
    const originalIndex = originals.findIndex(item => item.id === obs.id);
    const localIndex = local.findIndex(item => item.id === obs.id);

    if (originalIndex >= 0) {
        originals[originalIndex] = obs;
    } else if (localIndex >= 0) {
        local[localIndex] = obs;
        saveObservationsLocal(vorgang.id, local);
    } else {
        local.push(obs);
        saveObservationsLocal(vorgang.id, local);
    }
};

const completeProposalLifecycle = (vorgang, completionText, processReason) => {
    collapseAnalysisBlock(completionText);
    const obs = findFirstOpenObservation(vorgang);
    if (obs) {
        completeObservationLifecycle(vorgang, obs, processReason);
    }
    if (currentVorgang && currentVorgang.id === vorgang.id) {
        renderBeobachtungen(vorgang);
        renderVorgang(vorgang);
    }
};

const collapseAnalysisBlock = (message) => {
    const analysis = document.getElementById('analysisBlock');
    const completion = document.getElementById('analysisCompletionCard');
    const completionTitle = document.getElementById('completionCardTitle');
    const completionSubtitle = document.getElementById('completionCardSubtitle');
    const showLink = document.getElementById('showKiAnalysisLink');

    if (analysis) {
        analysis.style.display = 'none';
        analysis.style.opacity = '0';
        analysis.style.transition = 'opacity 220ms ease';
    }
    if (completion) {
        if (completionTitle) completionTitle.textContent = '✓ Analyse abgeschlossen';
        if (completionSubtitle) completionSubtitle.textContent = message || 'Ergebnis gespeichert.';
        completion.style.display = 'block';
        completion.style.opacity = '0';
        completion.style.animation = 'fadeIn 240ms ease forwards';
    }
    if (showLink) {
        showLink.onclick = (event) => {
            event.preventDefault();
            if (analysis) {
                analysis.style.display = 'block';
                setTimeout(() => {
                    analysis.style.opacity = '1';
                }, 10);
            }
            if (completion) {
                completion.style.display = 'none';
            }
        };
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
            renderProposal(vorgang);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (editor) editor.style.display = 'none';
            if (actions) actions.style.display = saved ? 'block' : 'none';
        };
    }
    renderProposal(vorgang);
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
        renderProposal(vorgang);
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
        const obs = applyObservationConfirmation(vorgang, obsId, currentRecap);
        try { appendSystemLog('Rekapitulation bestätigt', vorgang.id, `Rekapitulation für ${obsId} bestätigt`); } catch (e) {}
        cleanup();
        // re-render Beobachtungen and show completion view
        renderBeobachtungen(vorgang);
        if (obs) showObservationCompletion(vorgang, obs);
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

const getNextStepLabel = (nextStepType) => {
    switch (nextStepType) {
        case 'open': return 'Offenen Punkt';
        case 'task': return 'Aufgabe';
        case 'decision': return 'Entscheidung';
        case 'document':
        default:
            return 'Dokumentiert';
    }
};

const showObservationCompletion = (vorgang, obs) => {
    const card = document.getElementById('observationCompletionCard');
    const summaryEl = document.getElementById('observationSavedSummary');
    const assignmentEl = document.getElementById('observationAssignmentInfo');
    const noteEl = document.getElementById('observationCompletionNote');
    const btnDocument = document.getElementById('nextStepDocument');
    const btnOpen = document.getElementById('nextStepOpen');
    const btnTask = document.getElementById('nextStepTask');
    const btnDecision = document.getElementById('nextStepDecision');
    if (!card || !summaryEl || !assignmentEl || !noteEl) return;

    card.style.display = 'block';
    summaryEl.textContent = `Beobachtung ${obs.id} wurde gespeichert.`;
    assignmentEl.textContent = obs.processId
        ? `Zugeordnet zum Vorgang ${obs.processId}.` : 'Diese Beobachtung ist noch keinem Vorgang zugeordnet.';
    const statusLabel = getNextStepLabel(obs.nextStepType);
    noteEl.textContent = obs.nextStepType
        ? `Aktuell markiert als: ${statusLabel}.` : 'Wähle aus, wie weiter mit der Beobachtung verfahren werden soll.';

    const selectNextStep = (type, status) => {
        updateObservationNextStep(vorgang, obs.id, type, status);
        const label = getNextStepLabel(type);
        noteEl.textContent = `Die Beobachtung wurde als ${label} markiert.`;
        try { appendSystemLog('Weiterer Schritt gewählt', vorgang.id, `Beobachtung ${obs.id} als ${type} markiert`); } catch (e) {}
        renderBeobachtungen(vorgang);
    };

    if (btnDocument) btnDocument.onclick = () => selectNextStep('document', 'documented');
    if (btnOpen) btnOpen.onclick = () => selectNextStep('open', 'open');
    if (btnTask) btnTask.onclick = () => selectNextStep('task', 'task');
    if (btnDecision) btnDecision.onclick = () => selectNextStep('decision', 'decision');
};

const hideObservationCompletion = () => {
    const card = document.getElementById('observationCompletionCard');
    if (card) card.style.display = 'none';
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
