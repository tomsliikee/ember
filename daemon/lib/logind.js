// The service's dealings with the login manager: keeping the lid from
// putting the machine to sleep, and putting it to sleep itself.

import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

import {act} from './log.js';
import {call} from './bus.js';

const NAME = 'org.freedesktop.login1';
const PATH = '/org/freedesktop/login1';
const MANAGER = 'org.freedesktop.login1.Manager';

export class Logind {
    // onSleep is called just before the machine sleeps, onResume after it woke.
    constructor({onSleep, onResume}) {
        this._system = Gio.DBus.system;
        this._session = Gio.DBus.session;
        this._locks = new Map();
        this._delay = null;
        this._takeDelay();
        this._resumed = this._system.signal_subscribe(NAME, MANAGER, 'PrepareForSleep', PATH, null,
            Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, args) => {
                if (args.recursiveUnpack()[0]) {
                    onSleep();
                    this._dropDelay();
                } else {
                    this._takeDelay();
                    onResume();
                }
            });
    }

    // A delay lock makes the machine wait with its sleep until onSleep has
    // run; without it the service may be stopped before it has noted anything.
    _takeDelay() {
        if (this._delay)
            return;
        try {
            const [reply, fds] = this._system.call_with_unix_fd_list_sync(NAME, PATH, MANAGER, 'Inhibit',
                new GLib.Variant('(ssss)', ['sleep', 'Ember', 'Noting the battery before the sleep', 'delay']), null,
                Gio.DBusCallFlags.NONE, -1, null, null);
            this._delay = new GioUnix.InputStream({fd: fds.get(reply.get_child_value(0).get_handle()), close_fd: true});
        } catch {
            // Without it the note before a sleep may be missing; nothing else depends on it.
        }
    }

    _dropDelay() {
        this._delay?.close(null);
        this._delay = null;
    }

    // what is "handle-lid-switch" or "sleep". The lock is a file descriptor:
    // it lasts until it is closed, also by the end of this process, so a
    // crash never leaves the machine unable to sleep.
    hold(what, why) {
        if (this._locks.has(what))
            return;
        const stream = act(`hold ${what}`, () => {
            const [reply, fds] = this._system.call_with_unix_fd_list_sync(NAME, PATH, MANAGER, 'Inhibit',
                new GLib.Variant('(ssss)', [what, 'Ember', why, 'block']), null,
                Gio.DBusCallFlags.NONE, -1, null, null);
            return new GioUnix.InputStream({fd: fds.get(reply.get_child_value(0).get_handle()), close_fd: true});
        });
        // In a dry run the lock is only remembered, so it is taken once.
        this._locks.set(what, stream);
    }

    release(what) {
        if (!this._locks.has(what))
            return;
        const stream = this._locks.get(what);
        this._locks.delete(what);
        act(`release ${what}`, () => stream?.close(null));
    }

    holds(what) {
        return this._locks.has(what);
    }

    lock() {
        act('lock the session', () => call(this._session, 'org.gnome.ScreenSaver', '/org/gnome/ScreenSaver',
            'org.gnome.ScreenSaver', 'Lock'));
    }

    // With the lid closed, the login manager goes to sleep by itself as
    // soon as the lid's lock is released; then this call finds it on its way.
    suspend() {
        act('suspend', () => {
            try {
                call(this._system, NAME, PATH, MANAGER, 'Suspend', new GLib.Variant('(b)', [false]));
            } catch (e) {
                if (!e.message.includes('OperationInProgress'))
                    throw e;
            }
        });
    }

    destroy() {
        this._system.signal_unsubscribe(this._resumed);
        this._dropDelay();
        for (const what of [...this._locks.keys()])
            this.release(what);
    }
}
