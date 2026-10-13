// The sentences Ember says about a finished run, in the notification shown
// when the lid opens.

export function duration(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 1)
        return 'under a minute';
    if (minutes < 60)
        return `${minutes} min`;
    const rest = minutes % 60;
    return rest === 0 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 60)} h ${rest} min`;
}

const ENDINGS = {
    opened: 'Claude kept working until you opened the lid.',
    done: 'Claude finished, and the machine went to sleep.',
    waiting: 'Claude waited for your answer, and the machine went to sleep.',
    battery: 'The machine went to sleep to keep the rest of the battery.',
    heat: 'The machine went to sleep because it ran too hot.',
};

// A run that was cut short while sessions still worked says so first.
export function sentence(run) {
    const parts = [];
    const cut = (run.reason === 'battery' || run.reason === 'heat') && run.working > 0;
    if (cut)
        parts.push(`Stopped with ${run.working} ${run.working === 1 ? 'session' : 'sessions'} still working.`);
    parts.push(ENDINGS[run.reason] ?? '');
    const used = run.startPercent !== null && run.endPercent !== null
        ? Math.max(0, Math.round(run.startPercent - run.endPercent)) : null;
    parts.push(used === null
        ? `The lid was closed for ${duration(run.endedAt - run.startedAt)}.`
        : `The lid was closed for ${duration(run.endedAt - run.startedAt)} and used ${used} % of the battery.`);
    return parts.filter(part => part !== '').join(' ');
}
