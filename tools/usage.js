// Prints what the record of the machine's draw adds up to.
//
//   gjs -m tools/usage.js

import GLib from 'gi://GLib';

import {parseRows, summarise} from '../daemon/lib/usage.js';
import {usageFile} from '../daemon/lib/usagelog.js';

const NAMES = {working: 'Lid open, Claude working', closed: 'Lid closed, Ember holding', asleep: 'Asleep'};

let rows = [];
try {
    rows = parseRows(new TextDecoder().decode(GLib.file_get_contents(usageFile())[1]));
} catch {
    // No record yet.
}
print(`${rows.length} samples in ${usageFile()}, on battery only:`);
for (const [kind, {hours, wh, watts}] of Object.entries(summarise(rows))) {
    const average = watts === null ? 'too little to say' : `${watts.toFixed(2)} W`;
    print(`  ${NAMES[kind].padEnd(28)} ${average.padEnd(18)} ${hours.toFixed(2)} h, ${wh.toFixed(2)} Wh`);
}
