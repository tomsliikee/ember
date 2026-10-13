// The Ember service: watches the Claude sessions, the lid, the battery and
// the heat, asks decide() what to do, and does it.
//
//   gjs -m daemon/main.js [--dry-run] [--lid-file PATH] [--restore]
//
// --dry-run changes nothing and says what it would do; --lid-file lets a
// file stand in for the lid; --restore puts back whatever an earlier run
// left changed, and ends.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GLibUnix from 'gi://GLibUnix';
import system from 'system';

import * as Bridge from './lib/bridge.js';
import {decide} from './lib/decide.js';
import * as Freezer from './lib/freezer.js';
import {Guard} from './lib/guard.js';
import {note, setDryRun} from './lib/log.js';
import {Logind} from './lib/logind.js';
import {isEmpty, recall, remember} from './lib/memory.js';
import {FLOOR_CHOICES, GRACE_CHOICES, parseEvent, parseKept, parseSettings} from './lib/parse.js';
import {sentence} from './lib/report.js';
import {lastRun, record} from './lib/runs.js';
import * as Saving from './lib/saving.js';
import {isDue} from './lib/usage.js';
import {UsageLog} from './lib/usagelog.js';
import {chooseFrozen} from './lib/select.js';
import {apply, summarise} from './lib/sessions.js';

const BUS_NAME = 'io.github.tomsliikee.Ember';
const BUS_PATH = '/io/github/tomsliikee/Ember';
const INTERFACE = `
<node>
  <interface name="${BUS_NAME}">
    <method name="SetMode"><arg type="s" direction="in" name="mode"/></method>
    <method name="SetSetting">
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="in" name="json"/>
    </method>
    <property name="State" type="s" access="read"/>
  </interface>
</node>`;
const TICK_SECONDS = 20;
// The averages are worked out from the whole record, so not on every sample.
const SUMMARY_EVERY_MS = 60 * 60 * 1000;
const SIGTERM = 15;
const SIGINT = 2;

const configFile = () => GLib.build_filenamev([GLib.get_user_config_dir(), 'ember', 'settings.json']);
const eventsDir = () => GLib.build_filenamev([GLib.get_user_runtime_dir(), 'ember', 'events']);
const keptFile = () => GLib.build_filenamev([GLib.get_user_runtime_dir(), 'ember', 'sessions.json']);

function readJson(path) {
    try {
        return JSON.parse(new TextDecoder().decode(GLib.file_get_contents(path)[1]));
    } catch {
        return null;
    }
}

// Puts back what an earlier run of the service left changed. A dry run
// only says so and leaves the note of it where it is.
function restoreLeftovers(dry) {
    const memory = recall();
    if (isEmpty(memory))
        return;
    note('putting back what an earlier run left changed');
    Freezer.thaw([...memory.paused, ...memory.frozen]);
    Saving.restore(memory.saved);
    if (!dry)
        remember({frozen: [], paused: [], saved: {}});
}

