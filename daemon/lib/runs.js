// The record of each time the lid was closed with Ember holding it: how
// long, what it cost and why it ended.

import GLib from 'gi://GLib';

const stateDir = () => GLib.build_filenamev([GLib.get_user_state_dir(), 'ember']);
const file = () => GLib.build_filenamev([stateDir(), 'runs.jsonl']);

function isRun(value) {
    return typeof value === 'object' && value !== null
        && Number.isFinite(value.startedAt) && Number.isFinite(value.endedAt) && typeof value.reason === 'string';
}

// run is {startedAt, endedAt, startPercent, endPercent, reason, working}.
export function record(run) {
    try {
        GLib.mkdir_with_parents(stateDir(), 0o700);
        const previous = GLib.file_test(file(), GLib.FileTest.EXISTS)
            ? new TextDecoder().decode(GLib.file_get_contents(file())[1]) : '';
        GLib.file_set_contents(file(), `${previous}${JSON.stringify(run)}\n`);
    } catch (e) {
        print(`ember: could not write ${file()}: ${e.message}`);
    }
}

export function lastRun() {
    try {
        const lines = new TextDecoder().decode(GLib.file_get_contents(file())[1]).trim().split('\n');
        const run = JSON.parse(lines.at(-1));
        return isRun(run) ? run : null;
    } catch {
        return null;
    }
}
