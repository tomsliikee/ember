// Turns what comes from outside (the settings file, a hook's record) into
// values the rest of the service can trust.

export const MODES = ['off', 'auto'];
export const GRACE_CHOICES = [1, 2, 5, 10];
export const FLOOR_CHOICES = [10, 20, 30, 40];
const DEFAULT_GRACE_MINUTES = 2;
const DEFAULT_FLOOR = 20;
const DEFAULT_STYLE = 'blue';

function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function isText(value) {
    return typeof value === 'string' && value !== '';
}

export function parseSettings(json) {
    const {mode, graceMinutes, batteryFloor, holdProcessor, style} = isRecord(json) ? json : {};
    return {
        mode: MODES.includes(mode) ? mode : 'auto',
        graceMinutes: GRACE_CHOICES.includes(graceMinutes) ? graceMinutes : DEFAULT_GRACE_MINUTES,
        batteryFloor: FLOOR_CHOICES.includes(batteryFloor) ? batteryFloor : DEFAULT_FLOOR,
        holdProcessor: typeof holdProcessor === 'boolean' ? holdProcessor : true,
        // The extension knows which styles exist; here it only has to be a plain word.
        style: isText(style) && /^[a-z]+$/.test(style) ? style : DEFAULT_STYLE,
    };
}

// What each of Claude Code's hook events says about its session.
const KINDS = {
    UserPromptSubmit: 'work',
    PreToolUse: 'work',
    PostToolUse: 'work',
    Notification: 'wait',
    Stop: 'stop',
    SessionEnd: 'end',
};

// The unit is the last part of a control group path, such as
// "ptyxis-spawn-….scope".
export function unitOf(cgroup) {
    if (!isText(cgroup))
        return null;
    const last = cgroup.split('/').at(-1);
    return /\.(scope|service)$/.test(last) ? last : null;
}

// A session started from the desktop app runs inside the app's own unit.
export function isDesktopUnit(unit) {
    return unit !== null && /^app-.*(anthropic|claude)/i.test(unit);
}

// record is what hook/ember-hook wrote: {at, cgroup, event}, the event being
// Claude Code's own input to the hook.
export function parseEvent(record) {
    if (!isRecord(record) || !isNumber(record.at) || !isRecord(record.event))
        return null;
    const {session_id: session, hook_event_name: name, cwd, transcript_path: transcript} = record.event;
    const kind = KINDS[name];
    if (!isText(session) || !kind)
        return null;
    const unit = unitOf(record.cgroup);
    return {
        session,
        kind,
        at: record.at * 1000,
        cwd: isText(cwd) ? cwd : null,
        transcript: isText(transcript) ? transcript : null,
        cgroup: unit ? record.cgroup : null,
        unit,
        desktop: isDesktopUnit(unit),
    };
}

const STATES = ['working', 'waiting', 'done'];

function textOrNull(value) {
    return isText(value) ? value : null;
}

// json is what the service wrote down about its sessions before it ended:
// {instances, lastBusyAt, armed}. Anything that is not what it writes is
// left out, so a restart begins with nobody rather than with nonsense.
export function parseKept(json) {
    const {instances, lastBusyAt, armed} = isRecord(json) ? json : {};
    const kept = {};
    for (const raw of Object.values(isRecord(instances) ? instances : {})) {
        if (!isRecord(raw) || !isText(raw.session) || !STATES.includes(raw.state) || !isNumber(raw.since)
            || !isNumber(raw.lastEventAt))
            continue;
        const unit = unitOf(raw.cgroup);
        kept[raw.session] = {
            session: raw.session,
            cwd: textOrNull(raw.cwd),
            transcript: textOrNull(raw.transcript),
            cgroup: unit ? raw.cgroup : null,
            unit,
            desktop: isDesktopUnit(unit),
            state: raw.state,
            since: raw.since,
            lastEventAt: raw.lastEventAt,
        };
    }
    return {instances: kept, lastBusyAt: isNumber(lastBusyAt) ? lastBusyAt : null, armed: armed === true};
}

// The processor's own sensors by the name of their driver, Intel's first,
// then AMD's. They follow the load at once.
const PROCESSOR_SENSORS = ['coretemp', 'k10temp', 'zenpower'];
// Thermal zones, for a kernel without those drivers. The second sits on the
// board and lags, but is better than no reading at all.
const ZONES = ['x86_pkg_temp', 'acpitz'];

// sensors and zones are lists of {name, path}, the path being the file that
// holds the reading. Returns the path to read the processor's heat from, or
// null when the machine shows none.
export function chooseSensor(sensors, zones) {
    for (const [names, list] of [[PROCESSOR_SENSORS, sensors], [ZONES, zones]]) {
        for (const name of names) {
            const found = list.find(entry => entry.name === name);
            if (found)
                return found.path;
        }
    }
    return null;
}
