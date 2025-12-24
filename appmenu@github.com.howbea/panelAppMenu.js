/* panelAppMenu.js
 * Phase A-2 — Stable AppMenu replacement
 * - Replaces GNOME Shell appMenu safely
 * - Menu & items are created ONCE
 * - No removeAll(), no menu recreation
 * - _sync() only updates properties
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// ------------------------------------------------------------
// AppMenuButton
// ------------------------------------------------------------

const AppMenuButton = GObject.registerClass(
class AppMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'CleanAppMenu');

        // Icon
        this._icon = new St.Icon({
            icon_name: 'application-x-executable-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        // Internal state
        this._targetApp = null;
        this._windowSignals = [];

        // Build menu ONCE
        this._buildMenu();

        // Track focus changes
        this._focusSignal = global.display.connect('notify::focus-window', () => {
            this._updateTargetApp();
        });

        this._updateTargetApp();
    }

    // ----------------------------
    // Menu construction (ONCE)
    // ----------------------------

    _buildMenu() {
        // App title (header)
        this._titleItem = new PopupMenu.PopupMenuItem('No Application', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._titleItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Favorite toggle
        this._favoriteItem = new PopupMenu.PopupMenuItem('Add to Favorites');
        this._favoriteItem.connect('activate', () => {
            if (!this._targetApp)
                return;

            const favs = Shell.AppSystem.get_default().get_favorite_map();
            const id = this._targetApp.get_id();

            if (favs[id])
                Shell.AppSystem.get_default().remove_from_favorites(id);
            else
                Shell.AppSystem.get_default().add_to_favorites(id);

            this._sync();
        });
        this.menu.addMenuItem(this._favoriteItem);

        // Quit
        this._quitItem = new PopupMenu.PopupMenuItem('Quit');
        this._quitItem.connect('activate', () => {
            if (!this._targetApp)
                return;
            this._targetApp.request_quit();
        });
        this.menu.addMenuItem(this._quitItem);
    }

    // ----------------------------
    // Target app tracking
    // ----------------------------

    _updateTargetApp() {
        const win = global.display.get_focus_window();
        let app = null;

        if (win && !win.is_override_redirect())
            app = Shell.WindowTracker.get_default().get_window_app(win);

        if (app === this._targetApp)
            return;

        this._disconnectWindowSignals();
        this._targetApp = app;
        this._connectWindowSignals();
        this._sync();
    }

    _connectWindowSignals() {
        if (!this._targetApp)
            return;

        const wins = this._targetApp.get_windows();
        for (const w of wins) {
            const id = w.connect('unmanaged', () => this._sync());
            this._windowSignals.push([w, id]);
        }
    }

    _disconnectWindowSignals() {
        for (const [w, id] of this._windowSignals) {
            if (!w.destroyed)
                w.disconnect(id);
        }
        this._windowSignals = [];
    }

    // ----------------------------
    // Sync (NO destroy, NO recreate)
    // ----------------------------

    _sync() {
        if (!this._targetApp) {
            this._titleItem.label.text = 'No Application';
            this._favoriteItem.visible = false;
            this._quitItem.visible = false;
            return;
        }

        const name = this._targetApp.get_name();
        this._titleItem.label.text = name;

        const favs = Shell.AppSystem.get_default().get_favorite_map();
        const id = this._targetApp.get_id();
        const isFav = !!favs[id];

        this._favoriteItem.label.text = isFav
            ? 'Remove from Favorites'
            : 'Add to Favorites';

        this._favoriteItem.visible = true;
        this._quitItem.visible = true;
    }

    destroy() {
        if (this._focusSignal)
            global.display.disconnect(this._focusSignal);

        this._disconnectWindowSignals();
        super.destroy();
    }
});

// ------------------------------------------------------------
// Public controller
// ------------------------------------------------------------

export class PanelAppMenu {
    constructor(uuid) {
        this._uuid = uuid;
        this._button = null;
        this._hiddenOriginal = false;
    }

    enable() {
        // Hide original appMenu
        const orig = Main.panel.statusArea['appMenu'];
        if (orig) {
            orig.container.hide();
            this._hiddenOriginal = true;
        }

        this._button = new AppMenuButton();
        Main.panel.addToStatusArea(this._uuid, this._button, 0, 'left');
    }

    disable() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }

        if (this._hiddenOriginal) {
            const orig = Main.panel.statusArea['appMenu'];
            if (orig)
                orig.container.show();
            this._hiddenOriginal = false;
        }
    }
}

