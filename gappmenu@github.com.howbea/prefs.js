/*SPDX-License-Identifier: GPL-2.0-or-later*/

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const OptionsGroup = GObject.registerClass(
class OptionsGroup extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({ title: 'Preferences' });

        //settings = this.ExtensionUtils.getSettings();
        
        const Switch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        settings.bind('files-app',
            Switch, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const row = new Adw.ActionRow({
            title: 'Show Files',
            activatable_widget: Switch,
        });
        row.add_suffix(Switch);
        this.add(row);
        
        const Switch2 = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
        });
        settings.bind('single-window',
            Switch2, 'active',
            Gio.SettingsBindFlags.DEFAULT);

        const row2 = new Adw.ActionRow({
            title: 'Title for single window',
            activatable_widget: Switch2,
        });
        row2.add_suffix(Switch2);
        this.add(row2);
    }
});

export default class GAppMenuPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
    const settings = this.getSettings();
    const page = new Adw.PreferencesPage();
    const optionsgroup = new OptionsGroup(settings);
    page.add(optionsgroup);
    window.add(page);
    }
}
