import "./dashboard.js";

const PILOT_TEMPLATE_VORGANG_ID = 'VG-0001';
const PILOT_ACTIVE_VORGANG_ID_KEY = 'keosActiveVorgangId';
const PILOT_VORGANG_DRAFT_PREFIX = 'keosVorgangDraft:';

const pilotVorgangKeyFor = (vorgangId) => `${PILOT_VORGANG_DRAFT_PREFIX}${vorgangId}`;

const readJsonLocal = (key, fallback = null) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
};

const writeJsonLocal = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
};

const cloneValue = (value) => {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return value ? { ...value } : value;
    }
};

const loadPilotVorgangDraft = (vorgangId) => readJsonLocal(pilotVorgangKeyFor(vorgangId), null);

const savePilotVorgangDraft = (vorgang) => {
    if (!vorgang || !vorgang.id) return false;
    const payload = cloneValue(vorgang);
    const stored = writeJsonLocal(pilotVorgangKeyFor(payload.id), payload);
    if (stored) {
        try { localStorage.setItem(PILOT_ACTIVE_VORGANG_ID_KEY, payload.id); } catch (e) {}
    }
    return stored;
};

const loadActivePilotVorgangId = () => {
    try {
        return localStorage.getItem(PILOT_ACTIVE_VORGANG_ID_KEY) || '';
    } catch (e) {
        return '';
    }
};

const listKnownPilotVorgangIds = () => {
    const ids = new Set([PILOT_TEMPLATE_VORGANG_ID]);
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i) || '';
            if (key.startsWith(PILOT_VORGANG_DRAFT_PREFIX)) {
                ids.add(key.slice(PILOT_VORGANG_DRAFT_PREFIX.length));
            }
        }
    } catch (e) {
        // ignore
    }
    return [...ids];
};

const createNextPilotVorgangId = () => {
    const maxSuffix = listKnownPilotVorgangIds().reduce((max, id) => {
        const match = /^VG-(\d+)$/.exec(String(id));
        if (!match) return max;
        return Math.max(max, Number(match[1]));
    }, 0);
    return `VG-${String(maxSuffix + 1).padStart(4, '0')}`;
};

const loadPilotVorgang = async () => {
    const activeId = loadActivePilotVorgangId();
    if (activeId) {
        const stored = loadPilotVorgangDraft(activeId);
        if (stored) return stored;
    }

    const response = await fetch('/data/vorgaenge/VG-0001.json');
    if (!response.ok) return null;
    return response.json();
};

const activateEditablePilotVorgang = (vorgang) => {
    if (!vorgang) return null;
    if (vorgang.id === PILOT_TEMPLATE_VORGANG_ID) {
        const existingDraftId = loadActivePilotVorgangId();
        if (existingDraftId) {
            const storedDraft = loadPilotVorgangDraft(existingDraftId);
            if (storedDraft) return storedDraft;
        }
        const now = new Date().toISOString();
        const draft = {
            ...cloneValue(vorgang),
            id: createNextPilotVorgangId(),
            sourceVorgangId: vorgang.id,
            erstelltAm: vorgang.erstelltAm || now,
            erstelltVon: vorgang.erstelltVon || 'Pilot',
            typ: vorgang.typ || 'Beobachtung',
            status: vorgang.status || 'offen',
            rohtext: vorgang.rohtext || '',
            zusammenfassung: vorgang.zusammenfassung || '',
            strukturierteZusammenfassung: vorgang.strukturierteZusammenfassung || '',
            nextStepType: vorgang.nextStepType || 'noch-offen',
            nextStepLabel: vorgang.nextStepLabel || 'Noch offen'
        };
        savePilotVorgangDraft(draft);
        return draft;
    }

    savePilotVorgangDraft(vorgang);
    return vorgang;
};

const updatePilotVorgangDraft = (vorgang, patch = {}) => {
    if (!vorgang) return null;
    const next = {
        ...cloneValue(vorgang),
        ...cloneValue(patch)
    };
    savePilotVorgangDraft(next);
    return next;
};

const OBSERVATION_FIELD_MAP = {
    whatHappened: { legacyKey: 'wasIstPassiert', label: 'Was ist passiert?' },
    whyImportant: { legacyKey: 'warumWichtig', label: 'Warum ist das wichtig?' },
    impact: { legacyKey: 'auswirkung', label: 'Welche Auswirkung hat das?' },
    affected: { legacyKey: 'werIstBetroffen', label: 'Wer ist betroffen?' },
    decision: { legacyKey: 'entscheidung', label: 'Welche Entscheidung wurde getroffen?' }
};

const createAnswerRecord = (value = '', source = 'unanswered', status = 'unanswered') => ({
    value: String(value || '').trim(),
    source,
    status,
    needsReview: status === 'unclear' || status === 'unanswered'
});

const createAnswerState = () => ({
    whatHappened: createAnswerRecord(),
    whyImportant: createAnswerRecord(),
    impact: createAnswerRecord(),
    affected: createAnswerRecord(),
    decision: createAnswerRecord()
});

const UNDERSTANDING_STATUS = {
    pending: 'pending',
    confirmed: 'confirmed',
    rejected: 'rejected'
};

const normalizeUnderstandingText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const buildUnderstandingRecapFromText = (value) => {
    const text = normalizeUnderstandingText(value);
    if (!text) {
        return 'Ich bin mir noch nicht sicher, ob ich dich vollständig richtig verstanden habe. Ich habe bisher keine klare Aussage herausgehört.';
    }
    const clipped = text.length > 420 ? `${text.slice(0, 417).trim()}...` : text;
    const uncertain = isFragmentLike(clipped) || countWords(clipped) < 6;
    if (uncertain) {
        return `Ich bin mir noch nicht sicher, ob ich dich vollständig richtig verstanden habe. Ich habe Folgendes herausgehört: ${clipped}`;
    }
    return `Ich glaube, ich habe Folgendes verstanden: ${clipped}`;
};

const applyPartialCorrectionToRecap = (currentRecap, correctionText) => {
    const correction = normalizeUnderstandingText(correctionText);
    if (!correction) return normalizeUnderstandingText(currentRecap);
    return buildUnderstandingRecapFromText(correction);
};

const normalizeAnswerText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const countWords = (value) => normalizeAnswerText(value).split(/\s+/).filter(Boolean).length;

