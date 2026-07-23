export const OBSERVATION_CAPTURE_STATUS = {
    idle: 'idle',
    capturing: 'capturing',
    stopping: 'stopping',
    reviewing: 'reviewing',
    correcting: 'correcting',
    confirmed: 'confirmed',
    persisted: 'persisted',
    completed: 'completed',
    cancelled: 'cancelled'
};

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const joinText = (...parts) => parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' ')
    .trim();

export const createSafeId = (prefix = 'id') => {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    const randomPart = Math.random().toString(16).slice(2, 10);
    return `${prefix}-${Date.now()}-${randomPart}`;
};

export const createObservationCaptureSession = ({ vorgangId, mode = 'free' } = {}) => ({
    sessionId: createSafeId('ocs'),
    vorgangId: String(vorgangId || ''),
    observationId: createSafeId('obs'),
    mode,
    startedAt: new Date().toISOString(),
    baseText: '',
    finalSpeechSegments: {},
    acceptedFinalResultKeys: {},
    interimSpeechText: '',
    currentText: '',
    status: OBSERVATION_CAPTURE_STATUS.capturing,
    persisted: false
});

export const validateTargetVorgangId = (vorgangId) => {
    const value = String(vorgangId || '').trim();
    if (!value) {
        return { ok: false, error: 'Kein aktiver Vorgang ausgewählt.' };
    }
    return { ok: true, vorgangId: value };
};

export const resetSpeechBuffers = (session) => {
    if (!session) return session;
    session.baseText = '';
    session.finalSpeechSegments = {};
    session.acceptedFinalResultKeys = {};
    session.interimSpeechText = '';
    session.currentText = '';
    return session;
};

export const startSpeechCycle = (session, baseText = '') => {
    if (!session) return '';
    session.baseText = normalizeText(baseText);
    session.finalSpeechSegments = {};
    session.acceptedFinalResultKeys = {};
    session.interimSpeechText = '';
    session.currentText = session.baseText;
    return session.currentText;
};

const readTranscript = (resultItem) => {
    if (!resultItem || !resultItem[0] || !resultItem[0].transcript) return '';
    return normalizeText(resultItem[0].transcript);
};

const buildDisplayText = (session) => {
    const orderedFinal = Object.entries(session.finalSpeechSegments || {})
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, value]) => value)
        .join(' ')
        .trim();
    return joinText(session.baseText, orderedFinal, session.interimSpeechText);
};

export const applySpeechRecognitionEvent = (session, event) => {
    if (!session || !event || !event.results) return session ? session.currentText : '';
    const startIndex = Number(event.resultIndex || 0);
    let interimText = '';

    for (let index = startIndex; index < event.results.length; index += 1) {
        const resultItem = event.results[index];
        const transcript = readTranscript(resultItem);
        if (!transcript) continue;

        if (resultItem.isFinal) {
            const stableKey = `${index}:${transcript.toLowerCase()}`;
            if (session.acceptedFinalResultKeys[stableKey]) continue;
            session.acceptedFinalResultKeys[stableKey] = true;
            session.finalSpeechSegments[index] = transcript;
            continue;
        }

        interimText = joinText(interimText, transcript);
    }

    session.interimSpeechText = interimText;
    session.currentText = buildDisplayText(session);
    return session.currentText;
};

export const finalizeSpeechInterim = (session) => {
    if (!session) return '';
    session.interimSpeechText = '';
    session.currentText = buildDisplayText(session);
    return session.currentText;
};

export const updateSessionTextFromInput = (session, text) => {
    if (!session) return '';
    session.currentText = normalizeText(text);
    return session.currentText;
};

export const markSessionPersisted = (session) => {
    if (!session) return false;
    if (session.persisted) return false;
    session.persisted = true;
    session.status = OBSERVATION_CAPTURE_STATUS.persisted;
    return true;
};

export const markSessionStopping = (session) => {
    if (!session) return false;
    if (session.status === OBSERVATION_CAPTURE_STATUS.stopping) return false;
    session.status = OBSERVATION_CAPTURE_STATUS.stopping;
    return true;
};

export const applySessionCorrection = (session, correctionText) => {
    if (!session) return '';
    session.status = OBSERVATION_CAPTURE_STATUS.correcting;
    session.confirmedText = normalizeText(correctionText);
    return session.confirmedText;
};

export const confirmSessionText = (session, text = '') => {
    if (!session) return '';
    const confirmed = normalizeText(text || session.confirmedText || session.currentText || session.baseText);
    session.confirmedText = confirmed;
    session.status = OBSERVATION_CAPTURE_STATUS.confirmed;
    return session.confirmedText;
};
