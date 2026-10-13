// A small chevron that points down, or up once what it reveals is open.

import Cairo from 'cairo';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {colors} from './tokens.js';
import {setSource} from './paint.js';

const SIZE = 20;
const STROKE = 2;
const HALF_WIDTH = 5;
const HALF_HEIGHT = 2.5;

export const Chevron = GObject.registerClass({GTypeName: 'EmberChevron'},
class Chevron extends St.DrawingArea {
    _init({theme}) {
        super._init({width: SIZE, height: SIZE});
        this._theme = theme;
        // -1 points down, 1 points up; values between are the turn.
        this._direction = -1;
        this.connect('repaint', () => this._draw());
    }

    setDirection(direction) {
        this._direction = direction;
        this.queue_repaint();
    }

    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        const tip = height / 2 - this._direction * HALF_HEIGHT;
        const ends = height / 2 + this._direction * HALF_HEIGHT;
        cr.setLineWidth(STROKE);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        setSource(cr, colors[this._theme]['on-surface-variant']);
        cr.moveTo(width / 2 - HALF_WIDTH, ends);
        cr.lineTo(width / 2, tip);
        cr.lineTo(width / 2 + HALF_WIDTH, ends);
        cr.stroke();
        cr.$dispose();
    }
});
