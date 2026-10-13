// Keeps the samples in one small file: a line is added at the end, and
// lines older than a month are dropped once a day.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {HEADER, formatRow, parseRows, prune, summarise} from './usage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const stateDir = () => GLib.build_filenamev([GLib.get_user_state_dir(), 'ember']);
export const usageFile = () => GLib.build_filenamev([stateDir(), 'usage.csv']);

function readRows() {
    try {
        return parseRows(new TextDecoder().decode(GLib.file_get_contents(usageFile())[1]));
    } catch {
        return [];
    }
}

export class UsageLog {
    constructor() {
        this._prunedAt = 0;
    }

    add(sample) {
        try {
            GLib.mkdir_with_parents(stateDir(), 0o700);
            const file = Gio.File.new_for_path(usageFile());
            const fresh = !file.query_exists(null);
            const stream = file.append_to(Gio.FileCreateFlags.PRIVATE, null);
            stream.write_all(new TextEncoder().encode(`${fresh ? `${HEADER}\n` : ''}${formatRow(sample)}\n`), null);
            stream.close(null);
        } catch (e) {
            print(`ember: could not write ${usageFile()}: ${e.message}`);
        }
        if (sample.at - this._prunedAt >= DAY_MS) {
            this._prunedAt = sample.at;
            this._prune(sample.at);
        }
    }

    _prune(now) {
        const rows = readRows();
        const kept = prune(rows, now);
        if (kept.length === rows.length)
            return;
        try {
            GLib.file_set_contents(usageFile(), `${HEADER}\n${kept.map(formatRow).join('\n')}\n`);
        } catch (e) {
            print(`ember: could not shorten ${usageFile()}: ${e.message}`);
        }
    }

    summary() {
        return summarise(readRows());
    }
}
