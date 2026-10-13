// The menu's content, built from the design system: one loud tile for what
// the machine draws, neutral tiles for the rest.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Format from './format.js';
import {Chevron} from './chevron.js';
import {STATE_MS, animate} from './motion.js';
import {MODES} from './state.js';
import {Swatch} from './swatch.js';
import {Switch} from './switch.js';
import {styles} from './tokens.js';
import {text} from './text.js';

const MODE_CAPTIONS = {off: 'Off', auto: 'Auto', now: 'Now'};
const NO_SERVICE = 'The Ember service is not running. Start it with: systemctl --user start ember';
const NO_HELPER = 'Needs the helper. Install it with: sudo ./install-helper.sh';

function column(styleClass = '') {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

// The design system's ButtonGroup. Returns the row and a function that
// marks the chosen segment.
function segments(choices, captionFor, onPick) {
    const group = new St.BoxLayout({style_class: 'em-segments', x_expand: true});
    group.layout_manager.homogeneous = true;
    const buttons = choices.map((choice, i) => {
        const caption = text('body-strong');
        caption.text = captionFor(choice);
        const position = i === 0 ? 'first' : i === choices.length - 1 ? 'last' : 'middle';
        const button = new St.Button({
            style_class: `em-segment em-segment-${position}`,
            child: caption,
            can_focus: true,
            x_expand: true,
        });
        button.connect('clicked', () => onPick(choice));
        group.add_child(button);
        return {choice, button};
    });
    const select = chosen => {
        for (const {choice, button} of buttons) {
            if (choice === chosen)
                button.add_style_class_name('em-segment-selected');
            else
                button.remove_style_class_name('em-segment-selected');
        }
    };
    return {group, select};
}

export class Popup {
    constructor({style, theme}, {onMode, onSetting}) {
        // The marks are drawn in a scheme, one style in one theme.
        this._theme = `${style}-${theme}`;
        this._light = theme;
        this._onMode = onMode;
        this._onSetting = onSetting;
        this._state = null;
        this._turn = null;
        this._choices = '';

        this.actor = column('em-content');
        // The menu is destroyed before its owner hears of it, so the popup
        // stops its own motion while its actors still exist.
        this.actor.connect('destroy', () => this.stop());
        this._buildPower();
        this._buildLid();
        this._buildSessions();
        this._buildRun();
        this._buildFooter();
        this._buildOverflow();
        this._buildUsage();
        this._buildSettings();
        this._render();
    }

    _buildPower() {
        const tile = column('em-tile em-tile-loud');
        this._watts = text('metric-l');
        this._powerCaption = text('label', {muted: true});
        this._remaining = text('body-strong');
        tile.add_child(this._watts);
        tile.add_child(this._powerCaption);
        tile.add_child(this._remaining);
        this.actor.add_child(tile);
    }

    _buildLid() {
        const tile = column('em-tile');
        const label = text('label', {muted: true});
        label.text = 'When the lid closes';
        this._lidSentence = text('body-strong', {wrap: true});
        const {group, select} = segments(MODES, mode => MODE_CAPTIONS[mode], mode => this._onMode(mode));
        this._selectMode = select;
        tile.add_child(label);
        tile.add_child(this._lidSentence);
        tile.add_child(group);
        this.actor.add_child(tile);
    }

    _buildSessions() {
        this._sessionsHeader = text('title');
        this._sessionsHeader.text = 'Claude';
        this._sessionsHeader.add_style_class_name('em-section');
        this._rows = column('em-rows');
        this._rowsKey = '';
        this._rowLines = [];
        this.actor.add_child(this._sessionsHeader);
        this.actor.add_child(this._rows);
    }

    _buildRun() {
        this._runHeader = text('title');
        this._runHeader.text = 'Last time';
        this._runHeader.add_style_class_name('em-section');
        this._runTile = column('em-tile');
        const numbers = new St.BoxLayout({style_class: 'em-columns', x_expand: true});
        this._runDuration = text('metric-s');
        this._runUsed = text('metric-s');
        for (const [value, caption] of [[this._runDuration, 'with the lid closed'], [this._runUsed, 'of the battery used']]) {
            const cell = column();
            const label = text('label', {muted: true});
            label.text = caption;
            cell.add_child(value);
            cell.add_child(label);
            numbers.add_child(cell);
        }
        this._runSentence = text('body', {muted: true, wrap: true});
        this._runTile.add_child(numbers);
        this._runTile.add_child(this._runSentence);
        this.actor.add_child(this._runHeader);
        this.actor.add_child(this._runTile);
    }

    // Only there when something is wrong.
    _buildFooter() {
        this._footer = text('aside', {muted: true, wrap: true});
        this._footer.add_style_class_name('em-footer');
        this.actor.add_child(this._footer);
    }

    // The settings are not needed day to day, so they wait behind a chevron
    // at the bottom and are closed again whenever the menu opens.
    _buildOverflow() {
        this._overflowOpen = false;
        this._chevron = new Chevron({theme: this._theme});
        this._overflow = new St.Button({
            style_class: 'em-overflow',
            child: this._chevron,
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Settings',
        });
        this._overflow.connect('clicked', () => this._setOverflow(!this._overflowOpen));
        this.actor.add_child(this._overflow);
    }

    _setOverflow(open, {animated = true} = {}) {
        this._overflowOpen = open;
        this._syncSections();
        this._turn?.stop();
        this._turn = null;
        const tile = this._settingsTile;
        tile.remove_all_transitions();
        if (!animated) {
            tile.visible = open;
            tile.opacity = 255;
            tile.height = -1;
            this._chevron.setDirection(open ? 1 : -1);
            return;
        }

        const from = open ? -1 : 1;
        this._turn = animate(this._chevron, STATE_MS, progress => {
            this._chevron.setDirection(from + (open ? 2 : -2) * progress);
            if (progress === 1)
                this._turn = null;
        });
        if (open) {
            tile.visible = true;
            tile.height = -1;
            const [, natural] = tile.get_preferred_height(this.actor.width);
            tile.height = 0;
            tile.opacity = 0;
            tile.ease({
                height: natural,
                opacity: 255,
                duration: STATE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                // Back to its own height, so later text changes still fit.
                onComplete: () => (tile.height = -1),
            });
        } else {
            tile.ease({
                height: 0,
                opacity: 0,
                duration: STATE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                onComplete: () => {
                    tile.visible = false;
                    tile.height = -1;
                },
            });
        }
    }

    // What the machine drew on average, shown with the settings: it is for
    // judging Ember, not for every glance at the menu.
    _buildUsage() {
        const tile = column('em-tile');
        const label = text('label', {muted: true});
        label.text = 'Average draw on battery, last 30 days';
        const numbers = new St.BoxLayout({style_class: 'em-columns', x_expand: true});
        this._usageValues = {};
        for (const [kind, caption] of [['working', 'lid open'], ['closed', 'lid closed'], ['asleep', 'asleep']]) {
            const cell = column();
            const value = text('metric-s');
            const name = text('label', {muted: true});
            name.text = caption;
            cell.add_child(value);
            cell.add_child(name);
            numbers.add_child(cell);
            this._usageValues[kind] = value;
        }
        // Anything Ember computes itself says so.
        const note = text('aside', {muted: true, wrap: true});
        note.text = 'Worked out from what left the battery; lid open counts only while Claude works. A dash means too little time yet.';
        tile.add_child(label);
        tile.add_child(numbers);
        tile.add_child(note);
        tile.visible = false;
        this._usageTile = tile;
        this.actor.add_child(tile);
    }

    _buildSettings() {
        const tile = column('em-tile');
        const graceLabel = text('label', {muted: true});
        graceLabel.text = 'Minutes awake after the work ends';
        // The choices come from the service, so they are filled in later.
        this._graceSlot = column();
        const floorLabel = text('label', {muted: true});
        floorLabel.text = 'Go to sleep at this much battery';
        floorLabel.add_style_class_name('em-setting');
        this._floorSlot = column();

        const row = new St.BoxLayout({style_class: 'em-switch-row', x_expand: true});
        const words = column();
        const holdLabel = text('body-strong');
        holdLabel.text = 'Hold the processor back';
        this._holdNote = text('aside', {muted: true, wrap: true});
        words.add_child(holdLabel);
        words.add_child(this._holdNote);
        this._hold = new Switch({theme: this._theme});
        this._holdButton = new St.Button({
            style_class: 'em-switch',
            child: this._hold,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: 'Hold the processor back',
        });
        this._holdButton.connect('clicked',
            () => this._onSetting('holdProcessor', !this._state?.settings.holdProcessor));
        row.add_child(words);
        row.add_child(this._holdButton);

        const styleLabel = text('label', {muted: true});
        styleLabel.text = 'Colour';
        styleLabel.add_style_class_name('em-setting');
        const swatches = new St.BoxLayout({style_class: 'em-swatches'});
        this._swatches = styles.map(style => {
            const swatch = new Swatch({style, theme: this._light});
            const button = new St.Button({
                style_class: 'em-swatch',
                child: swatch,
                can_focus: true,
                accessible_name: style,
            });
            button.connect('clicked', () => this._onSetting('style', style));
            swatches.add_child(button);
            return {style, swatch};
        });

        for (const child of [graceLabel, this._graceSlot, floorLabel, this._floorSlot, row, styleLabel, swatches])
            tile.add_child(child);
        tile.visible = false;
        // The tile's height is animated, so what does not fit yet is cut off.
        tile.clip_to_allocation = true;
        this._settingsTile = tile;
        this.actor.add_child(tile);
    }

    _syncChoices(choices) {
        const key = JSON.stringify(choices);
        if (key === this._choices)
            return;
        this._choices = key;
        this._graceSlot.destroy_all_children();
        this._floorSlot.destroy_all_children();
        const grace = segments(choices.graceMinutes, minutes => `${minutes}`,
            minutes => this._onSetting('graceMinutes', minutes));
        const floor = segments(choices.batteryFloor, share => `${share} %`,
            share => this._onSetting('batteryFloor', share));
        this._graceSlot.add_child(grace.group);
        this._floorSlot.add_child(floor.group);
        this._selectGrace = grace.select;
        this._selectFloor = floor.select;
    }

    // The settings take the place of the sessions and the last run, so the
    // menu stays within a laptop's screen.
    _syncSections() {
        const shown = !this._overflowOpen;
        const sessions = shown && (this._state?.sessions.length ?? 0) > 0;
        const run = shown && (this._state?.lastRun ?? null) !== null;
        this._sessionsHeader.visible = sessions;
        this._rows.visible = sessions;
        this._runHeader.visible = run;
        this._runTile.visible = run;
        this._usageTile.visible = this._overflowOpen && this._state !== null;
    }

    // One row per session; rebuilt only when the sessions themselves change.
    _syncRows(sessions) {
        const key = sessions.map(entry => `${entry.project}|${entry.state}`).join('\n');
        if (key !== this._rowsKey) {
            this._rowsKey = key;
            this._rows.destroy_all_children();
            this._rowLines = sessions.map((entry, i) => {
                const place = sessions.length === 1 ? 'only' : i === 0 ? 'first' : i === sessions.length - 1 ? 'last' : '';
                const row = new St.BoxLayout({style_class: `em-row ${place ? `em-row-${place}` : ''}`, x_expand: true});
                const project = text('body-strong', {expand: true});
                project.text = entry.project;
                const line = text('body', {muted: true});
                row.add_child(project);
                row.add_child(line);
                this._rows.add_child(row);
                return line;
            });
        }
        const now = Date.now();
        sessions.forEach((entry, i) => (this._rowLines[i].text = Format.sessionLine(entry, now)));
    }

    update(state) {
        this._state = state;
        this._render();
    }

    setScheme({style, theme}) {
        this._theme = `${style}-${theme}`;
        this._light = theme;
        this._chevron.setTheme(this._theme);
        this._hold.setTheme(this._theme);
        for (const {swatch} of this._swatches)
            swatch.setTheme(theme);
    }

    // Called when the menu opens.
    opened() {
        this._setOverflow(false, {animated: false});
        this._render();
    }

    stop() {
        this._turn?.stop();
        this._turn = null;
        this._settingsTile.remove_all_transitions();
    }

    _render() {
        const state = this._state;
        const battery = state?.battery ?? null;
        this._watts.text = Format.watts(battery?.watts ?? null);
        this._powerCaption.text = Format.powerCaption(battery);
        this._remaining.text = battery ? Format.remaining(battery) : '';
        this._remaining.visible = this._remaining.text !== '';

        this._lidSentence.text = state ? Format.lidSentence(state) : 'Goes to sleep, as always.';
        this._selectMode(state?.mode ?? null);

        this._syncRows(state?.sessions ?? []);
        this._syncSections();
        const run = state?.lastRun ?? null;
        if (run) {
            this._runDuration.text = Format.duration(run.endedAt - run.startedAt);
            this._runUsed.text = Format.percent(Format.runUsed(run));
            this._runSentence.text = Format.runSentence(run);
        }

        this._footer.text = state ? '' : NO_SERVICE;
        this._footer.visible = !state;
        this._overflow.visible = state !== null;
        if (!state) {
            this._setOverflow(false, {animated: false});
            return;
        }

        for (const [kind, value] of Object.entries(this._usageValues))
            value.text = Format.average(state.usage[kind]);
        this._syncChoices(state.choices);
        this._selectGrace(state.settings.graceMinutes);
        this._selectFloor(state.settings.batteryFloor);
        // Without the helper the switch has nothing to switch.
        this._hold.set(state.helper && state.settings.holdProcessor, {animated: this._overflowOpen});
        this._holdButton.reactive = state.helper;
        this._holdButton.can_focus = state.helper;
        this._holdNote.text = state.helper ? 'Turbo off and a saving processor while the lid is closed.' : NO_HELPER;
        for (const {style, swatch} of this._swatches)
            swatch.setSelected(style === state.settings.style);
    }
}