const isFragmentLike = (value) => {
    const text = normalizeAnswerText(value).toLowerCase();
    if (!text) return true;
    if (['und du', 'und', 'du', 'ich weiß nicht', 'müller müllers ich', 'müller müller ich'].includes(text)) return true;
    if (/\b(weiß ich nicht|weiss ich nicht|nicht genau|keine ahnung|keine ahnung genau|irgendwie|gerade nicht|kann ich gerade nicht|kann ich nicht sagen|weiß ich nicht genau|weiss ich nicht genau)\b/i.test(text)) return true;
    if (/^[\p{L}\s'-]+$/u.test(text) && countWords(text) <= 1) return true;
    if (countWords(text) <= 3 && !/\b(ist|war|sind|hat|haben|macht|macht|führt|zeigt|braucht|bleibt|geht|ging|passt|lief|läuft|passiert|geschrieben|diktiert|eingegeben|ergänzt|getippt|gesprochen)\b/i.test(text)) {
        return true;
    }
    return false;
};

const classifyAnswer = (fieldKey, value) => {
    const text = normalizeAnswerText(value);
    if (!text) {
        return createAnswerRecord('', 'unanswered', 'unanswered');
    }

    const lower = text.toLowerCase();
    const fieldIsAffected = fieldKey === 'affected';
    let status = 'valid';

    if (isFragmentLike(text) && !(fieldIsAffected && ['ich', 'wir', 'team', 'mich', 'uns'].includes(lower))) {
        status = 'unclear';
    }

    if (fieldIsAffected && ['ich', 'wir', 'team', 'mich', 'uns'].includes(lower)) {
        status = 'valid';
    }

    return { value: text, source: 'unknown', status, needsReview: status !== 'valid' };
};

const setAnswerField = (obs, fieldKey, value, source = 'unknown') => {
    if (!obs.answers) obs.answers = createAnswerState();
    const classification = classifyAnswer(fieldKey, value);
    classification.source = source;
    obs.answers[fieldKey] = classification;

    const legacyKey = OBSERVATION_FIELD_MAP[fieldKey]?.legacyKey;
    if (legacyKey) {
        obs[legacyKey] = classification.value;
    }

    obs.unclearFields = Object.entries(obs.answers)
        .filter(([, answer]) => answer && answer.status === 'unclear')
        .map(([key]) => key);
    const validCount = Object.values(obs.answers).filter((answer) => answer && answer.status === 'valid' && answer.value).length;
    const unclearCount = Object.values(obs.answers).filter((answer) => answer && answer.status === 'unclear' && answer.value).length;
    obs.status = validCount === 0 ? 'Entwurf' : (unclearCount > 0 ? 'Klärung erforderlich' : 'Bereit zur Bearbeitung');
    return classification;
};

const getAnswerStateList = (obs) => Object.entries(OBSERVATION_FIELD_MAP).map(([fieldKey, config]) => ({
    fieldKey,
    label: config.label,
    ...((obs.answers && obs.answers[fieldKey]) || createAnswerRecord())
}));

const generateShortObservationTitle = (obs, fallbackDate = new Date()) => {
    const raw = normalizeAnswerText(obs?.rawInput || obs?.wasIstPassiert || '');
    if (/\b(mikrofon|tastatur|diktat|spracheingabe|speech)\b/i.test(raw)) {
        return 'Test von Spracheingabe und Tastaturergänzung';
    }
    if (raw) {
        const clipped = raw.split(/[.!?]/)[0].trim();
        if (clipped) {
            const short = clipped.split(/\s+/).slice(0, 8).join(' ');
            if (short) return short.length > 60 ? `${short.slice(0, 57).trim()}…` : short;
        }
    }
    return `Neue Beobachtung vom ${fallbackDate.toLocaleDateString('de-DE')}`;
};

const buildObservationSummaryText = (obs) => {
    const answers = obs?.answers || {};
    const parts = [];
    const whatHappened = answers.whatHappened;
    const whyImportant = answers.whyImportant;
    const impact = answers.impact;
    const affected = answers.affected;

    if (whatHappened && whatHappened.status === 'valid' && whatHappened.value) {
        parts.push(`Beobachtung: ${whatHappened.value}.`);
    }
    if (affected && affected.status === 'valid' && affected.value) {
        parts.push(`Betroffen: ${affected.value}.`);
    }
    if (whyImportant && whyImportant.status === 'valid' && whyImportant.value) {
        parts.push(`Bedeutung: ${whyImportant.value}.`);
    }
    if (impact && impact.status === 'valid' && impact.value) {
        parts.push(`Auswirkung: ${impact.value}.`);
    }

    if (parts.length === 0) {
        return 'Noch keine belastbare Zusammenfassung. Zunächst offene Angaben klären.';
    }

    const openPoints = [];
    if (!whyImportant || whyImportant.status !== 'valid' || !whyImportant.value) openPoints.push('Bedeutung');
    if (!impact || impact.status !== 'valid' || !impact.value) openPoints.push('Auswirkung');
    if (!affected || affected.status !== 'valid' || !affected.value) openPoints.push('Betroffene');
    if (openPoints.length > 0) parts.push(`Noch nicht ausreichend geklärt: ${openPoints.join(', ')}.`);

    return parts.join(' ');
};

const buildObservationHypothesisText = (obs) => {
    const answers = obs?.answers || {};
    const validCount = Object.values(answers).filter((answer) => answer && answer.status === 'valid' && answer.value).length;
    if (validCount < 2) {
        return 'Noch keine belastbare Arbeitshypothese. Zunächst offene Angaben klären.';
    }
    const impact = answers.impact && answers.impact.status === 'valid' ? answers.impact.value : '';
    const whyImportant = answers.whyImportant && answers.whyImportant.status === 'valid' ? answers.whyImportant.value : '';
    const whatHappened = answers.whatHappened && answers.whatHappened.status === 'valid' ? answers.whatHappened.value : '';
    const base = [whatHappened, whyImportant, impact].filter(Boolean).join(' · ');
    return `Arbeitshypothese: ${base}`.slice(0, 420);
};

const buildObservationProposalText = (obs) => {
    const answers = obs?.answers || {};
    if (answers.whatHappened && /mikrofon|tastatur|diktat|spracheingabe/i.test(answers.whatHappened.value || obs.rawInput || '')) {
        return 'Prüfen, ob Diktat und Tastatureingabe zuverlässig in einem gemeinsamen Text gespeichert werden.';
    }
    if (answers.impact && answers.impact.status === 'valid') {
        return 'Offene Auswirkung prüfen und den nächsten Bearbeitungsschritt festhalten.';
    }
    return 'Offene Angaben klären, bevor der Vorgang als vollständig bearbeitet gilt.';
};

const buildObservationStatusLabel = (obs) => {
    if (!obs) return 'Entwurf';
    if (obs.status === 'Bereit zur Bearbeitung') return 'Bereit zur Bearbeitung';
    if (obs.status === 'Klärung erforderlich') return 'Klärung erforderlich';
    if (obs.status === 'In Bearbeitung') return 'In Bearbeitung';
    if (obs.status === 'Erledigt') return 'Erledigt';
    return 'Entwurf';
};

const wireUnclearAnswerPrompt = (elements = {}) => {
    const clarityEl = elements.clarityEl || document.getElementById('modalAnswerClarity');
    const actionsEl = elements.actionsEl || document.getElementById('modalAnswerActions');
    const editBtn = elements.editBtn || document.getElementById('modalAnswerEdit');
    const redoBtn = elements.redoBtn || document.getElementById('modalAnswerRedo');
    const skipBtn = elements.skipBtn || document.getElementById('modalAnswerSkip');
    const unclearBtn = elements.unclearBtn || document.getElementById('modalAnswerUnclear');

    const hide = () => {
        if (clarityEl) clarityEl.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
        if (editBtn) editBtn.onclick = null;
        if (redoBtn) redoBtn.onclick = null;
        if (skipBtn) skipBtn.onclick = null;
        if (unclearBtn) unclearBtn.onclick = null;
    };

    const show = ({ message, onEdit, onRedo, onSkip, onMarkUnclear }) => {
        if (clarityEl) {
            clarityEl.textContent = message || 'Diese Antwort ist noch nicht eindeutig.';
            clarityEl.style.display = 'block';
        }
        if (actionsEl) actionsEl.style.display = 'flex';
        if (editBtn) editBtn.onclick = () => { hide(); if (typeof onEdit === 'function') onEdit(); };
        if (redoBtn) redoBtn.onclick = () => { hide(); if (typeof onRedo === 'function') onRedo(); };
        if (skipBtn) skipBtn.onclick = () => { hide(); if (typeof onSkip === 'function') onSkip(); };
        if (unclearBtn) unclearBtn.onclick = () => { hide(); if (typeof onMarkUnclear === 'function') onMarkUnclear(); };
    };

    return { show, hide };
};

const questionFieldOrder = ['whatHappened', 'whyImportant', 'impact', 'affected', 'decision'];

const updateObservationDraftFromField = (obs, fieldKey, value, source) => {
    const classification = setAnswerField(obs, fieldKey, value, source);
    if (fieldKey === 'whatHappened') {
        obs.rawInput = obs.rawInput || classification.value;
    }
    return classification;
};

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

    const result = {
        recommendation,
        reason,
        primaryAction,
        secondaryAction
    };
    return result;
}

function renderVorgangFocus(vorgang) {
    const focusCard = document.getElementById('vorgangFocusCard');
    if (!focusCard) {
        console.error('Render Fokus: focus card nicht gefunden');
        return;
    }

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
    if (!container) {
        console.error('Render Vorgang: container loadedVorgang nicht gefunden');
        return;
    }

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value !== undefined && value !== null ? String(value) : '';
    };

    setText('vorgang-id', vorgang.id);
    setText('vorgang-erstelltam', vorgang.erstelltAm || vorgang.createdAt);
    setText('vorgang-titel', vorgang.titel);
    setText('vorgang-typ', vorgang.typ || vorgang.type);
    setText('vorgang-status', vorgang.status);
    setText('vorgang-prioritaet', vorgang.prioritaet);
    setText('vorgang-rohtext', vorgang.rohtext || vorgang.rawText || '');
    setText('vorgang-zusammenfassung', vorgang.zusammenfassung || vorgang.structuredSummary || '');
    setText('vorgang-next-step', vorgang.nextStepLabel || vorgang.nextStepType || 'Noch offen');
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
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;
        renderVorgang(vorgang);
    } catch (error) {
        console.error("Vorgang konnte nicht geladen werden:", error);
    }
}

loadVorgang();

