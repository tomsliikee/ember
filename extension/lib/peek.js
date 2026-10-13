// A panel menu that can also be shown as a look: open, but without the grab
// an open menu takes. The pointer then stays with the top bar item, which is
// how the item knows when the look is over.

import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class PeekMenu extends PopupMenu.PopupMenu {
    constructor(sourceActor, alignment) {
        super(sourceActor, alignment, St.Side.TOP);
        this.peeking = false;
        // However a look ends, the menu goes back to the panel's care.
        this.connect('open-state-changed', (_menu, open) => {
            if (!open && this.peeking)
                this._manage();
        });
    }

    peek() {
        if (this.isOpen)
            return;
        // The panel's manager takes the grab whenever one of its menus opens.
        Main.panel.menuManager.removeMenu(this);
        this.peeking = true;
        this.open(BoxPointer.PopupAnimation.FULL);
        // Nothing to show, so nothing opened.
        if (!this.isOpen)
            this._manage();
    }

    endPeek() {
        if (this.peeking)
            this.close(BoxPointer.PopupAnimation.FULL);
    }

    // A click on a look holds it: the menu stays as it is and becomes an
    // ordinary open menu.
    toggle() {
        if (!this.peeking) {
            super.toggle();
            return;
        }
        this._manage();
        // The manager takes its grab when a menu reports that it opened.
        this.emit('open-state-changed', true);
    }

    _manage() {
        this.peeking = false;
        Main.panel.menuManager.addMenu(this);
    }
}
