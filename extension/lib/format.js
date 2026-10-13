// Text for what the menu shows. Units are set off with a space, as the
// design system asks.

const MIN = 60 * 1000;

export function watts(value) {
    if (value === null)
        return '–';
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} W`;
}

// Small draws, such as a sleeping machine's, need the second decimal.
export function average(value) {
    if (value === null)
        return '–';
    return `${value >= 10 ? Math.round(value) : value >= 1 ? value.toFixed(1) : value.toFixed(2)} W`;
}

export function percent(value) {
    return value === null ? '–' : `${Math.round(value)} %`;
}

export function duration(ms) {
    const minutes = Math.max(0, Math.round(ms / MIN));
    if (minutes < 1)
        return 'under 1 min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0)
        return m > 0 ? `${h} h ${m} min` : `${h} h`;
    return `${m} min`;
}

// What the big number is, in the words below it.
export function powerCaption(battery) {
    if (battery === null)
        return 'not known without the service';
    if (battery.watts === null)
        return battery.onBattery ? 'drawn from the battery' : 'on mains power';
    return battery.onBattery ? 'drawn from the battery now' : 'going into the battery now';
}

export function remaining(battery) {
    return battery.onBattery && battery.remainingMs !== null ? `About ${duration(battery.remainingMs)} left` : '';
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// What closing the lid will do right now, as one sentence.
export function lidSentence(state) {
    if (state.mode === 'off')
        return 'Goes to sleep, as always.';
    if (!state.sensor)
        return 'Goes to sleep: no temperature sensor found.';
    if (state.mode === 'now')
        return 'Stays awake until you open it again.';
    const working = state.sessions.filter(entry => entry.state === 'working').length;
    const waiting = state.sessions.length - working;
    if (working > 0)
        return `Stays awake: ${plural(working, 'session')} ${working === 1 ? 'is' : 'are'} working.`;
    if (waiting > 0 && state.holding)
        return `Stays awake a while: ${plural(waiting, 'session')} ${waiting === 1 ? 'waits' : 'wait'} for you.`;
    if (state.holding)
        return 'Stays awake a moment longer, in case the work goes on.';
    return 'Goes to sleep: nothing is working.';
}

export function sessionLine(entry, now) {
    if (entry.state === 'waiting')
        return 'Waits for you';
    return entry.since === null ? 'Working' : `Working for ${duration(now - entry.since)}`;
}

const ENDINGS = {
    opened: 'It ended when you opened the lid.',
    done: 'It ended when Claude had finished.',
    waiting: 'It ended while Claude waited for you.',
    battery: 'It ended to keep the rest of the battery.',
    heat: 'It ended because the machine ran too hot.',
    stopped: 'It ended with the Ember service.',
};

export function runUsed(run) {
    if (run.startPercent === null || run.endPercent === null)
        return null;
    return Math.max(0, run.startPercent - run.endPercent);
}

export function runSentence(run) {
    return ENDINGS[run.reason];
}