async function createDecisionFromEvent() {
    try {
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;

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
    let startInFlight = false;

    const statusMessages = {
        ready: 'Bereit. Du kannst diktieren oder tippen.',
        starting: 'Mikrofon wird gestartet...',
        capturing: 'Aufnahme läuft...',
        stopping: 'Aufnahme wird beendet...',
        processing: 'Verarbeitung läuft...',
        idle: 'Aufnahme beendet.',
        failed: 'Aufnahme fehlgeschlagen.'
    };

    const updateUI = (session, status, detail = '') => {
        if (!session) return;
        const { button, message, stopButton } = session;
        if (button) button.textContent = status === 'capturing' || status === 'stopping' || status === 'processing' ? '🛑' : '🎙️';
        if (stopButton) stopButton.style.display = status === 'capturing' || status === 'starting' ? 'inline-block' : 'none';
        if (message) {
            if (detail) message.textContent = detail;
            else message.textContent = statusMessages[status] || '';
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

        let speechCommitted = session.input.value || '';
        let started = false;
        let receivedResult = false;

        r.onstart = () => {
            started = true;
            state = 'capturing';
            updateUI(session, 'capturing');
        };

        r.onresult = (event) => {
            receivedResult = true;
            let finalText = '';
            let interimText = '';
            for (let i = 0; i < event.results.length; i++) {
                const rItem = event.results[i];
                const t = rItem[0] && rItem[0].transcript ? rItem[0].transcript : '';
                if (rItem.isFinal) finalText += (finalText ? ' ' : '') + t;
                else interimText += (interimText ? ' ' : '') + t;
            }
            speechCommitted = (speechCommitted ? speechCommitted + ' ' : '') + finalText;
            speechCommitted = speechCommitted.trim();
            if (!session.manualEdited) {
                session.input.value = speechCommitted;
                if (typeof session.onResult === 'function') session.onResult(speechCommitted);
            }
            session.lastSource = session.manualEdited ? (session.hadSpeech ? 'mixed' : 'keyboard') : 'speech';
            session.hadSpeech = true;
            if (session.message) session.message.textContent = interimText ? 'Ich höre weiter zu …' : 'Erkannter Text wurde übernommen.';
        };

        r.onend = () => {
            const endedSession = activeSession;
            recognition = null;
            activeSession = null;
            const wasStopped = stopRequested;
            stopRequested = false;
            startInFlight = false;
            if (wasStopped) {
                state = 'idle';
                updateUI(endedSession, 'idle');
                if (endResolver) {
                    endResolver();
                    endResolver = null;
                }
                return;
            }
            if (!started || !receivedResult) {
                state = 'failed';
                updateUI(endedSession, 'failed', 'Aufnahme endete ohne erkennbaren Text. Du kannst direkt tippen oder es erneut versuchen.');
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
            const error = String(event && event.error ? event.error : 'unbekannter Fehler');
            let detail = `Spracherkennung fehlgeschlagen: ${error}`;
            if (error === 'not-allowed' || error === 'service-not-allowed') {
                detail = 'Mikrofon wurde verweigert. Du kannst die Beobachtung direkt tippen.';
            } else if (error === 'audio-capture') {
                detail = 'Kein Mikrofon gefunden oder es ist gerade belegt. Du kannst direkt tippen.';
            } else if (error === 'no-speech') {
                detail = 'Es wurde keine Sprache erkannt. Du kannst es erneut versuchen oder tippen.';
            } else if (error === 'aborted') {
                detail = 'Aufnahme abgebrochen.';
            } else if (error === 'network') {
                detail = 'Spracherkennung konnte wegen eines Netzwerkproblems nicht verarbeitet werden.';
            }
            if (session.message) session.message.textContent = detail;
            state = 'failed';
            updateUI(session, 'failed', detail);
            if (endResolver) {
                endResolver();
                endResolver = null;
            }
            recognition = null;
            activeSession = null;
            stopRequested = false;
            startInFlight = false;
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
        if (startInFlight) return recognition;
        if (recognition) {
            if (activeSession === session && state === 'capturing') return recognition;
            await stopActive();
        }
        activeSession = session;
        stopRequested = false;
        startInFlight = true;
        state = 'starting';
        updateUI(session, 'starting');
        recognition = createRecognition(session);
        try {
            recognition.start();
        } catch (e) {
            state = 'idle';
            updateUI(session, 'idle');
            recognition = null;
            activeSession = null;
            startInFlight = false;
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
            onResult: options.onResult,
            manualEdited: false,
            hadSpeech: false,
            lastSource: 'unknown'
        };

        input.oninput = () => {
            session.manualEdited = true;
            session.lastSource = session.hadSpeech ? 'mixed' : 'keyboard';
        };

        button.onclick = async () => {
            if (activeSession === session && recognition && (state === 'capturing' || state === 'starting')) {
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
            loadVorgang().then(() => {
                const loadedCard = document.getElementById('loadedVorgangCard');
                if (loadedCard) loadedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
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

const appendTimelineEvent = (vorgang, text, type = 'decision') => {
    if (!vorgang || !text) return;
    try {
        const localKey = `keosVorgangEvents:${vorgang.id}`;
        const raw = localStorage.getItem(localKey);
        const existing = raw ? JSON.parse(raw) : [];
        const events = Array.isArray(existing) ? existing : [];
        events.push({
            id: `TL-${Date.now()}`,
            text: String(text),
            erstelltAm: new Date().toISOString(),
            type: type,
            quelle: 'system'
        });
        localStorage.setItem(localKey, JSON.stringify(events));
    } catch (e) {
        console.error('Timeline-Eintrag konnte nicht gespeichert werden', e);
    }
};

const persistCurrentSummary = (vorgang) => {
    if (!vorgang) return;
    const display = document.getElementById('summaryDisplay');
    if (!display) return;
    const current = display.textContent || '';
    if (!current || current === 'Keine Zusammenfassung vorhanden.') return;
    const saved = loadSummaryLocal(vorgang.id);
    if (saved !== current) {
        saveSummaryLocal(vorgang.id, current);
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
    obs.originalInput = obs.originalInput || obs.rawInput;
    obs.understandingStatus = UNDERSTANDING_STATUS.confirmed;
    if (!obs.understanding) obs.understanding = {};
    obs.understanding.original = obs.understanding.original || obs.originalInput;
    obs.understanding.recap = confirmedText;
    obs.understanding.confirmed = confirmedText;
    obs.understanding.status = UNDERSTANDING_STATUS.confirmed;
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
    if (obs && obs.titel) return String(obs.titel).trim();
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
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'entwurf') return 'Entwurf';
    if (normalized === 'klärung erforderlich' || normalized === 'klaerung erforderlich') return 'Klärung erforderlich';
    if (normalized === 'bereit zur bearbeitung') return 'Bereit zur Bearbeitung';
    if (normalized === 'in bearbeitung' || normalized === 'in-bearbeitung') return 'In Bearbeitung';
    if (normalized === 'erledigt' || normalized === 'processed') return 'Erledigt';
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
    const answerList = getAnswerStateList(obs);
    const statusSuffix = (answer) => answer && answer.status && answer.status !== 'valid' ? ` (${formatStatusLabel(answer.status)})` : '';
    const fields = [
        ...answerList.map((answer) => ({ label: answer.label, value: answer.value, suffix: statusSuffix(answer) })),
        { label: 'Was ist sicher?', value: obs.wasIstSicher },
        { label: 'Was vermutest du?', value: obs.wasVermutestDu }
    ];
    return fields.filter(item => item.value).map(item => `<p><strong>${item.label}${item.suffix || ''}</strong><br>${String(item.value).trim()}</p>`).join('');
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
            const response = await fetch("/data/vorgaenge/VG-0001.json");
            if (!response.ok) return resolve(null);
            const vorgang = await response.json();
            const editableVorgang = activateEditablePilotVorgang(vorgang) || vorgang;

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
            const answers = createAnswerState();
            const answerMeta = Array(questions.length).fill(null);
            const clarifyPrompt = wireUnclearAnswerPrompt();
            let questionSpeechSession = null;

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
                const currentFieldKey = questionFieldOrder[current];
                const currentField = OBSERVATION_FIELD_MAP[currentFieldKey];
                questionEl.textContent = currentField ? currentField.label : questions[current];
                progressEl.textContent = `Frage ${current + 1} von ${questions.length}`;
                input.value = (answerMeta[current] && answerMeta[current].value) || '';
                input.oninput = () => {
                    if (questionSpeechSession) {
                        questionSpeechSession.manualEdited = true;
                        questionSpeechSession.lastSource = questionSpeechSession.hadSpeech ? 'mixed' : 'keyboard';
                    }
                };
                if (speechMsg) speechMsg.textContent = '';
                const clarityEl = document.getElementById('modalAnswerClarity');
                const actionsEl = document.getElementById('modalAnswerActions');
                if (clarityEl) clarityEl.style.display = 'none';
                if (actionsEl) actionsEl.style.display = 'none';
                if (reactionEl) reactionEl.textContent = '';
                questionSpeechSession = speechController.registerSpeechControl(mic, input, speechMsg, modalStop, {
                    autoRestart: false,
                    onResult: (text) => { input.value = text; }
                });
                if (questionSpeechSession) {
                    questionSpeechSession.manualEdited = false;
                    questionSpeechSession.hadSpeech = false;
                    questionSpeechSession.lastSource = 'unknown';
                    setTimeout(() => {
                        if (input && input.value === '') mic.click();
                    }, 0);
                }
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
                const fieldKey = questionFieldOrder[current];
                const rawValue = normalizeAnswerText(input.value || '');
                const source = questionSpeechSession ? questionSpeechSession.lastSource : 'unknown';
                const currentAnswer = updateObservationDraftFromField(answers, fieldKey, rawValue, source);
                answerMeta[current] = currentAnswer;
                answeredItems.push({ question: questions[current], answer: currentAnswer.value });
                renderAnsweredCards();
                await speechController.stopActive();
                if (currentAnswer.needsReview) {
                    nextBtn.disabled = true;
                    clarifyPrompt.show({
                        message: 'Diese Antwort ist noch nicht eindeutig.',
                        onEdit: () => {
                            nextBtn.disabled = false;
                            input.focus();
                        },
                        onRedo: () => {
                            input.value = '';
                            if (questionSpeechSession) {
                                questionSpeechSession.manualEdited = false;
                                questionSpeechSession.hadSpeech = false;
                                questionSpeechSession.lastSource = 'unknown';
                            }
                            nextBtn.disabled = false;
                            setTimeout(() => mic.click(), 0);
                        },
                        onSkip: () => {
                            answerMeta[current] = createAnswerRecord('', 'keyboard', 'unanswered');
                            answers[fieldKey] = answerMeta[current];
                            advanceQuestion();
                        },
                        onMarkUnclear: () => {
                            answerMeta[current] = { ...currentAnswer, status: 'unclear', needsReview: true };
                            answers[fieldKey] = answerMeta[current];
                            advanceQuestion();
                        }
                    });
                    return;
                }
                answers[fieldKey] = currentAnswer;
                if (current === questions.length - 1) {
                    const anyNonEmpty = Object.values(answers).some(a => a && a.value && a.value.length > 0);
                    if (!anyNonEmpty) {
                        await cleanupHandlers(); closeModal(); return resolve(null);
                    }
                    const obsAnswers = createAnswerState();
                    questionFieldOrder.forEach((fieldKey, index) => {
                        const meta = answerMeta[index] || createAnswerRecord('', 'unanswered', 'unanswered');
                        obsAnswers[fieldKey] = { ...meta };
                    });
                    const obs = {
                        id: `BE-${Date.now()}`,
                        type: 'observation',
                        answers: obsAnswers,
                        rawInput: answeredItems.map((item) => `${item.question} ${item.answer || ''}`.trim()).join(' | '),
                        sourceMode: 'geführt',
                        processId: editableVorgang.id,
                        status: 'Entwurf',
                        nextStepType: 'noch-offen',
                        nextStepLabel: 'Noch offen',
                        erstelltAm: new Date().toISOString(),
                        quelle: 'manuell'
                    };
                    Object.entries(obsAnswers).forEach(([fieldKey, answer]) => {
                        if (answer && answer.value) {
                            updateObservationDraftFromField(obs, fieldKey, answer.value, answer.source || 'unknown');
                        }
                    });
                    obs.titel = generateShortObservationTitle(obs);
                    obs.zusammenfassung = buildObservationSummaryText(obs);
                    obs.strukturierteZusammenfassung = obs.zusammenfassung;
                    obs.arbeitshypothese = buildObservationHypothesisText(obs);
                    obs.arbeitsvorschlag = buildObservationProposalText(obs);
                    const local = loadObservationsLocal(editableVorgang.id);
                    local.push(obs);
                    saveObservationsLocal(editableVorgang.id, local);
                    updatePilotVorgangDraft(editableVorgang, {
                        createdAt: editableVorgang.erstelltAm || obs.erstelltAm,
                        titel: obs.titel,
                        typ: 'Beobachtung',
                        status: obs.status,
                        rohtext: obs.rawInput,
                        zusammenfassung: obs.zusammenfassung,
                        strukturierteZusammenfassung: obs.strukturierteZusammenfassung,
                        arbeitshypothese: obs.arbeitshypothese,
                        arbeitsvorschlag: obs.arbeitsvorschlag,
                        nextStepType: obs.nextStepType,
                        nextStepLabel: obs.nextStepLabel
                    });
                    try { appendSystemLog('Beobachtung erstellt', editableVorgang.id, `Beobachtung ${obs.id} erstellt`); } catch (e) {}
                    await cleanupHandlers(); document.removeEventListener('keydown', handleKeydown); closeModal(); renderBeobachtungen(editableVorgang);
                    return resolve(obs);
                }
                advanceQuestion();
            };

            const advanceQuestion = () => {
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const showWorkplaceTransition = () => {
    const card = document.getElementById('workplaceTransitionCard');
    if (!card) return;
    card.classList.add('show');
    card.style.display = 'block';
    const final = document.getElementById('workplaceTransitionFinal');
    if (final) final.style.display = 'none';
    const steps = Array.from(card.querySelectorAll('.transition-step'));
    steps.forEach((step) => {
        step.classList.remove('active', 'completed');
    });
};

const animateWorkplaceTransition = async () => {
    const card = document.getElementById('workplaceTransitionCard');
    if (!card) return;
    const steps = Array.from(card.querySelectorAll('.transition-step'));
    for (let i = 0; i < steps.length; i += 1) {
        steps[i].classList.add('active');
        await delay(360);
        steps[i].classList.remove('active');
        steps[i].classList.add('completed');
    }
};

const completeWorkplaceTransition = () => {
    const final = document.getElementById('workplaceTransitionFinal');
    const showResult = document.getElementById('workplaceTransitionShowResult');
    if (final) final.style.display = 'block';
    if (showResult) {
        showResult.onclick = () => {
            const analysisBlock = document.getElementById('analysisBlock');
            const card = document.getElementById('workplaceTransitionCard');
            if (analysisBlock) analysisBlock.style.display = 'block';
            if (card) card.style.display = 'none';
            const input = document.getElementById('workplaceInput');
            const finishBtn = document.getElementById('workplaceFinish');
            const speechBtn = document.getElementById('workplaceSpeechButton');
            const stopBtn = document.getElementById('workplaceStopRecording');
            if (input) input.style.display = 'block';
            if (finishBtn) finishBtn.style.display = 'inline-flex';
            if (speechBtn) speechBtn.style.display = 'inline-flex';
            if (stopBtn) stopBtn.style.display = 'none';
        };
    }
};

const setWorkplacePendingState = () => {
    const input = document.getElementById('workplaceInput');
    const finishBtn = document.getElementById('workplaceFinish');
    const speechBtn = document.getElementById('workplaceSpeechButton');
    const stopBtn = document.getElementById('workplaceStopRecording');
    const msg = document.getElementById('workplaceSpeechMessage');
    if (input) {
        input.readOnly = true;
        input.style.opacity = '0.8';
    }
    if (finishBtn) {
        finishBtn.disabled = true;
    }
    if (speechBtn) {
        speechBtn.disabled = true;
    }
    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.style.display = 'none';
    }
    if (msg) {
        msg.textContent = '✓ Aufnahme abgeschlossen. KEOS analysiert deine Eingabe...';
    }
};

const resetWorkplacePendingState = () => {
    const input = document.getElementById('workplaceInput');
    const finishBtn = document.getElementById('workplaceFinish');
    const speechBtn = document.getElementById('workplaceSpeechButton');
    const stopBtn = document.getElementById('workplaceStopRecording');
    const msg = document.getElementById('workplaceSpeechMessage');
    if (input) {
        input.readOnly = false;
        input.style.opacity = '1';
    }
    if (finishBtn) {
        finishBtn.disabled = false;
    }
    if (speechBtn) {
        speechBtn.disabled = false;
    }
    if (stopBtn) {
        stopBtn.disabled = false;
    }
    if (msg && msg.textContent === '✓ Aufnahme abgeschlossen. KEOS analysiert deine Eingabe...') {
        msg.textContent = '';
    }
};

const startFreeMode = () => {
    return new Promise(async (resolve) => {
        try {
            const response = await fetch("/data/vorgaenge/VG-0001.json");
            if (!response.ok) {
                console.error('Freier Modus: Vorgang konnte nicht geladen werden', response.status, response.statusText, response.url);
                return resolve(null);
            }

            const vorgang = await response.json();
            const editableVorgang = activateEditablePilotVorgang(vorgang) || vorgang;

            const input = document.getElementById('workplaceInput');
            const msg = document.getElementById('workplaceSpeechMessage');
            if (!input) return resolve(null);

            setWorkplacePendingState();
            hideVorgangReifeCard();
            await speechController.stopActive();
            setWorkplacePendingState();
            const text = (input.value || '').trim();
            if (!text) {
                if (msg) msg.textContent = 'Bitte erzähle zuerst etwas, bevor du fertig bist.';
                resetWorkplacePendingState();
                return resolve(null);
            }

            hideObservationCompletion();
            const obs = {
                id: `BE-${Date.now()}`,
                type: 'observation',
                wasIstPassiert: text,
                warumWichtig: '',
                auswirkung: '',
                wasIstSicher: '',
                wasVermutestDu: '',
                werIstBetroffen: '',
                entscheidung: '',
                erstelltAm: new Date().toISOString(),
                rawInput: text,
                originalInput: text,
                sourceMode: 'frei',
                processId: editableVorgang.id,
                understandingStatus: UNDERSTANDING_STATUS.pending,
                status: 'Entwurf',
                nextStepType: 'noch-offen',
                nextStepLabel: 'Noch offen',
                quelle: 'frei'
            };
            obs.understanding = {
                original: text,
                recap: buildUnderstandingRecapFromText(text),
                confirmed: '',
                status: UNDERSTANDING_STATUS.pending,
                corrections: []
            };
            const local = loadObservationsLocal(editableVorgang.id);
            local.push(obs);
            saveObservationsLocal(editableVorgang.id, local);
            updatePilotVorgangDraft(editableVorgang, {
                createdAt: editableVorgang.erstelltAm || obs.erstelltAm,
                typ: 'Beobachtung',
                status: obs.status,
                rohtext: obs.rawInput,
                zusammenfassung: '',
                strukturierteZusammenfassung: '',
                arbeitshypothese: buildObservationHypothesisText(obs),
                arbeitsvorschlag: buildObservationProposalText(obs),
                nextStepType: obs.nextStepType,
                nextStepLabel: obs.nextStepLabel
            });
            try { appendSystemLog('Beobachtung erstellt (frei)', editableVorgang.id, `Beobachtung ${obs.id} erstellt (frei)`); } catch (e) {}

            const recapResult = await showRecapUI(editableVorgang, obs.understanding.recap, obs.id);
            if (!recapResult || recapResult.status !== UNDERSTANDING_STATUS.confirmed) {
                if (msg) msg.textContent = 'Bitte erzähle es noch einmal mit deinen eigenen Worten.';
                if (input) {
                    input.value = (recapResult && recapResult.restartText) ? recapResult.restartText : '';
                    input.focus();
                }
                hideVorgangReifeCard();
                renderBeobachtungen(editableVorgang);
                resetWorkplacePendingState();
                return resolve(null);
            }

            const persisted = loadObservationsLocal(editableVorgang.id);
            let activeObservation = persisted.find((item) => item.id === obs.id) || obs;

            const maxClarificationRounds = 3;
            for (let round = 0; round < maxClarificationRounds; round += 1) {
                const handlungscheck = pruefeBeobachtungHandlungsreife(activeObservation);
                activeObservation.handlungsreife = {
                    handlungsreif: handlungscheck.handlungsreif,
                    begruendung: handlungscheck.begruendung,
                    rueckfrage: handlungscheck.rueckfrage,
                    geprueftAm: new Date().toISOString()
                };
                updateObservationLocal(editableVorgang.id, activeObservation);

                if (handlungscheck.handlungsreif || !handlungscheck.rueckfrage || !handlungscheck.rueckfrageFeld) break;
                const nextFollowUp = { field: handlungscheck.rueckfrageFeld, question: handlungscheck.rueckfrage };
                await askMissingInfoFollowUpQuestions(editableVorgang, activeObservation, [nextFollowUp]);
                const refreshed = loadObservationsLocal(editableVorgang.id);
                activeObservation = refreshed.find((item) => item.id === obs.id) || activeObservation;
            }

            const finalCheck = pruefeBeobachtungHandlungsreife(activeObservation);
            activeObservation.handlungsreife = {
                handlungsreif: finalCheck.handlungsreif,
                begruendung: finalCheck.begruendung,
                rueckfrage: finalCheck.rueckfrage,
                geprueftAm: new Date().toISOString()
            };
            if (!finalCheck.handlungsreif && getClarificationQuestionCount(activeObservation) >= 3) {
                activeObservation.verbleibenderKlaerungsbedarf = finalCheck.begruendung;
            } else {
                activeObservation.verbleibenderKlaerungsbedarf = '';
            }
            updateObservationLocal(editableVorgang.id, activeObservation);

            if (finalCheck.handlungsreif && msg) {
                msg.textContent = 'Danke. Ich habe genügend Informationen, um die Beobachtung weiterzuverarbeiten.';
                showVorgangReifeCard(editableVorgang, activeObservation, finalCheck);
            } else if (msg) {
                msg.textContent = 'Danke. Ich habe die Beobachtung erfasst und verbleibenden Klärungsbedarf intern markiert.';
                hideVorgangReifeCard();
            }
            renderBeobachtungen(editableVorgang);
            const gen = buildObservationSummaryText(activeObservation);
            showGeneratedSummary(gen, editableVorgang);
            showObservationCompletion(editableVorgang, activeObservation);
            resetWorkplacePendingState();
            return resolve(activeObservation);
        } catch (e) {
            console.error('Freier Modus fehlgeschlagen', e);
            resetWorkplacePendingState();
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
    if (!vorgang) return;
    persistCurrentSummary(vorgang);
    appendTimelineEvent(vorgang, 'Arbeitsvorschlag übernommen.');
    const obs = findFirstOpenObservation(vorgang);
    if (obs && !isObservationUnderstandingConfirmed(vorgang.id, obs.id)) {
        try {
            appendSystemLog('Weiterverarbeitung blockiert', vorgang.id, `Beobachtung ${obs.id} ohne bestätigtes Verständnis`);
        } catch (e) {
            // ignore
        }
        return;
    }
    if (obs) {
        completeObservationLifecycle(vorgang, obs, processReason);
    }
    collapseAnalysisBlock(completionText);
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
                updatePilotVorgangDraft(vorgang, {
                    zusammenfassung: current,
                    strukturierteZusammenfassung: current
                });
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
            updatePilotVorgangDraft(vorgang, {
                zusammenfassung: txt,
                strukturierteZusammenfassung: txt
            });
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
    return /\b(Auswirkung|Folge|Folgen|dadurch|deshalb|daher|darum|deswegen|führt|verursacht|beeinträchtigt|stört|gefährdet|Problem|Schäden|Konsequenz|Risiko|verzögert|verzoegert|verlangsamt|Zeitverlust|Zeit verlieren|Zeitverlu.*|blockiert|behindert|bremst|kostet Zeit|Auftrag[e]? verzögert)\b/i.test(text);
};

const hasDecisionPhraseInText = (text) => {
    return /\b(entschieden|beschlossen|wir haben|ich habe|ich werde|wir werden|entscheiden|Entscheidung|Beschluss|vorgesehen|geplant|veranlasst|sollte)\b/i.test(text);
};

const hasOperationalDisruptionInText = (text) => {
    return /\b(störung|stoerung|funktioniert nicht|fällt aus|faellt aus|blockiert|unterbrochen|abweichung|fehler|reklamation|stillstand|nacharbeit|doppelte arbeit|widersprüchlich|widerspruechlich|verwechselt|falsch abgelegt|beschädigt|beschädigte|beschädigten|angeliefert|verspätet|verspätung|zu spät|zu spaet|geräusch|geräusche|ungewöhnlich|rutschgefahr|abgestürzt|abstürzt|stürzt ab|stuerzt ab|springt zurück|springt zurueck|gehen verloren|geht verloren|verloren)\b/i.test(text);
};

const hasSoftwareContextInText = (text) => {
    return /\b(software|system|anwendung|programm|app|portal|maske|seite)\b/i.test(text);
};

const hasRepetitionPhraseInText = (text) => {
    return /\b(häufig|haeufig|immer wieder|wiederholt|ständig|staendig|regelmäßig|regelmaessig|täglich|taeglich|seit tagen|mehrfach)\b/i.test(text);
};

const hasImprovementHintInText = (text) => {
    return /\b(verbessern|optimieren|vereinfachen|untersuchen|prüfen|pruefen|klären|klaeren|anpassen|vermeiden)\b/i.test(text);
};

const hasDocumentableEventInText = (text) => {
    return /\b(heute|gestern|morgen|beim termin|bei der auslieferung|im gespräch|im gespraech|im lager|in der werkstatt|im büro|im buero)\b/i.test(text);
};

const getClarificationQuestionCount = (obs) => Number(obs?.clarificationQuestionCount || 0);

const getClarificationQuestionHistory = (obs) => {
    if (!obs || !Array.isArray(obs.clarificationQuestionHistory)) return [];
    return obs.clarificationQuestionHistory.filter(Boolean).map((fieldKey) => String(fieldKey));
};

const isMeaningfulClarificationText = (value) => {
    const text = normalizeAnswerText(value);
    if (!text) return false;
    if (!/[\p{L}\p{N}]/u.test(text)) return false;
    if (/^[\p{P}\s]+$/u.test(text)) return false;
    if (countWords(text) <= 1) return false;
    if (isFragmentLike(text)) return false;
    return true;
};

const getObservationNarrativeText = (obs) => [
    obs?.originalInput,
    obs?.rawInput,
    obs?.understanding?.confirmed,
    obs?.understanding?.recap,
    obs?.wasIstPassiert,
    obs?.answers?.whatHappened?.value,
    obs?.answers?.whyImportant?.value,
    obs?.answers?.impact?.value,
    obs?.answers?.affected?.value
].filter(Boolean).join(' ');

const hasClearWhatHappened = (obs) => {
    const direct = obs?.answers?.whatHappened;
    if (direct && direct.status === 'valid' && isMeaningfulClarificationText(direct.value)) return true;
    const text = getObservationNarrativeText(obs);
    if (!isMeaningfulClarificationText(text) || isFragmentLike(text)) return false;
    return hasOperationalDisruptionInText(text) || hasImpactPhraseInText(text);
};

const hasClearWhyOrImpact = (obs) => {
    const why = obs?.answers?.whyImportant;
    const impact = obs?.answers?.impact;
    const text = getObservationNarrativeText(obs);
    const whyClear = why && why.status === 'valid' && isMeaningfulClarificationText(why.value);
    const impactClear = impact && impact.status === 'valid' && isMeaningfulClarificationText(impact.value);
    return whyClear || impactClear || hasImportancePhraseInText(text) || hasImpactPhraseInText(text);
};

const hasClearAffected = (obs) => {
    const affected = obs?.answers?.affected;
    const text = getObservationNarrativeText(obs);
    return (affected && affected.status === 'valid' && isMeaningfulClarificationText(affected.value)) || hasAffectedEntityInText(text);
};

const hasClearReferencePoint = (obs) => {
    const text = getObservationNarrativeText(obs);
    if (!text) return false;
    if (hasAffectedEntityInText(text)) return true;
    return /\b(werkstatt|lager|büro|buero|beratung|nachbetreuung|lieferung|montage|fertigung|endkontrolle|arbeitsschritt|prozess|ablauf|termin)\b/i.test(text);
};

const getHandlungsreifeSignal = (obs) => {
    const text = getObservationNarrativeText(obs);
    return {
        konkret: hasClearWhatHappened(obs),
        stoerung: hasOperationalDisruptionInText(text),
        auswirkungOderGefahr: hasClearWhyOrImpact(obs) || hasImpactPhraseInText(text),
        wiederholung: hasRepetitionPhraseInText(text),
        verbesserungsansatz: hasImprovementHintInText(text),
        dokumentationswuerdig: hasDocumentableEventInText(text)
    };
};

const waehleRueckfrageBeiUnklarheit = (obs, signal) => {
    const history = new Set(getClarificationQuestionHistory(obs));
    if (!signal.konkret) {
        const text = getObservationNarrativeText(obs);
        if (hasSoftwareContextInText(text) && !history.has('whatHappened')) {
            return { field: 'whatHappened', question: 'Was genau passiert bei der Arbeit mit der Software?' };
        }
        if (!history.has('whatHappened')) return { field: 'whatHappened', question: 'Was genau ist passiert?' };
        if (!history.has('impact')) return { field: 'impact', question: 'Was funktioniert dabei nicht?' };
        return { field: 'impact', question: 'Woran merkst du das konkret?' };
    }

    if (!signal.auswirkungOderGefahr) {
        if (!history.has('whyImportant')) return { field: 'whyImportant', question: 'Welche Auswirkung hat das im Arbeitsalltag?' };
        if (!history.has('impact')) return { field: 'impact', question: 'Wozu führt das konkret?' };
    }

    if (!hasClearReferencePoint(obs) && !history.has('affected')) {
        return { field: 'affected', question: 'Auf welchen Arbeitsschritt bezieht sich deine Beobachtung?' };
    }

    return null;
};

const pruefeBeobachtungHandlungsreife = (obs) => {
    if (!obs) {
        return {
            handlungsreif: false,
            begruendung: 'Keine verwertbare Beobachtung vorhanden.',
            rueckfrage: 'Was genau ist passiert?',
            rueckfrageFeld: 'whatHappened'
        };
    }

    if (getClarificationQuestionCount(obs) >= 3) {
        return {
            handlungsreif: false,
            begruendung: 'Maximale Anzahl an Rückfragen erreicht; verbleibender Klärungsbedarf wird intern vermerkt.',
            rueckfrage: null,
            rueckfrageFeld: null
        };
    }

    const signal = getHandlungsreifeSignal(obs);
    const handlungsreif = signal.konkret || signal.stoerung || signal.auswirkungOderGefahr || signal.wiederholung || signal.verbesserungsansatz || signal.dokumentationswuerdig;

    if (handlungsreif) {
        return {
            handlungsreif: true,
            begruendung: 'Die Beobachtung ist ausreichend konkret oder zeigt eine verwertbare betriebliche Relevanz.',
            rueckfrage: null,
            rueckfrageFeld: null
        };
    }

    const rueckfrage = waehleRueckfrageBeiUnklarheit(obs, signal);
    return {
        handlungsreif: false,
        begruendung: 'Die Beobachtung ist noch zu allgemein oder mehrdeutig für die Weiterverarbeitung.',
        rueckfrage: rueckfrage ? rueckfrage.question : null,
        rueckfrageFeld: rueckfrage ? rueckfrage.field : null
    };
};

const selectNextClarificationQuestion = (obs) => {
    const entscheidung = pruefeBeobachtungHandlungsreife(obs);
    if (!entscheidung || entscheidung.handlungsreif || !entscheidung.rueckfrage || !entscheidung.rueckfrageFeld) return null;
    return { field: entscheidung.rueckfrageFeld, question: entscheidung.rueckfrage };
};

const askMissingInfoFollowUpQuestions = (vorgang, obs, followUps) => {
    return new Promise((resolve) => {
        if (!vorgang || !obs || !isObservationUnderstandingConfirmed(vorgang.id, obs.id)) {
            return resolve();
        }
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
        const clarifyPrompt = wireUnclearAnswerPrompt();
        if (!modal || !questionEl || !progressEl || !input || !mic || !nextBtn || !cancelBtn) {
            return resolve();
        }

        let current = 0;
        let questionSpeechSession = null;

        if (!Array.isArray(followUps) || followUps.length === 0) {
            return resolve();
        }

        obs.clarificationQuestionCount = getClarificationQuestionCount(obs) + 1;
        obs.clarificationQuestionHistory = Array.from(new Set([...getClarificationQuestionHistory(obs), followUps[0].field]));
        obs.currentClarificationField = followUps[0].field;
        obs.currentClarificationQuestion = followUps[0].question;
        updateObservationLocal(vorgang.id, obs);

        const openModal = () => {
            modal.style.display = 'flex';
            updateView();
        };

        const closeModal = () => {
            modal.style.display = 'none';
        };

        const updateView = async () => {
            if (current >= followUps.length) {
                await finishFollowUps();
                return;
            }
            const currentQuestion = followUps[current];
            questionEl.textContent = currentQuestion ? currentQuestion.question : '';
            progressEl.textContent = `Rückfrage ${current + 1} von ${followUps.length}`;
            input.value = '';
            if (speechMsg) speechMsg.textContent = '';
            if (reactionEl) reactionEl.textContent = '';
            questionSpeechSession = speechController.registerSpeechControl(mic, input, speechMsg, modalStop, {
                autoRestart: false,
                onResult: (text) => { input.value = text; }
            });
            if (questionSpeechSession) {
                questionSpeechSession.manualEdited = false;
                questionSpeechSession.hadSpeech = false;
                questionSpeechSession.lastSource = 'unknown';
                setTimeout(() => {
                    if (input && input.value === '') mic.click();
                }, 0);
            }
            nextBtn.disabled = false;
        };

        const cleanup = async () => {
            await speechController.stopActive();
            if (nextBtn) nextBtn.onclick = null;
            if (cancelBtn) cancelBtn.onclick = null;
            document.removeEventListener('keydown', handleKeydown);
        };

        const finishFollowUps = async () => {
            await cleanup();
            closeModal();
            return resolve();
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
                const source = questionSpeechSession ? questionSpeechSession.lastSource : 'unknown';
                const classification = updateObservationDraftFromField(obs, currentQuestion.field, input.value || '', source);
                obs[currentQuestion.field] = classification.value;
                obs.currentClarificationField = '';
                obs.currentClarificationQuestion = '';
                updateObservationLocal(vorgang.id, obs);
                if (classification.needsReview) {
                    if (!obs.answers) obs.answers = createAnswerState();
                    obs.answers[currentQuestion.field] = { ...classification, status: 'unclear', needsReview: true };
                    obs.currentClarificationField = '';
                    obs.currentClarificationQuestion = '';
                    updateObservationLocal(vorgang.id, obs);
                    if (current === followUps.length - 1) {
                        return finishFollowUps();
                    }
                    return goNext();
                }
            }
            await speechController.stopActive();
            if (current === followUps.length - 1) {
                return finishFollowUps();
            }
            goNext();
        };

        const goNext = () => {
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
                if (current >= followUps.length - 1) {
                    finishFollowUps();
                    return;
                }
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
        if (text) {
            saveSummaryLocal(vorgang.id, text);
            updatePilotVorgangDraft(vorgang, {
                zusammenfassung: text,
                strukturierteZusammenfassung: text
            });
        }
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
        updatePilotVorgangDraft(vorgang, {
            zusammenfassung: txt,
            strukturierteZusammenfassung: txt
        });
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
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;
        const local = loadObservationsLocal(vorgang.id);
        if (!local || local.length === 0) return;
        const last = local[local.length - 1];
        const gen = buildObservationSummaryText(last);
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

const getObservationMetaEntry = (vorgangId, obsId) => {
    const meta = loadObservationsMetaLocal(vorgangId);
    return meta && meta[obsId] ? meta[obsId] : null;
};

const isObservationUnderstandingConfirmed = (vorgangId, obsId) => {
    const entry = getObservationMetaEntry(vorgangId, obsId);
    if (!entry) return false;
    return entry.understandingStatus === UNDERSTANDING_STATUS.confirmed && entry.confirmed === true;
};

const setObservationUnderstandingStatus = (vorgang, obsId, status, patch = {}) => {
    if (!vorgang || !obsId) return;
    const meta = loadObservationsMetaLocal(vorgang.id);
    const currentMeta = meta[obsId] || {};
    meta[obsId] = {
        ...currentMeta,
        ...patch,
        understandingStatus: status
    };
    saveObservationsMetaLocal(vorgang.id, meta);

    const observations = loadObservationsLocal(vorgang.id);
    const idx = observations.findIndex((item) => item.id === obsId);
    if (idx < 0) return;
    const obs = observations[idx];
    obs.originalInput = obs.originalInput || obs.rawInput || '';
    obs.understandingStatus = status;
    if (!obs.understanding) obs.understanding = {};
    obs.understanding.original = obs.understanding.original || obs.originalInput;
    if (patch.recap) obs.understanding.recap = patch.recap;
    if (patch.confirmedRecap) obs.understanding.confirmed = patch.confirmedRecap;
    if (patch.corrections) obs.understanding.corrections = patch.corrections;
    obs.understanding.status = status;
    observations[idx] = obs;
    saveObservationsLocal(vorgang.id, observations);
};

const showRecapUI = (vorgang, recapText, obsId) => {
    return new Promise((resolve) => {
    const wrapper = document.getElementById('recapConfirmation');
    const recapEl = document.getElementById('recapText');
    const structurePreview = document.getElementById('recapStructurePreview');
    const question = document.getElementById('recapQuestion');
    const yesBtn = document.getElementById('recapYes');
    const partialBtn = document.getElementById('recapPartial');
    const noBtn = document.getElementById('recapNo');
    const correctionDiv = document.getElementById('recapCorrection');
    const correctionInput = document.getElementById('recapCorrectionInput');
    const sendCorr = document.getElementById('recapSendCorrection');
    const cancelCorr = document.getElementById('recapCancelCorrection');
    if (!wrapper || !recapEl || !structurePreview || !question) {
        resolve({ status: UNDERSTANDING_STATUS.rejected, recap: '' });
        return;
    }

    let currentRecap = recapText || '';
    let correctionMode = 'partial';

    wrapper.style.display = 'block';
    recapEl.textContent = currentRecap;
    question.textContent = 'Ich möchte sicher sein, dass ich dich richtig verstanden habe. Habe ich dich richtig verstanden?';
    if (correctionDiv) correctionDiv.style.display = 'none';
    structurePreview.innerHTML = buildStructurePreview(vorgang, obsId);

    setObservationUnderstandingStatus(vorgang, obsId, UNDERSTANDING_STATUS.pending, {
        recap: currentRecap,
        confirmed: false,
        corrections: []
    });

    const finalize = (payload) => {
        cleanup();
        resolve(payload);
    };

    const cleanup = () => {
        wrapper.style.display = 'none';
        if (correctionDiv) correctionDiv.style.display = 'none';
        if (correctionInput) correctionInput.value = '';
        // remove handlers
        if (yesBtn) yesBtn.onclick = null;
        if (partialBtn) partialBtn.onclick = null;
        if (noBtn) noBtn.onclick = null;
        if (sendCorr) sendCorr.onclick = null;
        if (cancelCorr) cancelCorr.onclick = null;
    };

    if (yesBtn) yesBtn.onclick = () => {
        // mark confirmed recap for this obs (use current displayed recap)
        const currentRecap = recapEl.textContent || '';
        const meta = loadObservationsMetaLocal(vorgang.id);
        const entry = meta[obsId] || {};
        setObservationUnderstandingStatus(vorgang, obsId, UNDERSTANDING_STATUS.confirmed, {
            ...entry,
            recap: currentRecap,
            confirmedRecap: currentRecap,
            confirmed: true,
            confirmedAt: new Date().toISOString()
        });
        saveSummaryLocal(vorgang.id, currentRecap);
        updatePilotVorgangDraft(vorgang, {
            zusammenfassung: currentRecap,
            strukturierteZusammenfassung: currentRecap,
            rohtext: vorgang.rohtext || currentRecap,
            status: buildObservationStatusLabel(vorgang)
        });
        const obs = applyObservationConfirmation(vorgang, obsId, currentRecap);
        try { appendSystemLog('Rekapitulation bestätigt', vorgang.id, `Rekapitulation für ${obsId} bestätigt`); } catch (e) {}
        // re-render Beobachtungen
        renderSummary(vorgang);
        renderHypothesis(vorgang);
        renderBeobachtungen(vorgang);
        finalize({ status: UNDERSTANDING_STATUS.confirmed, recap: currentRecap, observation: obs || null });
    };

    if (partialBtn) partialBtn.onclick = () => {
        correctionMode = 'partial';
        if (question) {
            question.textContent = 'Welcher Teil stimmt bereits, und was soll ich anders verstehen?';
        }
        if (correctionDiv) correctionDiv.style.display = 'block';
        if (correctionInput) {
            correctionInput.placeholder = 'Bitte korrigieren oder ergänzen.';
            correctionInput.focus();
        }
    };

    if (noBtn) noBtn.onclick = () => {
        correctionMode = 'restart';
        if (question) {
            question.textContent = 'Dann habe ich dich noch nicht richtig verstanden. Bitte erzähle es noch einmal mit deinen eigenen Worten.';
        }
        if (correctionDiv) correctionDiv.style.display = 'block';
        if (correctionInput) {
            correctionInput.placeholder = 'Bitte erzähle es noch einmal mit deinen eigenen Worten.';
            correctionInput.focus();
        }
    };

    if (sendCorr) sendCorr.onclick = () => {
        const corr = correctionInput ? correctionInput.value.trim() : '';
        if (!corr) return;
        if (correctionMode === 'restart') {
            setObservationUnderstandingStatus(vorgang, obsId, UNDERSTANDING_STATUS.rejected, {
                confirmed: false,
                rejectedAt: new Date().toISOString(),
                rejectedRecap: recapEl.textContent || '',
                restartText: corr
            });
            try { appendSystemLog('Rekapitulation abgelehnt', vorgang.id, `Rekapitulation für ${obsId} abgelehnt`); } catch (e) {}
            finalize({ status: UNDERSTANDING_STATUS.rejected, restartText: corr, recap: recapEl.textContent || '' });
            return;
        }

        const meta = loadObservationsMetaLocal(vorgang.id);
        const entry = meta[obsId] || {};
        const corrections = Array.isArray(entry.corrections) ? [...entry.corrections] : [];
        corrections.push({
            text: corr,
            createdAt: new Date().toISOString()
        });

        currentRecap = applyPartialCorrectionToRecap(currentRecap, corr);
        setObservationUnderstandingStatus(vorgang, obsId, UNDERSTANDING_STATUS.pending, {
            ...entry,
            recap: currentRecap,
            corrections,
            confirmed: false
        });

        recapEl.textContent = currentRecap;
        if (correctionDiv) correctionDiv.style.display = 'none';
        if (correctionInput) correctionInput.value = '';
        question.textContent = 'Habe ich dich jetzt richtig verstanden?';
        try { appendSystemLog('Beobachtung geändert', vorgang.id, `Rekapitulation für ${obsId} korrigiert`); } catch (e) {}
    };

    if (cancelCorr) cancelCorr.onclick = () => {
        if (correctionDiv) correctionDiv.style.display = 'none';
    };
    });
};

const buildStructurePreview = (vorgang, obsId) => {
    const observations = loadObservationsLocal(vorgang.id) || [];
    const obs = observations.find((item) => item.id === obsId) || {};
    const answerRows = getAnswerStateList(obs);
    const sections = [
        { title: '👤 Betroffene', value: (obs.answers && obs.answers.affected && obs.answers.affected.value) || obs.werIstBetroffen, placeholder: 'Noch keine Informationen' },
        { title: '👀 Beobachtungen', value: (obs.answers && obs.answers.whatHappened && obs.answers.whatHappened.value) || obs.wasIstPassiert, placeholder: 'Noch keine Informationen' },
        { title: '💡 Erkenntnisse', value: [(obs.answers && obs.answers.whyImportant && obs.answers.whyImportant.value) || obs.warumWichtig, (obs.answers && obs.answers.impact && obs.answers.impact.value) || obs.auswirkung, obs.wasVermutestDu].filter(Boolean).join('\n'), placeholder: 'Noch keine Informationen' },
        { title: '📌 Offene Punkte', value: (obs.unclearFields || []).map((fieldKey) => OBSERVATION_FIELD_MAP[fieldKey]?.label || fieldKey).join(', '), placeholder: 'Keine offenen Punkte' }
    ];

    const answerSection = answerRows.map((answer) => {
        const label = `${answer.label}${answer.status && answer.status !== 'valid' ? ` · ${formatStatusLabel(answer.status)}` : ''}`;
        const text = String(answer.value || '').trim();
        if (!text) return `<div class="recap-card recap-card-empty"><strong>${label}</strong><p>Noch keine Information</p></div>`;
        return `<div class="recap-card"><strong>${label}</strong><p>${text}</p></div>`;
    }).join('');

    return sections.map((section) => {
        const text = String(section.value || '').trim();
        if (!text) {
            return `<div class="recap-card recap-card-empty"><strong>${section.title}</strong><p>${section.placeholder}</p></div>`;
        }
        const lines = text.split(/\n+/).filter(Boolean);
        const content = lines.length > 1 ? `<ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul>` : `<p>${lines[0]}</p>`;
        return `<div class="recap-card"><strong>${section.title}</strong>${content}</div>`;
    }).join('') + answerSection;
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
        const latestDraft = loadPilotVorgangDraft(vorgang.id) || vorgang;
        updatePilotVorgangDraft(latestDraft, {
            nextStepType: type,
            nextStepLabel: getNextStepLabel(type),
            status: status || 'offen',
            updatedAt: new Date().toISOString()
        });
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

const hideVorgangReifeCard = () => {
    const card = document.getElementById('vorgangReifeCard');
    const messageEl = document.getElementById('vorgangReifeSpeicherMeldung');
    if (card) card.style.display = 'none';
    if (messageEl) messageEl.textContent = '';
};

const showVorgangReifeCard = (vorgang, obs, handlungscheck) => {
    const card = document.getElementById('vorgangReifeCard');
    const titleEl = document.getElementById('vorgangReifeTitel');
    const summaryEl = document.getElementById('vorgangReifeZusammenfassung');
    const statusEl = document.getElementById('vorgangReifeStatus');
    const nextStepEl = document.getElementById('vorgangReifeNaechsterSchritt');
    const saveBtn = document.getElementById('vorgangSpeichernButton');
    const messageEl = document.getElementById('vorgangReifeSpeicherMeldung');
    if (!card || !titleEl || !summaryEl || !statusEl || !nextStepEl || !saveBtn || !messageEl) return;

    const titel = String(obs?.titel || generateShortObservationTitle(obs || {})).trim() || 'Beobachtung';
    const hasStructuredAnswers = Object.values(obs?.answers || {}).some((answer) => answer && answer.status === 'valid' && answer.value);
    const zusammenfassung = String(
        (hasStructuredAnswers ? buildObservationSummaryText(obs || {}) : '')
        || (obs && obs.understanding && obs.understanding.confirmed)
        || (obs && obs.confirmedText)
        || (obs && obs.zusammenfassung)
        || buildObservationSummaryText(obs || {})
        || ''
    ).trim();

    titleEl.textContent = titel;
    summaryEl.textContent = zusammenfassung || 'Keine Zusammenfassung vorhanden.';
    statusEl.textContent = handlungscheck && handlungscheck.handlungsreif ? 'Handlungsreif' : 'Noch Klärungsbedarf';
    nextStepEl.textContent = handlungscheck && handlungscheck.handlungsreif
        ? 'Vorgang speichern und für die weitere Bearbeitung bereitstellen.'
        : 'Verbleibenden Klärungsbedarf intern vermerken.';
    messageEl.textContent = '';
    card.style.display = 'block';

    saveBtn.onclick = () => {
        const now = new Date().toISOString();
        const nextObs = {
            ...obs,
            titel,
            zusammenfassung,
            vorgangGespeichertAm: now
        };
        updateObservationLocal(vorgang.id, nextObs);
        updatePilotVorgangDraft(vorgang, {
            titel,
            zusammenfassung,
            strukturierteZusammenfassung: zusammenfassung,
            status: handlungscheck && handlungscheck.handlungsreif ? 'handlungsreif' : (vorgang.status || 'offen'),
            updatedAt: now
        });
        try { appendSystemLog('Vorgang gespeichert', vorgang.id, `Beobachtung ${obs.id} als Vorgangskarte gespeichert`); } catch (e) {}
        messageEl.textContent = 'Vorgang erfolgreich gespeichert.';
    };
};

// New wrapper with confirmation loop
const enhancedStartObservationInterviewWithConfirmation = async () => {
    const input = document.getElementById('workplaceInput');
    const msg = document.getElementById('workplaceSpeechMessage');
    const text = input ? String(input.value || '').trim() : '';
    if (!text) {
        if (msg) msg.textContent = 'Bitte erfasse zuerst eine freie Aussage, bevor die Klärung startet.';
        if (input) input.focus();
        return;
    }
    await startFreeMode();
};

// rebind observation button to new enhanced wrapper with confirmation
if (obsBtn) obsBtn.onclick = enhancedStartObservationInterviewWithConfirmation;

// ensure summary rendered after initial load
window.addEventListener('load', async () => {
    try {
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;
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
            const response = await fetch("/data/vorgaenge/VG-0001.json");
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
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;
        await renderHypothesis(vorgang);
    } catch (e) {
        // ignore
    }
});

window.addEventListener('load', async () => {
    try {
        const vorgang = await loadPilotVorgang();
        if (!vorgang) return;
        renderBeobachtungen(vorgang);
    } catch (e) {
        // ignore
    }
});
