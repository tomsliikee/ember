// The design system's Switch: a pill track with a round thumb that grows
// as it travels.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {colors} from './tokens.js';
import {STATE_MS, animate} from './motion.js';
import {setSource} from './paint.js';

const WIDTH = 52;
const HEIGHT = 32;
const THUMB_OFF = 8;
const THUMB_ON = 12;

export const Switch = GObject.registerClass({GTypeName: 'EmberSwitch'},
class Switch extends St.DrawingArea {
    _init({theme}) {
        super._init({width: WIDTH, height: HEIGHT, y_align: Clutter.ActorAlign.CENTER});
        this._theme = theme;
        this._position = 0;
        this._on = false;
        this._tween = null;
        this.connect('repaint', () => this._draw());
        this.connect('destroy', () => this._tween?.stop());
    }

    set(on, {animated = true} = {}) {
        if (on === this._on)
            return;
        this._on = on;
        this._tween?.stop();
        this._tween = null;
        const from = this._position;
        const to = on ? 1 : 0;
        if (!animated) {
            this._position = to;
            this.queue_repaint();
            return;
        }
        this._tween = animate(this, STATE_MS, progress => {
            this._position = from + (to - from) * progress;
            this.queue_repaint();
        });
    }

    setTheme(theme) {
        this._theme = theme;
        this.queue_repaint();
    }

    _draw() {
        const cr = this.get_context();
        const palette = colors[this._theme];
        const on = this._position;
        const radius = HEIGHT / 2;

        cr.arc(WIDTH - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
        cr.arc(radius, radius, radius, Math.PI / 2, 1.5 * Math.PI);
        cr.closePath();
        setSource(cr, palette['surface-container-highest']);
        cr.fillPreserve();
        setSource(cr, palette['primary'], on);
        cr.fill();

        const thumb = THUMB_OFF + (THUMB_ON - THUMB_OFF) * on;
        setSource(cr, palette['outline']);
        cr.arc(radius + (WIDTH - HEIGHT) * on, radius, thumb, 0, 2 * Math.PI);
        cr.fillPreserve();
        setSource(cr, palette['on-primary'], on);
        cr.fill();
        cr.$dispose();
    }
});
