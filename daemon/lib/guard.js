// What has to be watched while the lid is closed: the lid itself, the
// battery and the heat of the processor.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import UPower from 'gi://UPowerGlib';

import {chooseSensor} from './parse.js';

const THERMAL = '/sys/class/thermal';
const HWMON = '/sys/class/hwmon';

function read(path) {
    try {
        const [, bytes] = GLib.file_get_contents(path);
        return new TextDecoder().decode(bytes).trim();
    } catch {
        return null;
    }
}

// The numbered entries of a directory in /sys, each as {name, path}.
function entries(prefix, nameFile, valueFile) {
    const found = [];
    for (let i = 0; i < 64; i++) {
        const name = read(`${prefix}${i}/${nameFile}`);
        if (name === null)
            break;
        found.push({name, path: `${prefix}${i}/${valueFile}`});
    }
    return found;
}

function findSensor() {
    return chooseSensor(entries(`${HWMON}/hwmon`, 'name', 'temp1_input'),
        entries(`${THERMAL}/thermal_zone`, 'type', 'temp'));
}

const SUPPLIES = '/sys/class/power_supply';
const MICRO = 1e6;

function findBattery() {
    for (let i = 0; i < 4; i++) {
        const battery = `${SUPPLIES}/BAT${i}`;
        if (read(`${battery}/type`) === 'Battery')
            return battery;
    }
    return null;
}

export class Guard {
    // lidFile stands in for the lid in a trial: it is closed while the file
    // says "closed".
    constructor({onChange, lidFile = null}) {
        this._onChange = onChange;
        this._client = UPower.Client.new();
        this._device = this._client.get_display_device();
        this._sensor = findSensor();
        this._supply = findBattery();
        this._lidFile = lidFile;
        this._monitor = null;
        if (lidFile) {
            this._monitor = Gio.File.new_for_path(lidFile).monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', () => this._onChange());
        } else {
            this._client.connect('notify::lid-is-closed', () => this._onChange());
        }
        this._client.connect('notify::on-battery', () => this._onChange());
    }

    get lidClosed() {
        return this._lidFile ? read(this._lidFile) === 'closed' : this._client.lid_is_closed;
    }

    // percent is null on a machine without a battery.
    get battery() {
        const device = this._device;
        const present = device.is_present;
        return {
            percent: present ? device.percentage : null,
            onBattery: this._client.on_battery,
            watts: present && device.energy_rate > 0 ? device.energy_rate : null,
            remainingMs: present && this._client.on_battery && device.time_to_empty > 0
                ? device.time_to_empty * 1000 : null,
        };
    }

    // What is in the battery, in watt-hours, read from the kernel itself:
    // right after waking, the power service still holds the value from
    // before the sleep. Some batteries count charge instead of energy;
    // that is turned into energy the way the power service does it.
    get energyWh() {
        if (!this._supply)
            return null;
        const value = name => {
            const raw = Number.parseInt(read(`${this._supply}/${name}`), 10);
            return Number.isFinite(raw) ? raw / MICRO : null;
        };
        const energy = value('energy_now');
        if (energy !== null)
            return energy;
        const charge = value('charge_now');
        const volts = value('voltage_min_design');
        return charge !== null && volts !== null ? charge * volts : null;
    }

    // The file the heat is read from, or null on a machine that shows none.
    get sensor() {
        return this._sensor;
    }

    // Degrees Celsius, or null when there is nothing to read it from.
    get temperature() {
        const raw = this._sensor ? Number.parseInt(read(this._sensor), 10) : NaN;
        return Number.isFinite(raw) ? raw / 1000 : null;
    }

    destroy() {
        this._monitor?.cancel();
    }
}
