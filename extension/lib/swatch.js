// A colour style to choose: a disc in the style's primary colour, with a
// check mark while it is the chosen one.

import Cairo from 'cairo';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {colors} from './tokens.js';
import {setSource} from './paint.js';

const SIZE = 32;
const CHECK_STROKE = 2.5;

export const Swatch = GObject.registerClass({GTypeName: 'EmberSwatch'},
class Swatch extends St.DrawingArea {
    _init({style, theme}) {
        super._init({width: SIZE, height: SIZE});
        this._style = style;
        this._theme = theme;
        this._selected = false;
        this.connect('repaint', () => this._draw());
    }

    setSelected(selected) {
        this._selected = selected;
        this.queue_repaint();
    }

    // theme is "light" or "dark"; the disc always shows its own style.
    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const palette = colors[`${this._style}-${this._theme}`];
        setSource(cr, palette['primary']);
        cr.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, 2 * Math.PI);
        cr.fill();
        if (this._selected) {
            setSource(cr, palette['on-primary']);
            cr.setLineWidth(CHECK_STROKE);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setLineJoin(Cairo.LineJoin.ROUND);
            cr.moveTo(width / 2 - 6, height / 2);
            cr.lineTo(width / 2 - 2, height / 2 + 4);
            cr.lineTo(width / 2 + 6, height / 2 - 4);
            cr.stroke();
        }
        cr.$dispose();
    }
});
