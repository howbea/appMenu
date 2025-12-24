/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Animation from 'resource:///org/gnome/shell/ui/animation.js';
import {AppMenu} from './appMenu.js';
import {DesktopMenu} from './desktopMenu.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as CtrlAltTab from 'resource:///org/gnome/shell/ui/ctrlAltTab.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Overview from 'resource:///org/gnome/shell/ui/overview.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {QuickSettingsMenu, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const PANEL_ICON_SIZE = 16;
const APP_MENU_ICON_MARGIN = 0;

const BUTTON_DND_ACTIVATION_TIMEOUT = 250;

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const AppMenuButton = GObject.registerClass({
    Signals: {'changed': {}},
}, class AppMenuButton extends PanelMenu.Button {
    _init(panel) {
        super._init(0.0, null, true);

        this.accessible_role = Atk.Role.MENU;

        this._startingApps = [];

        this._menuManager = panel.menuManager;
        this._targetApp = null;

        let bin = new St.Bin({name: 'appMenu'});
        this.add_child(bin);

        this.bind_property('reactive', this, 'can-focus', 0);
        this.reactive = false;

        this._container = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        bin.set_child(this._container);

        let textureCache = St.TextureCache.get_default();
        textureCache.connect('icon-theme-changed',
            this._onIconThemeChanged.bind(this));

        let iconEffect = new Clutter.DesaturateEffect();
        this._iconBox = new St.Bin({
            style_class: 'app-menu-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._iconBox.add_effect(iconEffect);
        this._container.add_child(this._iconBox);

        this._iconBox.connect('style-changed', () => {
            let themeNode = this._iconBox.get_theme_node();
            iconEffect.enabled = themeNode.get_icon_style() === St.IconStyle.SYMBOLIC;
        });

        this._label = new St.Label({
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._container.add_child(this._label);

        this._visible = !Main.overview.visible;
        if (!this._visible)
            this.hide();
        Main.overview.connectObject(
            'hiding', this._sync.bind(this),
            'showing', this._sync.bind(this), this);

        this._spinner = new Animation.Spinner(PANEL_ICON_SIZE, {
            animate: true,
            hideOnStop: true,
        });
        this._container.add_child(this._spinner);

        let menu = new AppMenu(this);
        this.setMenu(menu);
        this._menuManager.addMenu(menu);
        
        this._dmenu = new DesktopMenu(this);

        Shell.WindowTracker.get_default().connectObject('notify::focus-app',
            this._focusAppChanged.bind(this), this);
        Shell.AppSystem.get_default().connectObject('app-state-changed',
            this._onAppStateChanged.bind(this), this);
        global.window_manager.connectObject('switch-workspace',
            this._sync.bind(this), this);

        this._sync();
    }

    fadeIn() {
        if (this._visible)
            return;

        this._visible = true;
        this.reactive = true;
        this.remove_all_transitions();
        this.ease({
            opacity: 255,
            duration: Overview.ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    fadeOut() {
        if (!this._visible)
            return;

        this._visible = false;
        this.reactive = false;
        this.remove_all_transitions();
        this.ease({
            opacity: 0,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            duration: Overview.ANIMATION_TIME,
        });
    }

    _syncIcon(app) {
        const icon = app.create_icon_texture(PANEL_ICON_SIZE - APP_MENU_ICON_MARGIN);
        this._iconBox.set_child(icon);
    }

    _onIconThemeChanged() {
        if (this._iconBox.child == null)
            return;

        if (this._targetApp)
            this._syncIcon(this._targetApp);
    }

    stopAnimation() {
        this._spinner.stop();
    }

    startAnimation() {
        this._spinner.play();
    }

    _onAppStateChanged(appSys, app) {
        let state = app.state;
        if (state !== Shell.AppState.STARTING)
            this._startingApps = this._startingApps.filter(a => a !== app);
        else if (state === Shell.AppState.STARTING)
            this._startingApps.push(app);
        // For now just resync on all running state changes; this is mainly to handle
        // cases where the focused window's application changes without the focus
        // changing.  An example case is how we map OpenOffice.org based on the window
        // title which is a dynamic property.
        this._sync();
    }

    _focusAppChanged() {
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (!focusedApp) {
            // If the app has just lost focus to the panel, pretend
            // nothing happened; otherwise you can't keynav to the
            // app menu.
            if (global.stage.key_focus != null)
                return;
        }
        this._sync();
    }

    _findTargetApp() {
        let workspaceManager = global.workspace_manager;
        let workspace = workspaceManager.get_active_workspace();
        let tracker = Shell.WindowTracker.get_default();
        let focusedApp = tracker.focus_app;
        if (focusedApp && focusedApp.is_on_workspace(workspace))
            return focusedApp;

        for (let i = 0; i < this._startingApps.length; i++) {
            if (this._startingApps[i].is_on_workspace(workspace))
                return this._startingApps[i];
        }

        return null;
    }

    _sync() {
        let targetApp = this._findTargetApp();

        if (this._targetApp !== targetApp) {
            this._targetApp?.disconnectObject(this);

            this._targetApp = targetApp;

            if (this._targetApp) {
                this._targetApp.connectObject('notify::busy', this._sync.bind(this), this);
                this._label.set_text(this._targetApp.get_name());
                this.set_accessible_name(this._targetApp.get_name());

                this._syncIcon(this._targetApp);
            }
            else {
                let text = 'Settings'
                this._label.set_text(text);
                this._iconBox.set_child(new St.Icon({icon_name: 'user-desktop-symbolic', style_class: 'desktop-menu-icon'}));
            }
        }            

        let visible = !Main.overview.visibleTarget;
        if (visible)
            this.fadeIn();
        else
            this.fadeOut();

        let isBusy = this._targetApp != null &&
                      (this._targetApp.get_state() === Shell.AppState.STARTING ||
                       this._targetApp.get_busy());
        if (isBusy)
            this.startAnimation();
        else
            this.stopAnimation();

        this.reactive = visible && !isBusy;


        if (this._targetApp)
            this.menu.setApp(this._targetApp);
        else
            this.menu = this._dmemu;
            
        this.emit('changed');
    }
});

export default class IndicatorExampleExtension extends Extension {
    enable() {
        this.switchWorkspaceId = global.window_manager.connect('switch-workspace', () => {
                let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, global.workspace_manager.get_active_workspace());
                windows = global.display.sort_windows_by_stacking(windows);
                if (windows.length) {
                    let topWindow = windows[windows.length - 1];
                    topWindow.focus(Clutter.CURRENT_TIME);
                }
            });
    
        this._indicator = new AppMenuButton(Main.panel);
        if(Main.panel.statusArea['appMenu'])
        Main.panel.statusArea['appMenu'].hide();
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'left');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
