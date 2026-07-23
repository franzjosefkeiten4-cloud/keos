import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OBSERVATION_CAPTURE_STATUS,
    applySessionCorrection,
    applySpeechRecognitionEvent,
    confirmSessionText,
    createObservationCaptureSession,
    finalizeSpeechInterim,
    markSessionPersisted,
    markSessionStopping,
    startSpeechCycle,
    validateTargetVorgangId
} from '../../public/observation-capture.js';

const makeResult = (transcript, isFinal = false) => {
    const item = [{ transcript }];
    item.isFinal = isFinal;
    return item;
};

test('1) Neue Session ist leer und besitzt genau einen Vorgang', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000', mode: 'free' });
    assert.equal(session.vorgangId, 'VG-2000');
    assert.equal(session.baseText, '');
    assert.equal(session.currentText, '');
    assert.equal(session.persisted, false);
    assert.equal(session.status, OBSERVATION_CAPTURE_STATUS.capturing);
});

test('2) Zweite Session enthält keinen Text der ersten', () => {
    const first = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    startSpeechCycle(first, 'Vorheriger Text');
    const second = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    assert.equal(second.currentText, '');
    assert.equal(second.baseText, '');
});

test('3) Identisches finales Speech-Resultat wird nur einmal übernommen', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    startSpeechCycle(session, '');
    const eventA = { resultIndex: 0, results: [makeResult('Die Maschine steht.', true)] };
    const eventB = { resultIndex: 0, results: [makeResult('Die Maschine steht.', true)] };
    const firstText = applySpeechRecognitionEvent(session, eventA);
    const secondText = applySpeechRecognitionEvent(session, eventB);
    assert.equal(firstText, 'Die Maschine steht.');
    assert.equal(secondText, 'Die Maschine steht.');
});

test('4) Interim-Ergebnis ersetzt vorheriges Interim-Ergebnis', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    startSpeechCycle(session, 'Start');
    applySpeechRecognitionEvent(session, { resultIndex: 0, results: [makeResult('kurz', false)] });
    const text = applySpeechRecognitionEvent(session, { resultIndex: 0, results: [makeResult('kurz erweitert', false)] });
    assert.equal(text, 'Start kurz erweitert');
});

test('5) Finalisierung löscht Interim korrekt', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    startSpeechCycle(session, 'Start');
    applySpeechRecognitionEvent(session, { resultIndex: 0, results: [makeResult('noch offen', false)] });
    const finalText = finalizeSpeechInterim(session);
    assert.equal(finalText, 'Start');
    assert.equal(session.interimSpeechText, '');
});

test('6) Mehrfacher Stop ist idempotent', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    const first = markSessionStopping(session);
    const second = markSessionStopping(session);
    assert.equal(first, true);
    assert.equal(second, false);
});

test('7) Persistierung wird bei zweitem Aufruf blockiert', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    const first = markSessionPersisted(session);
    const second = markSessionPersisted(session);
    assert.equal(first, true);
    assert.equal(second, false);
});

test('8) Korrektur verändert nur die aktuelle Session-Beobachtung', () => {
    const sessionA = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    const sessionB = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    applySessionCorrection(sessionA, 'Bitte mit Lieferschein dokumentieren.');
    assert.equal(sessionA.confirmedText, 'Bitte mit Lieferschein dokumentieren.');
    assert.equal(sessionB.confirmedText, undefined);
});

test('9) Bestätigung setzt den korrekten Sessionstatus', () => {
    const session = createObservationCaptureSession({ vorgangId: 'VG-2000' });
    const confirmed = confirmSessionText(session, 'Bestätigter Text');
    assert.equal(confirmed, 'Bestätigter Text');
    assert.equal(session.status, OBSERVATION_CAPTURE_STATUS.confirmed);
});

test('10) Fehlender Zielvorgang liefert kontrollierten Fehler', () => {
    const invalid = validateTargetVorgangId('');
    assert.equal(invalid.ok, false);
    assert.match(invalid.error, /Kein aktiver Vorgang/);
});
