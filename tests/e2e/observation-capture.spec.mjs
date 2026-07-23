import { test, expect } from '@playwright/test';

const startCaptureFlow = async (page) => {
    await page.getByRole('button', { name: '📝 Etwas festhalten' }).click();
    await page.getByRole('button', { name: 'Beobachtung' }).click();
    await page.getByRole('button', { name: 'Freies Erzählen' }).click();
};

const getObservationCount = async (page) => page.evaluate(() => {
    const vorgangId = localStorage.getItem('keosActiveVorgangId');
    if (!vorgangId) return 0;
    const raw = localStorage.getItem(`keosVorgangObservations:${vorgangId}`);
    if (!raw) return 0;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
        return 0;
    }
});

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');
});

test('A) Etwas festhalten zeigt aktuellen Zielvorgang', async ({ page }) => {
    await startCaptureFlow(page);
    await expect(page.locator('#observationTargetInfo')).toBeVisible();
    await expect(page.locator('#observationTargetText')).toContainText('Diese Beobachtung gehört zu:');
});

test('B) Freie Eingabe -> fertig -> recap -> ja erzeugt genau einen Eintrag', async ({ page }) => {
    await startCaptureFlow(page);
    await page.locator('#workplaceInput').fill('Bei der Auslieferung fiel eine Maschine aus und der Auftrag verzögert sich für den Kunden.');
    await page.getByRole('button', { name: 'Ich bin fertig' }).click();
    await expect(page.locator('#recapConfirmation')).toBeVisible();
    await page.getByRole('button', { name: 'Ja, genau so.' }).click();
    await expect(page.locator('#observationCompletionCard')).toBeVisible();
    await expect.poll(() => getObservationCount(page)).toBe(1);
});

test('C) Teilweise korrigieren -> ja speichert genau eine korrigierte Beobachtung', async ({ page }) => {
    await startCaptureFlow(page);
    await page.locator('#workplaceInput').fill('Im Lager gibt es wiederholt Verwechslungen bei den Lieferscheinen.');
    await page.getByRole('button', { name: 'Ich bin fertig' }).click();
    await expect(page.locator('#recapConfirmation')).toBeVisible();
    await page.getByRole('button', { name: 'Teilweise - ich möchte etwas korrigieren oder ergänzen.' }).click();
    await page.locator('#recapCorrectionInput').fill('Bitte ergänzen: Das betrifft vor allem die Spätschicht.');
    await page.getByRole('button', { name: 'Korrektur senden' }).click();
    await page.getByRole('button', { name: 'Ja, genau so.' }).click();

    await expect.poll(() => getObservationCount(page)).toBe(1);
    const hasCorrection = await page.evaluate(() => {
        const vorgangId = localStorage.getItem('keosActiveVorgangId');
        const raw = localStorage.getItem(`keosVorgangObservations:${vorgangId}`);
        const list = raw ? JSON.parse(raw) : [];
        const item = list[list.length - 1];
        return Boolean(item?.understanding?.confirmed && item.understanding.confirmed.includes('Spätschicht'));
    });
    expect(hasCorrection).toBeTruthy();
});

test('D) Zwei Durchläufe bleiben textlich getrennt', async ({ page }) => {
    await startCaptureFlow(page);
    await page.locator('#workplaceInput').fill('Erster Durchlauf: Reklamation beim Beschlag.');
    await page.getByRole('button', { name: 'Ich bin fertig' }).click();
    await page.getByRole('button', { name: 'Ja, genau so.' }).click();

    await startCaptureFlow(page);
    await page.locator('#workplaceInput').fill('Zweiter Durchlauf: Verzögerung durch fehlendes Material.');
    await page.getByRole('button', { name: 'Ich bin fertig' }).click();
    await page.getByRole('button', { name: 'Ja, genau so.' }).click();

    await expect.poll(() => getObservationCount(page)).toBe(2);
    const separated = await page.evaluate(() => {
        const vorgangId = localStorage.getItem('keosActiveVorgangId');
        const raw = localStorage.getItem(`keosVorgangObservations:${vorgangId}`);
        const list = raw ? JSON.parse(raw) : [];
        if (list.length < 2) return false;
        return list[0].rawInput !== list[1].rawInput;
    });
    expect(separated).toBeTruthy();
});

test('E) Wiederholte Speech-Resultate werden im Browser idempotent verarbeitet', async ({ page }) => {
    const simulated = await page.evaluate(async () => {
        const mod = await import('/observation-capture.js');
        const session = mod.createObservationCaptureSession({ vorgangId: 'VG-TEST' });
        mod.startSpeechCycle(session, '');
        const makeResult = (transcript, isFinal) => {
            const item = [{ transcript }];
            item.isFinal = isFinal;
            return item;
        };
        mod.applySpeechRecognitionEvent(session, { resultIndex: 0, results: [makeResult('Doppelblock', true)] });
        return mod.applySpeechRecognitionEvent(session, { resultIndex: 0, results: [makeResult('Doppelblock', true)] });
    });
    expect(simulated).toBe('Doppelblock');
});

test('F) Langer Rohtext ist zunächst eingeklappt', async ({ page }) => {
    await startCaptureFlow(page);
    const longText = 'Sehr langer Rohtext '.repeat(60);
    await page.locator('#workplaceInput').fill(longText);
    await page.getByRole('button', { name: 'Ich bin fertig' }).click();
    await page.getByRole('button', { name: 'Ja, genau so.' }).click();
    await expect(page.locator('#vorgang-rohtext button')).toHaveText('Original vollständig anzeigen');
});

test('G/H) Mobile 390x844 ohne horizontalen Overflow und ohne pageerror/console-error', async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await startCaptureFlow(page);
    await expect(page.locator('#intentCaptureArea')).toBeVisible();

    const hasOverflow = await page.evaluate(() => {
        const target = document.getElementById('intentCaptureArea');
        if (!target) return true;
        return target.scrollWidth > window.innerWidth + 1;
    });

    expect(hasOverflow).toBeFalsy();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
});
