import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Client} from './lib/client.js';
import {Indicator} from './lib/indicator.js';

// The extension only shows and switches; the Ember service does the work,
// so it goes on while the screen is locked and this is not loaded.
export default class EmberExtension extends Extension {
    enable() {
        this._indicator = new Indicator({
            onMode: mode => this._client.setMode(mode),
            onSetting: (name, value) => this._client.setSetting(name, value),
        });

        // Directly left of the system menu.
        const rightBox = Main.panel._rightBox;
        const systemMenu = Main.panel.statusArea.quickSettings?.container;
        const position = Math.max(0, rightBox.get_children().indexOf(systemMenu));
        Main.panel.addToStatusArea(this.uuid, this._indicator, position, 'right');

        this._client = new Client({onChange: state => this._indicator?.update(state)});
    }

    disable() {
        this._client.destroy();
        this._client = null;
        this._indicator.destroy();
        this._indicator = null;
    }
}
