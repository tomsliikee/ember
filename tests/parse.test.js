import {parseEvent, parseSettings, unitOf, isDesktopUnit, chooseSensor, parseKept} from '../daemon/lib/parse.js';
import {test, equal, done} from './harness.js';

const CLI = '/user.slice/user-1000.slice/user@1000.service/app.slice/ptyxis-spawn-b3b0.scope';
const APP = '/user.slice/user-1000.slice/user@1000.service/app.slice/app-com.anthropic.Claude-4522.scope';

test('settings fall back to the defaults', () => {
    equal(parseSettings(null), {mode: 'auto', graceMinutes: 2, batteryFloor: 20, holdProcessor: true, style: 'blue'});
});

test('settings keep valid values and drop the rest', () => {
    equal(parseSettings({mode: 'off', graceMinutes: 5, batteryFloor: 15, holdProcessor: false, style: 'Pink!'}),
        {mode: 'off', graceMinutes: 5, batteryFloor: 20, holdProcessor: false, style: 'blue'});
});

test('"now" is never a saved mode', () => {
    equal(parseSettings({mode: 'now'}).mode, 'auto');
});

test('the unit is the last part of the control group', () => {
    equal(unitOf(CLI), 'ptyxis-spawn-b3b0.scope');
    equal(unitOf('/user.slice'), null);
    equal(unitOf(undefined), null);
});

test('the desktop app is told from a terminal', () => {
    equal(isDesktopUnit(unitOf(APP)), true);
    equal(isDesktopUnit(unitOf(CLI)), false);
    equal(isDesktopUnit(null), false);
});

test('a prompt is work', () => {
    equal(parseEvent({at: 100, cgroup: CLI, event: {session_id: 'a', hook_event_name: 'UserPromptSubmit',
        cwd: '/home/t/git/ember', transcript_path: '/t.jsonl'}}),
    {session: 'a', kind: 'work', at: 100000, cwd: '/home/t/git/ember', transcript: '/t.jsonl', cgroup: CLI,
        unit: 'ptyxis-spawn-b3b0.scope', desktop: false});
});

test('the other events are named', () => {
    const kind = name => parseEvent({at: 1, cgroup: APP, event: {session_id: 'a', hook_event_name: name}})?.kind ?? null;
    equal(['PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd', 'SessionStart'].map(kind),
        ['work', 'work', 'wait', 'stop', 'end', null]);
});

test('a helper that ends says nothing about its session', () => {
    equal(parseEvent({at: 1, cgroup: APP, event: {session_id: 'a', hook_event_name: 'SubagentStop'}}), null);
});

test('a broken record is dropped', () => {
    equal(parseEvent(null), null);
    equal(parseEvent({at: 'x', event: {}}), null);
    equal(parseEvent({at: 1, event: {hook_event_name: 'Stop'}}), null);
});

test('the processor\'s own sensor comes before any thermal zone', () => {
    const zones = [{name: 'acpitz', path: '/z0'}, {name: 'x86_pkg_temp', path: '/z5'}];
    equal(chooseSensor([{name: 'nvme', path: '/h0'}, {name: 'coretemp', path: '/h3'}], zones), '/h3');
    equal(chooseSensor([{name: 'k10temp', path: '/h1'}], [{name: 'acpitz', path: '/z0'}]), '/h1');
    equal(chooseSensor([{name: 'nvme', path: '/h0'}], zones), '/z5');
    equal(chooseSensor([], [{name: 'acpitz', path: '/z0'}]), '/z0');
});

test('a machine without a sensor has none', () => {
    equal(chooseSensor([{name: 'nvme', path: '/h0'}], [{name: 'iwlwifi_1', path: '/z4'}]), null);
});

test('what was written down about the sessions comes back as it was', () => {
    const instance = {session: 'a', cwd: '/home/t/git/ember', transcript: '/t.jsonl', cgroup: CLI,
        unit: unitOf(CLI), desktop: false, state: 'working', since: 5, lastEventAt: 9};
    equal(parseKept({instances: {a: instance}, lastBusyAt: 9, armed: true}),
        {instances: {a: instance}, lastBusyAt: 9, armed: true});
});

test('a damaged note about the sessions leaves nobody', () => {
    equal(parseKept(null), {instances: {}, lastBusyAt: null, armed: false});
    equal(parseKept({instances: {a: {session: 'a', state: 'flying', since: 1, lastEventAt: 1}, b: 'x'},
        lastBusyAt: 'soon', armed: 1}), {instances: {}, lastBusyAt: null, armed: false});
});

done('parse');
