// Puts the user's units to rest and wakes them again, through the user's
// own service manager, and reads what the machine shows about a unit.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {act} from './log.js';
import {call} from './bus.js';
import {unitOf} from './parse.js';

const NAME = 'org.freedesktop.systemd1';
const PATH = '/org/freedesktop/systemd1';
const MANAGER = 'org.freedesktop.systemd1.Manager';
const CGROUPS = '/sys/fs/cgroup';

function read(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes);
    } catch {
        return null;
    }
}

export function runningUnits() {
    const [units] = call(Gio.DBus.session, NAME, PATH, MANAGER, 'ListUnitsFiltered',
        new GLib.Variant('(as)', [['active']]));
    return units.map(unit => unit[0]).filter(name => /\.(scope|service)$/.test(name));
}

// The units that hold a process of Claude Code or the desktop app.
export function claudeUnits() {
    const units = new Set();
    const proc = Gio.File.new_for_path('/proc').enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    for (let info = proc.next_file(null); info !== null; info = proc.next_file(null)) {
        const pid = info.get_name();
        if (!/^\d+$/.test(pid) || !/^claude/.test(read(`/proc/${pid}/comm`) ?? ''))
            continue;
        const unit = unitOf(/^0::(.*)$/m.exec(read(`/proc/${pid}/cgroup`) ?? '')?.[1]);
        if (unit)
            units.add(unit);
    }
    return [...units];
}

export function freeze(units) {
    for (const unit of units) {
        act(`freeze ${unit}`, () => call(Gio.DBus.session, NAME, PATH, MANAGER, 'FreezeUnit',
            new GLib.Variant('(s)', [unit])));
    }
}

export function thaw(units) {
    for (const unit of units) {
        act(`thaw ${unit}`, () => call(Gio.DBus.session, NAME, PATH, MANAGER, 'ThawUnit',
            new GLib.Variant('(s)', [unit])));
    }
}

export function exists(cgroup) {
    return GLib.file_test(`${CGROUPS}${cgroup}`, GLib.FileTest.IS_DIR);
}

// Processor time the unit has used so far, in microseconds.
export function cpuUsec(cgroup) {
    const usage = /^usage_usec (\d+)$/m.exec(read(`${CGROUPS}${cgroup}/cpu.stat`) ?? '');
    return usage ? Number(usage[1]) : null;
}

export function modifiedAt(path) {
    try {
        const info = Gio.File.new_for_path(path).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
        return info.get_attribute_uint64('time::modified') * 1000;
    } catch {
        return null;
    }
}
