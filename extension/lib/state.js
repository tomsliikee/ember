// Turns what the Ember service publishes into values the menu can trust.

export const MODES = ['off', 'auto', 'now'];
const SESSION_STATES = ['working', 'waiting'];
const REASONS = ['opened', 'done', 'waiting', 'battery', 'heat', 'stopped'];

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const numbers = value => Array.isArray(value) ? value.filter(item => number(item) !== null) : [];

function session(raw) {
    if (!isRecord(raw) || typeof raw.project !== 'string' || !SESSION_STATES.includes(raw.state))
        return null;
    return {project: raw.project, state: raw.state, since: number(raw.since)};
}

function run(raw) {
    if (!isRecord(raw) || number(raw.startedAt) === null || number(raw.endedAt) === null
        || !REASONS.includes(raw.reason))
        return null;
    return {
        startedAt: raw.startedAt,
        endedAt: raw.endedAt,
        startPercent: number(raw.startPercent),
        endPercent: number(raw.endPercent),
        reason: raw.reason,
        working: number(raw.working) ?? 0,
    };
}

// json is the text of the service's State property. Returns null when it is
// not what the service writes.
export function parseState(json) {
    let raw;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    if (!isRecord(raw) || !MODES.includes(raw.mode))
        return null;
    const battery = isRecord(raw.battery) ? raw.battery : {};
    const settings = isRecord(raw.settings) ? raw.settings : {};
    const choices = isRecord(raw.choices) ? raw.choices : {};
    const usage = isRecord(raw.usage) ? raw.usage : {};
    return {
        mode: raw.mode,
        holding: raw.holding === true,
        sessions: (Array.isArray(raw.sessions) ? raw.sessions : []).map(session).filter(entry => entry !== null),
        battery: {
            percent: number(battery.percent),
            onBattery: battery.onBattery === true,
            watts: number(battery.watts),
            remainingMs: number(battery.remainingMs),
        },
        lastRun: run(raw.lastRun),
        // Average watts on battery for each kind of time; null until there is enough of it.
        usage: {working: number(usage.working), closed: number(usage.closed), asleep: number(usage.asleep)},
        settings: {
            graceMinutes: number(settings.graceMinutes),
            batteryFloor: number(settings.batteryFloor),
            holdProcessor: settings.holdProcessor === true,
            style: typeof settings.style === 'string' ? settings.style : null,
        },
        choices: {graceMinutes: numbers(choices.graceMinutes), batteryFloor: numbers(choices.batteryFloor)},
        helper: raw.helper === true,
        // False on a machine whose heat cannot be read; Ember holds nothing there.
        sensor: raw.sensor !== false,
    };
}
