// Short forms of the D-Bus calls the service makes. They block for a moment,
// which a service without a window can afford.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const TIMEOUT_MS = 5000;
const PROPERTIES = 'org.freedesktop.DBus.Properties';

// Returns the reply unpacked, as an array of its values.
export function call(bus, name, path, iface, method, args = null) {
    const reply = bus.call_sync(name, path, iface, method, args, null, Gio.DBusCallFlags.NONE, TIMEOUT_MS, null);
    return reply.recursiveUnpack();
}

export function getProperty(bus, name, path, iface, property) {
    return call(bus, name, path, PROPERTIES, 'Get', new GLib.Variant('(ss)', [iface, property]))[0];
}

export function setProperty(bus, name, path, iface, property, value) {
    call(bus, name, path, PROPERTIES, 'Set', new GLib.Variant('(ssv)', [iface, property, value]));
}