class Service {
    constructor({lidFile, dryRun}) {
        this._dryRun = dryRun;
        this._settings = parseSettings(readJson(configFile()));
        // What a service before this one knew about the sessions: a restart
        // must not make a session that still works look finished.
        const kept = parseKept(dryRun ? null : readJson(keptFile()));
        this._armed = kept.armed;
        this._instances = kept.instances;
        this._kept = '';
        this._samples = new Map();
        this._lastBusyAt = kept.lastBusyAt;
        // A bridge may be left from that service; it goes unless a run takes it over.
        this._bridged = !dryRun;
        this._run = null;
        this._paused = false;
        this._memory = {frozen: [], paused: [], saved: {}};
        this._report = null;
        this._wasClosed = false;
        this._published = '';
        this._connected = false;
        this._list = [];
        this._sessionsLine = '';
        this._lastRun = lastRun();
        this._usage = dryRun ? null : new UsageLog();
        this._usageAt = 0;
        this._usageSummary = null;
        this._summaryAt = 0;

        this._guard = new Guard({lidFile, onChange: () => this._evaluate()});
        note(this._guard.sensor ? `heat is read from ${this._guard.sensor}`
            : 'no temperature sensor found: the lid will not be held');
        this._logind = new Logind({onSleep: () => this._mark('sleep'), onResume: () => {
            this._mark('wake');
            this._evaluate();
        }});
        this._watchEvents();
        this._exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE, this);
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TICK_SECONDS, () => {
            this._evaluate();
            return GLib.SOURCE_CONTINUE;
        });
    }

    export(connection) {
        this._exported.export(connection, BUS_PATH);
        this._connected = true;
        this._evaluate();
    }

    // The interface's methods and its one property.

    SetMode(mode) {
        this._armed = mode === 'now';
        if (!this._armed)
            this._saveSettings({...this._settings, mode});
        note(`mode: ${this._armed ? 'now' : this._settings.mode}`);
        this._evaluate();
    }

    SetSetting(name, json) {
        let value;
        try {
            value = JSON.parse(json);
        } catch {
            return;
        }
        this._saveSettings({...this._settings, [name]: value});
        this._evaluate();
    }

    get State() {
        return this._published;
    }

    _saveSettings(settings) {
        this._settings = parseSettings(settings);
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(configFile()), 0o700);
            GLib.file_set_contents(configFile(), `${JSON.stringify(this._settings, null, 2)}\n`);
        } catch {
            // The choice still holds while the service runs; it is only not remembered.
        }
    }

    // The hooks leave one file per event; they are read in the order they
    // were written and removed.
    _watchEvents() {
        const dir = Gio.File.new_for_path(eventsDir());
        GLib.mkdir_with_parents(eventsDir(), 0o700);
        this._eventsMonitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this._eventsMonitor.connect('changed', () => {
            if (this._readEvents())
                this._evaluate();
        });
        this._readEvents();
    }

    _readEvents() {
        const names = [];
        const files = Gio.File.new_for_path(eventsDir()).enumerate_children('standard::name',
            Gio.FileQueryInfoFlags.NONE, null);
        for (let info = files.next_file(null); info !== null; info = files.next_file(null)) {
            if (info.get_name().endsWith('.json'))
                names.push(info.get_name());
        }
        for (const name of names.sort()) {
            const path = GLib.build_filenamev([eventsDir(), name]);
            const event = parseEvent(readJson(path));
            GLib.unlink(path);
            if (event)
                this._instances = apply(this._instances, event);
        }
        return names.length > 0;
    }

    // Who works and who waits goes to the journal whenever it changes, so a
    // machine that stayed awake can be asked why.
    _noteSessions(list) {
        const line = list.map(entry => `${entry.project} ${entry.state}`).join(', ') || 'nobody';
        if (line === this._sessionsLine)
            return;
        this._sessionsLine = line;
        note(`at work: ${line}`);
    }

    // The share of one processor core the unit used since it was last asked.
    _cpuShare(cgroup, now) {
        const usec = Freezer.cpuUsec(cgroup);
        const previous = this._samples.get(cgroup);
        if (usec === null)
            return null;
        if (!previous || now - previous.at >= TICK_SECONDS * 1000) {
            const share = previous ? (usec - previous.usec) / ((now - previous.at) * 1000) : null;
            this._samples.set(cgroup, {usec, at: now, share});
            return share;
        }
        // Asked again within the same tick: the last answer still stands.
        return previous.share;
    }

    _facts(instance, now) {
        if (instance.cgroup === null)
            return {alive: true, transcriptAt: null, cpuShare: null};
        return {
            alive: Freezer.exists(instance.cgroup),
            transcriptAt: instance.transcript ? Freezer.modifiedAt(instance.transcript) : null,
            cpuShare: this._cpuShare(instance.cgroup, now),
        };
    }

    _evaluate() {
        const now = Date.now();
        const summary = summarise(this._instances, instance => this._facts(instance, now), now);
        this._instances = summary.instances;
        this._list = summary.list;
        this._noteSessions(summary.list);
        for (const cgroup of this._samples.keys()) {
            if (!Object.values(this._instances).some(instance => instance.cgroup === cgroup))
                this._samples.delete(cgroup);
        }

        const lidClosed = this._guard.lidClosed;
        // "Now" is for one closing of the lid; opening it again ends it.
        if (this._wasClosed && !lidClosed && this._armed) {
            this._armed = false;
            note(`mode: ${this._settings.mode}`);
        }
        this._wasClosed = lidClosed;

        const battery = this._guard.battery;
        const answer = decide({
            mode: this._settings.mode,
            armed: this._armed,
            lidClosed,
            working: summary.working,
            waitingSince: summary.waitingSince,
            lastBusyAt: this._lastBusyAt,
            holding: this._logind.holds('handle-lid-switch'),
            paused: this._paused,
            battery,
            temperature: this._guard.temperature,
            graceMs: this._settings.graceMinutes * 60000,
            floor: this._settings.batteryFloor,
            now,
        });
        this._lastBusyAt = answer.lastBusyAt;

        if (answer.sleep) {
            note(`going to sleep: ${answer.sleep}`);
            if (this._run)
                this._endRun(answer.sleep, summary.working, now, battery);
            this._logind.release('handle-lid-switch');
            this._logind.suspend();
        } else {
            if (answer.hold)
                this._logind.hold('handle-lid-switch', 'Claude is working');
            else
                this._logind.release('handle-lid-switch');
            if (answer.saving) {
                if (this._run)
                    Saving.screenOff();
                else
                    this._startRun(now, battery);
                this._setPaused(answer.pause);
            } else if (this._run) {
                this._endRun('opened', summary.working, now, battery);
            }
        }

        if (this._run)
            Bridge.beat();
        else if (this._bridged)
            this._dropBridge();
        this._keep();
        this._sample(now, battery, summary.working);
        if (!lidClosed && this._report) {
            this._notify(sentence(this._report));
            this._report = null;
        }
        this._publish(lidClosed, battery);
    }

    // Written down whenever it changes, for the service that may follow this one.
    _keep() {
        if (this._dryRun)
            return;
        const kept = JSON.stringify({instances: this._instances, lastBusyAt: this._lastBusyAt, armed: this._armed});
        if (kept === this._kept)
            return;
        this._kept = kept;
        try {
            GLib.file_set_contents(keptFile(), kept);
        } catch {
            // A restart then begins with nobody at work, as it did before.
        }
    }

    _dropBridge() {
        this._bridged = false;
        Bridge.stop();
    }

    _startRun(now, battery) {
        note('the lid closed: saving');
        this._run = {startedAt: now, startPercent: battery.percent};
        if (!this._dryRun) {
            Bridge.start();
            this._bridged = true;
        }
        // The lid no longer puts the machine to sleep; an idle timer must not either.
        this._logind.hold('sleep', 'Claude is working with the lid closed');
        this._logind.lock();
        let frozen = [];
        try {
            // A session the hooks reported keeps running even where its
            // process is not called "claude".
            const reported = Object.values(this._instances).map(instance => instance.unit).filter(Boolean);
            frozen = chooseFrozen(Freezer.runningUnits(), [...Freezer.claudeUnits(), ...reported]);
        } catch (e) {
            note(`could not list the units: ${e.message}`);
        }
        // Written down before anything is touched, so a crash halfway can be undone.
        this._memory = {frozen, paused: [], saved: {}};
        this._remember();
        Freezer.freeze(frozen);
        this._memory.saved = Saving.apply(this._settings);
        this._remember();
        // A run is measured from its own first sample to its own last.
        this._usageAt = 0;
    }

    _endRun(reason, working, now, battery) {
        note(`the run ends: ${reason}`);
        Freezer.thaw([...this._memory.paused, ...this._memory.frozen]);
        // A machine on its way to sleep keeps its screen dark.
        Saving.restore(this._memory.saved, {screen: reason === 'opened' || reason === 'stopped'});
        this._memory = {frozen: [], paused: [], saved: {}};
        this._remember();
        this._paused = false;
        this._logind.release('sleep');
        // When the service itself ends, the bridge stays for the one that follows.
        if (reason !== 'stopped' && this._bridged)
            this._dropBridge();
        const run = {...this._run, endedAt: now, endPercent: battery.percent, reason, working};
        this._run = null;
        if (!this._dryRun)
            record(run);
        this._lastRun = run;
        this._report = run;
        this._usageAt = 0;
        this._summaryAt = 0;
    }

    // One line in the record of what the machine draws, when one is due.
    _sample(now, battery, working) {
        if (!this._usage)
            return;
        const closed = this._run !== null;
        if (isDue(this._usageAt, now, closed)) {
            this._usageAt = now;
            this._usage.add(this._reading(now, closed ? 'closed' : 'open', battery, working));
        }
        if (now - this._summaryAt >= SUMMARY_EVERY_MS) {
            this._summaryAt = now;
            const {working: open, closed: shut, asleep} = this._usage.summary();
            this._usageSummary = {working: open.watts, closed: shut.watts, asleep: asleep.watts};
        }
    }

    // The two ends of a sleep, noted so that what it cost can be told
    // afterwards; nothing is measured while the machine sleeps.
    _mark(state) {
        if (!this._usage)
            return;
        const now = Date.now();
        this._usage.add(this._reading(now, state, this._guard.battery, 0));
        // The first sample after waking is taken at once, and the averages with it.
        this._usageAt = 0;
        this._summaryAt = 0;
    }

    _reading(now, state, battery, working) {
        return {
            at: now,
            state,
            working,
            onBattery: battery.onBattery,
            percent: battery.percent,
            wh: this._guard.energyWh,
            watts: battery.watts,
            celsius: this._guard.temperature,
        };
    }

    // Too hot: the sessions themselves rest until the machine has cooled.
    _setPaused(pause) {
        if (pause === this._paused)
            return;
        this._paused = pause;
        if (pause) {
            note('too hot: pausing the sessions');
            this._memory.paused = Freezer.claudeUnits();
            this._remember();
            Freezer.freeze(this._memory.paused);
        } else {
            note('cool again: the sessions go on');
            Freezer.thaw(this._memory.paused);
            this._memory.paused = [];
            this._remember();
        }
    }

    _remember() {
        if (!this._dryRun)
            remember(this._memory);
    }

    _notify(body) {
        note(`report: ${body}`);
        if (this._dryRun)
            return;
        try {
            Gio.DBus.session.call_sync('org.freedesktop.Notifications', '/org/freedesktop/Notifications',
                'org.freedesktop.Notifications', 'Notify',
                new GLib.Variant('(susssasa{sv}i)', ['Ember', 0, '', 'Ember', body, [], {}, -1]),
                null, Gio.DBusCallFlags.NONE, -1, null);
        } catch (e) {
            note(`could not show the report: ${e.message}`);
        }
    }

    _publish(lidClosed, battery) {
        const state = JSON.stringify({
            mode: this._armed ? 'now' : this._settings.mode,
            lidClosed,
            holding: this._logind.holds('handle-lid-switch'),
            saving: this._run !== null,
            paused: this._paused,
            sessions: this._list.map(({project, state: s, since}) => ({project, state: s, since})),
            battery,
            lastRun: this._lastRun,
            usage: this._usageSummary,
            settings: this._settings,
            choices: {graceMinutes: GRACE_CHOICES, batteryFloor: FLOOR_CHOICES},
            helper: Saving.helperInstalled(),
            sensor: this._guard.sensor !== null,
        });
        if (state === this._published)
            return;
        this._published = state;
        if (this._connected)
            this._exported.emit_property_changed('State', new GLib.Variant('s', state));
    }

    destroy() {
        GLib.source_remove(this._tick);
        this._eventsMonitor.cancel();
        if (this._run) {
            // The bridge counts its minute from here.
            Bridge.beat();
            this._endRun('stopped', 0, Date.now(), this._guard.battery);
        }
        this._logind.destroy();
        this._guard.destroy();
        if (this._connected)
            this._exported.unexport();
    }
}

const args = system.programArgs;
const dryRun = args.includes('--dry-run');
const lidFile = args.includes('--lid-file') ? args[args.indexOf('--lid-file') + 1] : null;
setDryRun(dryRun);

if (args.includes('--restore')) {
    restoreLeftovers(dryRun);
} else {
    if (!dryRun)
        restoreLeftovers(false);
    const loop = new GLib.MainLoop(null, false);
    const service = new Service({lidFile, dryRun});
    Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE,
        connection => service.export(connection), null, () => {
            note(`${BUS_NAME} is taken or the bus is gone`);
            loop.quit();
        });
    for (const signal of [SIGTERM, SIGINT]) {
        GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, signal, () => {
            loop.quit();
            return GLib.SOURCE_REMOVE;
        });
    }
    note(dryRun ? 'started as a dry run' : 'started');
    loop.run();
    service.destroy();
}
