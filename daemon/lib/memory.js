// What Ember changed on the machine and has not put back yet, kept on disk
// so that it can be put back after a crash or a restart as well.

import GLib from 'gi://GLib';

const stateDir = () => GLib.build_filenamev([GLib.get_user_state_dir(), 'ember']);
const file = () => GLib.build_filenamev([stateDir(), 'applied.json']);

export function recall() {
    try {
        const [, bytes] = GLib.file_get_contents(file());
        const json = JSON.parse(new TextDecoder().decode(bytes));
        return {
            frozen: Array.isArray(json.frozen) ? json.frozen.filter(unit => typeof unit === 'string') : [],
            paused: Array.isArray(json.paused) ? json.paused.filter(unit => typeof unit === 'string') : [],
            saved: typeof json.saved === 'object' && json.saved !== null ? json.saved : {},
        };
    } catch {
        return {frozen: [], paused: [], saved: {}};
    }
}

export function remember(memory) {
    try {
        GLib.mkdir_with_parents(stateDir(), 0o700);
        GLib.file_set_contents(file(), `${JSON.stringify(memory, null, 2)}\n`);
    } catch (e) {
        print(`ember: could not write ${file()}: ${e.message}`);
    }
}

export function isEmpty(memory) {
    return memory.frozen.length === 0 && memory.paused.length === 0 && Object.keys(memory.saved).length === 0;
}
