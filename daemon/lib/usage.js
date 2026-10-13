// The record of what the machine draws: how often a sample is due, how a
// sample is written, and what the samples add up to. Nothing here touches
// the disk; usagelog.js does.

export const CLOSED_EVERY_MS = 60 * 1000;
export const OPEN_EVERY_MS = 5 * 60 * 1000;
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// Two samples further apart than this were not taken in one go: the service
// was not running in between, and nothing is known about that time.
const MAX_GAP_MS = 15 * 60 * 1000;
// Less than this in a state is too little to name an average for it.
const MIN_HOURS = 0.05;
const HOUR_MS = 60 * 60 * 1000;

export const HEADER = 'time,state,working,on_battery,percent,wh,watts,celsius';
// "open" and "closed" are samples; closed means Ember holds the lid.
// "sleep" and "wake" mark the two ends of a suspend.
const STATES = ['open', 'closed', 'sleep', 'wake'];

// With the lid closed every minute counts; with it open the samples are
// only there to compare against.
export function isDue(lastAt, now, closed) {
    return now - lastAt >= (closed ? CLOSED_EVERY_MS : OPEN_EVERY_MS);
}

const cell = (value, digits) => value === null ? '' : value.toFixed(digits);

// sample is {at, state, working, onBattery, percent, wh, watts, celsius};
// the last four are null where the machine does not say.
export function formatRow(sample) {
    return [Math.round(sample.at / 1000), sample.state, sample.working, sample.onBattery ? 1 : 0,
        cell(sample.percent, 0), cell(sample.wh, 3), cell(sample.watts, 2), cell(sample.celsius, 0)].join(',');
}

const number = text => text === '' || text === undefined || !Number.isFinite(Number(text)) ? null : Number(text);

export function parseRows(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        const [time, state, working, onBattery, percent, wh, watts, celsius] = line.split(',');
        if (number(time) === null || !STATES.includes(state))
            continue;
        rows.push({
            at: Number(time) * 1000,
            state,
            working: number(working) ?? 0,
            onBattery: onBattery === '1',
            percent: number(percent),
            wh: number(wh),
            watts: number(watts),
            celsius: number(celsius),
        });
    }
    return rows;
}

export function prune(rows, now) {
    return rows.filter(row => now - row.at < KEEP_MS);
}

// The waking that ends the sleep noted at rows[index], or null when the
// record has none before the next sleep. A sample may be taken in between:
// the battery's change is noticed before the waking is announced.
function wakingAfter(rows, index) {
    for (let i = index + 1; i < rows.length && rows[i].state !== 'sleep'; i++) {
        if (rows[i].state === 'wake')
            return rows[i];
    }
    return null;
}

// What kind of time passed between a sample and the next one, or null when
// it is not one of the two that are compared. A sleep is counted apart.
function kindOf(from, to) {
    if (to.at - from.at > MAX_GAP_MS)
        return null;
    if (from.state === 'closed')
        return 'closed';
    return from.state === 'open' && from.working > 0 ? 'working' : null;
}

// Averages from what left the battery, not from the momentary readings: the
// energy that went between two samples, summed up per kind of time.
// Returns {working, closed, asleep}, each {hours, wh, watts}; watts is null
// while there is too little time to go by.
export function summarise(rows) {
    const sums = {working: {ms: 0, wh: 0}, closed: {ms: 0, wh: 0}, asleep: {ms: 0, wh: 0}};
    for (let i = 0; i + 1 < rows.length; i++) {
        const from = rows[i];
        const asleep = from.state === 'sleep';
        const to = asleep ? wakingAfter(rows, i) : rows[i + 1];
        const kind = asleep ? 'asleep' : kindOf(from, to ?? from);
        if (!to)
            continue;
        // On mains the battery says nothing about what the machine draws.
        if (!kind || !from.onBattery || !to.onBattery || from.wh === null || to.wh === null)
            continue;
        if (to.at <= from.at || to.wh > from.wh)
            continue;
        sums[kind].ms += to.at - from.at;
        sums[kind].wh += from.wh - to.wh;
    }
    return Object.fromEntries(Object.entries(sums).map(([kind, {ms, wh}]) => {
        const hours = ms / HOUR_MS;
        return [kind, {hours, wh, watts: hours >= MIN_HOURS ? wh / hours : null}];
    }));
}
