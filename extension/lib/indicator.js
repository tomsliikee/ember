// The top bar item: Ember's mark, and the menu behind it. Resting the pointer
// on it shows the menu for as long as it stays; a click holds it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {Mark, coreFor} from './mark.js';
import {PeekMenu} from './peek.js';
import {Popup} from './popup.js';
import {styles} from './tokens.js';

// Switched off, the mark stands back.
const OFF_OPACITY = 128;
// Long enough that crossing the item on the way elsewhere shows nothing.
const HOVER_DELAY_MS = 300;

export const Indicator = GObject.registerClass({GTypeName: 'EmberIndicator'},
class Indicator extends PanelMenu.Button {
    _init({onMode, onSetting}) {
        // The menu is made here, not by the panel button, so it can peek.
        super._init(0.5, 'Ember', true);
        this.setMenu(new PeekMenu(this, 0.5));
        this._open = false;
        this._pending = 0;
        this._rested = false;
        this._style = styles[0];

        this._box = new St.BoxLayout({style_class: 'panel-status-indicators-box em-indicator'});
        this._mark = new Mark();
        this._box.add_child(this._mark);
        this.add_child(this._box);

        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._theme = this._readTheme();
        this._popup = new Popup({style: this._style, theme: this._theme}, {onMode, onSetting});
        this.menu.box.add_style_class_name(this._popupClass());
        this.menu.box.add_child(this._popup.actor);

        this._interface.connectObject('changed::color-scheme',
            () => this._applyScheme(this._style, this._readTheme()), this);
        this.menu.connect('open-state-changed', (_menu, open) => {
            // A look that is held reports once more that it is open.
            if (open === this._open)
                return;
            this._open = open;
            if (open) {
                this._popup.opened();
            } else {
                // Closed by a click on the item itself: the pointer still
                // rests there, and that is no wish for a look.
                this._rested = !this.menu.peeking && this._pointerInside();
            }
        });
        this.connect('notify::hover', () => this._hoverChanged());
        this.connect('destroy', () => {
            this._cancelPeek();
            this._interface.disconnectObject(this);
        });
        this.update(null);
    }

    // state is null while the service is not running.
    update(state) {
        this._mark.set(coreFor(state));
        this._box.opacity = !state || state.mode === 'off' ? OFF_OPACITY : 255;
        const style = styles.includes(state?.settings.style) ? state.settings.style : this._style;
        if (style !== this._style)
            this._applyScheme(style, this._theme);
        this._popup.update(state);
    }

    _hoverChanged() {
        this._cancelPeek();
        if (!this.hover) {
            this._rested = false;
            this.menu.endPeek();
            return;
        }
        if (this._rested)
            return;
        this._pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_DELAY_MS, () => {
            this._pending = 0;
            this.menu.peek();
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelPeek() {
        if (this._pending)
            GLib.source_remove(this._pending);
        this._pending = 0;
    }

    _pointerInside() {
        const [x, y] = global.get_pointer();
        const [left, top] = this.get_transformed_position();
        const [width, height] = this.get_transformed_size();
        return x >= left && x < left + width && y >= top && y < top + height;
    }

    _popupClass() {
        return `em-popup-${this._style}-${this._theme}`;
    }

    _readTheme() {
        return this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
    }

    _applyScheme(style, theme) {
        this.menu.box.remove_style_class_name(this._popupClass());
        this._style = style;
        this._theme = theme;
        this.menu.box.add_style_class_name(this._popupClass());
        this._popup.setScheme({style, theme});
    }
});
