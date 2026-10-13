// The changes that save power while the lid is closed. Each one notes what
// it found, so the machine is given back the way it was.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {act} from './log.js';
import {call, getProperty, setProperty} from './bus.js';

const MUTTER = ['org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig', 'org.gnome.Mutter.DisplayConfig'];
const SCREEN_ON = 0;
const SCREEN_OFF = 3;
const TUNED = ['com.redhat.tuned', '/Tuned', 'com.redhat.tuned.control'];
const SAVING_PROFILE = 'powersave';
const RFKILL = ['org.gnome.SettingsDaemon.Rfkill', '/org/gnome/SettingsDaemon/Rfkill', 'org.gnome.SettingsDaemon.Rfkill'];
const KEYS = ['org.freedesktop.UPower', '/org/freedesktop/UPower/KbdBacklight', 'org.freedesktop.UPower.KbdBacklight'];
const SINK = '@DEFAULT_AUDIO_SINK@';
export const HELPER = '/usr/local/libexec/ember-helper';

const session = () => Gio.DBus.session;
const system = () => Gio.DBus.system;

function quiet(read) {
    try {
        return read();
    } catch {
        return null;
    }
}

function run(command) {
    const [, out, , status] = GLib.spawn_command_line_sync(command);
    if (status !== 0)
        throw new Error(`"${command}" ended with ${status}`);
    return new TextDecoder().decode(out);
}

export function helperInstalled() {
    return GLib.file_test(HELPER, GLib.FileTest.IS_EXECUTABLE);
}

export function screenOff() {
    if (quiet(() => getProperty(session(), ...MUTTER, 'PowerSaveMode')) === SCREEN_OFF)
        return;
    act('switch the screen off', () => setProperty(session(), ...MUTTER, 'PowerSaveMode',
        new GLib.Variant('i', SCREEN_OFF)));
}

function screenOn() {
    act('switch the screen on', () => setProperty(session(), ...MUTTER, 'PowerSaveMode',
        new GLib.Variant('i', SCREEN_ON)));
}

// Returns what was found, to be handed to restore() later. Only what was
// really changed is in it.
export function apply({holdProcessor}) {
    const saved = {};
    screenOff();

    const profile = quiet(() => call(system(), ...TUNED, 'active_profile')[0]);
    if (profile && profile !== SAVING_PROFILE) {
        saved.profile = profile;
        act(`switch the power profile to ${SAVING_PROFILE}`, () => call(system(), ...TUNED, 'switch_profile',
            new GLib.Variant('(s)', [SAVING_PROFILE])));
    }

    if (quiet(() => getProperty(session(), ...RFKILL, 'BluetoothAirplaneMode')) === false) {
        saved.bluetooth = true;
        act('switch Bluetooth off', () => setProperty(session(), ...RFKILL, 'BluetoothAirplaneMode',
            new GLib.Variant('b', true)));
    }

    const keys = quiet(() => call(system(), ...KEYS, 'GetBrightness')[0]);
    if (keys > 0) {
        saved.keys = keys;
        act('switch the keyboard light off', () => call(system(), ...KEYS, 'SetBrightness',
            new GLib.Variant('(i)', [0])));
    }

    const volume = quiet(() => run(`wpctl get-volume ${SINK}`));
    if (volume !== null && !volume.includes('MUTED')) {
        saved.sound = true;
        act('mute the sound', () => run(`wpctl set-mute ${SINK} 1`));
    }

    if (holdProcessor && helperInstalled()) {
        saved.processor = true;
        act('hold the processor back', () => run(`pkexec ${HELPER} save`));
    }
    return saved;
}

export function restore(saved, {screen = true} = {}) {
    if (saved.processor)
        act('let the processor go', () => run(`pkexec ${HELPER} restore`));
    if (saved.sound)
        act('unmute the sound', () => run(`wpctl set-mute ${SINK} 0`));
    if (saved.keys) {
        act('switch the keyboard light on', () => call(system(), ...KEYS, 'SetBrightness',
            new GLib.Variant('(i)', [saved.keys])));
    }
    if (saved.bluetooth) {
        act('switch Bluetooth on', () => setProperty(session(), ...RFKILL, 'BluetoothAirplaneMode',
            new GLib.Variant('b', false)));
    }
    if (saved.profile) {
        act(`switch the power profile back to ${saved.profile}`, () => call(system(), ...TUNED, 'switch_profile',
            new GLib.Variant('(s)', [saved.profile])));
    }
    if (screen)
        screenOn();
}
