// Keeps the lid held across a restart of the service. The service's own
// locks end with its process; while the lid is closed a second holder runs
// beside it as a unit of its own (daemon/ember-bridge), which lasts a
// minute past the service's last sign of life.

import GLib from 'gi://GLib';

import {act} from './log.js';

const UNIT = 'ember-bridge.service';
const dir = () => GLib.build_filenamev([GLib.get_user_runtime_dir(), 'ember']);
const beatFile = () => GLib.build_filenamev([dir(), 'alive']);
// Beside the service's own files, wherever they are installed.
const script = () => GLib.build_filenamev([GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0])), 'ember-bridge']);

function run(command) {
    const [, , , status] = GLib.spawn_command_line_sync(command);
    if (status !== 0)
        throw new Error(`"${command}" ended with ${status}`);
}

function running() {
    try {
        run(`systemctl --user --quiet is-active ${UNIT}`);
        return true;
    } catch {
        return false;
    }
}

// The sign of life the bridge waits for.
export function beat() {
    try {
        GLib.mkdir_with_parents(dir(), 0o700);
        GLib.file_set_contents(beatFile(), `${Date.now()}\n`);
    } catch {
        // Without it the bridge ends, which is the safe way round.
    }
}

export function start() {
    beat();
    if (running())
        return;
    act('start the bridge for a restart', () => run(`systemd-run --user --quiet --collect --unit=${UNIT} `
        + '--slice=session.slice systemd-inhibit --what=handle-lid-switch:sleep --who=Ember '
        + `--why="Holding the lid while the service restarts" --mode=block ${script()}`));
}

// Ends the bridge at once; until it is gone the machine cannot sleep.
export function stop() {
    GLib.unlink(beatFile());
    if (running())
        act('stop the bridge', () => run(`systemctl --user stop ${UNIT}`));
}
