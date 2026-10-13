// The extension's line to the Ember service: reads the state it publishes
// and passes on what is chosen in the menu.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {parseState} from './state.js';

const NAME = 'io.github.tomsliikee.Ember';
const PATH = '/io/github/tomsliikee/Ember';
const PROPERTIES = 'org.freedesktop.DBus.Properties';

export class Client {
    // onChange gets the state, or null while the service is not running.
    constructor({onChange}) {
        this._onChange = onChange;
        this._bus = Gio.DBus.session;
        this._cancellable = new Gio.Cancellable();
        this._changed = this._bus.signal_subscribe(NAME, PROPERTIES, 'PropertiesChanged', PATH, null,
            Gio.DBusSignalFlags.NONE, (_c, _s, _p, _i, _n, args) => {
                const [, changed] = args.recursiveUnpack();
                if (typeof changed.State === 'string')
                    this._onChange(parseState(changed.State));
            });
        this._watch = Gio.bus_watch_name(Gio.BusType.SESSION, NAME, Gio.BusNameWatcherFlags.NONE,
            () => this._read(), () => this._onChange(null));
    }

    _read() {
        this._bus.call(NAME, PATH, PROPERTIES, 'Get', new GLib.Variant('(ss)', [NAME, 'State']), null,
            Gio.DBusCallFlags.NONE, -1, this._cancellable, (bus, result) => {
                try {
                    const [state] = bus.call_finish(result).recursiveUnpack();
                    this._onChange(parseState(state));
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        this._onChange(null);
                }
            });
    }

    _send(method, args) {
        this._bus.call(NAME, PATH, NAME, method, args, null, Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (bus, result) => {
                try {
                    bus.call_finish(result);
                } catch {
                    // Without the service there is nothing to set; the menu says so.
                }
            });
    }

    setMode(mode) {
        this._send('SetMode', new GLib.Variant('(s)', [mode]));
    }

    setSetting(name, value) {
        this._send('SetSetting', new GLib.Variant('(ss)', [name, JSON.stringify(value)]));
    }

    destroy() {
        this._cancellable.cancel();
        this._bus.signal_unsubscribe(this._changed);
        Gio.bus_unwatch_name(this._watch);
    }
}
