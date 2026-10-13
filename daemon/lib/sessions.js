// Which Claude sessions are working, kept from the hook events and checked
// against what the machine shows, because not every end is announced.

// Without any sign of life for this long, a session counts as finished:
// Claude Code sends no Stop when the user interrupts it.
export const QUIET_MS = 10 * 60 * 1000;
// Shares of one processor core. Below the first a unit is at rest; above the
// second it is plainly doing something, such as a build left in the background.
const QUIET_SHARE = 0.01;
const BUSY_SHARE = 0.2;

// instances maps a session id to {session, cwd, transcript, cgroup, unit, desktop,
// state, since, lastEventAt}; state is "working", "waiting" or "done".
export function apply(instances, event) {
    const next = {...instances};
    const previous = instances[event.session];
    if (event.kind === 'end') {
        delete next[event.session];
        return next;
    }
    // A session that never said it works has nothing to wait for or to stop.
    if (!previous && event.kind !== 'work')
        return next;

    const base = {
        session: event.session,
        cwd: event.cwd ?? previous?.cwd ?? null,
        transcript: event.transcript ?? previous?.transcript ?? null,
        cgroup: event.cgroup ?? previous?.cgroup ?? null,
        unit: event.unit ?? previous?.unit ?? null,
        desktop: event.unit ? event.desktop : previous?.desktop ?? false,
        lastEventAt: event.at,
    };
    if (event.kind === 'work') {
        next[event.session] = {...base, state: 'working',
            since: previous?.state === 'working' ? previous.since : event.at};
    } else if (event.kind === 'stop') {
        next[event.session] = {...base, state: 'done', since: event.at};
    } else if (previous.state === 'working') {
        next[event.session] = {...base, state: 'waiting', since: event.at};
    }
    // A notice that reaches a finished session is the reminder that it is
    // idle; it changes nothing.
    return next;
}

// facts is what the machine shows for the session's unit: {alive,
// transcriptAt, cpuShare}, the last two null when unknown.
export function status(instance, facts, now) {
    if (!facts.alive)
        return 'gone';
    if (instance.state === 'waiting')
        return 'waiting';
    // A session of the desktop app shares its unit with the app, which is
    // never quite at rest, so the processor says nothing about it.
    if (instance.state === 'done') {
        const background = !instance.desktop && facts.cpuShare !== null && facts.cpuShare >= BUSY_SHARE;
        return background ? 'working' : 'idle';
    }
    const lastSign = Math.max(instance.lastEventAt, facts.transcriptAt ?? 0);
    if (now - lastSign < QUIET_MS)
        return 'working';
    const atRest = instance.desktop || (facts.cpuShare !== null && facts.cpuShare < QUIET_SHARE);
    return atRest ? 'idle' : 'working';
}

function projectOf(cwd) {
    return cwd?.split('/').filter(part => part !== '').at(-1) ?? 'Claude Code';
}

// Returns the instances that still exist and what they add up to.
// factsFor(instance) gives the facts described above.
export function summarise(instances, factsFor, now) {
    const kept = {};
    const list = [];
    for (const instance of Object.values(instances)) {
        const state = status(instance, factsFor(instance), now);
        if (state === 'gone')
            continue;
        kept[instance.session] = instance;
        if (state !== 'idle') {
            list.push({project: projectOf(instance.cwd), state, since: instance.since,
                unit: instance.unit, desktop: instance.desktop});
        }
    }
    const waiting = list.filter(entry => entry.state === 'waiting').map(entry => entry.since);
    return {
        instances: kept,
        list,
        working: list.filter(entry => entry.state === 'working').length,
        // The latest question counts: each one starts the wait anew.
        waitingSince: waiting.length > 0 ? Math.max(...waiting) : null,
    };
}
