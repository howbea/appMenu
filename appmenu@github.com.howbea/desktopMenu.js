import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import GObject from 'gi://GObject';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {PlacesManager} from './placeDisplay.js';
import * as appMenu from './appMenu.js';

const N_ = x => x;

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

Gio._promisify(Gio.AppInfo, 'launch_default_for_uri_async');

const mypanelMenuButton = new appMenu.MyPanelMenuButton();

export class DesktopMenu extends PopupMenu.PopupMenu {
    /**
     * @param {Clutter.Actor} sourceActor - actor the menu is attached to
     * @param {St.Side} side - arrow side
     * @param {object} params - options
     * @param {bool} params.favoritesSection - show items to add/remove favorite
     * @param {bool} params.showSingleWindow - show window section for a single window
     */
    constructor(sourceActor, side = St.Side.TOP, params = {}) {
        if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
            if (side === St.Side.LEFT)
                side = St.Side.RIGHT;
            else if (side === St.Side.RIGHT)
                side = St.Side.LEFT;
        }

        super(sourceActor, 0.5, side);

        this.actor.add_style_class_name('app-menu');

        this._app = null;
        this._appSystem = Shell.AppSystem.get_default();
        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._appFavorites = AppFavorites.getAppFavorites();
        //this._enableFavorites = favoritesSection;
        //this._showSingleWindows = showSingleWindows;
        
        let itemoverview = new PopupMenu.PopupMenuItem(_('Overview'));
        itemoverview.connect('activate', () => {
        if (Main.overview.shouldToggleByCornerOrButton())
            Main.overview.toggle();
        });
        
        //this.addMenuItem(itemoverview);
        
        let itemapps = new PopupMenu.PopupMenuItem(_('App Grid'));
        itemapps.connect('activate', () => {
            if (Main.overview.dash.showAppsButton.checked) {
                if (Main.overview.shouldToggleByCornerOrButton())
                    Main.overview.dash.showAppsButton.checked = false;
            }
            else {
                if (Main.overview.shouldToggleByCornerOrButton()) {
                    Main.overview.show();
                    Main.overview.dash.showAppsButton.checked = true;
                    }
            }
        });
        
        this.addMenuItem(itemapps);
      
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this._mypanelMenuButtonItem = this.addAction(_('Window Previews'), () => {
            mypanelMenuButton._showWidget();
            //mypanelMenuButton.toggleDock();
        });
        
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let item1 = new PopupMenu.PopupMenuItem(_('Change Background…'));
        item1.connect('activate', () => {
            Shell.AppSystem.get_default().lookup_app('gnome-background-panel.desktop').activate();
            this.menu.close();
            Main.overview.hide();
        });
        
