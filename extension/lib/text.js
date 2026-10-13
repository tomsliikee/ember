// Labels set in a type role of the design system.
//
// St's CSS cannot reach the axes of a variable font (width, roundness), so
// the role is applied as a Pango attribute instead of through the stylesheet.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {family, type} from './tokens.js';

// The calm, friendly end of the design system's roundness dial.
const ROUNDNESS = 100;
const PX_TO_PT = 0.75;

function descriptionFor(role) {
    const spec = type[role];
    const description = Pango.FontDescription.from_string(family);
    // Points, not pixels, so the text follows the desktop's text scaling.
    description.set_size(Math.round(spec.size * PX_TO_PT * Pango.SCALE));
    const axes = [`wght=${spec.weight}`, `wdth=${spec.width}`, `ROND=${ROUNDNESS}`];
    if (spec.italic)
        axes.push('slnt=-10');
    description.set_variations(axes.join(','));
    return description;
}

// Pango colour channels are 16 bit, the theme's are 8 bit.
const CHANNEL = 257;

function applyRole(label, description) {
    const attributes = new Pango.AttrList();
    attributes.insert(Pango.attr_font_desc_new(description));
    // Tabular figures, so a changing number does not shift its neighbours.
    attributes.insert(Pango.attr_font_features_new('tnum=1'));
    // Heavy weights of the variable font are drawn without the label's own
    // colour, so the colour from the stylesheet is passed on as an attribute.
    if (label.get_stage()) {
        const color = label.get_theme_node().get_foreground_color();
        attributes.insert(Pango.attr_foreground_new(
            color.red * CHANNEL, color.green * CHANNEL, color.blue * CHANNEL));
    }
    label.clutter_text.set_attributes(attributes);
}

export function text(role, {muted = false, expand = false, wrap = false} = {}) {
    const label = new St.Label({
        style_class: muted ? 'em-muted' : '',
        x_expand: expand,
        y_align: Clutter.ActorAlign.CENTER,
    });
    const description = descriptionFor(role);
    applyRole(label, description);
    // St replaces the attributes whenever the style is recomputed.
    label.connect_after('style-changed', () => applyRole(label, description));
    if (wrap) {
        label.clutter_text.line_wrap = true;
        label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    }
    return label;
}