        this.addMenuItem(item1);
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let item = new PopupMenu.PopupMenuItem(_('Show Desktop in Files'));
        item.connect('activate', () => {
            let desktopPath = GLib.get_user_special_dir(
                GLib.UserDirectory.DIRECTORY_DESKTOP);
            let desktopFile = desktopPath
                ? Gio.File.new_for_path(desktopPath)
                : null;
            Gio.AppInfo.launch_default_for_uri_async(desktopFile.get_uri(), global.create_app_launch_context(0, -1), null);
            this.menu.close();
            Main.overview.hide();
        });
        //this.addMenuItem(item);
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        let item2 = new PopupMenu.PopupMenuItem(_('Display Settings'));
        item2.connect('activate', () => {
            Shell.AppSystem.get_default().lookup_app('gnome-display-panel.desktop').activate();
            this.menu.close();
            Main.overview.hide();
        });
        this.addMenuItem(item2);
        let item3 = new PopupMenu.PopupMenuItem(_('Settings'));
        item3.connect('activate', () => {
            Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop').activate();
            this.menu.close();
        });
        this.addMenuItem(item3);
    }
    
    placesMenu() {
        this.placesManager = new PlacesManager();

        this._sections = { };

        for (let i = 0; i < SECTIONS.length; i++) {
            let id = SECTIONS[i];
            this._sections[id] = new PopupMenu.PopupMenuSection();
            this.placesManager.connect(`${id}-updated`, () => {
                this._redisplay(id);
            });

            this._create(id);
            this.addMenuItem(this._sections[id]);
            //this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay(id) {
        this._sections[id].removeAll();
        this._create(id);
    }

    _create(id) {
        let places = this.placesManager.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections[id].addMenuItem(new PlaceMenuItem2(places[i]));

        this._sections[id].actor.visible = places.length > 0;
    }
    
    placesMenu2() {
        this.placesManager2 = new PlacesManager();

        this._sections2 = { };

        for (let i = 0; i < SECTIONS2.length; i++) {
            let id = SECTIONS2[i];
            this._sections2[id] = new PopupMenu.PopupMenuSection();
            this.placesManager2.connect(`${id}-updated`, () => {
                this._redisplay2(id);
            });

            this._create2(id);
            this.smitemd.menu.addMenuItem(this._sections2[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay2(id) {
        this._sections2[id].removeAll();
        this._create2(id);
    }

    _create2(id) {
        let places = this.placesManager2.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections2[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections2[id].actor.visible = places.length > 0;
    }
    
    placesMenu3() {
        this.placesManager3 = new PlacesManager();

        this._sections3 = { };

        for (let i = 0; i < SECTIONS4.length; i++) {
            let id = SECTIONS4[i];
            this._sections3[id] = new PopupMenu.PopupMenuSection();
            this.placesManager3.connect(`${id}-updated`, () => {
                this._redisplay3(id);
            });

            this._create3(id);
            this.smitemd.menu.addMenuItem(this._sections3[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay3(id) {
        this._sections3[id].removeAll();
        this._create3(id);
    }

    _create3(id) {
        let places = this.placesManager3.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections3[id].addMenuItem(new PlaceMenuItem2(places[i]));

        this._sections3[id].actor.visible = places.length > 0;
    }
    
    placesMenu4() {
        this.placesManager4 = new PlacesManager();

        this._sections4 = { };

        for (let i = 0; i < SECTIONS5.length; i++) {
            let id = SECTIONS5[i];
            this._sections4[id] = new PopupMenu.PopupMenuSection();
            this.placesManager4.connect(`${id}-updated`, () => {
                this._redisplay4(id);
            });

            this._create4(id);
            this.smitemd.menu.addMenuItem(this._sections4[id]);
            this.smitemd.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
    }
    
    _redisplay4(id) {
        this._sections4[id].removeAll();
        this._create4(id);
    }

    _create4(id) {
        let places = this.placesManager4.get(id);

        for (let i = 0; i < places.length; i++)
            this._sections4[id].addMenuItem(new PlaceMenuItem(places[i]));

        this._sections4[id].actor.visible = places.length > 0;
    }

    _onAppStateChanged(sys, app) {
        if (this._app !== app)
            return;

        this._updateQuitItem();
        this._updateNewWindowItem();
        this._updateGpuItem();
    }

    _updateQuitItem() {
        this._quitItem.visible = this._app?.state === Shell.AppState.RUNNING;
    }

    _updateNewWindowItem() {
        const actions = this._app?.appInfo?.list_actions() ?? [];
        this._newWindowItem.visible =
            this._app?.can_open_new_window() && !actions.includes('new-window');
    }

    _updateFavoriteItem() {
        const appInfo = this._app?.app_info;
        const canFavorite = appInfo &&
            this._enableFavorites &&
            global.settings.is_writable('favorite-apps') &&
            this._parentalControlsManager.shouldShowApp(appInfo);

        this._toggleFavoriteItem.visible = canFavorite;

        if (!canFavorite)
            return;

        const {id} = this._app;
        this._toggleFavoriteItem.label.text = this._appFavorites.isFavorite(id)
            ? _('Unpin')
            : _('Pin to Dash');
    }

    _updateGpuItem() {
        const proxy = global.get_switcheroo_control();
        const hasDualGpu = proxy?.get_cached_property('HasDualGpu')?.unpack();

        const showItem =
            this._app?.state === Shell.AppState.STOPPED && hasDualGpu;

        this._onGpuMenuItem.visible = showItem;

        if (!showItem)
            return;

        const launchGpu = this._getNonDefaultLaunchGpu();
        this._onGpuMenuItem.label.text = launchGpu === Shell.AppLaunchGpu.DEFAULT
            ? _('Launch using Integrated Graphics Card')
            : _('Launch using Discrete Graphics Card');
    }

    _updateDetailsVisibility() {
        const sw = this._appSystem.lookup_app('org.gnome.Software.desktop');
        this._detailsItem.visible = sw !== null;
    }

    _animateLaunch() {
        if (this.sourceActor.animateLaunch)
            this.sourceActor.animateLaunch();
    }

    _getNonDefaultLaunchGpu() {
        return this._app.appInfo.get_boolean('PrefersNonDefaultGPU')
            ? Shell.AppLaunchGpu.DEFAULT
            : Shell.AppLaunchGpu.DISCRETE;
    }

    /** */
    destroy() {
        this.setApp(null);
        super.destroy();
    }

    /**
     * @returns {bool} - true if the menu is empty
     */
    /*isEmpty() {
        if (!this._app)
            return true;
        return super.isEmpty();
    }*/

    /**
     * @param {Shell.App} app - the app the menu represents
     */
    setApp(app) {
        if (this._app === app)
            return;

        this._app?.disconnectObject(this);

        this._app = app;

        this._app?.connectObject('windows-changed',
            () => this._queueUpdateWindowsSection(), this);

        this._updateWindowsSection();

        const appInfo = app?.app_info;
        const actions = appInfo?.list_actions() ?? [];

        this._actionSection.removeAll();
        actions.forEach(action => {
            const label = appInfo.get_action_name(action);
            this._actionSection.addAction(label, event => {
                if (action === 'new-window')
                    this._animateLaunch();

                this._app.launch_action(action, event.get_time(), -1);
                Main.overview.hide();
            });
        });

        this._updateQuitItem();
        this._updateNewWindowItem();
        this._updateFavoriteItem();
        this._updateGpuItem();            
    }

    _queueUpdateWindowsSection() {
        if (this._updateWindowsLaterId)
            return;

        const laters = global.compositor.get_laters();
        this._updateWindowsLaterId = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._updateWindowsSection();
                return GLib.SOURCE_REMOVE;
            });
    }

    _updateWindowsSection() {
        if (this._updateWindowsLaterId) {
            const laters = global.compositor.get_laters();
            laters.remove(this._updateWindowsLaterId);
        }
        this._updateWindowsLaterId = 0;

        this._windowSection.removeAll();
        this._openWindowsHeader.hide();

        if (!this._app)
            return;

        const minWindows = this._showSingleWindows ? 1 : 2;
        const windows = this._app.get_windows().filter(w => !w.skip_taskbar);
        if (windows.length < minWindows)
            return;

        this._openWindowsHeader.show();

        windows.forEach(window => {
            const title = window.title || this._app.get_name();
            const item = this._windowSection.addAction(title, event => {
                Main.activateWindow(window, event.get_time());
            });
            window.connectObject('notify::title', () => {
                item.label.text = window.title || this._app.get_name();
            }, item);
        });
    }
}
