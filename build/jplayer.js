
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
/*
 * this file is part of
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010-2014, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2015-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */

window.projekktor = window.$p = (function (window, document, $) {

    "use strict";

    var projekktors = [];

    // this object is returned in case multiple player's are requested
    function Iterator(arr) {
        this.length = arr.length;
        this.each = function (fn) {
            $.each(arr, fn);
        };
        this.size = function () {
            return arr.length;
        };
    }


    function PPlayer(srcNode, cfg, onReady) {
        this.config = new projekktorConfig();

        this.storage = new projekktorPersistentStorage(this);

        this.env = {
            muted: false,
            volume: 1,
            playerDom: null,
            mediaContainer: null,
            mouseIsOver: false,
            loading: false, // important
            className: '',
            onReady: onReady
        };

        this.media = [];
        this._plugins = [];
        this._pluginCache = {};
        this._queue = [];
        this._cuePoints = {};
        this.listeners = [];
        this.playerModel = {};
        this._isReady = false;
        this._isLive = false;
        this._isFullViewport = false;
        this._maxElapsed = 0;
        this._playlistServer = '';
        this._id = '';
        this._parsers = {};

        this.itemRules = [
            function () {
                return arguments[0].id != null;
            },
            function () {
                return arguments[0].config.active !== false;
            },
            function () {
                return arguments[0].config.maxviews == null || arguments[0].viewcount < arguments[0].config.maxviews;
            }
        ];

        /**
         * Add items to the playlist on provided index
         *
         * @param {array} items - playlist items to add
         * @param {number} [index=this.media.length] - index on which the items should be added
         * @param {boolean} [replace=false] - should the items on specified index be replaced
         * @returns {object} object with affected index, added and replaced (removed) items.
         * For example when nothing was added the object will look like: {added: [], removed: [], index: -1}
         */
        this.addItems = function (items, index, replace) {

            var result = {
                    added: [],
                    removed: [],
                    indexes: [],
                    currentItemAffected: false
                },
                i, l,
                item,
                files,
                itemIds = [],
                currentItem = this.getItem();

            replace = !!replace || false; // default is false

            // constrain index to the range
            index = (typeof index !== 'number') ? this.media.length : index;
            index = (index > this.media.length) ? this.media.length : index;
            index = (index < 0) ? 0 : index;

            // check if there is data to add
            if ($.isEmptyObject(items)) {
                return result;
            }

            // check if items are not the reference to the actual media array (for example when result of getPlaylist() is passed)
            if (items === this.media) {
                items = items.slice(); // clone
            }

            // check if items is an array and if it's not push it to the array
            if (!$.isArray(items)) {
                items = [items];
            }

            // be sure that items are unique and processed
            for (i = 0, l = items.length; i < l; i++) {

                item = items[i];
                files = [];

                $.each(item, function (key, value) {
                    if ($.isNumeric(key)) {
                        files.push(value);
                    }
                });

                // item is not processed by _prepareMedia yet
                if (item.processed !== true) {
                    item = this._processItem({
                        file: files,
                        config: item.config || {}
                    });
                }

                // check if the id is unique in currently added array
                if ($.inArray(item.id, itemIds) > -1) {
                    item.id = item.id + '_' + $p.utils.randomId(8);
                }

                // item is already on the playlist, so provide an unique copy of it
                if (this.getItemById(item.id)) {
                    item = $.extend(true, {}, item);
                    item.id = $p.utils.randomId(8);
                }

                // set cuepoints if there are some
                if (item.hasOwnProperty('cuepoints') && !!item.cuepoints) {
                    this.setCuePoints(item.cuepoints, item.id, true);
                }

                itemIds.push(item.id);
                items[i] = item;
            }

            // add item
            result.added = items;
            result.removed = Array.prototype.splice.apply(this.media, [index,
                (replace === true ? items.length : 0)
            ].concat(items));
            result.indexes = [index];
            result.currentItemAffected = $.inArray(currentItem, result.removed) > -1;

            this._promote('scheduleModified', result);

            return result;
        };

        /**
         * Shortcut function to remove item from playlist at given index
         *
         * @param {number} [index=this.media.length-1] - index of item to remove. Default is the last one on the playlist.
         * @returns {object} - object with affected index, removed item  e.g.: {added: [], removed: [], index: -1}
         */
        this.removeItemAtIndex = function (index) {

            var result = {
                    added: [],
                    removed: [],
                    indexes: [],
                    currentItemAffected: false
                },
                func = function (itm, idx) {
                    return idx === index;
                };

            // check if we could remove something
            if (typeof index !== 'number' ||
                this.media.length === 0 ||
                index > this.media.length - 1 ||
                index < 0) {
                return result;
            }

            // remove item
            result = this.removeItems(func);

            return result;
        };

        /**
         * Shortcut function to remove item by id
         * @param {string} itemId
         * @returns {object}
         */
        this.removeItemById = function (itemId) {
            var result = {
                    added: [],
                    removed: [],
                    indexes: [],
                    currentItemAffected: false
                },
                func = function (itm, idx) {
                    return itm.id === itemId;
                };

            // check if we could remove something
            if (typeof itemId !== 'string' ||
                this.media.length === 0) {
                return result;
            }

            result = this.removeItems(func);

            return result;
        };

        this.removeItemsCategory = function (catName) {
            var result = {
                    added: [],
                    removed: [],
                    indexes: [],
                    currentItemAffected: false
                },
                func = function (itm, idx) {
                    return itm.cat === catName;
                };

            // check if we could remove something
            if (typeof catName !== 'string' ||
                this.media.length === 0) {
                return result;
            }

            result = this.removeItems(func);

            return result;
        };

        /**
         * Remove playlist items which satisfy a filter function. If no function provided then all items are removed
         * @param {function} [which] - function( Object elementOfArray, Integer indexInArray ) => Boolean;
         * The function to process each playlist item against. The first argument to the function is the item,
         * and the second argument is the index. The function should return a Boolean value.
         * @returns {object} - object with affected index, removed item  e.g.: {added: [], removed: [], index: -1}
         */
        this.removeItems = function (which) {

            var result = {
                    added: [], // just for consistency with addItems()
                    removed: [],
                    indexes: [],
                    currentItemAffected: false
                },
                currentItem = this.getItem(),
                toRemove,
                toRemoveIndexes = [],
                i, l;

            if (typeof which === 'undefined') {
                which = function (itm, idx) {
                    return true;
                };
            } else if (!$.isFunction(which)) {
                return result;
            }

            // check if there anything to remove
            if (this.media.length === 0) {
                return result;
            }

            toRemove = $.grep(this.media, which);

            for (i = 0, l = toRemove.length; i < l; i++) {
                toRemoveIndexes.push($.inArray(toRemove[i], this.media));
            }

            for (i = 0, l = toRemoveIndexes.length; i < l; i++) {
                result.removed.push(this.media.splice(toRemoveIndexes[i] - i, 1)[0]);
            }

            result.indexes = toRemoveIndexes;
            result.currentItemAffected = $.inArray(currentItem, result.removed) > -1;

            this._promote('scheduleModified', result);

            return result;
        };

        this.getItemById = function (itemId) {
            return this.media.find(function (item) {
                return (itemId === item.id);
            }) || null;
        };

        this.getItemsByCatName = function (catName) {
            return this.media.filter(function (item) {
                return (catName === item.cat);
            }) || [];
        };

        /**
         * Returns all possible platform names implemented in projekktor which are potentially 
         * able to play the MIME Type specified in the argument. 
         */
        this._canPlayOnPlatforms = function (mimeType) {
            var platformsSet = new Set(),
                mILove = $p.cache.modelsILove || [];

            mILove.forEach(function (iLove) {
                if (iLove.type === mimeType) {
                    iLove.platform.forEach(function (platform) {
                        platformsSet.add(platform);
                    });
                }
            });

            return platformsSet;
        };

        /**
         * Checks if mimeType can be played using specified platform
         */
        this._canPlay = function (mimeType, platform) {

            var platformMimeTypeMap = this.getSupportedPlatforms(),
                pt = (typeof platform === "string") ? platform.toLowerCase() : "browser",
                type = (typeof mimeType === "string") ? mimeType.toLowerCase() : undefined;

            // if mimeType is undefined we have nothing to look for
            if (type === undefined) {
                return false;
            }

            // platform unsupported
            if (!platformMimeTypeMap.has(pt)) {
                return false;
            }

            // everything fine
            // check if specified platform is supporting mimeType we are looking for
            return platformMimeTypeMap.get(pt).has(type);
        };

        this._processItem = function (itemData) {
            var files = itemData.file || [],
                config = itemData.config || {},
                defaultItem = {
                    id: config.id || $p.utils.randomId(8),
                    cat: config.cat || 'clip',
                    file: [],
                    availableFiles: files,
                    platform: 'browser',
                    qualities: [], // available quality keys
                    model: 'NA',
                    errorCode: undefined,
                    viewcount: 0,
                    processed: false,
                    config: config,
                    cuepoints: []
                },
                resultItem = $.extend({}, defaultItem);

            // leave only supported files
            resultItem = this._filterSupportedItemFiles(resultItem);

            if (resultItem.file.length) {
                // In this place we are dealing only with potentially playable files.
                // Now we need to select the best one(s) to play.
                resultItem = this._getBestModelForItem(resultItem);

                // leave only valid files for the selected model/platform
                resultItem = this._filterFiles(resultItem, function (file, idx, files) {
                    return file.type === files[0].type;
                });

                // finally check for available qualities and remove redundant file formats
                resultItem = this._filterQualities(resultItem);
            }

            resultItem.processed = true;

            return resultItem;
        };

        this._processItemFile = function (file) {
            var parsedMimeType,
                resultFile = {
                    src: $p.utils.toAbsoluteURL(file.src),
                    type: 'none/none',
                    originalType: file.type,
                    drm: file.drm || [],
                    codecs: undefined,
                    quality: file.quality || 'auto'
                };

            // check and cleanup provided mimeType
            if (file.type) {
                parsedMimeType = $p.utils.parseMimeType(file.type);
                resultFile.type = parsedMimeType.type + "/" + parsedMimeType.subtype;
                resultFile.codecs = parsedMimeType.parameters.codecs;
            }
            // if type is not set try to get it from file extension
            else {
                resultFile.type = ref._getTypeFromFileExtension(file.src);
            }

            return resultFile;
        };

        this._filterSupportedItemFiles = function (item) {

            var ref = this,
                inFiles = item.availableFiles || [],
                outFiles = [];

            // select only playable files
            inFiles.forEach(function (file) {
                var processedFile = ref._processItemFile(file),
                    mimeType = processedFile.type,
                    drm = processedFile.drm;

                // check if the format is supported
                if (ref.getCanPlay(mimeType)) {
                    // check if there is any DRM system specified 
                    if (drm.length) {
                        // if it is then check if it's supported
                        if (drm.some(function (drmSystem) {
                                return ref.getCanPlayWithDrm(drmSystem, mimeType);
                            })) {
                            // if so add this file to the list
                            outFiles.push(processedFile);
                        }
                        // if it's not then add appropriate error code
                        else {
                            item.errorCode = 300;
                        }
                    }
                    // if it's not then just add the file to the list
                    else {
                        outFiles.push(processedFile);
                    }
                }
                // add error code for unsupported file format
                else {
                    item.errorCode = 5;
                }
            });

            // cleanup errorCode if there are some playable files
            if (outFiles.length) {
                item.errorCode = undefined;
            }

            item.file = outFiles;

            return item;
        };

        this._getBestModelForItem = function (item) {
            var ref = this,
                files = item.file,
                config = item.config || {},
                prioritizeBy = config.prioritizeBy || this.getConfig('prioritizeBy'),
                platformPriorities = Array.from(this.getSupportedPlatforms().keys()),
                resultILoves = [],
                file,
                selectedModel = item.model,
                selectedPlatform = item.platform;

            // select best model based on defined priorities
            if (prioritizeBy === 'sourcesOrder') {
                // in 'sourcesOrder' mode we just need to find a proper model
                // for the first playable file
                file = files[0];
            } else {
                /**
                 * In platformsOrder mode we need to find the first file supported by the 
                 * platform with highest priority.
                 */
                platformPriorities.some(function (pt) {
                    selectedPlatform = pt;
                    file = files.find(function (f) {
                        if (f.drm.length) {
                            return f.drm.some(function (drmSystem) {
                                return ref.getCanPlayWithDrm(drmSystem, f.type, [pt]);
                            });
                        } else {
                            return ref.getCanPlay(f.type, [pt]);
                        }
                    });
                    return file !== undefined;
                });
            }

            /**
             * Get only sensible iLoves in this context
             */
            resultILoves = this._filterModelILoves(file.type, file.drm);

            /**
             * Now resultILoves is filled only with compatible and supported models iLoves
             * but probably in the wrong order. Select first one with the highest priority
             * for supported platforms.
             */

            platformPriorities.some(function (pt) {
                selectedPlatform = pt;
                selectedModel = resultILoves.find(function (iLove) {
                    return (iLove.platform.indexOf(pt) > -1);
                });

                return selectedModel !== undefined;
            });

            // move selected file to the beginning of the array
            item.file = files.splice(files.indexOf(file), 1).concat(files);
            item.model = selectedModel.model;
            item.platform = selectedPlatform;

            return item;
        };

        this._filterModelILoves = function (mimeType, drmSystems) {
            var modelsILoveSupported = $p.cache.modelsILoveSupported,
                drm = drmSystems || [];

            return modelsILoveSupported.filter(function (iLove) {
                return (iLove.type === mimeType &&
                    (!drm.length // no DRM support needed
                        // DRM support needed
                        ||
                        (iLove.drm // model has defined DRM support
                            &&
                            $p.utils.intersect(iLove.drm, drm).length // and this is the DRM support we need
                        )
                    )
                );
            });
        };

        this._filterQualities = function (item) {
            var inFiles = item.file,
                qualityDefinitions = item.config.playbackQualities || this.getConfig('playbackQualities') || [],
                fileQualityKeys = [],
                definedQualityKeys = qualityDefinitions.map(function (q) {
                    return q.key;
                }),
                outFiles = [];

            // always push 'auto' to the definedQualityKeys
            definedQualityKeys.push('auto');

            // collect all quality keys from available files
            inFiles.forEach(function (file) {
                fileQualityKeys.push(file.quality);
            });

            // leave only unique ones
            fileQualityKeys = $p.utils.unique(fileQualityKeys);

            // are there proper definitions for those quality keys?
            // leave only valid ones
            fileQualityKeys = $p.utils.intersect(fileQualityKeys, definedQualityKeys);

            // is there more than one quality
            if (fileQualityKeys.length > 1) {
                // leave only one file for each valid key
                fileQualityKeys.forEach(function (qKey) {
                    outFiles.push(inFiles.find(function (file) {
                        return file.quality === qKey;
                    }));
                });
            }

            // if there is no usable quality file
            // add first file from playable ones and overwrite its quality with 'auto'
            if (outFiles.length === 0) {
                inFiles[0].quality = 'auto';
                outFiles.push(inFiles[0]);
            }

            item.file = outFiles;
            item.qualities = fileQualityKeys;

            return item;
        };

        this._filterFiles = function (item, filterFunc) {
            var files = item.file || [];

            item.file = files.filter(filterFunc);

            return item;
        };

        /********************************************************************************************
         Event Handlers:
         *********************************************************************************************/

        /* Event Handlers */

        this.displayReadyHandler = function () {

            this._syncPlugins('displayready');
        };

        this.modelReadyHandler = function () {

            this._maxElapsed = 0;
            this._promote('item', this.getItemIdx());
        };

        this.pluginsReadyHandler = function (obj) {

            switch (obj.callee) {
                case 'parserscollected':
                    var parser = this.getParser(obj.data[2]);
                    this.setPlaylist(parser(obj.data));
                    if (this.getItemCount() < 1) {
                        this.setPlaylist();
                    }
                    break;

                case 'reelupdate':
                    this._promote('playlistLoaded', this.getPlaylist());
                    this.setActiveItem(0);
                    break;

                case 'displayready':
                    this._addGUIListeners();
                    this._promote('synchronized');
                    if (this.getState('AWAKENING')) {
                        this.playerModel.start();
                    }
                    if (!this._isReady) {
                        this._promote('ready');
                    }
                    break;

                case 'awakening':
                    if (this.getState('AWAKENING')) {
                        this.playerModel.displayItem(true);
                    }
                    break;
            }
        };

        this.synchronizedHandler = function (forceAutoplay) {

            if (this._isReady) {

                if (this.playerModel.init && (this.playerModel._ap === true || forceAutoplay === true) && this.getState('IDLE')) {
                    this.setPlay();
                }
            }
        };

        this.scheduleModifiedHandler = function (event) {
            if (event.currentItemAffected) {
                this.setActiveItem('next');
            }
        };

        this.readyHandler = function () {

            this._isReady = true;

            if (typeof onReady === 'function') {
                onReady(this);
            }

            this.synchronizedHandler(this.getConfig('autoplay'));
        };

        this.stateHandler = function (stateValue) {

            var ref = this;

            // change player css classes in order to reflect current state:
            var classes = $.map(this.getDC().attr("class").split(" "), function (item) {
                return item.indexOf(ref.getConfig('ns') + "state") === -1 ? item : null;
            });

            classes.push(this.getConfig('ns') + "state" + stateValue.toLowerCase());
            this.getDC().attr("class", classes.join(" "));

            switch (stateValue) {
                case 'STARTING':
                    this.getItem().viewcount++;
                    break;

                case 'AWAKENING':
                    this._syncPlugins('awakening');
                    break;

                case 'ERROR':
                    this._addGUIListeners();
                    if (this.getConfig('skipTestcard')) {
                        this.setActiveItem('next');
                    }
                    break;

                case 'COMPLETED':
                    this.setActiveItem('next');
                    break;

                case 'IDLE':
                    if (this.getConfig('leaveFullscreen')) {
                        this.setFullscreen(false);
                    }
                    break;
            }
        };

        this.volumeHandler = function (value) {
            var muted;

            if (value <= 0) {
                muted = true;
            } else {
                muted = false;
            }

            if (muted !== this.env.muted) {
                this.env.muted = muted;
                this.storage.save('muted', muted);
                this._promote('muted', muted);
            }

            this.storage.save('volume', value);
            this.env.volume = value;
        };

        this.playlistHandler = function (value) {
            this.setFile(value.file, value.type);
        };

        this.cuepointsAddHandler = function (value) {
            this._cuepointsChangeEventHandler(value);
        };

        this.cuepointsRemoveHandler = function (value) {
            this._cuepointsChangeEventHandler(value);
        };

        this.fullscreenHandler = function (goFullscreen) {

            if (goFullscreen === true) {
                this._requestFullscreen();
                this.getDC().addClass(this.getNS() + 'fullscreen');
            } else {
                this._exitFullscreen();
                this.getDC().removeClass(this.getNS() + 'fullscreen');
            }
        };

        this.configHandler = function (value) {
            this.setConfig(value);
        };

        this.timeHandler = function (value) {

            if (this._maxElapsed < value) {

                var pct = Math.round(value * 100 / this.getDuration()),
                    evt = false;

                if (pct < 25) {
                    pct = 25;
                }
                if (pct > 25 && pct < 50) {
                    evt = 'firstquartile';
                    pct = 50;
                }
                if (pct > 50 && pct < 75) {
                    evt = 'midpoint';
                    pct = 75;
                }
                if (pct > 75 && pct < 100) {
                    evt = 'thirdquartile';
                    pct = 100;
                }

                if (evt !== false) {
                    this._promote(evt, value);
                }

                this._maxElapsed = (this.getDuration() * pct / 100);
            }
        };

        this.availableQualitiesChangeHandler = function (value) {

            this.getItem().qualities = value;
        };

        this.qualityChangeHandler = function (value) {

            this.setConfig({
                playbackQuality: value
            });
        };

        this.streamTypeChangeHandler = function (value) {

            if (value === 'dvr' || value === 'live') {
                this._isLive = true;
            } else {
                this._isLive = false;
            }

            switch (value) {
                case 'dvr':
                    this.getDC().addClass(this.getNS() + 'dvr');
                    this.getDC().addClass(this.getNS() + 'live');
                    break;
                case 'live':
                    this.getDC().removeClass(this.getNS() + 'dvr');
                    this.getDC().addClass(this.getNS() + 'live');
                    break;
                default:
                    this.getDC().removeClass(this.getNS() + 'dvr');
                    this.getDC().removeClass(this.getNS() + 'live');
                    break;
            }
        };

        this.doneHandler = function () {

            this.setActiveItem(0, false);

            // prevent player-hangup in situations where
            // playlist becomes virtually empty by applied filter rules (e.g. maxviews)
            if (!this.getNextItem()) {
                //this.reset();
            }
        };

        this._syncPlugins = function (callee, data) {

            // wait for all plugins to re-initialize properly
            var ref = this,
                sync = function () {
                    try {
                        if (ref._plugins.length > 0) {
                            for (var i = 0; i < ref._plugins.length; i++) {
                                if (!ref._plugins[i].isReady()) {
                                    setTimeout(sync, 50);
                                    return;
                                }
                            }
                        }
                        ref._promote('pluginsReady', {
                            callee: callee,
                            data: data
                        });
                    } catch (e) {}
                };

            setTimeout(sync, 50);
        };

        /* attach mouse-listeners to GUI elements */
        this._addGUIListeners = function () {

            var ref = this;

            this._removeGUIListeners();

            this.getDC().on("mousedown mousemove mouseenter mouseleave focus blur", function handler(e) {
                ref._playerFocusListener(e);
            });

            $(window)
                .on('resize.projekktor' + this.getId(), function () {
                    ref.setSize();
                })
                .on('touchstart.projekktor' + this.getId(), function (event) {
                    ref._windowTouchListener(event);
                });

            if (this.config.enableKeyboard === true) {
                $(document).off('keydown.pp' + this._id);
                $(document).on('keydown.pp' + this._id, function (evt) {
                    ref._keyListener(evt);
                });
            }
        };

        /* remove mouse-listeners */
        this._removeGUIListeners = function () {

            $("#" + this.getId()).off();
            this.getDC().off();


            $(window).off('touchstart.projekktor' + this.getId());
            $(window).off('resize.projekktor' + this.getId());
        };

        /* add plugin objects to the bubble-event queue */
        this._registerPlugins = function () {

            var plugins = $.merge($.merge([], this.config._plugins), this.config._addplugins),
                pluginName = '',
                pluginNamePrefix = 'projekktor',
                pluginObj = null,
                availablePlugins = $p.plugins,
                i;

            // nothing to do
            if (this._plugins.length > 0 || plugins.length === 0) {
                return;
            }

            for (i = 0; i < plugins.length; i++) {
                pluginName = pluginNamePrefix + plugins[i].charAt(0).toUpperCase() + plugins[i].slice(1);

                if (typeof availablePlugins[pluginName] !== 'function') {
                    $p.utils.log("Projekktor Error: Plugin '" + plugins[i] + "' malicious or not available.");
                    continue;
                }

                pluginObj = $.extend(true, {}, new projekktorPluginInterface(), availablePlugins[pluginName].prototype);
                pluginObj.name = plugins[i].toLowerCase();
                pluginObj.pp = this;
                pluginObj.playerDom = this.env.playerDom;
                pluginObj._init(this.config['plugin_' + plugins[i].toLowerCase()] || {});

                if (this.config['plugin_' + pluginObj.name] == null) {
                    this.config['plugin_' + pluginObj.name] = {};
                }

                this.config['plugin_' + pluginObj.name] = $.extend(true, {}, pluginObj.config || {});

                for (var propName in pluginObj) {

                    if (propName.indexOf('Handler') > 1) {

                        if (!this._pluginCache.hasOwnProperty(propName)) {
                            this._pluginCache[propName] = [];
                        }
                        this._pluginCache[propName].push(pluginObj);
                    }
                }

                this._plugins.push(pluginObj);
            }
        };

        /* removes some or all eventlisteners from registered plugins */
        this.removePlugins = function (rmvPl) {

            if (this._plugins.length === 0) {
                return;
            }

            var pluginsToRemove = rmvPl || $.merge($.merge([], this.config._plugins), this.config._addplugins),
                pluginsRegistered = this._plugins.length;

            for (var j = 0; j < pluginsToRemove.length; j++) {

                for (var k = 0; k < pluginsRegistered; k++) {

                    if (this._plugins[k] !== undefined) {

                        if (this._plugins[k].name === pluginsToRemove[j].toLowerCase()) {
                            this._plugins[k].deconstruct();
                            this._plugins.splice(k, 1);

                            for (var events in this._pluginCache) {

                                if (this._pluginCache.hasOwnProperty(event)) {

                                    for (var shortcuts = 0; shortcuts < this._pluginCache[events].length; shortcuts++) {

                                        if (this._pluginCache[events][shortcuts].name === pluginsToRemove[j].toLowerCase()) {
                                            this._pluginCache[events].splice(shortcuts, 1);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        this.getPlugins = function () {

            var result = [];

            $.each(this._plugins, function () {
                result.push({
                    name: this.name,
                    ver: this.version || 'unknown'
                });
            });

            return result;
        };

        /* media element update listener */
        this._modelUpdateListener = function (evtName, value) {

            if (this.playerModel.init) {
                this._promote(evtName, value);
            }
        };

        this._promote = function (evt, value) {
            var ref = this;
            this._enqueue(function () {
                try {
                    ref.__promote(evt, value);
                } catch (e) {}
            });
        };

        /* promote an event to all registered plugins */
        this.__promote = function (evt, value) {

            var ref = this,
                event = evt,
                pluginEventHandlersCache = this._pluginCache,
                playerListeners = this.listeners || [],
                pluginsWithHandlers;

            if (typeof event === 'object') {

                if (!event._plugin) {
                    return;
                }
                event = 'plugin_' + event._plugin + $p.utils.ucfirst(event._event.toLowerCase());
            }

            if (event !== 'time' && event !== 'progress' && event !== 'mousemove') {
                $p.utils.log('Event: [' + event + ']', value, playerListeners);
            }

            // fire on plugins
            pluginsWithHandlers = pluginEventHandlersCache[event + 'Handler'] || [];
            pluginsWithHandlers.forEach(function (plugin) {
                try {
                    plugin[event + 'Handler'](value, ref);
                } catch (error) {
                    $p.utils.log(error);
                }
            });

            // universal plugin event handler
            pluginsWithHandlers = pluginEventHandlersCache['eventHandler'] || [];
            pluginsWithHandlers.forEach(function (plugin) {
                try {
                    plugin['eventHandler'](event, value, ref);
                } catch (error) {
                    $p.utils.log(error);
                }
            });

            // fire on custom player listeners
            playerListeners.forEach(function (listener) {
                if (listener.event === event || listener.event === '*') {
                    try {
                        listener.callback(value, ref);
                    } catch (error) {
                        $p.utils.log(error);
                    }
                }
            });

            // fire on self:
            if (ref.hasOwnProperty(event + 'Handler')) {
                try {
                    ref[evt + 'Handler'](value);
                } catch (error) {
                    $p.utils.log(error);
                }
            }
        };

        /* destroy, reset, break down to rebuild */
        this._detachplayerModel = function () {

            this._removeGUIListeners();
            try {
                this.playerModel.destroy();
                this._promote('detach', {});
            } catch (e) {
                // this.playerModel = new playerModel();
                // this.playerModel._init({pp:this, autoplay: false});
            }
        };


        /*******************************
         GUI LISTENERS
         *******************************/
        this._windowTouchListener = function (evt) {

            if (evt.touches) {

                if (evt.touches.length > 0) {
                    if (($(document.elementFromPoint(evt.touches[0].clientX, evt.touches[0].clientY))
                            .attr('id') || '').indexOf(this.getDC().attr('id')) > -1) {

                        if (this.env.mouseIsOver === false) {
                            this._promote('mouseenter', {});
                        }

                        this.env.mouseIsOver = true;

                        this._promote('mousemove', {});
                        evt.stopPropagation();
                    } else if (this.env.mouseIsOver) {
                        this._promote('mouseleave', {});
                        this.env.mouseIsOver = false;
                    }
                }
            }
        };

        this._playerFocusListener = function (evt) {

            var type = evt.type.toLowerCase();

            switch (type) {
                case 'mousedown':

                    if (this.env.mouseIsOver === false) {
                        break;
                    }

                    // make sure we do not mess with input-overlays here:
                    if ("|TEXTAREA|INPUT".indexOf('|' + evt.target.tagName.toUpperCase()) > -1) {
                        return;
                    }

                    // prevent context-menu
                    if (evt.which === 3) {

                        if ($(evt.target).hasClass('context')) {
                            break;
                        }
                        $(document).on('contextmenu', function (evt) {
                            $(document).off('contextmenu');
                            return false;
                        });
                    }
                    break;

                case 'mousemove':

                    if (this.env.mouseX !== evt.clientX && this.env.mouseY !== evt.clientY) {
                        this.env.mouseIsOver = true;
                    }

                    // prevent strange chrome issues with cursor changes:
                    if (this.env.clientX === evt.clientX && this.env.clientY === evt.clientY) {
                        return;
                    }

                    this.env.clientX = evt.clientX;
                    this.env.clientY = evt.clientY;
                    break;

                case 'focus':
                case 'mouseenter':
                    this.env.mouseIsOver = true;
                    break;

                case 'blur':
                case 'mouseleave':
                    this.env.mouseIsOver = false;
                    break;
            }

            this._promote(type, evt);
        };

        this._keyListener = function (evt) {
            if (!this.env.mouseIsOver) {
                return;
            }

            // make sure we do not mess with input-overlays here:
            if ("|TEXTAREA|INPUT".indexOf('|' + evt.target.tagName.toUpperCase()) > -1) {
                return;
            }

            var ref = this,
                set = (this.getConfig('keys').length > 0) ? this.getConfig('keys') : [{
                    13: function (player) {
                        player.setFullscreen(!player.getIsFullscreen());
                    }, // return;
                    32: function (player, evt) {
                        player.setPlayPause();
                        evt.preventDefault();
                    }, // space
                    39: function (player, evt) {
                        player.setPlayhead('+5');
                        evt.preventDefault();
                    }, // cursor right
                    37: function (player, evt) {
                        player.setPlayhead('-5');
                        evt.preventDefault();
                    }, // cursor left
                    38: function (player, evt) {
                        player.setVolume('+0.05');
                        evt.preventDefault();
                    }, // cursor up
                    40: function (player, evt) {
                        player.setVolume('-0.05');
                        evt.preventDefault();
                    }, // cursor down
                    68: function (player) {
                        player.setDebug();
                    }, // D
                    67: function (player) {
                        $p.utils.log('Config Dump', player.config);
                    }, // C
                    80: function (player) {
                        $p.utils.log('Schedule Dump', player.media);
                    }, // P
                    84: function (player) {
                        $p.utils.log('Cuepoints Dump', player.getCuePoints());
                    } // T
                }];

            this._promote('key', evt);

            $.each(set || [], function () {
                try {
                    this[evt.keyCode](ref, evt);
                } catch (e) {}

                try {
                    this['*'](ref);
                } catch (e) {}
            });
        };

        /*******************************
         DOM manipulations
         *******************************/

        /* make player fill actual viewport */
        this._expandView = function (win, target, targetParent) {

            var winBody = $(win[0].document).find('body'),
                overflow = winBody.css('overflow'),
                isSelf = (win[0] === window.self),
                targetWidthAttr = target.attr('width') || '',
                targetHeightAttr = target.attr('height') || '';

            // prepare target:
            target
                .data('fsdata', {
                    scrollTop: win.scrollTop() || 0,
                    scrollLeft: win.scrollLeft() || 0,
                    targetStyle: target.attr('style') || '',
                    targetWidth: target.width(),
                    targetHeight: target.height(),
                    bodyOverflow: (overflow === 'visible') ? 'auto' : overflow, // prevent IE7 crash
                    bodyOverflowX: winBody.css('overflow-x'), // prevent IE7 crash
                    bodyOverflowY: winBody.css('overflow-y'), // prevent IE7 crash
                    iframeWidth: targetWidthAttr.indexOf('%') > -1 ? targetWidthAttr : parseInt(targetWidthAttr) || 0,
                    iframeHeight: targetHeightAttr.indexOf('%') > -1 ? targetHeightAttr : parseInt(targetHeightAttr) || 0
                })
                .removeAttr('width')
                .removeAttr('height')
                .css({
                    position: isSelf && !targetParent ? 'absolute' : 'fixed', // to prevent Android native browser bad 'fixed' positioning when the player is in the iframe mode
                    display: 'block',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 9999999, // that still not guarantee that the target element will be on top. Theoretically we could move the target element to the body but this causing reload of the iframe so it's not an option.
                    margin: 0,
                    padding: 0
                });

            // prepare target parent
            // check if it's not in the iframe mode and if the targetParent is not <body>
            if (!isSelf && !!targetParent && targetParent[0].tagName !== 'BODY') {
                targetParent
                    .data('fsdata', {
                        overflow: targetParent.css('overflow'),
                        overflowX: targetParent.css('overflow-x'),
                        overflowY: targetParent.css('overflow-y'),
                        styles: targetParent.attr('style')
                    })
                    .attr('style', (!targetParent.attr('style') ? '' : targetParent.attr('style') + '; ') + 'overflow: visible!important;'); // that fixes IE issues with visibility of the element
            }

            // prepare parent window
            win.scrollTop(0).scrollLeft(0);

            winBody.css({
                overflow: 'hidden',
                overflowX: 'hidden',
                overflowY: 'hidden'
            });

            return true;
        };

        /* return player to the original size */
        this._collapseView = function (win, target, targetParent) {
            var isSelf = (win[0] === window.self),
                fsData = target ? target.data('fsdata') : null,
                fsTargetParentData = targetParent ? targetParent.data('fsdata') : null;

            // reset
            if (fsData !== null) {

                $(win[0].document.body)
                    .css({
                        overflow: fsData.bodyOverflow,
                        overflowX: fsData.bodyOverflowX,
                        overflowY: fsData.bodyOverflowY
                    });

                // rebuild iframe:
                if (fsData.iframeWidth > 0 && !isSelf) {
                    target
                        .attr('width', fsData.iframeWidth)
                        .attr('height', fsData.iframeHeight);
                } else {
                    target
                        .width(fsData.targetWidth)
                        .height(fsData.targetHeight);
                }

                target
                    .attr('style', (fsData.targetStyle == null) ? '' : fsData.targetStyle)
                    .data('fsdata', null);

                if (!isSelf && !!fsTargetParentData) {
                    targetParent
                        .attr('style', !fsTargetParentData.styles ? '' : fsTargetParentData.styles)
                        .data('fsdata', null);
                }

                // rebuild parent window state
                win.scrollTop(fsData.scrollTop)
                    .scrollLeft(fsData.scrollLeft);

                return true;
            }

            return false;
        };

        this._enterFullViewport = function () {

            var iframeCfg = this.getConfig('iframe'),
                win = iframeCfg ? this.getIframeParent() || $(window) : $(window),
                target = iframeCfg ? this.getIframe() || this.getDC() : this.getDC(),
                targetParent = target.parent() || null,
                winDocument = $(win[0].document);

            // set isFullViewport flag
            this._isFullViewport = true;

            // add class to eventually create more specific rules for site elements with high z-indexes
            winDocument.find('body').addClass(this.getNS() + 'fullviewport');

            // prevent Android 4.x Browser from scrolling
            $(document).on('touchmove.fullviewport', function (e) {
                e.preventDefault();
            });

            this._expandView(win, target, targetParent);

            return true;
        };

        /* exit player from full viewport mode - "full (parent) window viewport" to be specific */
        this._exitFullViewport = function () {

            var iframeCfg = this.getConfig('iframe'),
                win = iframeCfg ? this.getIframeParent() || $(window) : $(window),
                target = iframeCfg ? this.getIframe() || this.getDC() : this.getDC(),
                targetParent = target.parent() || null,
                winDocument = $(win[0].document);

            this._isFullViewport = false;

            winDocument.find('body').removeClass(this.getNS() + 'fullviewport');

            $(document).off('.fullviewport');

            this._collapseView(win, target, targetParent);

            return true;
        };

        /*******************************
         plugin API wrapper
         *******************************/
        this.pluginAPI = function () {

            var args = Array.prototype.slice.call(arguments) || null,
                dest = args.shift(),
                func = args.shift();

            if (dest != null && func != null) {

                for (var j = 0; j < this._plugins.length; j++) {

                    if (this._plugins[j].name === dest) {
                        this._plugins[j][func](args[0]);
                        return;
                    }
                }
            }
        };

        /*******************************
         public (API) methods GETTERS
         *******************************/
        this.getVersion = function () {
            return this.config._version;
        };

        this.getIsLastItem = function () {
            return this.getNextItem() !== false;
        };

        this.getIsFirstItem = function () {
            return this.getPreviousItem() !== false;
        };

        this.getConfig = function () {

            var idx = this.getItemIdx(),
                name = null,
                result = false;

            if (typeof arguments[0] === 'string') {
                name = arguments[0];
                result = (this.config['_' + name] != null) ? this.config['_' + name] : this.config[name];
            } else if (typeof arguments[0] === 'number') {
                idx = arguments[0];
            }

            if (name == null) {
                return this.media[idx]['config'];
            }

            // get value from item-specific config (beats them all)
            if (this.config['_' + name] == undefined) {

                try {
                    if (this.media[idx]['config'][name] !== undefined) {
                        result = this.media[idx]['config'][name];
                    }
                } catch (e) {}
            }

            if (name.indexOf('plugin_') > -1) {

                try {
                    if (this.media[idx]['config'][name]) {
                        result = $.extend(true, {}, this.config[name], this.media[idx]['config'][name]);
                    }
                } catch (e) {}
            }


            if (result == null) {
                return null;
            }

            if (typeof result === 'object' && result.length === null) {
                result = $.extend(true, {}, result || {});
            } else if (typeof result === 'object') {
                result = $.extend(true, [], result || []);
            }

            if (typeof result === 'string') {

                switch (result) {
                    case 'true':
                        result = true;
                        break;

                    case 'false':
                        result = false;
                        break;

                    case 'NaN':
                    case 'undefined':
                    case 'null':
                        result = null;
                        break;
                }
            }

            return result;
        };

        this.getDC = function () {
            return this.env.playerDom;
        };

        this.getState = function (compare) {

            var result = 'IDLE';

            try {
                result = this.playerModel.getState();
            } catch (e) {}

            if (compare) {
                return (result === compare.toUpperCase());
            }

            return result;
        };

        this.getLoadProgress = function () {

            try {
                return this.playerModel.getLoadProgress();
            } catch (e) {
                return 0;
            }
        };

        this._testItem = function (item) {

            for (var r = 0; r < this.itemRules.length; r++) {
                if (!this.itemRules[r](item)) {
                    return false;
                }
            }
            return true;
        };

        this.getItemAtIdx = function (atidx) {

            var ref = this,
                idx = atidx || 0,
                result = false;

            $.each(this.media.slice(idx), function () {

                if (!ref._testItem(this)) {
                    return true;
                }
                result = this;
                return false;
            });

            return result;
        };

        this.getNextItem = function () {

            var ref = this,
                idx = this.getItemIdx(),
                result = false;

            $.each(this.media.slice(idx + 1), function () {

                if (!ref._testItem(this)) {
                    return true;
                }
                result = this;
                return false;
            });

            if (this.getConfig('loop') && result === false) {

                $.each(this.media.slice(), function () {

                    if (!ref._testItem(this)) {
                        return true;
                    }
                    result = this;
                    return false;
                });
            }

            return result;
        };

        this.getPreviousItem = function () {

            var ref = this,
                idx = this.getItemIdx(),
                result = false;

            $.each(this.media.slice(0, idx).reverse(), function () {

                if (!ref._testItem(this)) {
                    return true;
                }
                result = this;
                return false;
            });

            if (this.getConfig('loop') && result === false) {

                $.each(this.media.slice().reverse(), function () {
                    if (!ref._testItem(this)) {
                        return true;
                    }
                    result = this;
                    return false;
                });
            }
            return result;
        };

        this.getItemCount = function () {
            // ignore NA dummy
            return (this.media.length === 1 && this.media[0].model === 'NA') ? 0 : this.media.length;
        };

        this.getItemId = function (idx) {

            try {
                return this.playerModel.getId();
            } catch (e) {
                return this.getItemAtIdx(idx).id;
            }
        };

        this.getItemIdx = function (itm) {

            var item = itm || {
                    id: false
                },
                id = item.id || this.getItemId();

            return this.media.indexOf(this.media.find(function (item) {
                return item.id === id;
            }));
        };

        this.getCurrentItem = function () {

            var ref = this;
            return $.grep(this.media, function (e) {
                return ref.getItemId() === e.id;
            })[0] || false;
        };

        this.getPlaylist = function () {

            return this.getItem('*');
        };

        this.getItem = function (idx) {

            // ignore NA dummy
            if (this.media.length === 1 && this.media[0].model === 'NA') {
                return false;
            }

            // some shortcuts
            switch (arguments[0] || 'current') {
                case 'next':
                    return this.getNextItem();

                case 'prev':
                    return this.getPreviousItem();

                case 'current':
                    return this.getCurrentItem();

                case '*':
                    return this.media;

                default:
                    return this.getItemAtIdx(idx);
            }
        };

        this.getVolume = function () {
            var volume = ('getIsReady' in this.playerModel && this.playerModel.getIsReady()) ? this.playerModel.getVolume() : this.env.volume,
                fixedVolume = this.getConfig('fixedVolume'),
                isMuted = this.getMuted();

            if (fixedVolume === true) {
                volume = this.getConfig('volume');
            }

            if(isMuted){
                volume = 0;
            }

            return volume;
        };

        this.getMuted = function () {
            return this.env.muted;
        };

        this.getTrackId = function () {

            if (this.getConfig('trackId')) {
                return this.config.trackId;
            }

            if (this._playlistServer != null) {
                return "pl" + this._currentItem;
            }

            return null;
        };

        this.getLoadPlaybackProgress = function () {

            try {
                return this.playerModel.getLoadPlaybackProgress();
            } catch (e) {
                return 0;
            }
        };

        this.getSource = function () {

            try {
                return this.playerModel.getSource()[0].src;
            } catch (e) {
                return false;
            }
        };

        this.getDuration = function () {

            try {
                return this.playerModel.getDuration();
            } catch (e) {
                return 0;
            }
        };

        this.getIsLiveOrDvr = function () {
            try {
                return this._isLive || this.playerModel._isDVR || this.playerModel._isLive;
            } catch (e) {
                return false;
            }
        };

        this.getPosition = function () {

            try {
                return this.playerModel.getPosition() || 0;
            } catch (e) {
                return 0;
            }
        };

        this.getMaxPosition = function () {

            try {
                return this.playerModel.getMaxPosition() || 0;
            } catch (e) {
                return 0;
            }
        };

        this.getFrame = function () {

            try {
                return this.playerModel.getFrame();
            } catch (e) {
                return 0;
            }
        };

        this.getTimeLeft = function () {

            try {
                return this.playerModel.getDuration() - this.playerModel.getPosition();
            } catch (e) {
                return this.getItem().duration;
            }
        };
        /**
         * Basing on fullscreen prioritized array config, currently used platform and device abilities
         * it detects fullscreen type/mode to use.
         *
         * @returns string - full | mediaonly | viewport | none
         */
        this.getFullscreenType = function () {
            var config = this.getConfig('fullscreen') || [],
                usedPlatform = this.getPlatform(),
                fullscreenTypesAvailableForUsedPlatform = this.config._platformsFullscreenConfig[usedPlatform] || [],
                availableFullscreenApiType = $p.fullscreenApi.type,
                fullscreenTypeAvailableForApi = [],
                available = [],
                result = 'none',
                i;

            switch (availableFullscreenApiType) {
                case 'full':
                    fullscreenTypeAvailableForApi = ['full', 'mediaonly'];
                    break;

                case 'mediaonly':
                    fullscreenTypeAvailableForApi = ['mediaonly'];
                    break;

                case 'none':
                    break;
            }

            // if device has support for inlinevideo then there is full viewport mode available
            if ($p.features.inlinevideo) {
                fullscreenTypeAvailableForApi.push('viewport');
            }

            available = $p.utils.intersect($p.utils.intersect(config, fullscreenTypesAvailableForUsedPlatform), fullscreenTypeAvailableForApi);

            // select one from the available fullscreen types with highest configured priority
            for (i = 0; i < config.length; i++) {
                if (available.indexOf(config[i]) > -1) {
                    result = config[i];
                    break;
                }
            }

            return result;
        };

        this.getFullscreenEnabled = function () {
            var fsType = this.getFullscreenType(),
                apiType = $p.fullscreenApi.type,
                result = false;

            switch (fsType) {
                case 'full':
                    result = this._getFullscreenEnabledApi();
                    break;

                case 'mediaonly':
                    /**
                     * there could be 4 cases in this situation:
                     * a) there is only 'mediaonly' fullscreen API available
                     * b) there is 'full' fullscreen API available, but the user prefer 'mediaonly' in config
                     * c) player is in the same-origin <iframe> and has 'mediaonly' fullscreen API available, 
                     *    but there is no <iframe> `allowfullscreen` attribute so we respect that.
                     * d) player is in the crossdomain <iframe> (so we can't check the attributes of the <iframe> element)
                     *    and has 'mediaonly' fullscreen API available, so we try to use it
                     */
                    if (this.getConfig('iframe') && !this.config._isCrossDomain) {
                        result = (this.getIframeAllowFullscreen() && this._getFullscreenEnabledApi(apiType));
                    } else {
                        result = this._getFullscreenEnabledApi(apiType);
                    }
                    break;

                case 'viewport':
                    /**
                     * In this case we just need to check if the player is inside the <iframe>
                     * and if the <iframe> attributes allowing fullscreen. We respect this even if it's
                     * possible to set fullviewport when the <iframe> is from the same domain.
                     * If the player isn't inside the <iframe> then we assume that it's possible to
                     * put the player into fullviewport mode when requested.
                     */
                    if (this.getConfig('iframe') && !this.config._isCrossDomain) {
                        result = this.getIframeAllowFullscreen();
                    } else {
                        result = true;
                    }
                    break;

                    /**
                     * The fullscreen functionality is disabled in configuration
                     */
                case 'none':
                    result = false;
                    break;
            }

            return result;
        };

        this._getFullscreenEnabledApi = function (apiType) {
            var apiType = apiType || $p.fullscreenApi.type,
                fsFullscreenEnabledPropName = $p.fullscreenApi[apiType]['fullscreenEnabled'] || false,
                fsSupportsFullscreenPropName = $p.fullscreenApi[apiType]['supportsFullscreen'] || false,
                result = false;

            switch (apiType) {
                case 'full':
                    // we need to check if the document fullscreenEnabled value is true or false
                    // cause even if the fullscreen API feature is available it could be blocked
                    // through browser configuration and/or <iframe> lack of allowfullscreen attribute
                    result = document[fsFullscreenEnabledPropName];
                    break;

                case 'mediaonly':
                    /**
                     * if the detected fullscreen API is 'mediaonly' then we need to check the status
                     * of current player model media element supportsFullscreen value. This value is
                     * reliable only after HTML <video> metadataloaded event was fired. If there is
                     * no player model media element available at the function execution time we return
                     * false.
                     */
                    if (!!this.playerModel.mediaElement) {
                        result = this.playerModel.mediaElement[0][fsSupportsFullscreenPropName];
                    }
                    break;
            }

            return result;
        };

        this.getIsFullscreen = function () {
            var fsType = this.getFullscreenType(),
                apiType = $p.fullscreenApi.type,
                result = false;

            switch (fsType) {
                case 'full':
                    result = this._getIsFullscreenApi();
                    break;

                case 'mediaonly':
                    /**
                     * there could be 2 cases in this situation:
                     * a) there is only 'mediaonly' fullscreen API available
                     * b) there is 'full' fullscreen API available, but the user prefer 'mediaonly' in config
                     */
                    result = this._getIsFullscreenApi(apiType);
                    break;

                case 'viewport':
                    result = this._isFullViewport;
                    break;

                    /**
                     * The fullscreen functionality is disabled in configuration
                     */
                case 'none':
                    result = false;
                    break;
            }

            return result;
        };

        this._getIsFullscreenApi = function (apiType) {
            var apiType = apiType || $p.fullscreenApi.type,
                fsElementPropName = $p.fullscreenApi[apiType]['fullscreenElement'] || false,
                fsIsFullscreenPropName = $p.fullscreenApi[apiType]['isFullscreen'] || false,
                fsDisplayingFullscreenPropName = $p.fullscreenApi[apiType]['isFullscreen'] || false,
                result = false;

            switch (apiType) {
                case 'full':
                    // NOTE: IE11 and IEMobile on Windows Phone 8.1 don't have isFullscreen property implemented,
                    // but we can use fullscreenElement property instead
                    result = document[fsIsFullscreenPropName] || !!document[fsElementPropName];
                    break;

                case 'mediaonly':
                    if (!!this.playerModel.mediaElement && fsDisplayingFullscreenPropName) {
                        result = this.playerModel.mediaElement[0][fsDisplayingFullscreenPropName];
                    } else {
                        result = this.getDC().hasClass('fullscreen');
                    }
                    break;
            }

            return result;
        };

        this.getMediaContainer = function () {

            // return "buffered" media container
            if (!this.env.mediaContainer) {
                this.env.mediaContainer = $('#' + this.getMediaId());
            }

            // if mediacontainer does not exist ...
            if (this.env.mediaContainer.length === 0 || !$.contains(document.body, this.env.mediaContainer[0])) {

                // and there is a "display", injects media container
                if (this.env.playerDom.find('.' + this.getNS() + 'display').length > 0) {
                    this.env.mediaContainer = $(document.createElement('div'))
                        .attr({
                            'id': this.getId() + "_media"
                        }) // IMPORTANT IDENTIFIER
                        .css({
                            // position: 'absolute',
                            overflow: 'hidden',
                            height: '100%',
                            width: '100%',
                            top: 0,
                            left: 0,
                            padding: 0,
                            margin: 0,
                            display: 'block'
                        })
                        .appendTo(this.env.playerDom.find('.' + this.getNS() + 'display'));
                }
                // else create a 1x1 pixel dummy somewhere
                else {
                    this.env.mediaContainer = $(document.createElement('div'))
                        .attr({
                            id: this.getMediaId()
                        })
                        .css({
                            width: '1px',
                            height: '1px'
                        })
                        .appendTo($(document.body));
                }
            }

            // go for it
            return this.env.mediaContainer;
        };

        this.getMediaId = function () {

            return this.getId() + "_media";
        };

        this.getMediaType = function () {

            // might be called before a model has been initialized
            if ('getSrc' in this.playerModel) {
                return this._getTypeFromFileExtension(this.playerModel.getSrc());
            } else {
                return 'none/none';
            }
        };

        this.getModel = function () {

            try {
                return this.getItem().model;
            } catch (e) {
                return "NA";
            }
        };

        this.getIframeParent = function () {

            try {
                var result = parent.location.host || false;
                return (result === false) ? false : $(parent.window);
            } catch (e) {
                return false;
            }
        };

        this.getIframe = function () {

            try {
                var result = [];

                if (this.config._iframe) {
                    result = window.$(frameElement) || [];
                }
                return (result.length === 0) ? false : result;
            } catch (e) {
                return false;
            }
        };

        this.getIframeAllowFullscreen = function () {

            var result = false;

            try {
                result = window.frameElement.attributes.allowFullscreen || window.frameElement.attributes.mozallowFullscreen || window.frameElement.attributes.webkitallowFullscreen || false;
            } catch (e) {
                result = false;
            }

            return result;
        };

        this.getPlaybackQuality = function () {

            var result = 'auto';

            try {
                result = this.playerModel.getPlaybackQuality();
            } catch (e) {}

            if (result === 'auto') {
                result = this.getConfig('playbackQuality');
            }

            if (result === 'auto' || $.inArray(result, this.getPlaybackQualities()) === -1) {
                result = this.getAppropriateQuality();
            }

            if ($.inArray(result, this.getPlaybackQualities()) === -1) {
                result = 'auto';
            }

            return result;
        };

        this.getPlaybackQualities = function () {

            try {
                return $.extend(true, [], this.getItem().qualities || []);
            } catch (e) {}

            return [];
        };

        this.getCanPlay = function (mimeType, platforms) {
            var ref = this,
                pt = (platforms === undefined) ? Array.from(this.getSupportedPlatforms().keys()) : platforms;

            return pt.some(function (pt) {
                return ref._canPlay(mimeType, pt);
            });
        };

        this.getCanPlayOnPlatforms = function (mimeType) {
            return this._canPlayOnPlatforms(mimeType);
        };

        this.getIsDrmSystemSupported = function (drmSystem) {
            return ($p.drm.supportedDrmSystems.indexOf(drmSystem) > -1);
        };

        this.getPlatform = function (item) {

            var item = item || this.getItem();

            return item.platform || 'browser';
        };

        this.getId = function () {

            return this._id;
        };

        this.getHasGUI = function () {

            try {
                return this.playerModel.getHasGUI();
            } catch (e) {
                return false;
            }
        };

        this.getCssPrefix = this.getNS = function () {

            return this.config._cssClassPrefix || this.config._ns || 'pp';
        };

        this.getPlayerDimensions = function () {

            return {
                width: this.getDC()
                    .width(),
                height: this.getDC()
                    .height()
            };
        };

        this.getMediaDimensions = function () {

            return this.playerModel.getMediaDimensions() || {
                width: 0,
                height: 0
            };
        };

        this.getAppropriateQuality = function (qualities) {

            var quals = qualities || this.getPlaybackQualities() || [];

            if (quals.length === 0) {
                return [];
            }

            var wid = this.env.playerDom.width(),
                hei = this.env.playerDom.height(),
                ratio = $p.utils.roundNumber(wid / hei, 2),
                temp = {};

            // find best available quality-config-set by "minHeight"
            $.each(this.getConfig('playbackQualities') || [], function () {

                // not available
                if ($.inArray(this.key, quals) < 0) {
                    return true;
                }

                // check player-dim against minHeight
                if ((this.minHeight || 0) > hei && temp.minHeight <= hei) {
                    return true;
                }

                // new set in case of higher resolution
                if ((temp.minHeight || 0) > this.minHeight) {
                    return true;
                }

                // check against minWidth - simple case:
                if (typeof this.minWidth === 'number') {
                    if (this.minWidth === 0 && this.minHeight > hei) {
                        return true;
                    }

                    if (this.minWidth > wid) {
                        return true;
                    }

                    temp = this;
                }
                // check against minWidth - aspect ratio
                else if (typeof this.minWidth === 'object') {
                    var ref = this;

                    $.each(this.minWidth, function () {
                        if ((this.ratio || 100) > ratio) {
                            return true;
                        }
                        if (this.minWidth > wid) {
                            return true;
                        }
                        temp = ref;

                        return true;
                    });
                }

                return true;
            });

            return ($.inArray('auto', this.getPlaybackQualities()) > -1) ? 'auto' : temp.key || 'auto';
        };

        /* asynchronously loads external XML and JSON data from server */
        this.getFromUrl = function (url, dest, callback, dataType, auxConfig) {

            var data = null;

            if (callback.substr(0, 1) !== '_') {
                window[callback] = function (data) {

                    try {
                        delete window[callback];
                    } catch (e) {}
                    dest[callback](data);
                };
            }

            if (dataType) {
                dataType = (dataType.indexOf('/') > -1) ? dataType.split('/')[1] : dataType;
            }

            var ajaxConf = {
                url: url,
                complete: function (xhr, status) {

                    if (dataType == undefined) {

                        try {

                            if (xhr.getResponseHeader("Content-Type").indexOf('xml') > -1) {
                                dataType = 'xml';
                            }

                            if (xhr.getResponseHeader("Content-Type").indexOf('json') > -1) {
                                dataType = 'json';
                            }

                            if (xhr.getResponseHeader("Content-Type").indexOf('html') > -1) {
                                dataType = 'html';
                            }
                        } catch (e) {}
                    }
                    data = $p.utils.cleanResponse(xhr.responseText, dataType);

                    if (status !== 'error') {

                        try {
                            dest[callback](data, xhr.responseText, auxConfig);
                        } catch (e) {}
                    }
                },
                error: function (data) {

                    // bypass jq 1.6.1 issues
                    if (dest[callback]) {
                        dest[callback](false);
                    }
                },
                cache: true,
                dataType: dataType
            };
            ajaxConf.xhrFields = {
                withCredentials: false
            };
            ajaxConf.beforeSend = function (xhr) {
                xhr.withCredentials = false;
            };
            $.support.cors = true;
            $.ajax(ajaxConf);

            return this;
        };

        /*******************************
         public (API) methods SETTERS
         *******************************/
        this.setActiveItem = function (mixedData, autoplay) {

            var lastItem = this.getItem(),
                newItem = null,
                ap = this.config._autoplay,
                M;

            if (typeof mixedData === 'string') {

                // prev/next shortcuts
                switch (mixedData) {
                    case 'previous':
                        newItem = this.getPreviousItem();
                        break;

                    case 'next':
                        newItem = this.getNextItem();
                        break;
                }
            } else if (typeof mixedData === 'number') {

                // index number given
                newItem = this.getItemAtIdx(mixedData);
                // wrong argument
            } else {
                return this;
            }

            if (newItem === false) {
                // end of playlist reached
                if (!this.getNextItem()) {
                    this._promote('done');
                }
                // nothing to do
                return this;
            }

            //

            // item change requested
            if (newItem.id !== lastItem.id) {

                // but and denied by config or state
                if (this.getConfig('disallowSkip') === true && ('COMPLETED|IDLE|ERROR'.indexOf(this.getState()) === -1)) {
                    return this;
                }
            }

            // do we have an continuous play situation?
            if (!this.getState('IDLE')) {
                if(newItem.config.hasOwnProperty('continuous')){
                    ap = newItem.config.continuous;
                }
                else {
                    ap = this.config._continuous;
                }
            }

            this._detachplayerModel();

            // reset player class
            var wasFullscreen = this.getIsFullscreen();
            this.getDC().attr('class', this.env.className);

            if (wasFullscreen) {
                this.getDC().addClass('fullscreen');
            }

            // create player instance
            var newModel = newItem.model;

            // model does not exist or is faulty:
            if (!$p.models.has(newModel)) {
                newModel = 'NA';
                newItem.model = newModel;
                newItem.errorCode = 8;
            }

            // start model
            this.playerModel = new playerModel();
            M = $p.models.get(newModel);
            $.extend(this.playerModel, new M());

            this.__promote('synchronizing', 'display');

            this.initPlayerModel({
                media: $.extend(true, {}, newItem),
                model: newModel,
                pp: this,
                environment: $.extend(true, {}, this.env),
                autoplay: (typeof autoplay === 'boolean') ? autoplay : ap,
                quality: this.getPlaybackQuality(),
                fullscreen: wasFullscreen
                // persistent: (ap || this.config._continuous) && (newModel==nextUp)
            });

            this.syncCuePoints();

            return this;
        };

        this.initPlayerModel = function (cfg) {

            this.playerModel._init(cfg);

            // apply item specific class(es) to player
            if (this.getConfig('className', null) != null) {
                this.getDC().addClass(this.getNS() + this.getConfig('className'));
            }
            this.getDC().addClass(this.getNS() + (this.getConfig('streamType') || 'http'));

            if (this.getConfig('streamType').indexOf('dvr') > -1 || this.getConfig('streamType').indexOf('live') > -1) {
                this.getDC().addClass(this.getNS() + 'live');
                this._isLive = true;
            }

            if (!$p.features.csstransitions) {
                this.getDC().addClass('notransitions');
            }

            if ($p.userAgent.isMobile) {
                this.getDC().addClass(this.getNS() + 'mobile');
            }

            if (!$p.features.volumecontrol){
                this.getDC().addClass(this.getNS() + 'novolumecontrol');
            }
        };

        /* queue ready */
        this.setPlay = function () {

            var ref = this;

            if (this.getConfig('thereCanBeOnlyOne')) {
                projekktor('*').each(function () {
                    if (this.getId() !== ref.getId()) {
                        this.setStop();
                    }
                });
            }
            this._enqueue('play', false);

            return this;
        };

        /* queue ready */
        this.setPause = function () {

            this._enqueue('pause', false);

            return this;
        };

        /* queue ready */
        this.setStop = function (toZero) {

            var ref = this;

            if (this.getState('IDLE')) {
                return this;
            }

            if (toZero) {
                this._enqueue(function () {
                    ref.setActiveItem(0);
                });
            } else {
                this._enqueue('stop', false);
            }

            return this;
        };

        /* queue ready */
        this.setPlayPause = function () {

            if (!this.getState('PLAYING')) {
                this.setPlay();
            } else {
                this.setPause();
            }

            return this;
        };

        /* queue ready */
        this.setVolume = function (vol, fadeDelay) {

            var initialVolume = this.getVolume();

            if (this.getConfig('fixedVolume') === true) {
                return this;
            }

            switch (typeof vol) {
                case 'string':
                    var dir = vol.substr(0, 1);
                    vol = parseFloat(vol.substr(1));
                    switch (dir) {
                        case '+':
                            vol = this.getVolume() + vol;
                            break;

                        case '-':
                            vol = this.getVolume() - vol;
                            break;

                        default:
                            vol = this.getVolume();
                    }
                    break;

                case 'number':
                    vol = parseFloat(vol);
                    vol = (vol > 1) ? 1 : vol;
                    vol = (vol < 0) ? 0 : vol;
                    break;

                default:
                    return this;
            }

            if (vol > initialVolume && fadeDelay) {

                if (vol - initialVolume > 0.03) {

                    for (var i = initialVolume; i <= vol; i = i + 0.03) {
                        this._enqueue('volume', i, fadeDelay);
                    }
                    this._enqueue('volume', vol, fadeDelay);
                    return this;
                }
            } else if (vol < initialVolume && fadeDelay) {

                if (initialVolume - vol > 0.03) {

                    for (var i = initialVolume; i >= vol; i = i - 0.03) {
                        this._enqueue('volume', i, fadeDelay);
                    }
                    this._enqueue('volume', vol, fadeDelay);
                    return this;
                }
            }
            this._enqueue('volume', vol);

            return this;
        };

        this.setMuted = function (value) {
            var value = value === undefined ? !this.env.muted : value,
                volume = this.getVolume(),
                isVolumeControllable = $p.features.volumecontrol;

            if(isVolumeControllable){
                if (value && volume > 0) {
                    this.env.lastVolume = volume;
                    this.setVolume(0);
                } else {
                    this.setVolume(typeof this.env.lastVolume === 'number' ? this.env.lastVolume : volume);
                    this.env.lastVolume = null;
                }
            }
            else {
                if(value){
                    this.setVolume(0);
                }
                else {
                    this.setVolume(1);
                }
            }

            return this;
        };

        /* queue ready */
        this.setPlayhead = this.setSeek = function (position) {

            if (this.getConfig('disallowSkip') === true) {
                return this;
            }

            if (typeof position === 'string') {

                var dir = position.substr(0, 1);

                position = parseFloat(position.substr(1));

                if (dir === '+') {
                    position = this.getPosition() + position;
                } else if (dir === '-') {
                    position = this.getPosition() - position;
                } else {
                    position = this.getPosition();
                }
            }

            if (typeof position === 'number') {
                this._enqueue('seek', Math.round(position * 100) / 100);
            }

            return this;
        };

        /* queue ready */
        this.setFrame = function (frame) {

            if (this.getConfig('fps') == null) {
                return this;
            }

            if (this.getConfig('disallowSkip') === true) {
                return this;
            }

            if (typeof frame === 'string') {
                var dir = frame.substr(0, 1);
                frame = parseFloat(frame.substr(1));

                if (dir === '+') {
                    frame = this.getFrame() + frame;
                } else if (dir === '-') {
                    frame = this.getFrame() - frame;
                } else {
                    frame = this.getFrame();
                }
            }

            if (typeof frame === 'number') {
                this._enqueue('frame', frame);
            }

            return this;
        };

        /* queue ready */
        this.setPlayerPoster = function (url) {

            var ref = this;

            this._enqueue(function () {
                ref.setConfig({
                        poster: url
                    },
                    0);
            });
            this._enqueue(function () {
                ref.playerModel.setPosterLive();
            });

            return this;
        };

        this.setConfig = function () {

            var ref = this,
                args = arguments;

            this._enqueue(function () {
                ref._setConfig(args[0] || null, args[1]);
            });

            return this;
        };

        this._setConfig = function () {
            if (!arguments.length) {
                return;
            }

            var confObj = arguments[0],
                dest = '*',
                value = false;

            if (typeof confObj !== 'object') {
                return this;
            }

            if (typeof arguments[1] === 'string' || typeof arguments[1] === 'number') {
                dest = arguments[1];
            } else {
                dest = this.getItemIdx();
            }

            for (var i in confObj) {

                // is constant:
                if (this.config['_' + i] != null) {
                    continue;
                }

                try {
                    value = eval(confObj[i]);
                } catch (e) {
                    value = confObj[i];
                }

                if (dest === '*') {

                    $.each(this.media, function () {
                        if (this.config == null) {
                            this.config = {};
                        }
                        this.config[i] = value;
                    });
                    continue;
                }

                if (this.media[dest] == undefined) {
                    return this;
                }

                if (this.media[dest]['config'] == null) {
                    this.media[dest]['config'] = {};
                }

                this.media[dest]['config'][i] = value;
            }

            return this;
        };

        this.setFullscreen = function (goFullscreen) {
            var goFullscreen = goFullscreen === void(0) ? !this.getIsFullscreen() : goFullscreen; // toggle or use argument value

            // inform player model about going fullscreen
            this.playerModel.applyCommand('fullscreen', goFullscreen);

            return this;
        };

        this._requestFullscreen = function () {
            var fsType = this.getFullscreenType(),
                apiType = $p.fullscreenApi.type,
                result = false;

            switch (fsType) {
                case 'full':
                    result = this._requestFullscreenApi(apiType, fsType);
                    break;

                case 'mediaonly':
                    /**
                     * there could be 2 cases in this situation:
                     * a) there is only 'mediaonly' fullscreen API available
                     * b) there is 'full' fullscreen API available, but the user prefer 'mediaonly' in config
                     */
                    result = this._requestFullscreenApi(apiType, fsType);
                    break;

                case 'viewport':
                    result = this._enterFullViewport();
                    break;

                    /**
                     * The fullscreen functionality is disabled in configuration
                     */
                case 'none':
                    result = false;
                    break;
            }

            return result;
        };

        this._requestFullscreenApi = function (apiType, fsType) {
            var apiType = apiType || $p.fullscreenApi.type,
                fsElement,
                fsRequestFunctionName = $p.fullscreenApi[apiType]['requestFullscreen'] ? $p.fullscreenApi[apiType]['requestFullscreen'] : false,
                fsEnterFunctionName = $p.fullscreenApi[apiType]['enterFullscreen'] ? $p.fullscreenApi[apiType]['enterFullscreen'] : false,
                fsChangeEventName = $p.fullscreenApi[apiType]['fullscreenchange'] ? $p.fullscreenApi[apiType]['fullscreenchange'].substr(2) : false,
                fsErrorEventName = $p.fullscreenApi[apiType]['fullscreenerror'] ? $p.fullscreenApi[apiType]['fullscreenerror'].substr(2) : false,
                fsEventsNS = '.' + this.getNS() + 'fullscreen',
                result = false,
                ref = this;

            switch (apiType) {
                case 'full':
                    if (fsType === 'full') {
                        fsElement = this.getDC();
                    } else if (fsType === 'mediaonly') {
                        if (!!this.playerModel.mediaElement) {
                            fsElement = this.playerModel.mediaElement;

                            // add native controls
                            fsElement.attr('controls', true);
                            result = true;
                        } else {
                            return false;
                        }
                    }

                    // remove all previous event listeners
                    $(document).off(fsEventsNS);

                    // add event listeners
                    if (fsChangeEventName) {

                        $(document).on(fsChangeEventName + fsEventsNS, function (event) {

                            if (!ref.getIsFullscreen()) {

                                if (fsType === 'mediaonly') {

                                    // remove native controls
                                    fsElement.attr('controls', false);
                                }
                                ref.setFullscreen(false);

                                // remove fullscreen event listeners
                                $(document).off(fsEventsNS);
                            }
                        });
                    } else {
                        $p.utils.log('No fullscreenchange event defined.');
                    }

                    if (fsErrorEventName) {

                        $(document).on(fsErrorEventName + fsEventsNS, function (event) {

                            $p.utils.log('fullscreenerror', event);
                            ref.setFullscreen(false);

                            // remove fullscreen event listeners
                            $(document).off(fsEventsNS);
                        });
                    } else {
                        $p.utils.log('No fullscreenerror event defined.');
                    }

                    // request fullscreen
                    fsElement[0][fsRequestFunctionName]();
                    result = true;
                    break;

                case 'mediaonly':
                    if (!!this.playerModel.mediaElement) {

                        fsElement = this.playerModel.mediaElement;
                        fsElement[0][fsEnterFunctionName]();
                        result = true;
                    } else {
                        result = false;
                    }
                    break;
            }

            return result;
        };

        this._exitFullscreen = function () {

            var fsType = this.getFullscreenType(),
                apiType = $p.fullscreenApi.type,
                result = false;

            switch (fsType) {
                case 'full':
                    result = this._exitFullscreenApi();
                    break;

                case 'mediaonly':
                    /**
                     * there could be 2 cases in this situation:
                     * a) there is only 'mediaonly' fullscreen API available
                     * b) there is 'full' fullscreen API available, but the user prefer 'mediaonly' in config
                     */
                    result = this._exitFullscreenApi(apiType);
                    break;

                case 'viewport':
                    result = this._exitFullViewport();
                    break;

                    /**
                     * The fullscreen functionality is disabled in configuration
                     */
                case 'none':
                    result = false;
                    break;
            }

            return result;
        };

        this._exitFullscreenApi = function () {

            var apiType = apiType || $p.fullscreenApi.type,
                fsElement,
                fsExitFunctionName = $p.fullscreenApi[apiType]['exitFullscreen'] ? $p.fullscreenApi[apiType]['exitFullscreen'] : false,
                result = false;

            switch (apiType) {
                case 'full':
                    fsElement = document;
                    this.getIsFullscreen() ? fsElement[fsExitFunctionName]() : null;
                    result = true;
                    break;

                case 'mediaonly':
                    if (!!this.playerModel.mediaElement) {
                        fsElement = this.playerModel.mediaElement[0];
                        fsElement[fsExitFunctionName]();
                        result = true;
                    } else {
                        result = false;
                    }
                    break;
            }

            return result;
        };

        this.setSize = function (data) {

            var target = this.getIframe() || this.getDC(),
                fsdata = target.data('fsdata') || null,
                w = (data && data.width != null) ? data.width :
                (this.getConfig('width') != null) ? this.getConfig('width') : false,
                h = (data && data.height != null) ? data.height :
                (this.getConfig('height') == null && this.getConfig('ratio')) ? Math.round((w || this.getDC()
                    .width()) / this.getConfig('ratio')) :
                (this.getConfig('height') != null) ? this.getConfig('height') : false;

            if (this.getIsFullscreen() && fsdata != null) {
                // remember new dims while in FS
                fsdata.targetWidth = w;
                fsdata.targetHeight = h;
                target.data('fsdata', fsdata);
            } else {
                // apply new dims
                if (w) {
                    target.css({
                        width: w + "px"
                    });
                }
                if (h) {
                    target.css({
                        height: h + "px"
                    });
                }
            }

            try {
                this.playerModel.applyCommand('resize', {
                    width: w,
                    height: h
                });
            } catch (e) {}
        };

        this.setLoop = function (value) {

            this.config._loop = value || !this.config._loop;

            return this;
        };

        this.setDebug = function (value) {

            $p.utils.logging = (value !== undefined) ? value : !$p.utils.logging;

            if ($p.utils.logging) {
                $p.utils.log('DEBUG MODE #' + this.getId() + " Level: " + this.getConfig('debugLevel'));
            }

            return this;
        };

        this.addListener = function (evt, callback) {

            var ref = this;

            this._enqueue(function () {
                ref._addListener(evt, callback);
            });

            return this;
        };

        this._addListener = function (event, callback) {

            var evt = (event.indexOf('.') > -1) ? event.split('.') : [event, 'default'];

            this.listeners.push({
                event: evt[0],
                ns: evt[1],
                callback: callback
            });

            return this;
        };

        /**
         * removes an JS object from the event queue
         *
         * @param {String} name of event to remove
         * @param {Function} [callback]
         * @returns {PPlayer} reference to the current instance of projekktor
         */
        this.removeListener = function (event, callback) {

            var len = this.listeners.length,
                evt = (event.indexOf('.') > -1) ? event.split('.') : [event, '*'],
                toKill = [];

            // gather listeners to remove
            for (var i = 0; i < len; i++) {

                if (this.listeners[i] === undefined) {
                    continue;
                }

                if (this.listeners[i].event != evt[0] && evt[0] !== '*') {
                    continue;
                }

                if ((this.listeners[i].ns != evt[1] && evt[1] !== '*') || (this.listeners[i].callback !== callback && callback != null)) {
                    continue;
                }
                toKill.push(i);
            }

            // than remove them
            for (var i = 0, l = toKill.length; i < l; i++) {
                this.listeners.splice(toKill[i] - i, 1);
            }

            return this;
        };
        /**
         * @deprecated since 1.4.00
         *
         * Adds, removes, replaces item
         *
         * @param {type} item
         * @param {number} [index]
         * @param {boolean} [replace=false]
         * @returns {PPlayer}
         */
        this.setItem = function (item, index, replace) {
            // remove item
            if (item === null) {
                this.removeItemAtIndex(index);
            }
            // add item
            else {
                this.addItems(item, index, replace);
            }
            return this;
        };

        this.setFile = function () {

            var fileNameOrObject = arguments[0] || '',
                dataType = arguments[1] || this._getTypeFromFileExtension(fileNameOrObject),
                parser = arguments[2] || null,
                result = [{
                    file: {
                        src: fileNameOrObject,
                        type: dataType,
                        parser: parser
                    }
                }];

            this._clearqueue();
            this._detachplayerModel();

            // incoming JSON Object / native Projekktor playlist
            if (typeof fileNameOrObject === 'object') {
                $p.utils.log('Applying incoming JS Object', fileNameOrObject);
                this.setPlaylist(fileNameOrObject);
                return this;
            }

            if (result[0].file.type.indexOf('/xml') > -1 || result[0].file.type.indexOf('/json') > -1) {
                // async. loaded playlist
                $p.utils.log('Loading playlist data from ' + result[0].file.src + ' supposed to be ' + result[0].file.type);
                this._promote('scheduleLoading', 1 + this.getItemCount());
                this._playlistServer = result[0].file.src;
                this.getFromUrl(result[0].file.src, this, '_collectParsers', result[0].file.type, parser);
            } else {
                // incoming single file:
                $p.utils.log('Applying single resource:' + result[0].file.src, result);
                this.setPlaylist(result);
            }

            return this;
        };

        this._collectParsers = function () {

            this._syncPlugins('parserscollected', arguments);
            this._promote('scheduleLoaded', arguments);
        };

        this.addParser = function (parserId, parser) {
            if (typeof parserId === 'string' && typeof parser === 'function') {
                this._parsers[parserId.toUpperCase()] = parser;
            } else {
                $p.utils.log('Failed to set improperly defined parser.');
            }
        };

        this.getParser = function (parserId) {
            if (typeof parserId === 'string') {
                return this._parsers[parserId.toUpperCase()];
            } else {
                return function (data) {
                    return (data);
                };
            }
        };

        this.setPlaylist = this.destroy = function (obj) {

            var data = obj || [{
                    file: {
                        src: '',
                        type: 'none/none'
                    }
                }],
                files = data.playlist || data;

            this.media = [];

            // gather and set alternate config from reel:
            try {

                for (var props in data.config) {

                    if (data.config.hasOwnProperty(props)) {

                        if (typeof data.config[props].indexOf('objectfunction') > -1) {
                            continue; // IE SUCKZ
                        }
                        this.config[props] = eval(data.config[props]);
                    }
                }

                if (data.config != null) {
                    $p.utils.log('Updated config var: ' + props + ' to ' + this.config[props]);
                    this._promote('configModified');
                    delete(data.config);
                }
            } catch (e) {}

            // add media items
            this.addItems(files, 0, true);

            this._syncPlugins('reelupdate');
        };

        this.setPlaybackQuality = function (quality) {

            var qual = quality || this.getAppropriateQuality();

            if ($.inArray(qual, this.getItem().qualities || []) > -1) {
                this.playerModel.applyCommand('quality', qual);
                this.setConfig({
                    playbackQuality: qual
                });
            }

            return this;
        };

        this.openUrl = function (cfg) {

            cfg = cfg || {
                url: '',
                target: '',
                pause: false
            };

            if (cfg.url === '') {
                return this;
            }

            if (cfg.pause === true) {
                this.setPause();
            }
            window.open(cfg.url, cfg.target).focus();

            return this;
        };

        /**
         * Removes THIS Projekktor and reconstructs original DOM
         *
         * ENQUEUED
         *
         * @public
         * @return {Object} this
         */
        this.selfDestruct = this.destroy = function () {

                var ref = this;

                this._enqueue(function () {
                    ref._destroy();
                });

                return this;
            },
            this._destroy = function () {

                var ref = this;

                $(this).off();
                this.removePlugins();
                this.playerModel.destroy();
                this._removeGUIListeners();

                $.each(projekktors, function (idx) {

                    try {

                        if (this.getId() === ref.getId() || this.getId() === ref.getId() || this.getParent() === ref.getId()) {
                            projekktors.splice(idx, 1);
                            return;
                        }
                    } catch (e) {}
                });

                this.env.playerDom.replaceWith(this.env.srcNode);
                this._promote('destroyed');
                this.removeListener('*');

                return this;
            };

        /**
         * @public
         * @return {Object} this
         */
        this.reset = function (autoplay) {

                var ref = this;

                try {
                    this.addListener('fullscreen.reset', function () {
                        ref.removeListener('fullscreen.reset');
                        ref._clearqueue();
                        ref._enqueue(function () {
                            ref._reset(autoplay);
                        });
                    });

                    this.setFullscreen(false);
                } catch (e) {
                    // this needs to be fixed
                    // fails with an "this.playerModel.applyCommand is not a function" from time to time
                    // ugly workaround to prevent player to hang up:
                    ref.removeListener('fullscreen.reset');
                    ref._clearqueue();
                    ref._enqueue(function () {
                        ref._reset(autoplay);
                    });
                }

                return this;
            },
            this._reset = function (autoplay) {

                var cleanConfig = {};

                // this._isReady = false;
                $(this).off();
                $((this.getIframe()) ? parent.window.document : document).off(".projekktor");
                $(window).off('.projekktor' + this.getId());

                this.playerModel.destroy();
                this.playerModel = {};
                this._parsers = {};

                this.removePlugins();
                this._removeGUIListeners();
                this.env.mediaContainer = null;

                for (var i in this.config) {
                    if (this.config.hasOwnProperty(i)) {
                        cleanConfig[(i.substr(0, 1) === '_') ? i.substr(1) : i] = this.config[i];
                    }
                }

                cleanConfig['autoplay'] = cleanConfig['loop'] || autoplay;

                return this;
            },
            /********************************************************************************************
             Queue Points
             *********************************************************************************************/
            this.setCuePoint = function (obj, opt, stopProp) {

                var item = (obj.item !== undefined) ? obj.item : this.getItemId(),
                    options = $.extend(true, {
                            offset: 0
                        },
                        opt),
                    stopPropagation = stopProp || false,
                    //should we propagate cuepointsAdd event after cuepoint was added

                    cuePoint = {
                        id: obj.id || $p.utils.randomId(8),
                        group: obj.group || 'default',
                        item: item,
                        on: ($p.utils.toSeconds(obj.on) || 0) + options.offset,
                        off: ($p.utils.toSeconds(obj.off) || $p.utils.toSeconds(obj.on) || 0) + options.offset,
                        value: obj.value || null,
                        callback: obj.callback || function () {},
                        precision: (obj.precision == null) ? 1 : obj.precision,
                        title: (obj.title == null) ? '' : obj.title,
                        once: obj.once || false,
                        blipEvents: obj.blipEvents || [],
                        _listeners: [],
                        _unlocked: false,
                        _active: false,
                        _lastTime: 0,
                        isAvailable: function () {
                            return this._unlocked;
                        },
                        _stateListener: function (state, player) {

                            if ('STOPPED|COMPLETED|DESTROYING'.indexOf(state) > -1) {

                                if (this._active) {

                                    try {
                                        this.callback(false, this, player);
                                    } catch (e) {}
                                }
                                this._active = false;
                                this._lastTime = -1;
                                this._unlocked = false;
                            }
                        },
                        _timeListener: function (time, player) {

                            if (player.getItemId() !== this.item && this.item !== '*') {
                                return;
                            }

                            if (player.getItemId() !== this.item && this.item !== '*') {
                                return;
                            }

                            var timeIdx = (this.precision === 0) ? Math.round(time) : $p.utils.roundNumber(time, this.precision),
                                ref = this;

                            // are we already unlocked?
                            // consider buffer state to unlock future cuepoints for user interactions
                            if (this._unlocked === false) {

                                var approxMaxTimeLoaded = player.getDuration() * player.getLoadProgress() / 100;

                                if (this.on <= approxMaxTimeLoaded || this.on <= timeIdx) {

                                    // trigger unlock-listeners
                                    $.each(this._listeners['unlock'] || [], function () {
                                        this(ref, player);
                                    });
                                    this._unlocked = true;
                                } else {
                                    return;
                                }
                            }

                            // something to do?
                            if (this._lastTime === timeIdx) {
                                return;
                            }

                            var nat = (timeIdx - this._lastTime <= 1 && timeIdx - this._lastTime > 0);

                            // trigger ON
                            if (((timeIdx >= this.on && timeIdx <= this.off) || (timeIdx >= this.on && this.on === this.off && timeIdx <= this.on + 1)) && this._active !== true) {
                                this._active = true;
                                $p.utils.log("Cue Point: [ON " + this.on + "] at " + timeIdx, this);
                                var cp = $.extend(this, {
                                    enabled: true,
                                    seeked: !nat,
                                    player: player
                                });
                                player._promote('cuepoint', cp);

                                try {
                                    this.callback(cp);
                                } catch (e) {}

                                // remove cue point if it should be triggered only once
                                if (this.once) {
                                    player.removeCuePointById(this.id, this.item);
                                }
                            }
                            // trigger OFF
                            else if ((timeIdx < this.on || timeIdx > this.off) && this.off !== this.on && this._active === true) {
                                this._active = false;
                                $p.utils.log("Cue Point: [OFF " + this.off + "] at " + timeIdx, this);

                                var cp = $.extend(this, {
                                    enabled: false,
                                    seeked: !nat,
                                    player: player
                                });
                                player._promote('cuepoint', cp);

                                try {
                                    this.callback(cp);
                                } catch (e) {}

                                // remove cue point if it should be triggered only once
                                if (this.once) {
                                    player.removeCuePointById(this.id, this.item);
                                }
                            }

                            if (this.off === this.on && this._active && Number(timeIdx - this.on).toPrecision(this.precision) >= 1) {
                                this._active = false;
                            }

                            this._lastTime = timeIdx;
                        },
                        addListener: function (event, func) {

                            if (this._listeners[event] == null) {
                                this._listeners[event] = [];
                            }
                            this._listeners[event].push(func || function () {});
                        }
                    };

                if (obj.unlockCallback != null) {
                    cuePoint.addListener('unlock', obj.unlockCallback);
                }

                // create itemidx key
                if (!this._cuePoints.hasOwnProperty(item)) {
                    this._cuePoints[item] = [];
                }
                this._cuePoints[item].push(cuePoint);

                if (!stopPropagation) {
                    this._promote('cuepointsAdd', [cuePoint]);
                }

                return this._cuePoints[item];
            },
            this.setCuePoints = function (cp, itmId, forceItmId, options) {

                var cuepoints = cp || [],
                    itemId = itmId || this.getItemId(),
                    forceItemId = forceItmId || false,
                    ref = this;

                $.each(cuepoints, function () {
                    this.item = forceItemId ? itemId : this.item || itemId; // use given itemId if there is no item id specified per cuepoint or forceItemId is true
                    ref.setCuePoint(this, options, true); // set cuepoint and suppress event propagation after every addition
                });

                if (cuepoints.length) {
                    this._promote('cuepointsAdd', cuepoints);
                }

                return this._cuePoints;
            },
            this.setGotoCuePoint = function (cuePointId, itmId) {
                var currentItemId = this.getItemId(),
                    itemId = itmId || currentItemId;

                if (itemId === currentItemId) {
                    this.setPlayhead(this.getCuePointById(cuePointId, itemId).on);
                } else {
                    //TODO: change playlist item and setPlayhead position
                }

                return this;
            },
            /**
             * Gets cuepoints for specified playlist item
             *
             * @param {String} itmId Playlist item id or wildcard '*' for universal cuepoint added to all of items on the playlist
             * @param {Boolean} withWildcarded Should it get wildcarded ('*') cuepoints too
             * @param {Array} groups Get cuepoints only from given cuepoint groups
             * @returns {Array} Returns array of cuepoints which satisfies the given criteria
             */
            this.getCuePoints = function (itmId, withWildcarded, groups) {
                var itemId = itmId || this.getItemId(),
                    cuePoints = withWildcarded && itemId !== '*' ? $.merge($.merge([], this._cuePoints[itemId] || []), this._cuePoints['*'] || []) : this._cuePoints[itemId] || [],
                    cuePointsGroup = [];

                if (groups && !$.isEmptyObject(cuePoints)) {

                    for (var cIdx = 0; cIdx < cuePoints.length; cIdx++) {
                        if ($.inArray(cuePoints[cIdx].group, groups) > -1) {
                            cuePointsGroup.push(cuePoints[cIdx]);
                        }
                    }
                    return cuePointsGroup;
                }

                return cuePoints;
            },
            /**
             * Gets cuepoint with given id from specified playlist item
             *
             * @param {String} cuePointId
             * @param {String} [itmId=currentItemId]
             * @returns {Object} Returns cuepoint object if the cuepoint exists otherwise false
             */
            this.getCuePointById = function (cuePointId, itmId) {
                var result = false,
                    itemId = itmId || this.getItemId(),
                    cuePoints = this.getCuePoints(itemId);

                for (var j = 0; j < cuePoints.length; j++) {
                    if (cuePoints[j].id === cuePointId) {
                        result = cuePoints[j];
                        break;
                    }
                }
                return result;
            },
            /**
             *
             * @param {String} [itmId=currentItemId]
             * @param {Boolean} [withWildcarded=false]
             * @param {Array} [cuePointGroups]
             * @returns {Array} Array of removed cuepoints
             */
            this.removeCuePoints = function (itmId, withWildcarded, cuePointGroups) {
                var itemId = itmId || this.getItemId(),
                    cuePoints = this._cuePoints,
                    itemKey = {},
                    cpForItem = [],
                    toKill = [],
                    removed = [];

                // remove cuepoints and relevant event listeners
                for (var itemKey in cuePoints) {
                    if (cuePoints.hasOwnProperty(itemKey) && (itemKey === itemId || (withWildcarded ? itemKey === '*' : false))) {
                        cpForItem = cuePoints[itemKey];

                        for (var cIdx = 0, cL = cpForItem.length; cIdx < cL; cIdx++) {

                            if (cuePointGroups === undefined || $.inArray(cpForItem[cIdx].group, cuePointGroups) > -1) {
                                this.removeListener('time', cpForItem[cIdx].timeEventHandler);
                                this.removeListener('state', cpForItem[cIdx].stateEventHandler);
                                toKill.push(cIdx);
                            }
                        }

                        for (var i = 0, l = toKill.length; i < l; i++) {
                            removed.push(cpForItem.splice(toKill[i] - i, 1)[0]);
                        }

                        if (!cpForItem.length) {
                            delete cuePoints[itemKey];
                        }
                        toKill = [];
                    }
                }

                if (removed.length) {
                    this._promote('cuepointsRemove', removed);
                }

                return removed;
            },
            /**
             * Remove cuepoint with given id from specified playlist item
             *
             * @param {String} cuePointId
             * @param {String} [itmId=currentItemId]
             * @returns {Array} Array with removed cuepoint if it was found or empty array otherwise
             */
            this.removeCuePointById = function (cuePointId, itmId) {

                if (typeof cuePointId !== 'string') {
                    return [];
                }

                var itemId = itmId || this.getItemId(),
                    cuePoints = this.getCuePoints(itemId),
                    removed = [];

                for (var cIdx = 0; cIdx < cuePoints.length; cIdx++) {

                    if (cuePoints[cIdx].id === cuePointId) {
                        this.removeListener('time', cuePoints[cIdx].timeEventHandler);
                        this.removeListener('state', cuePoints[cIdx].stateEventHandler);
                        removed = cuePoints.splice(cIdx, 1);
                        break;
                    }
                }

                if (removed.length) {
                    this._promote('cuepointsRemove', removed);
                }

                return removed;
            },
            this.syncCuePoints = function () {

                var ref = this;

                this._enqueue(function () {
                    try {
                        ref._applyCuePoints();
                    } catch (e) {}
                });

                return this;
            },
            this._cuepointsChangeEventHandler = function (cuepoints) {

                var ref = this;

                this._enqueue(function () {
                    try {
                        ref._applyCuePoints();
                    } catch (e) {}
                });
            },
            this._applyCuePoints = function () {

                var ref = this,
                    cuePoints = this.getCuePoints(this.getItemId(), true) || [];

                // remove all cuepoint listeners
                ref.removeListener('*.cuepoint');

                $.each(cuePoints, function (key, cuePointObj) {

                    // attach cuepoint event handlers
                    cuePointObj.timeEventHandler = function (time, player) {
                        try {
                            cuePointObj._timeListener(time, player);
                        } catch (e) {}
                    };

                    cuePointObj.stateEventHandler = function (state, player) {
                        try {
                            cuePointObj._stateListener(state, player);
                        } catch (e) {}
                    };

                    ref.addListener('time.cuepoint', cuePointObj.timeEventHandler);
                    ref.addListener('state.cuepoint', cuePointObj.stateEventHandler);
                });
                this._promote('cuepointsSync', cuePoints);
            },
            /********************************************************************************************
             Command Queue
             *********************************************************************************************/
            this._enqueue = function (command, params, delay) {

                if (command != null) {
                    this._queue.push({
                        command: command,
                        params: params,
                        delay: delay
                    });
                    this._processQueue();
                }
            };

        this._clearqueue = function (command, params) {

            if (this._isReady === true) {
                this._queue = [];
            }
        };

        this._processQueue = function () {

            var ref = this;

            if (this._processing === true) {
                return;
            }
            this._processing = true;

            (function pq() {
                try {

                    var msg = ref._queue.shift();
                    if (msg != null) {

                        if (typeof msg.command === 'string') {
                            if (msg.delay > 0) {
                                setTimeout(function () {
                                    ref.playerModel.applyCommand(msg.command, msg.params);
                                }, msg.delay);
                            } else {
                                ref.playerModel.applyCommand(msg.command, msg.params);
                            }
                        } else {
                            msg.command(ref);
                        }
                    }
                } catch (e) {
                    $p.utils.log("ERROR:", e);
                }

                if (ref._queue.length === 0) {
                    ref._processing = false;
                    return;
                }
                pq();
            })();
        };

        /********************************************************************************************
         GENERAL Tools
         *********************************************************************************************/
        /**
         *
         * @param {string} url or filename containing file extension for which mimeType we want to get
         * @returns {string} one of defined mimeTypes from available models iLove definitions
         * or 'none/none' if there is no such a type or url attribute was other than 'string'
         */
        this._getTypeFromFileExtension = function (url) {

            var regExp = $p.cache.fileExtensionsRegExp,
                extTypes = $p.cache.fileExtensionMimeTypeMap, // file extension -> mimeType map
                extMatch,
                fileExt = 'na'; // file extension string, 'na' -> none/none

            if (!regExp) {

                regExp = function () {

                    var extensions = [];

                    // build regexp matching all known extensions
                    extTypes.forEach(function (mimeType, ext) {
                        extensions.push('\\\.' + ext);
                    });

                    // match last occurrence of the extension 
                    return new RegExp('(' + extensions.join('|') + ')(?!' + extensions.join('|') + ')(?:[\?\/#&]{1}.*|$)', 'i');
                }();

                $p.cache.fileExtensionsRegExp = regExp;
            }

            if (typeof url === 'string') {

                extMatch = url.match(regExp);

                if (extMatch) {
                    fileExt = extMatch[1].replace('.', '');
                }
            }

            return Array.from(extTypes.get(fileExt))[0];
        };

        this._getSupportedPlatforms = function (global) {
            var supportedPlatformsGlobal = $p.cache.platformMimeTypeMap,
                supportedPlatformsLocal = new Map(),
                platformsConfig;

            return function () {
                if (global) {
                    return supportedPlatformsGlobal;
                }

                if (!supportedPlatformsLocal.size) {

                    platformsConfig = this.getConfig('platforms') || ['browser'];

                    // always add 'browser' platform if it's missing
                    if (platformsConfig.indexOf('browser') === -1) {
                        platformsConfig.unshift('browser');
                    }

                    platformsConfig.forEach(function (pt) {

                        if (supportedPlatformsGlobal.has(pt)) {
                            supportedPlatformsLocal.set(pt, supportedPlatformsGlobal.get(pt));
                        }
                    });
                }
                return supportedPlatformsLocal;
            };
        };

        this.getSupportedPlatforms = this._getSupportedPlatforms();

        this.getSupportedPlatformsGlobal = this._getSupportedPlatforms(true);

        this.getPriorityForPlatform = function () {
            var platforms;

            return function (platform) {
                if (!platforms) {
                    platforms = Array.from(this.getSupportedPlatforms());
                }
                return platforms.indexOf(platform);
            };
        }.call(this);

        this.getCanPlayWithDrm = function (drmSystem, mimeType, platforms) {
            var ref = this,
                supportedDrmSystems = $p.drm.supportedDrmSystems,
                modelsILoveSupported = $p.cache.modelsILoveSupported,
                supportedPlatforms = Array.from(ref.getSupportedPlatforms().keys()),
                pt = Array.isArray(platforms) ? $p.utils.intersect(supportedPlatforms, platforms) : supportedPlatforms;

            // check if DRM system is supported at this device
            if (supportedDrmSystems.indexOf(drmSystem) > -1) {
                // check if DRM system is supported for specified mimeType
                return modelsILoveSupported.some(function (iLove) {
                    return (iLove.drm &&
                        iLove.drm.indexOf(drmSystem) > -1 &&
                        iLove.type === mimeType &&
                        $p.utils.intersect(iLove.platform, pt).length
                    );
                });
            }
            return false;
        };

        this._readMediaTag = function (domNode) {
            var result = {},
                htmlTag = '',
                attr = [],
                ref = this;

            if ("VIDEOAUDIO".indexOf(domNode[0].tagName.toUpperCase()) === -1) {
                return false;
            }

            // gather general config attributes:
            // - Safari does not supply default-bools here:
            if (!this.getConfig('ignoreAttributes')) {
                result = {
                    autoplay: ((domNode.attr('autoplay') !== undefined || domNode.prop('autoplay') !== undefined) && domNode.prop('autoplay') !== false) ? true : false,
                    controls: ((domNode.attr('controls') !== undefined || domNode.prop('controls') !== undefined) && domNode.prop('controls') !== false) ? true : false,
                    muted: ((domNode.attr('muted') !== undefined || domNode.prop('muted') !== undefined) && domNode.prop('muted') !== false) ? true : false,
                    loop: ((domNode.attr('autoplay') !== undefined || domNode.prop('loop') !== undefined) && domNode.prop('loop') !== false) ? true : false,
                    title: (domNode.attr('title') !== undefined && domNode.attr('title') !== false) ? domNode.attr('title') : '',
                    poster: (domNode.attr('poster') !== undefined && domNode.attr('poster') !== false) ? domNode.attr('poster') : '',
                    width: (domNode.attr('width') !== undefined && domNode.attr('width') !== false) ? domNode.attr('width') : null,
                    height: (domNode.attr('height') !== undefined && domNode.attr('height') !== false) ? domNode.attr('height') : null
                };
            }

            // IE7+8 and some other idiots do not keep attributes w/o values:
            htmlTag = $($('<div></div>').html($(domNode).clone())).html();
            attr = ['autoplay', 'controls', 'loop', 'muted'];

            for (var i = 0; i < attr.length; i++) {

                if (htmlTag.indexOf(attr[i]) === -1) {
                    continue;
                }
                result[attr[i]] = true;
            }

            // get possible media sources:
            result.playlist = [];
            result.playlist[0] = [];
            result.playlist[0]['config'] = {
                tracks: []
            };

            // ... from "src" attribute:
            if (domNode.attr('src')) {
                result.playlist[0].push({
                    src: domNode.attr('src'),
                    type: domNode.attr('type') || this._getTypeFromFileExtension(domNode.attr('src'))
                });
            }

            // ... from media tag children
            // ... within a lame browser (IE <9) ...
            if (!$('<video/>').get(0).canPlayType) {

                var childNode = domNode;

                do {
                    childNode = childNode.next('source,track');

                    if (childNode.attr('src')) {
                        switch (childNode.get(0).tagName.toUpperCase()) {
                            case 'SOURCE':
                                result.playlist[0].push({
                                    src: childNode.attr('src'),
                                    type: childNode.attr('type') || this._getTypeFromFileExtension(childNode.attr('src')),
                                    quality: childNode.attr('data-quality') || ''
                                });
                                break;

                            case 'TRACK':

                                if ($(this).attr('src')) {
                                    result.playlist[0]['config']['tracks'].push({
                                        src: childNode.attr('src'),
                                        kind: childNode.attr('kind') || 'subtitle',
                                        lang: childNode.attr('srclang') || null,
                                        label: childNode.attr('label') || null
                                    });
                                }
                                break;
                        }
                    }
                } while (childNode.attr('src'));
            }

            // ... within a good browser ...
            if (result.playlist[0].length === 0) {
                domNode.children('source,track').each(function () {
                    if ($(this).attr('src')) {

                        switch ($(this).get(0).tagName.toUpperCase()) {
                            case 'SOURCE':
                                result.playlist[0].push({
                                    src: $(this).attr('src'),
                                    type: $(this).attr('type') || ref._getTypeFromFileExtension($(this)
                                        .attr('src')),
                                    quality: $(this).attr('data-quality') || ''
                                });
                                break;

                            case 'TRACK':
                                result.playlist[0]['config']['tracks'].push({
                                    src: $(this).attr('src'),
                                    kind: $(this).attr('kind') || 'subtitle',
                                    lang: $(this).attr('srclang') || null,
                                    label: $(this).attr('label') || null
                                });
                                break;
                        }
                    }
                });
            }

            return result;
        };

        this._init = function (customNode, customCfg) {

            var theNode = customNode || srcNode,
                theCfg = customCfg || cfg,
                cfgByTag = this._readMediaTag(theNode),
                ref = this,
                iframeParent = this.getIframeParent();

            // -----------------------------------------------------------------------------
            // - 1. GENERAL CONFIG ---------------------------------------------------------
            // -----------------------------------------------------------------------------

            // remember original node HTML for reset and reference purposes:
            this.env.srcNode = theNode.wrap('<div></div>').parent().html();
            theNode.unwrap();

            // remember initial classes
            this.env.className = theNode.attr('class') || '';

            // remember id
            this._id = theNode[0].id || $p.utils.randomId(8);

            if (cfgByTag !== false) {
                // swap videotag->playercontainer
                this.env.playerDom = $('<div/>')
                    .attr({
                        'class': theNode[0].className,
                        'style': theNode.attr('style')
                    });

                theNode.replaceWith(this.env.playerDom);

                // destroy theNode
                theNode.empty().removeAttr('type').removeAttr('src');

                try {
                    theNode.get(0).pause();
                    theNode.get(0).load();
                } catch (e) {}
                $('<div/>').append(theNode).get(0).innerHTML = '';
                theNode = null;
            } else {
                this.env.playerDom = theNode;
            }

            // merge configs we got so far:
            theCfg = $.extend(true, {}, cfgByTag, theCfg);

            for (var i in theCfg) {

                if (this.config['_' + i] != null) {
                    this.config['_' + i] = theCfg[i];
                } else {

                    if (i.indexOf('plugin_') > -1) {
                        this.config[i] = $.extend(this.config[i], theCfg[i]);
                    } else {
                        this.config[i] = theCfg[i];
                    }
                }
            }

            // turn debug mode on/off
            this.setDebug(this.getConfig('debug'));

            // check platforms config is valid
            // should be array with at least 1 platform 'browser' defined
            if (!$.isArray(this.config['_platforms'])) {
                $p.utils.log('ERROR: platforms config must be an array. Reset platforms config to the defaults.');
                this.config['_platforms'] = Object.getPrototypeOf(this.config)['_platforms'] || [];
            }
            // add BROWSER platform if it's not defined in config
            if ($.inArray('browser', this.config['_platforms']) === -1) {
                $p.utils.log('ERROR: "browser" platform not present in platforms config. Adding it.');
                this.config._platforms.unshift('browser');
            }

            // initial DOM scaling
            this.setSize();

            // set initial volume and muted values
            if (this.getConfig('forceMuted')) {
                this.env.muted = true;
            } else {
                this.env.muted = this.storage.restore('muted') !== null ? this.storage.restore('muted') : this.env.muted;
            }

            if (this.env.muted) {
                this.env.volume = 0;
            } else {
                this.env.volume = this.storage.restore('volume') !== null ? this.storage.restore('volume') : this.getConfig('volume');
            }

            // -----------------------------------------------------------------------------
            // - TRIM DEST --------------------------------------------------------------
            // -----------------------------------------------------------------------------

            // make sure we can deal with a domID here:
            this.env.playerDom.attr('id', this._id);

            // load and initialize plugins
            this._registerPlugins();

            // set up iframe environment
            if (this.config._iframe === true) {
                if (iframeParent) {
                    iframeParent.ready(function () {
                        ref._expandView($(window), ref.getDC());
                    });
                } else {
                    ref._expandView($(window), ref.getDC());
                }
            }

            // cross domain
            if (iframeParent === false) {
                this.config._isCrossDomain = true;
            }

            // playlist?
            for (var i in this.config._playlist[0]) {

                // we prefer playlists - search one:
                if (this.config._playlist[0][i].type) {

                    if (this.config._playlist[0][i].type.indexOf('/json') > -1 || this.config._playlist[0][i].type.indexOf('/xml') > -1) {
                        this.setFile(this.config._playlist[0][i].src, this.config._playlist[0][i].type, this.config._playlist[0][i].parser);
                        return this;
                    }
                }
            }

            this.setFile(this.config._playlist);

            return this;
        };

        var ref = this;
        // if there are some initPromises, wait with _init() 
        // until all of them will be fulfilled. Otherwise _init() immediately
        if ($p.initPromises.length > 0) {
            Promise.all($p.initPromises).then(function (result) {
                // clear promises queue
                $p.initPromises.length = 0;
                return ref._init();
            },
                function (reason) {
                    $p.utils.log('initPromises failed: ' + reason);

                });
        }
        else {
            ref._init();
        }
    }

    function Projekktor() {

        var arg = arguments[0],
            instances = [];

        // test media support
        $p.testMediaSupport();

        if (!arguments.length) {
            return projekktors[0] || null;
        }

        // get instances
        // projekktor(idx:number);
        if (typeof arg === 'number') {
            return projekktors[arg];
        }

        // by string selection unique "id" or "*"
        if (typeof arg === 'string') {

            // get all instances
            if (arg === '*') {
                return new Iterator(projekktors);
            }

            // get instance by Jquery OBJ, 'containerId' or selector
            for (var i = 0; i < projekktors.length; i++) {
                try {
                    if (projekktors[i].getId() == arg.id) {
                        instances.push(projekktors[i]);
                        continue;
                    }
                } catch (e) {}
                try {
                    for (var j = 0; j < $(arg).length; j++) {
                        if (projekktors[i].env.playerDom.get(0) == $(arg).get(j)) {
                            instances.push(projekktors[i]);
                            continue;
                        }
                    }
                } catch (e) {}
                try {
                    if (projekktors[i].getParent() == arg) {
                        instances.push(projekktors[i]);
                        continue;
                    }
                } catch (e) {}
                try {
                    if (projekktors[i].getId() == arg) {
                        instances.push(projekktors[i]);
                        continue;
                    }
                } catch (e) {}
            }

            if (instances.length > 0) {
                return (instances.length == 1) ? instances[0] : new Iterator(instances);
            }
        }

        // build instances
        if (instances.length === 0) {
            var cfg = arguments[1] || {},
                callback = arguments[2] || {},
                count = 0,
                playerA;

            if (typeof arg === 'string') {
                $.each($(arg), function () {
                    playerA = new PPlayer($(this), cfg, callback);
                    projekktors.push(playerA);
                    count++;
                });
                return (count > 1) ? new Iterator(projekktors) : playerA;
                // arg is a DOM element
            } else if (arg) {
                projekktors.push(new PPlayer(arg, cfg, callback));
                return new Iterator(projekktors);
            }
        }
    }

    Object.defineProperties(Projekktor, {
        initPromises: {
            value: []
        },
        cache: {
            value: {
                modelsILove: [],
                modelsILoveSupported: undefined,
                platformMimeTypeMap: undefined,
                fileExtensionMimeTypeMap: undefined
            }
        },
        models: {
            value: new Map()
        },
        newModel: {
            value: function (newModelDef, parentModelId) {
                var models = this.models,
                    mILove = this.cache.modelsILove,
                    modelId = newModelDef.modelId,
                    parentModel = models.has(parentModelId) ? models.get(parentModelId).prototype : {},
                    newModel;

                // skip if already exists
                if (models.has(modelId)) {
                    return false;
                }

                // register new model and extend its parent
                newModel = function () {};
                newModel.prototype = $.extend({}, parentModel, newModelDef);

                // add new model to the models register
                models.set(modelId, newModel);

                // add model iLove definitions to the cache
                newModelDef.iLove.forEach(function (iLoveObj) {
                    iLoveObj.model = modelId;
                    mILove.push(iLoveObj);
                });

                return true;
            }
        },
        plugins: {
            value: {}
        },
        /**
         * generates:
         * - platform -> mimeType map 
         * - file extension -> mimeType map 
         * - supported iLoves array
         */
        testMediaSupport: {
            value: function () {

                var fileExtensionMimeTypeMap,
                    platformMimeTypeMap,
                    modelsILoveSupported,
                    mILove;

                // process only once
                if (!$p.cache.platformMimeTypeMap && !$p.cache.fileExtensionMimeTypeMap) {

                    fileExtensionMimeTypeMap = new Map();
                    platformMimeTypeMap = new Map();
                    modelsILoveSupported = [];
                    mILove = $p.cache.modelsILove || [];

                    mILove.forEach(function (iLove) {

                        var platforms = iLove.platform || [],
                            modelId = iLove.model,
                            mimeType = iLove.type,
                            fileExt = iLove.ext;

                        // create file extension -> mimeType map for later use
                        if (!fileExtensionMimeTypeMap.has(fileExt)) {
                            fileExtensionMimeTypeMap.set(fileExt, new Set());
                        }
                        // add mimeType to the set of supported for this platform
                        fileExtensionMimeTypeMap.get(fileExt).add(mimeType);

                        // test mimeType support for every platform specified in iLove
                        platforms.forEach(function (platform) {

                            // check if the platform is known to the player
                            if ($p.platforms.hasOwnProperty(platform)) {

                                // requested platform version is minPlatformVersion from platformsConfig or model prototype
                                var reqPlatformVersion = String($p.models.get(modelId).prototype[platform + 'Version']);

                                // perform version and config check:
                                if ($p.utils.versionCompare($p.platforms[platform](mimeType), reqPlatformVersion)) {

                                    if (!platformMimeTypeMap.has(platform)) {
                                        platformMimeTypeMap.set(platform, new Set());
                                    }
                                    // add mimeType to the set of supported for this platform
                                    platformMimeTypeMap.get(platform).add(mimeType);

                                    modelsILoveSupported.push(iLove);
                                }
                            }
                        });
                    });

                    // cache values
                    $p.cache.fileExtensionMimeTypeMap = fileExtensionMimeTypeMap;
                    $p.cache.platformMimeTypeMap = platformMimeTypeMap;
                    $p.cache.modelsILoveSupported = modelsILoveSupported;
                }
            }
        }
    });

    return Projekktor;

}(window, document, jQuery));
var projekktorConfig = (function (window, document, $, $p) {
  "use strict";

  function projekktorConfig() {
    this._version = "1.9.7";
  }

  return projekktorConfig;
})(window, document, jQuery, projekktor);
/*
* JPlayer Config
* based on: 
* projekktor 
* http://www.projekktor.com 
* 
* Copyright 2010-2014, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com 
* Copyright 2014-2017, Radosław Włodkowski, radoslaw@wlodkowski.net
* 
* under GNU General Public License  
*/
(function (window, document, $, $p, projekktorConfig){
    
    "use strict";

projekktorConfig.prototype = {
    /**************************************************************
        Config options to be customized prior initialization only:
    ***************************************************************/
        
    _playerName:                    'JPlayer',
        
    _playerHome:                    '',
    
    /* Plugins to load on instance initialization, plugins are automatically extening the projekktorPluginInterface class.
    The order how the plugins are set here is important because they are added from z-index 0 to n one by one to the player DOM.
    As such it is usefull to add the "Display" plugin always first.
    */
    _plugins:                       ['display', 'overlay', 'ads', 'controlbar', 'tracking', 'settings'],
    
    /* Add one plugin or more plugins to the player. Alternative to "plugins" above. Will be merged with it. */
    _addplugins:                    [], 
    
    /* custom reel parser (data:JSObject), default function(data){return data;} */
    _reelParser:                    null,
    
    /* Prefix prepended to all css-Classnames and data-attributes used by the player in order to avoid conflicts with existing layouts and scripts */ 
    _ns:                            'pp',
    
    /* a prioritized array of available platforms */
    _platforms:                     ['browser', 'android', 'ios', 'native', 'mse', 'videojs'],
    
    /* additional platforms config */
    _platformsConfig: {
        mse: {
            hlsjs: {
                src: '',
                initVars: {}
            },
            dashjs: {
                src: '',
                initVars: {}
            }
        },
        videojs: {
            src: ''
        }
    },
    
    _platformsFullscreenConfig: {
        browser: ['full', 'viewport'],
        native: ['full', 'mediaonly', 'viewport'],
        android: ['full', 'mediaonly', 'viewport'],
        ios: ['full', 'mediaonly', 'viewport'],
        mse: ['full', 'viewport'],
        videojs: ['full', 'viewport']
    },
    
    /* if set to true, projekktor assumes to live within an iframe and will act accordingly (used for embedding) */
    _iframe:                        false,
    
    /* if set to true projekktor will discard native media tag attributes (loop,controls,autoplay,preload etc.pp) */   
    _ignoreAttributes:              false,
        
    /* looping scheduled media elements -  will be overwritten by loop-attribute of a replaced <video> tag. */
    _loop:                          false,
    
    /* automatically start playback once page has loaded -  will be overwritten by autoplay-attribute of a replaced <video> tag. */
    _autoplay:                      false,
    
    /* if more than one item is scheduled, true will automatically start playback of the next item in line once current one completed */ 
    _continuous:                    true,
    
    /* "true" will stop all other player instances but the one the user clicked play on. */
    _thereCanBeOnlyOne:             false,

    /* An array of items to be played. Check http://www.projekktor.com/docs/playlists to learn more */
    _playlist:                      [],

    /* debug on / off */
    _debug:                         false,
    debugLevel:                     'plugins,events,',
    
    /* the width of the player - >0= overwrite destNodes width, 0= keep dest node width, false=maintain ratio */
    _width:                         null,
    
    /* guess what.... the hight of the player - >0= overwrite destNodes height, 0 = keep height , false=maintain ratio */
    _height:                        null,
    
    _ratio:                         false,
    
    /* An array of objects featuring keycode=>function sets for keyboard-controls-customizing */       
    _keys: [{
        27: function(player) {player.setFullscreen(false);}, // esc
        32: function(player, evt) {player.setPlayPause(); evt.preventDefault();}, // space
        70: function(player) {player.setFullscreen(true);}, // f
        39: function(player, evt) {player.setPlayhead('+5'); evt.preventDefault();}, // left
        37: function(player, evt) {player.setPlayhead('-5'); evt.preventDefault();}, // right
        38: function(player, evt) {player.setVolume('+0.05'); evt.preventDefault();}, // up
        40: function(player, evt) {player.setVolume('-0.05'); evt.preventDefault();}, // down
        68: function(player) {player.setDebug();}, // D
        67: function(player) {$p.utils.log('Config Dump', player.config);}, // C,
        88: function(player) {$p.utils.log('Playlist Dump', player.getItem());}, // X
        89: function(player) {$p.utils.log('Current Quality', player.getAppropriateQuality());} // Y
    }],

    /* cross domain */
    _isCrossDomain:                 false,
    
    /* on "true" try to leave fullscreen on player "complete" */
    _leaveFullscreen:               true,
    
    /* A prioritized list of available fullscreen modes:
     * - full - use HTML5 fullscreen API if available - will push all the player controls and video into fullscreen mode
     * - mediaonly - will use native video player in fullscreen mode (no custom overlays or controls will be displayed)
     * - viewport - this is 'pseudo fullscreen', it'll stretch the player with it's controls to the browser viewport size
     *
     * If the array is empty or value is null then the fullscreen functionality will be disabled. If you prefer to use
     * fullviewport mode even if the native fullscreen for <video> elements is available (e.g. iPad), just push 'viewport' before
     * 'mediaonly' into array like: ['full', 'viewport', 'mediaonly']
     */
    _fullscreen:                    ['full', 'mediaonly', 'viewport'],
    
    /**************************************************************
        Config options available per playlist item:
    ***************************************************************/
    
    /* unique itemID for the item currently played - dynamically generated if not provided via config */
    id:                             null,
    
    /* a title is a title is a title */ 
    title:                          null,
        
    cat:                            'clip',
       
    /* How to select best media format to play. There are two modes available:
    - 'platformsOrder'
    - 'sourcesOrder'
    */
    prioritizeBy: 'sourcesOrder', 
    
    /* URL to poster image -  will be overwritten by poster-attribute of the replaced media tag. */
    poster:                         null,   
    
    /* enable/disable controls -  will be overwritten by controls-attribute of the replaced <video> tag. */
    controls:                       true,
    
    /* start offset in seconds for randomly seekable media. (EXPERIMENTAL) */
    start:                          false,
    
    /* stop endpoint in seconds for randomly seekable media. (EXPERIMENTAL) */
    stop:                           false,   
    
    /* initial volume on player-startup, 0=muted, 1=max */
    volume:                         0.8,
    
    /* a cover which will fill the display on audio-only playback */
    cover:                          '',     
            
    /* enable/disable the possibility to PAUSE the video once playback started. */
    disablePause:                   false,
    
    /* enable/disable the possibility to skip the video by hitting NEXT or using the SCRUBBER */
    disallowSkip:                   false,
    
    /* if set to TRUE users can not change the volume of the player - neither via API nor through controls */
    fixedVolume:                    false,
    
    /* if set to true the initial value of muted will be always taken from configuration instead of user last remember settings */
    forceMuted: false,
    
    /* scaling used for images (playlist items and posters) "fill", "aspectratio" or "none" */
    imageScaling:                   'aspectratio',
    
    /* scaling used for videos (flash and native, not youtube) "fill", "aspectratio" or "none" */
    videoScaling:                   'aspectratio',
            
    /* defines the streamtype of the current item.
        'http':  http  streaming
        'rtmp':  RTMP streaming - requires "flashRTMPServer" to be set.
    */
    streamType:                     'http',
    
    /* *** DEPRECATED with OSMF model ***
     *
     *  if streamType is 'rtmp' you have to provide the serverURL here. */
    streamServer:   '',
    
    /*
     * Indicates, for RTMP streaming URLs, whether the URL includes the application instance or not. 
     * If true, then the second part of the URL path is considered the instance name, 
     * such as rtmp://host/app/foo/bar/stream. In this case the instance name would be 'foo' and the stream 
     * would be 'bar/stream'. If false, then the second part of the URL path is considered to be the stream name, 
     * such as rtmp://host/app/foo/bar/stream. In this case there is no instance name and the stream would be 'foo/bar/stream'.
     *
     */
    rtmpUrlIncludesApplicationInstance: false, 
    /* Youtube offers two different player APIs: fLaSh and "iFrame" for HTML5 . Make your choice here:
      For mobile devices this is forced to TRUE
    */
    useYTIframeAPI:                 true,
    
    /* enable/disable fetching of keyboard events - works in "fullscreen" only */
    enableKeyboard:                 true,  
    
    /*
    small: Player height is 240px, and player dimensions are at least 320px by 240px for 4:3 aspect ratio.
    medium: Player height is 360px, and player dimensions are 640px by 360px (for 16:9 aspect ratio) or 480px by 360px (for 4:3 aspect ratio).
    large: Player height is 480px, and player dimensions are 853px by 480px (for 16:9 aspect ratio) or 640px by 480px (for 4:3 aspect ratio).
    hd720: Player height is 720px, and player dimensions are 1280px by 720px (for 16:9 aspect ratio) or 960px by 720px (for 4:3 aspect ratio).
    hd1080: Player height is 1080px, and player dimensions are 1920px by 1080px (for 16:9 aspect ratio) or 1440px by 1080px (for 4:3 aspect ratio).
    highres: Player height is greater than 1080px, which means that the player's aspect ratio is greater than 1920px by 1080px.
    */
    playbackQuality:                'auto',
    
    _playbackQualities:
    [
        {key: 'small', minHeight: 240, minWidth: 240},
        {key: 'medium', minHeight: 360, minWidth: [{ratio: 1.77, minWidth: 640}, {ratio: 1.33, minWidth: 480}]},
        {key: 'large', minHeight: 480, minWidth: [{ratio: 1.77, minWidth: 853}, {ratio: 1.33, minWidth: 640}]},
        {key: 'hd1080', minHeight: 1080, minWidth: [{ratio: 1.77, minWidth: 1920}, {ratio: 1.33, minWidth: 1440}]},
        {key: 'hd720', minHeight: 720, minWidth: [{ratio: 1.77, minWidth: 1280}, {ratio: 1.33, minWidth: 960}]},
        {key: 'highres', minHeight: 1081, minWidth: 0}
    ],
    
    /**
     * Format of dynamic stream (HDS, HLS, MSS, etc.) audio/video quality keys in which they will be displayed in the settings menu
     * 
     * The available template values you can use:
     * %{width} - width in px
     * %{height} - height in px
     * 
     * %{bitrate} - bitrate in kbps or Mbps
     * %{bitrateunit} - kbps or Mbps
     * %{bitratekbps} - bitrate in kbps
     * %{bitratembps} - bitrate in Mbps
     */
    dynamicStreamQualityKeyFormatAudioVideo: '%{height}p | %{bitrate}%{bitrateunit}',
    
    /**
     * Format of dynamic stream (HDS, HLS, MSS, etc.) audio-only quality keys in which they will be displayed in the settings menu
     * 
     * The available template values you can use:
     * %{bitrate} - bitrate in kbps or Mbps
     * %{bitrateunit} - kbps or Mbps
     * %{bitratekbps} - bitrate in kbps
     * %{bitratembps} - bitrate in Mbps
     * 
     * Note: the audio-only qualities will appear on the list only when the 'dynamicStreamShowAudioOnlyQualities' config option is set to true.
     */
    dynamicStreamQualityKeyFormatAudioOnly: 'audio | %{bitrate}%{bitrateunit}',
    
    /**
     * If the value is set to >0 than there will be decimal point and so many decimal places shown within
     * the bitrate parte of the key. E.g.: 
     * 
     * dynamicStreamQualityKeyBitrateRoundingDecimalPlacesCount: 2,
     * dynamicStreamQualityKeyFormatAudioVideo: '%{bitrate}%{bitrateunit}'
     * // stream bitrate = 1656kbps
     * // key will be rendered as: 1.66Mbps
     * 
     */ 
    dynamicStreamQualityKeyBitrateRoundingDecimalPlacesCount: 1,

    // if true, the player will add audio only streams to the list of available qualities
    dynamicStreamShowAudioOnlyQualities: false,
    
    /* if testcard is disabled, the player will force a file download when no playback platform
    is available. Otherwise (enableTestcard=true) a testcard with an error message is shown in case of issues */
    enableTestcard:                 true,
    
    /* if the scheduled playlist holds more than one item an "skipTestcard" is set to TRUE in case of an error
    the player will proceed to the next item without showing a testcard */
    skipTestcard:                   false,  
        
    /* (pre-) sets the media-duration / will be overwritten once META data is available */
    duration:                       0,
    
    /* add this CSS classes on startup */
    className:                      '',
    
    /* ads plugin internal config */
    plugin_ads: {
    },
        
        
        /* controlbar plugin internal default config */
        plugin_controlbar: {
            showCuePoints: true,
            showCuePointsImmediately: true,
            showCuePointGroups: ['midroll'],
            showOnIdle: true,
            showOnStart: false,
            onPrevClick: null,
            onNextClick: null,
            controlsTemplate: '<ul class="left"><li><div %{play}></div><div %{pause}></div></li></ul><ul class="right"><li><div %{logo}></div></li><li><div %{fsexit}></div><div %{fsenter}></div></li><li><div %{settingsbtn}></div></li><li><div %{subtitlesbtn}></div></li><li><div %{vmax}></div></li><li><div %{vslider}><div %{vmarker}></div><div %{vknob}></div></div></li><li><div %{mute}></div></li><li><div %{timeleft}>%{hr_elp}:%{min_elp}:%{sec_elp} | %{hr_dur}:%{min_dur}:%{sec_dur}</div></li><li><div %{golive}></div></li></ul><ul class="bottom"><li><div %{scrubber}><div %{loaded}></div><div %{playhead}></div><div %{scrubberknob}></div><div %{scrubberdrag}></div></div></li></ul><div %{scrubbertip}>%{hr_tip}:%{min_tip}:%{sec_tip}</div>'
        },
    /* settings plugin internal default config */
    plugin_settings: {
        settingsMenu: '<ul data-id="quality" class="ppsettingslist active">' +
        '<li class="first label">%{quality}</li>' +
        '</ul>' +
        '<div class="ppclear"></div>',

        versionTpl: '<div data-pp-settings-func="toolwindow_version">' +
        '<p>JPlayer V%{version}</p>' +
        '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
        '</div>',
        debugTpl: '<div data-pp-settings-func="toolwindow_debug">' +
        '<div class="wizzard inactive" data-id="debug_1">' +
        '<p><b>%{report}</b></p>' +
        '<p><textarea data-id="message">%{please}</textarea></p>' +
        '<p>' +
        '<a class="btn cancel" href="#">%{cancel}</a>' +
        '<a class="btn next" data-step="2" href="#">%{continue}</a>' +
        '</p>' +
        '</div>' +
        '<div class="wizzard inactive" data-id="debug_2">' +
        '<p><b>%{sendto}</b></p>' +
        '<p><textarea data-id="result">%{please}</textarea></p>' +
        '<p><a class="btn next" href="#" data-step="3">%{ok}</a></p>' +
        '</div>' +
        '<div class="wizzard inactive" data-id="debug_3">' +
        '<p>%{thanks}</p>' +
        '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
        '</div>' +
        '</div>' +
        '<div data-pp-settings-func="toolwindow_error">' +
        '<div class="wizzard inactive" data-id="error_1">' +
        '<p><b>%{error}<br/> %{sendto}</b></p>' +
        '<p><textarea data-id="errortxt"></textarea></p>' +
        '<p><a class="btn next" href="#" data-step="3">%{ok}</a></p>' +
        '</div>' +
        '<div class="wizzard inactive" data-id="error_2">' +
        '<p>%{thanks}</p>' +
        '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
        '</div>' +
        '</div>',

        helpTpl: '<div data-pp-settings-func="toolwindow_help">' +
        '<p><b>%{keyboard assignments}</b></p>' +
        '<p class="key">%{help1}</p>' +
        '<p class="key">%{help2}</p>' +
        '<p class="key">%{help3}</p>' +
        '<p>%{help4}</p>' +
        '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
        '</div>'
    }
};

}(window, document, jQuery, projekktor, projekktorConfig));
(function (window, document, $, $p) {

    "use strict";
    
    $p.utils = {
        imageDummy: function () {
            return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABBJREFUeNpi/v//PwNAgAEACQsDAUdpTjcAAAAASUVORK5CYII=';
        },
        videoDummy: function (type) {
            switch (type) {
                case 'mp4':
                default:
                    // black 256x144 (16:9) h264/AAC - 1s
                    return 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAABfttZGF0AAACoAYF//+c3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTYgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz00IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAADRliIQAN//+9vD+BTZWBFCXEc3onTMfvxW4ujQ3vdAiDuN5tmMABMa1jgAAAwNyBesyMBavAAAADEGaJGxDf/6nhAAwIAAAAAlBnkJ4hX8AJuHeAgBMYXZjNTcuNjQuMTAxAEIgCMEYOCEQBGCMHAAAAAkBnmF0Qn8AMqAhEARgjBwhEARgjBwAAAAJAZ5jakJ/ADKhIRAEYIwcAAAAEkGaaEmoQWiZTAhv//6nhAAwISEQBGCMHCEQBGCMHAAAAAtBnoZFESwr/wAm4SEQBGCMHAAAAAkBnqV0Qn8AMqEhEARgjBwhEARgjBwAAAAJAZ6nakJ/ADKgIRAEYIwcAAAAEkGarEmoQWyZTAhv//6nhAAwICEQBGCMHCEQBGCMHAAAAAtBnspFFSwr/wAm4SEQBGCMHCEQBGCMHAAAAAkBnul0Qn8AMqAhEARgjBwAAAAJAZ7rakJ/ADKgIRAEYIwcIRAEYIwcAAAAEkGa8EmoQWyZTAhv//6nhAAwISEQBGCMHAAAAAtBnw5FFSwr/wAm4SEQBGCMHCEQBGCMHAAAAAkBny10Qn8AMqEhEARgjBwAAAAJAZ8vakJ/ADKgIRAEYIwcIRAEYIwcAAAAEkGbNEmoQWyZTAhv//6nhAAwICEQBGCMHCEQBGCMHAAAAAtBn1JFFSwr/wAm4SEQBGCMHAAAAAkBn3F0Qn8AMqAhEARgjBwhEARgjBwAAAAJAZ9zakJ/ADKgIRAEYIwcAAAAEkGbeEmoQWyZTAhn//6eEAC7gSEQBGCMHCEQBGCMHAAAAAtBn5ZFFSwr/wAm4CEQBGCMHAAAAAkBn7V0Qn8AMqEhEARgjBwhEARgjBwAAAAJAZ+3akJ/ADKhIRAEYIwcAAAAEkGbvEmoQWyZTAhf//6MsAC8gCEQBGCMHCEQBGCMHAAAAAtBn9pFFSwr/wAm4SEQBGCMHCEQBGCMHAAAAAkBn/l0Qn8AMqAhEARgjBwAAAAJAZ/7akJ/ADKhIRAEYIwcIRAEYIwcAAAAEkGb/kmoQWyZTBRMJ//98QAG9SEQBGCMHAAAAAkBnh1qQn8AMqAhEARgjBwhEARgjBwhEARgjBwhEARgjBwhEARgjBwhEARgjBwhEARgjBwAAAlUbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAABEAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAABDt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAABAsAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAQAAAACQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAQLAAAH0gABAAAAAAOzbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAB1MAAAeTdVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAADXm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAx5zdGJsAAAApnN0c2QAAAAAAAAAAQAAAJZhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAQAAkABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMGF2Y0MBZAAM/+EAF2dkAAys2UEBOwEQAAA+kAAOpgDxQplgAQAGaOvjyyLAAAAAEHBhc3AAAAABAAAAAQAAABhzdHRzAAAAAAAAAAEAAAAfAAAD6QAAABRzdHNzAAAAAAAAAAEAAAABAAABCGN0dHMAAAAAAAAAHwAAAAEAAAfSAAAAAQAAE40AAAABAAAH0gAAAAEAAAAAAAAAAQAAA+kAAAABAAATjQAAAAEAAAfSAAAAAQAAAAAAAAABAAAD6QAAAAEAABONAAAAAQAAB9IAAAABAAAAAAAAAAEAAAPpAAAAAQAAE40AAAABAAAH0gAAAAEAAAAAAAAAAQAAA+kAAAABAAATjQAAAAEAAAfSAAAAAQAAAAAAAAABAAAD6QAAAAEAABONAAAAAQAAB9IAAAABAAAAAAAAAAEAAAPpAAAAAQAAE40AAAABAAAH0gAAAAEAAAAAAAAAAQAAA+kAAAABAAALuwAAAAEAAAPpAAAAKHN0c2MAAAAAAAAAAgAAAAEAAAADAAAAAQAAAAIAAAABAAAAAQAAAJBzdHN6AAAAAAAAAAAAAAAfAAAC3AAAABAAAAANAAAADQAAAA0AAAAWAAAADwAAAA0AAAANAAAAFgAAAA8AAAANAAAADQAAABYAAAAPAAAADQAAAA0AAAAWAAAADwAAAA0AAAANAAAAFgAAAA8AAAANAAAADQAAABYAAAAPAAAADQAAAA0AAAAWAAAADQAAAIRzdGNvAAAAAAAAAB0AAAAwAAADRgAAA18AAANyAAADlAAAA6kAAAPCAAAD1QAAA/cAAAQSAAAEJQAABD4AAARaAAAEdQAABIgAAAShAAAEwwAABNgAAATxAAAFBAAABSYAAAU7AAAFVAAABWcAAAWJAAAFpAAABbcAAAXQAAAF7AAABEN0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAABEAAAAAAAAAAAAAAAAEBAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAARAAAAAAAABAAAAAAO7bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAC7gAAAzABVxAAAAAAALWhkbHIAAAAAAAAAAHNvdW4AAAAAAAAAAAAAAABTb3VuZEhhbmRsZXIAAAADZm1pbmYAAAAQc21oZAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAADKnN0YmwAAABqc3RzZAAAAAAAAAABAAAAWm1wNGEAAAAAAAAAAQAAAAAAAAAAAAIAEAAAAAC7gAAAAAAANmVzZHMAAAAAA4CAgCUAAgAEgICAF0AVAAAAAAH0AAAACUcFgICABRGQVuUABoCAgAECAAAAGHN0dHMAAAAAAAAAAQAAADMAAAQAAAABPHN0c2MAAAAAAAAAGQAAAAEAAAACAAAAAQAAAAMAAAABAAAAAQAAAAQAAAACAAAAAQAAAAUAAAABAAAAAQAAAAYAAAACAAAAAQAAAAcAAAABAAAAAQAAAAgAAAACAAAAAQAAAAoAAAABAAAAAQAAAAsAAAACAAAAAQAAAAwAAAABAAAAAQAAAA0AAAACAAAAAQAAAA4AAAABAAAAAQAAAA8AAAACAAAAAQAAABEAAAABAAAAAQAAABIAAAACAAAAAQAAABMAAAABAAAAAQAAABQAAAACAAAAAQAAABUAAAABAAAAAQAAABYAAAACAAAAAQAAABcAAAABAAAAAQAAABgAAAACAAAAAQAAABoAAAABAAAAAQAAABsAAAACAAAAAQAAABwAAAABAAAAAQAAAB0AAAAHAAAAAQAAAOBzdHN6AAAAAAAAAAAAAAAzAAAAFwAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAABgAAAAYAAAAGAAAAhHN0Y28AAAAAAAAAHQAAAykAAANTAAADbAAAA4gAAAOjAAADtgAAA88AAAPrAAAEBgAABB8AAAQyAAAEVAAABGkAAASCAAAElQAABLcAAATSAAAE5QAABP4AAAUaAAAFNQAABUgAAAVhAAAFfQAABZgAAAWxAAAFxAAABeYAAAX5AAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY1Ny41Ni4xMDE=';
            }
        },
        /**
         * blocks text selection attempts by the user for the given obj
         * @private
         * @param (Object) Object
         */
        blockSelection: function (dest) {
            if (dest) {

                dest.css({
                    "-webkit-touch-callout": "none",
                    /* iOS Safari */
                    "-webkit-user-select": "none",
                    /* Safari */
                    "-khtml-user-select": "none",
                    /* Konqueror HTML */
                    "-moz-user-select": "none",
                    /* Firefox */
                    "-ms-user-select": "none",
                    /* IE 11 / Edge */
                    "user-select": "none" /* Non-prefixed version */
                });
            }
            return dest;
        },
        unique: function (arr) {
            return Array.from(new Set(arr));
        },
        intersect: function (array1, array2) {
            var aA = Array.from(new Set(array1)),
                setB = new Set(array2),
                intersection = new Set(aA.filter(function (val) {
                    return setB.has(val);
                }));

            return Array.from(intersection);
        },
        roundNumber: function (value, decimals) {
            return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
        },
        /* generates a random string of <length> */
        randomId: function (length) {
            var chars = "abcdefghiklmnopqrstuvwxyz",
                charsLen = chars.length,
                len = length || 8, // default to 8 char id
                result = '',
                r,
                i;

            for (i = 0; i < len; i++) {
                r = Math.floor(Math.random() * charsLen);
                result += chars.substr(r, 1);
            }
            return result;
        },
        toAbsoluteURL: function (s) {
            var l = location,
                h, p, f, i;

            if (s == null || s == '') {
                return '';
            }

            if (/^\w+:/.test(s)) {
                return s;
            }

            h = l.protocol + '//' + l.host;
            if (s.indexOf('/') === 0) {
                return h + s;
            }

            p = l.pathname.replace(/\/[^\/]*$/, '');
            f = s.match(/\.\.\//g);
            if (f) {
                s = s.substring(f.length * 3);
                for (i = f.length; i--;) {
                    p = p.substring(0, p.lastIndexOf('/'));
                }
            }

            return h + p + '/' + s;
        },
        /**
         * strips / trims
         * @public
         * @param (String) Da string to get processed
         * @return (String) Da trimmed string
         */
        strip: function (s) {
            return s.replace(/^\s+|\s+$/g, "");
        },
        /**
         * strips / trims
         * @public
         * @param (String) Da human readable time to parse
         * @return (Integer) Absolute seconds
         */
        toSeconds: function (t) {
            var s = 0.0;
            if (typeof t != 'string') {
                return t;
            }
            if (t) {
                var p = t.split(':');
                if (p.length > 3) {
                    p = p.slice(0, 3);
                }

                for (var i = 0; i < p.length; i++) {
                    s = s * 60 + parseFloat(p[i].replace(',', '.'));
                }
            }

            return parseFloat(s);
        },
        toTimeObject: function (secs) {
            var hours = Math.floor(secs / (60 * 60)),
                divisor_for_minutes = secs % (60 * 60),
                minutes = Math.floor(divisor_for_minutes / 60),
                divisor_for_seconds = divisor_for_minutes % 60,
                seconds = Math.floor(divisor_for_seconds);

            return {
                h: hours,
                m: minutes,
                s: seconds
            };
        },
        toTimeString: function (secs, noSecs) {
            var time = this.toTimeObject(secs),
                hours = time.h,
                minutes = time.m,
                seconds = time.s;

            if (hours < 10) {
                hours = "0" + hours;
            }
            if (minutes < 10) {
                minutes = "0" + minutes;
            }
            if (seconds < 10) {
                seconds = "0" + seconds;
            }
            return (noSecs === true) ? hours + ':' + minutes : hours + ':' + minutes + ':' + seconds;
        },
        /**
         * script that allows fetching a cached/uncached script
         * set options to {cache: true} if you want to cache requests
         */
        getScript: function (url, options) {
            options = $.extend(options || {}, {
                dataType: "script",
                url: url
            });

            return jQuery.ajax(options);
        },
        getCss: function (url, onload) {
            var css = $("<link>", {
                "rel": "stylesheet",
                "type": "text/css",
                "href": url
            });

            if (typeof callback === 'function') {
                css.on('load', onload);
            }

            if (url) {
                css.appendTo('head');
            }
        },
        /**
         * replaces {}-tags with parameter equivalents
         * @public
         * @param (String) Da string to get processed
         * @param (Object) Object holding data to fill in
         * @return (String) Da parsed string
         * OBSOLETE
         parseTemplate: function (template, data, encode) {

         if (data === undefined || data.length == 0 || typeof data != 'object') return template;

         for (var i in data) {
         template = template.replace(new RegExp('%{' + i + '}', 'gi'), ((encode === true) ? window.encodeURIComponent(data[i]) : data[i]))
         }
         template = template.replace(/%{(.*?)}/gi, '');
         return template;
         },
         */

        /**
         * stretches target to fit into specified dimensions keeping aspect ratio
         * @public
         * @param (String) "fill" or "aspectratio" (default)
         * @param (Object) the Dom-Obj to scale
         * @param (Float) The maximum available width in px
         * @param (Float) The maximum available height in px
         * @param (Float) A forced assumed with of the target object (optional)
         * @param (Float) A forced assumed height of the target object (optional)
         * @return (Boolean) Returns TRUE if <target> was resized in any way, otherwise FALSE
         */
        stretch: function (stretchStyle, target, owid, ohei, twf, thf) {
            var unit = "%",
                wid = owid,
                hei = ohei;

            if (!target) {
                return false;
            }

            if ((target instanceof $) === false) {
                target = $(target);
            }

            if (!target.attr("data-od-width")) {
                target.attr("data-od-width", target.width());
            }
            if (!target.attr("data-od-height")) {
                target.attr("data-od-height", target.height());
            }

            var tw = (twf !== undefined) ? twf : target.attr("data-od-width"),
                th = (thf !== undefined) ? thf : target.attr("data-od-height"),
                xsc = (wid / tw),
                ysc = (hei / th),
                rw = wid,
                rh = hei;

            // fill area
            switch (stretchStyle) {
                case 'none':
                    wid = tw;
                    hei = th;
                    unit = "px";

                    break;

                case 'fill':
                    if (xsc > ysc) {
                        rw = tw * xsc;
                        rh = th * xsc;
                    } else if (xsc < ysc) {
                        rw = tw * ysc;
                        rh = th * ysc;
                    }
                    wid = $p.utils.roundNumber((rw / wid) * 100, 0);
                    hei = $p.utils.roundNumber((rh / hei) * 100, 0);
                    unit = "%";
                    break;

                case 'aspectratio':
                default:
                    // scale, keep aspect ratio
                    if (xsc > ysc) {
                        rw = tw * ysc;
                        rh = th * ysc;
                    } else if (xsc < ysc) {
                        rw = tw * xsc;
                        rh = th * xsc;
                    }
                    wid = $p.utils.roundNumber((rw / wid) * 100, 0);
                    hei = $p.utils.roundNumber((rh / hei) * 100, 0);
                    unit = "%";
                    break;
            }

            if (wid === 0 || hei === 0) {
                return false;
            }

            target.css({
                'margin': 0,
                'padding': 0,
                'width': wid + unit,
                'height': hei + unit,
                'left': (((unit === "%") ? 100 : owid) - wid) / 2 + unit,
                'top': (((unit === "%") ? 100 : ohei) - hei) / 2 + unit
            });

            if (target.attr("data-od-width") != target.width() || target.attr("data-od-height") != target.height()) {
                return true;
            }

            return false;
        },
        // parseUri 1.2.2
        // (c) Steven Levithan <stevenlevithan.com>
        // MIT License
        parseUri: function (str) {
            var o = {
                    strictMode: false,
                    key: ["source", "protocol", "authority", "userInfo", "user", "password", "host", "port", "relative", "path", "directory", "file", "query", "anchor"],
                    q: {
                        name: "queryKey",
                        parser: /(?:^|&)([^&=]*)=?([^&]*)/g
                    },
                    parser: {
                        strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
                        loose: /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
                    }
                },
                m = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
                uri = {},
                i = 14;

            while (i--) {
                uri[o.key[i]] = m[i] || "";
            }

            uri[o.q.name] = {};
            uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
                if ($1) {
                    uri[o.q.name][$1] = $2;
                }
            });

            return uri;
        },
        // usage: log('inside coolFunc',this,arguments);
        // http://paulirish.com/2009/log-a-lightweight-wrapper-for-consolelog/
        log: function () {

            if (this.logging === false) {
                return;
            }

            this.history = this.history || []; // store logs to an array for reference
            this.history.push(arguments);
            if (window.console) {
                console.log(Array.prototype.slice.call(arguments));
            }
        },
        copyToClipboard: function (value) {
            var element = document.createElement('textarea'),
                result = false;

            element.value = value;
            document.body.appendChild(element);
            element.focus();
            element.setSelectionRange(0, element.value.length);

            try {
                result = document.execCommand('copy');
            }
            catch(e){}
            // cleanup
            document.body.removeChild(element);

            return result;
        },
        cleanResponse: function (responseText, type) {
            var data = false;

            switch (type) {
                case 'html':
                case 'xml':
                    // Create the xml document from the responseText string.
                    data = new DOMParser();
                    data = data.parseFromString(responseText, "text/xml");
                    break;

                case 'json':
                    data = responseText;
                    if (typeof data == 'string') {
                        data = JSON.parse(data);
                    }
                    break;
                default:
                    data = responseText;
                    break;

            }
            return data;
        },
        versionCompare: function (installed, required) {
            var installedArr = String(installed).split('.').map(Number),
                requiredArr = String(required).split('.').map(Number),
                insVal, reqVal;

            if(installedArr.some(isNaN) || requiredArr.some(isNaN)){
                return false;
            }

            for (var i = 0; i < 3; i++) {
                reqVal = requiredArr[i];
                insVal = installedArr[i] === undefined ? 0 : installedArr[i];

                if(insVal > reqVal){
                    return true;
                }
                if(reqVal > insVal){
                    return false;
                }
            }

            return true;        
        },
        /**
         * replaces {}-tags with parameter equivalents
         * @public
         * @param (String) Da string to get processed
         * @param (Object) Object holding data to fill in
         * @return (String) Da parsed string
         */
        parseTemplate: function (template, data, encode) {
            var tpl = template,
            i;

            if (data === undefined || data.length == 0 || typeof data !== 'object') {
                return tpl;
            }

            for (i in data) {
                if(data.hasOwnProperty(i)){
                    tpl = tpl.replace(new RegExp('%{' + this.regExpEsc(i) + '}', 'gi'), ((encode === true) ? window.encodeURIComponent(data[i]) : data[i]));
                }
            }
            
            tpl = tpl.replace(/%{(.*?)}/gi, '');
            return tpl;
        },
        i18n: function (str, customData) {
            var regexp = /%{([^}]+)}/g,
                messages = $.extend({}, projekktorMessages, customData),
                text,
                msg = '';

            while (text = regexp.exec(str)) {
                msg = messages.hasOwnProperty(text[1]) ? messages[text[1]] : text[1];
                str = str.replace(new RegExp('%{' + $p.utils.regExpEsc(text[1]) + '}', 'gi'), msg);
            }

            return str;
        },
        errorMessage: function (errorCode, pp) {
            var customData = {
                title: pp.getConfig('title'),
                version: pp.getVersion()
            };

            return this.i18n("%{error" + errorCode + "}", customData);
        },
        regExpEsc: function (s) {
            return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        },
        parseMimeType: function (mimeType) {
            var type,
                subtype,
                params,
                parameters,
                tokenRegexp = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/,
                contentTypeRegex = /^(.*?)\/(.*?)([\t ]*;.*)?$/,
                parameterPattern = /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g,
                quotedStringRegexp = /"(?:[\t \x21\x23-\x5B\x5D-\x7E\x80-\xFF]|(?:\\[\t \x21-\x7E\x80-\xFF]))*"/,
                qescRegExp = /\\([\u000b\u0020-\u00ff])/g,
                contentTypeMatch,
                paramMatch,
                key,
                value;

            if (!mimeType) {
                return null;
            }

            contentTypeMatch = contentTypeRegex.exec(mimeType);

            if (contentTypeMatch) {

                type = contentTypeMatch[1];
                subtype = contentTypeMatch[2];
                params = contentTypeMatch[3];

                if (tokenRegexp.test(type) && tokenRegexp.test(subtype)) {

                    parameters = {};

                    while ((paramMatch = parameterPattern.exec(params))) {
                        key = paramMatch[1];
                        value = paramMatch[2];

                        if (quotedStringRegexp.test(value)) {
                            value = value
                                .substr(1, value.length - 2)
                                .replace(qescRegExp, "$1");
                        }

                        if (key) {
                            parameters[key.toLowerCase()] = value;
                        }
                    }
                    return {
                        type: type,
                        subtype: subtype,
                        parameters: parameters
                    };

                }
                return null;
            }
            return null;
        },
        /**
         * serializes a simple object to a JSON formatted string.
         * Note: stringify() is different from jQuery.serialize() which URLEncodes form elements
         * CREDITS: http://blogs.sitepointstatic.com/examples/tech/json-serialization/json-serialization.js
         */
        stringify: function (obj) {
            if ("JSON" in window) {
                return JSON.stringify(obj);
            }

            var t = typeof (obj);
            if (t != "object" || obj === null) {
                // simple data type
                if (t == "string") {
                    obj = '"' + obj + '"';
                }

                return String(obj);
            } else {
                // recourse array or object
                var n, v, json = [],
                    arr = (obj && obj.constructor == Array);

                for (n in obj) {
                    if (obj.hasOwnProperty(n)) {
                        v = obj[n];
                        t = typeof (v);
                        if (obj.hasOwnProperty(n)) {
                            if (t == "string") {
                                v = '"' + v + '"';
                            } else if (t == "object" && v !== null) {
                                v = $p.utils.stringify(v);
                            }

                            json.push((arr ? "" : '"' + n + '":') + String(v));
                        }
                    }
                }

                return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
            }
        },
        /*
         * Check if object has any of given properties/methods
         * and returns the name of first existing one
         * otherwise returns false.
         * If the prefix is set then method will make a second pass
         * to check all of the prefixed versions of given properties/methods
         */
        hasProp: function (obj, prop, prefix, hasOwn) {
            // add prefixed prop version(s)
            if (this.is(prefix, 'string')) {
                prop = this.addPrefix(prop, prefix, false, true);
            }

            if (this.is(prop, 'string')) {
                if (!!(prop in obj) && (!!hasOwn ? obj.hasOwnProperty(prop) : true)) {
                    return prop;
                }
            } else if ($.isArray(prop)) {
                for (var i = 0; i < prop.length; i++) {
                    if (!!(prop[i] in obj) && (!!hasOwn ? obj.hasOwnProperty(prop[i]) : true)) {
                        return prop[i];
                    }
                }
            }
            return false;
        },
        /*
         *
         * @param {string or array} obj - string or array of strings to prefix
         * @param {string} prefix
         * @param (boolean) replace - if the obj is array should the prefixed strings be replaced or added to existing ones
         * @param {boolean} capitalize - should be the first letter of prefixed string capitalized (to preserve camelCase)
         * @returns {string or array} - returns prefixed string or array of strings
         */
        addPrefix: function (obj, prefix, replace, capitalize) {
            if (this.is(obj, 'string') && this.is(prefix, 'string')) {
                if (!!replace) {
                    return prefix + (!!capitalize ? this.ucfirst(obj) : obj);
                } else {
                    return [obj, prefix + (!!capitalize ? this.ucfirst(obj) : obj)];
                }
            } else if ($.isArray(obj) && this.is(prefix, 'string')) {
                var initLength = obj.length;
                for (var i = 0; i < initLength; i++) {
                    if (!!replace) {
                        obj[i] = prefix + (!!capitalize ? this.ucfirst(obj[i]) : obj[i]);
                    } else {
                        obj.push(prefix + (!!capitalize ? this.ucfirst(obj[i]) : obj[i]));
                    }
                }
            }
            return obj;
        },
        /**
         * is returns a boolean for if typeof obj is exactly type.
         * CREDITS: Modernizr
         */
        is: function (obj, type) {
            return typeof obj === type;
        },
        /**
         * contains returns a boolean for if substr is found within str
         * CREDITS: Modernizr
         */
        contains: function (str, substr) {
            return !!~('' + str).indexOf(substr);
        },
        /*
         * Returns a string with the first character of string capitalized
         * @param {string} str
         * @returns {string or boolean}
         */
        ucfirst: function (str) {
            if (this.is(str, 'string')) {
                return str[0].toUpperCase() + str.substr(1);
            }
            return false;
        },
        logging: false
    };

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2015 Radosław Włodkowski, radoslaw@wlodkowski.net
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 */

(function(window, document, $, $p){

    "use strict";
    
$p.userAgent = (function () {

   /*
    * Modified version of:
    * UAParser.js v0.7.9
    * Lightweight JavaScript-based User-Agent string parser
    * https://github.com/faisalman/ua-parser-js
    *
    * Copyright © 2012-2015 Faisal Salman <fyzlman@gmail.com>
    * Dual licensed under GPLv2 & MIT
    */
    var UAParser = new (function (window, undefined) {

        'use strict';

        //////////////
        // Constants
        /////////////


        var LIBVERSION  = '0.7.9',
            EMPTY       = '',
            UNKNOWN     = '?',
            FUNC_TYPE   = 'function',
            UNDEF_TYPE  = 'undefined',
            OBJ_TYPE    = 'object',
            STR_TYPE    = 'string',
            MAJOR       = 'major', // deprecated
            MODEL       = 'model',
            NAME        = 'name',
            TYPE        = 'type',
            VENDOR      = 'vendor',
            VERSION     = 'version',
            ARCHITECTURE= 'architecture',
            CONSOLE     = 'console',
            MOBILE      = 'mobile',
            TABLET      = 'tablet',
            SMARTTV     = 'smarttv',
            WEARABLE    = 'wearable',
            EMBEDDED    = 'embedded';


        ///////////
        // Helper
        //////////


        var util = {
            extend : function (regexes, extensions) {
                for (var i in extensions) {
                    if ("browser cpu device engine os".indexOf(i) !== -1 && extensions[i].length % 2 === 0) {
                        regexes[i] = extensions[i].concat(regexes[i]);
                    }
                }
                return regexes;
            },
            has : function (str1, str2) {
              if (typeof str1 === "string") {
                return str2.toLowerCase().indexOf(str1.toLowerCase()) !== -1;
              } else {
                return false;
              }
            },
            lowerize : function (str) {
                return str.toLowerCase();
            },
            major : function (version) {
                return typeof(version) === STR_TYPE ? version.split(".")[0] : undefined;
            }
        };


        ///////////////
        // Map helper
        //////////////


        var mapper = {

            rgx : function () {

                var result, i = 0, j, k, p, q, matches, match, args = arguments;

                // loop through all regexes maps
                while (i < args.length && !matches) {

                    var regex = args[i],       // even sequence (0,2,4,..)
                        props = args[i + 1];   // odd sequence (1,3,5,..)

                    // construct object barebones
                    if (typeof result === UNDEF_TYPE) {
                        result = {};
                        for (p in props) {
                            q = props[p];
                            if (typeof q === OBJ_TYPE) {
                                result[q[0]] = undefined;
                            } else {
                                result[q] = undefined;
                            }
                        }
                    }

                    // try matching uastring with regexes
                    j = k = 0;
                    while (j < regex.length && !matches) {
                        matches = regex[j++].exec(this.getUA());
                        if (!!matches) {
                            for (p = 0; p < props.length; p++) {
                                match = matches[++k];
                                q = props[p];
                                // check if given property is actually array
                                if (typeof q === OBJ_TYPE && q.length > 0) {
                                    if (q.length == 2) {
                                        if (typeof q[1] == FUNC_TYPE) {
                                            // assign modified match
                                            result[q[0]] = q[1].call(this, match);
                                        } else {
                                            // assign given value, ignore regex match
                                            result[q[0]] = q[1];
                                        }
                                    } else if (q.length == 3) {
                                        // check whether function or regex
                                        if (typeof q[1] === FUNC_TYPE && !(q[1].exec && q[1].test)) {
                                            // call function (usually string mapper)
                                            result[q[0]] = match ? q[1].call(this, match, q[2]) : undefined;
                                        } else {
                                            // sanitize match using given regex
                                            result[q[0]] = match ? match.replace(q[1], q[2]) : undefined;
                                        }
                                    } else if (q.length == 4) {
                                            result[q[0]] = match ? q[3].call(this, match.replace(q[1], q[2])) : undefined;
                                    }
                                } else {
                                    result[q] = match ? match : undefined;
                                }
                            }
                        }
                    }
                    i += 2;
                }
                return result;
            },

            str : function (str, map) {

                for (var i in map) {
                    // check if array
                    if (typeof map[i] === OBJ_TYPE && map[i].length > 0) {
                        for (var j = 0; j < map[i].length; j++) {
                            if (util.has(map[i][j], str)) {
                                return (i === UNKNOWN) ? undefined : i;
                            }
                        }
                    } else if (util.has(map[i], str)) {
                        return (i === UNKNOWN) ? undefined : i;
                    }
                }
                return str;
            }
        };


        ///////////////
        // String map
        //////////////


        var maps = {

            browser : {
                oldsafari : {
                    version : {
                        '1.0'   : '/8',
                        '1.2'   : '/1',
                        '1.3'   : '/3',
                        '2.0'   : '/412',
                        '2.0.2' : '/416',
                        '2.0.3' : '/417',
                        '2.0.4' : '/419',
                        '?'     : '/'
                    }
                }
            },

            device : {
                amazon : {
                    model : {
                        'Fire Phone' : ['SD', 'KF']
                    }
                },
                sprint : {
                    model : {
                        'Evo Shift 4G' : '7373KT'
                    },
                    vendor : {
                        'HTC'       : 'APA',
                        'Sprint'    : 'Sprint'
                    }
                }
            },

            os : {
                windows : {
                    version : {
                        'ME'        : '4.90',
                        'NT 3.11'   : 'NT3.51',
                        'NT 4.0'    : 'NT4.0',
                        '2000'      : 'NT 5.0',
                        'XP'        : ['NT 5.1', 'NT 5.2'],
                        'Vista'     : 'NT 6.0',
                        '7'         : 'NT 6.1',
                        '8'         : 'NT 6.2',
                        '8.1'       : 'NT 6.3',
                        '10'        : ['NT 6.4', 'NT 10.0'],
                        'RT'        : 'ARM'
                    }
                }
            }
        };


        //////////////
        // Regex map
        /////////////


        var regexes = {

            browser : [[

                // Presto based
                /(opera\smini)\/([\w\.-]+)/i,                                       // Opera Mini
                /(opera\s[mobiletab]+).+version\/([\w\.-]+)/i,                      // Opera Mobi/Tablet
                /(opera).+version\/([\w\.]+)/i,                                     // Opera > 9.80
                /(opera)[\/\s]+([\w\.]+)/i                                          // Opera < 9.80

                ], [NAME, VERSION], [

                /\s(opr)\/([\w\.]+)/i                                               // Opera Webkit
                ], [[NAME, 'Opera'], VERSION], [

                // Mixed
                /(kindle)\/([\w\.]+)/i,                                             // Kindle
                /(lunascape|maxthon|netfront|jasmine|blazer)[\/\s]?([\w\.]+)*/i,
                                                                                    // Lunascape/Maxthon/Netfront/Jasmine/Blazer

                // Trident based
                /(avant\s|iemobile|slim|baidu)(?:browser)?[\/\s]?([\w\.]*)/i,
                                                                                    // Avant/IEMobile/SlimBrowser/Baidu
                /(?:ms|\()(ie)\s([\w\.]+)/i,                                        // Internet Explorer

                // Webkit/KHTML based
                /(rekonq)\/([\w\.]+)*/i,                                            // Rekonq
                /(chromium|flock|rockmelt|midori|epiphany|silk|skyfire|ovibrowser|bolt|iron|vivaldi|iridium)\/([\w\.-]+)/i
                                                                                    // Chromium/Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium
                ], [NAME, VERSION], [

                /(trident).+rv[:\s]([\w\.]+).+like\sgecko/i                         // IE11
                ], [[NAME, 'IE'], VERSION], [

                /(edge)\/((\d+)?[\w\.]+)/i                                          // Microsoft Edge
                ], [NAME, VERSION], [

                /(yabrowser)\/([\w\.]+)/i                                           // Yandex
                ], [[NAME, 'Yandex'], VERSION], [

                /(comodo_dragon)\/([\w\.]+)/i                                       // Comodo Dragon
                ], [[NAME, /_/g, ' '], VERSION], [

                /(chrome|omniweb|arora|[tizenoka]{5}\s?browser)\/v?([\w\.]+)/i,
                                                                                    // Chrome/OmniWeb/Arora/Tizen/Nokia
                /(qqbrowser)[\/\s]?([\w\.]+)/i
                                                                                    // QQBrowser
                ], [NAME, VERSION], [

                /(uc\s?browser)[\/\s]?([\w\.]+)/i,
                /ucweb.+(ucbrowser)[\/\s]?([\w\.]+)/i,
                /JUC.+(ucweb)[\/\s]?([\w\.]+)/i
                                                                                    // UCBrowser
                ], [[NAME, 'UCBrowser'], VERSION], [

                /(dolfin)\/([\w\.]+)/i                                              // Dolphin
                ], [[NAME, 'Dolphin'], VERSION], [

                /((?:android.+)crmo|crios)\/([\w\.]+)/i                             // Chrome for Android/iOS
                ], [[NAME, 'Chrome'], VERSION], [

                /XiaoMi\/MiuiBrowser\/([\w\.]+)/i                                   // MIUI Browser
                ], [VERSION, [NAME, 'MIUI Browser']], [

                /android.+version\/([\w\.]+)\s+(?:mobile\s?safari|safari)/i         // Android Browser
                ], [VERSION, [NAME, 'Android Browser']], [

                /FBAV\/([\w\.]+);/i                                                 // Facebook App for iOS
                ], [VERSION, [NAME, 'Facebook']], [

                /version\/([\w\.]+).+?mobile\/\w+\s(safari)/i                       // Mobile Safari
                ], [VERSION, [NAME, 'Mobile Safari']], [

                /version\/([\w\.]+).+?(mobile\s?safari|safari)/i                    // Safari & Safari Mobile
                ], [VERSION, NAME], [

                /webkit.+?(mobile\s?safari|safari)(\/[\w\.]+)/i                     // Safari < 3.0
                ], [NAME, [VERSION, mapper.str, maps.browser.oldsafari.version]], [

                /(konqueror)\/([\w\.]+)/i,                                          // Konqueror
                /(webkit|khtml)\/([\w\.]+)/i
                ], [NAME, VERSION], [

                // Gecko based
                /(navigator|netscape)\/([\w\.-]+)/i                                 // Netscape
                ], [[NAME, 'Netscape'], VERSION], [
                /fxios\/([\w\.-]+)/i                                                // Firefox for iOS
                ], [VERSION, [NAME, 'Firefox']], [
                /(swiftfox)/i,                                                      // Swiftfox
                /(icedragon|iceweasel|camino|chimera|fennec|maemo\sbrowser|minimo|conkeror)[\/\s]?([\w\.\+]+)/i,
                                                                                    // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror
                /(firefox|seamonkey|k-meleon|icecat|iceape|firebird|phoenix)\/([\w\.-]+)/i,
                                                                                    // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
                /(mozilla)\/([\w\.]+).+rv\:.+gecko\/\d+/i,                          // Mozilla

                // Other
                /(polaris|lynx|dillo|icab|doris|amaya|w3m|netsurf)[\/\s]?([\w\.]+)/i,
                                                                                    // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf
                /(links)\s\(([\w\.]+)/i,                                            // Links
                /(gobrowser)\/?([\w\.]+)*/i,                                        // GoBrowser
                /(ice\s?browser)\/v?([\w\._]+)/i,                                   // ICE Browser
                /(mosaic)[\/\s]([\w\.]+)/i                                          // Mosaic
                ], [NAME, VERSION]

                /* /////////////////////
                // Media players BEGIN
                ////////////////////////
                , [
                /(apple(?:coremedia|))\/((\d+)[\w\._]+)/i,                          // Generic Apple CoreMedia
                /(coremedia) v((\d+)[\w\._]+)/i
                ], [NAME, VERSION], [
                /(aqualung|lyssna|bsplayer)\/((\d+)?[\w\.-]+)/i                     // Aqualung/Lyssna/BSPlayer
                ], [NAME, VERSION], [
                /(ares|ossproxy)\s((\d+)[\w\.-]+)/i                                 // Ares/OSSProxy
                ], [NAME, VERSION], [
                /(audacious|audimusicstream|amarok|bass|core|dalvik|gnomemplayer|music on console|nsplayer|psp-internetradioplayer|videos)\/((\d+)[\w\.-]+)/i,
                                                                                    // Audacious/AudiMusicStream/Amarok/BASS/OpenCORE/Dalvik/GnomeMplayer/MoC
                                                                                    // NSPlayer/PSP-InternetRadioPlayer/Videos
                /(clementine|music player daemon)\s((\d+)[\w\.-]+)/i,               // Clementine/MPD
                /(lg player|nexplayer)\s((\d+)[\d\.]+)/i,
                /player\/(nexplayer|lg player)\s((\d+)[\w\.-]+)/i                   // NexPlayer/LG Player
                ], [NAME, VERSION], [
                /(nexplayer)\s((\d+)[\w\.-]+)/i                                     // Nexplayer
                ], [NAME, VERSION], [
                /(flrp)\/((\d+)[\w\.-]+)/i                                          // Flip Player
                ], [[NAME, 'Flip Player'], VERSION], [
                /(fstream|nativehost|queryseekspider|ia-archiver|facebookexternalhit)/i
                                                                                    // FStream/NativeHost/QuerySeekSpider/IA Archiver/facebookexternalhit
                ], [NAME], [
                /(gstreamer) souphttpsrc (?:\([^\)]+\)){0,1} libsoup\/((\d+)[\w\.-]+)/i
                                                                                    // Gstreamer
                ], [NAME, VERSION], [
                /(htc streaming player)\s[\w_]+\s\/\s((\d+)[\d\.]+)/i,              // HTC Streaming Player
                /(java|python-urllib|python-requests|wget|libcurl)\/((\d+)[\w\.-_]+)/i,
                                                                                    // Java/urllib/requests/wget/cURL
                /(lavf)((\d+)[\d\.]+)/i                                             // Lavf (FFMPEG)
                ], [NAME, VERSION], [
                /(htc_one_s)\/((\d+)[\d\.]+)/i                                      // HTC One S
                ], [[NAME, /_/g, ' '], VERSION], [
                /(mplayer)(?:\s|\/)(?:(?:sherpya-){0,1}svn)(?:-|\s)(r\d+(?:-\d+[\w\.-]+){0,1})/i
                                                                                    // MPlayer SVN
                ], [NAME, VERSION], [
                /(mplayer)(?:\s|\/|[unkow-]+)((\d+)[\w\.-]+)/i                      // MPlayer
                ], [NAME, VERSION], [
                /(mplayer)/i,                                                       // MPlayer (no other info)
                /(yourmuze)/i,                                                      // YourMuze
                /(media player classic|nero showtime)/i                             // Media Player Classic/Nero ShowTime
                ], [NAME], [
                /(nero (?:home|scout))\/((\d+)[\w\.-]+)/i                           // Nero Home/Nero Scout
                ], [NAME, VERSION], [
                /(nokia\d+)\/((\d+)[\w\.-]+)/i                                      // Nokia
                ], [NAME, VERSION], [
                /\s(songbird)\/((\d+)[\w\.-]+)/i                                    // Songbird/Philips-Songbird
                ], [NAME, VERSION], [
                /(winamp)3 version ((\d+)[\w\.-]+)/i,                               // Winamp
                /(winamp)\s((\d+)[\w\.-]+)/i,
                /(winamp)mpeg\/((\d+)[\w\.-]+)/i
                ], [NAME, VERSION], [
                /(ocms-bot|tapinradio|tunein radio|unknown|winamp|inlight radio)/i  // OCMS-bot/tap in radio/tunein/unknown/winamp (no other info)
                                                                                    // inlight radio
                ], [NAME], [
                /(quicktime|rma|radioapp|radioclientapplication|soundtap|totem|stagefright|streamium)\/((\d+)[\w\.-]+)/i
                                                                                    // QuickTime/RealMedia/RadioApp/RadioClientApplication/
                                                                                    // SoundTap/Totem/Stagefright/Streamium
                ], [NAME, VERSION], [
                /(smp)((\d+)[\d\.]+)/i                                              // SMP
                ], [NAME, VERSION], [
                /(vlc) media player - version ((\d+)[\w\.]+)/i,                     // VLC Videolan
                /(vlc)\/((\d+)[\w\.-]+)/i,
                /(xbmc|gvfs|xine|xmms|irapp)\/((\d+)[\w\.-]+)/i,                    // XBMC/gvfs/Xine/XMMS/irapp
                /(foobar2000)\/((\d+)[\d\.]+)/i,                                    // Foobar2000
                /(itunes)\/((\d+)[\d\.]+)/i                                         // iTunes
                ], [NAME, VERSION], [
                /(wmplayer)\/((\d+)[\w\.-]+)/i,                                     // Windows Media Player
                /(windows-media-player)\/((\d+)[\w\.-]+)/i
                ], [[NAME, /-/g, ' '], VERSION], [
                /windows\/((\d+)[\w\.-]+) upnp\/[\d\.]+ dlnadoc\/[\d\.]+ (home media server)/i
                                                                                    // Windows Media Server
                ], [VERSION, [NAME, 'Windows']], [
                /(com\.riseupradioalarm)\/((\d+)[\d\.]*)/i                          // RiseUP Radio Alarm
                ], [NAME, VERSION], [
                /(rad.io)\s((\d+)[\d\.]+)/i,                                        // Rad.io
                /(radio.(?:de|at|fr))\s((\d+)[\d\.]+)/i
                ], [[NAME, 'rad.io'], VERSION]
                //////////////////////
                // Media players END
                ////////////////////*/

            ],

            cpu : [[

                /(?:(amd|x(?:(?:86|64)[_-])?|wow|win)64)[;\)]/i                     // AMD64
                ], [[ARCHITECTURE, 'amd64']], [

                /(ia32(?=;))/i                                                      // IA32 (quicktime)
                ], [[ARCHITECTURE, util.lowerize]], [

                /((?:i[346]|x)86)[;\)]/i                                            // IA32
                ], [[ARCHITECTURE, 'ia32']], [

                // PocketPC mistakenly identified as PowerPC
                /windows\s(ce|mobile);\sppc;/i
                ], [[ARCHITECTURE, 'arm']], [

                /((?:ppc|powerpc)(?:64)?)(?:\smac|;|\))/i                           // PowerPC
                ], [[ARCHITECTURE, /ower/, '', util.lowerize]], [

                /(sun4\w)[;\)]/i                                                    // SPARC
                ], [[ARCHITECTURE, 'sparc']], [

                /((?:avr32|ia64(?=;))|68k(?=\))|arm(?:64|(?=v\d+;))|(?=atmel\s)avr|(?:irix|mips|sparc)(?:64)?(?=;)|pa-risc)/i
                                                                                    // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
                ], [[ARCHITECTURE, util.lowerize]]
            ],

            device : [[

                /\((ipad|playbook);[\w\s\);-]+(rim|apple)/i                         // iPad/PlayBook
                ], [MODEL, VENDOR, [TYPE, TABLET]], [

                /applecoremedia\/[\w\.]+ \((ipad)/                                  // iPad
                ], [MODEL, [VENDOR, 'Apple'], [TYPE, TABLET]], [

                /(apple\s{0,1}tv)/i                                                 // Apple TV
                ], [[MODEL, 'Apple TV'], [VENDOR, 'Apple']], [

                /(archos)\s(gamepad2?)/i,                                           // Archos
                /(hp).+(touchpad)/i,                                                // HP TouchPad
                /(kindle)\/([\w\.]+)/i,                                             // Kindle
                /\s(nook)[\w\s]+build\/(\w+)/i,                                     // Nook
                /(dell)\s(strea[kpr\s\d]*[\dko])/i                                  // Dell Streak
                ], [VENDOR, MODEL, [TYPE, TABLET]], [

                /(kf[A-z]+)\sbuild\/[\w\.]+.*silk\//i                               // Kindle Fire HD
                ], [MODEL, [VENDOR, 'Amazon'], [TYPE, TABLET]], [
                /(sd|kf)[0349hijorstuw]+\sbuild\/[\w\.]+.*silk\//i                  // Fire Phone
                ], [[MODEL, mapper.str, maps.device.amazon.model], [VENDOR, 'Amazon'], [TYPE, MOBILE]], [

                /\((ip[honed|\s\w*]+);.+(apple)/i                                   // iPod/iPhone
                ], [MODEL, VENDOR, [TYPE, MOBILE]], [
                /\((ip[honed|\s\w*]+);/i                                            // iPod/iPhone
                ], [MODEL, [VENDOR, 'Apple'], [TYPE, MOBILE]], [

                /(blackberry)[\s-]?(\w+)/i,                                         // BlackBerry
                /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus|dell|huawei|meizu|motorola|polytron)[\s_-]?([\w-]+)*/i,
                                                                                    // BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Huawei/Meizu/Motorola/Polytron
                /(hp)\s([\w\s]+\w)/i,                                               // HP iPAQ
                /(asus)-?(\w+)/i                                                    // Asus
                ], [VENDOR, MODEL, [TYPE, MOBILE]], [
                /\(bb10;\s(\w+)/i                                                   // BlackBerry 10
                ], [MODEL, [VENDOR, 'BlackBerry'], [TYPE, MOBILE]], [
                                                                                    // Asus Tablets
                /android.+(transfo[prime\s]{4,10}\s\w+|eeepc|slider\s\w+|nexus 7)/i
                ], [MODEL, [VENDOR, 'Asus'], [TYPE, TABLET]], [

                /(sony)\s(tablet\s[ps])\sbuild\//i,                                  // Sony
                /(sony)?(?:sgp.+)\sbuild\//i
                ], [[VENDOR, 'Sony'], [MODEL, 'Xperia Tablet'], [TYPE, TABLET]], [
                /(?:sony)?(?:(?:(?:c|d)\d{4})|(?:so[-l].+))\sbuild\//i
                ], [[VENDOR, 'Sony'], [MODEL, 'Xperia Phone'], [TYPE, MOBILE]], [

                /\s(ouya)\s/i,                                                      // Ouya
                /(nintendo)\s([wids3u]+)/i                                          // Nintendo
                ], [VENDOR, MODEL, [TYPE, CONSOLE]], [

                /android.+;\s(shield)\sbuild/i                                      // Nvidia
                ], [MODEL, [VENDOR, 'Nvidia'], [TYPE, CONSOLE]], [

                /(playstation\s[3portablevi]+)/i                                    // Playstation
                ], [MODEL, [VENDOR, 'Sony'], [TYPE, CONSOLE]], [

                /(sprint\s(\w+))/i                                                  // Sprint Phones
                ], [[VENDOR, mapper.str, maps.device.sprint.vendor], [MODEL, mapper.str, maps.device.sprint.model], [TYPE, MOBILE]], [

                /(lenovo)\s?(S(?:5000|6000)+(?:[-][\w+]))/i                         // Lenovo tablets
                ], [VENDOR, MODEL, [TYPE, TABLET]], [

                /(htc)[;_\s-]+([\w\s]+(?=\))|\w+)*/i,                               // HTC
                /(zte)-(\w+)*/i,                                                    // ZTE
                /(alcatel|geeksphone|huawei|lenovo|nexian|panasonic|(?=;\s)sony)[_\s-]?([\w-]+)*/i
                                                                                    // Alcatel/GeeksPhone/Huawei/Lenovo/Nexian/Panasonic/Sony
                ], [VENDOR, [MODEL, /_/g, ' '], [TYPE, MOBILE]], [

                /(nexus\s9)/i                                                       // HTC Nexus 9
                ], [MODEL, [VENDOR, 'HTC'], [TYPE, TABLET]], [

                /[\s\(;](xbox(?:\sone)?)[\s\);]/i                                   // Microsoft Xbox
                ], [MODEL, [VENDOR, 'Microsoft'], [TYPE, CONSOLE]], [
                /(kin\.[onetw]{3})/i                                                // Microsoft Kin
                ], [[MODEL, /\./g, ' '], [VENDOR, 'Microsoft'], [TYPE, MOBILE]], [

                                                                                    // Motorola
                /\s(milestone|droid(?:[2-4x]|\s(?:bionic|x2|pro|razr))?(:?\s4g)?)[\w\s]+build\//i,
                /mot[\s-]?(\w+)*/i,
                /(XT\d{3,4}) build\//i
                ], [MODEL, [VENDOR, 'Motorola'], [TYPE, MOBILE]], [
                /android.+\s(mz60\d|xoom[\s2]{0,2})\sbuild\//i
                ], [MODEL, [VENDOR, 'Motorola'], [TYPE, TABLET]], [

                /android.+((sch-i[89]0\d|shw-m380s|gt-p\d{4}|gt-n8000|sgh-t8[56]9|nexus 10))/i,
                /((SM-T\w+))/i
                ], [[VENDOR, 'Samsung'], MODEL, [TYPE, TABLET]], [                  // Samsung
                /((s[cgp]h-\w+|gt-\w+|galaxy\snexus|sm-n900))/i,
                /(sam[sung]*)[\s-]*(\w+-?[\w-]*)*/i,
                /sec-((sgh\w+))/i
                ], [[VENDOR, 'Samsung'], MODEL, [TYPE, MOBILE]], [
                /(samsung);smarttv/i
                ], [VENDOR, MODEL, [TYPE, SMARTTV]], [

                /\(dtv[\);].+(aquos)/i                                              // Sharp
                ], [MODEL, [VENDOR, 'Sharp'], [TYPE, SMARTTV]], [
                /sie-(\w+)*/i                                                       // Siemens
                ], [MODEL, [VENDOR, 'Siemens'], [TYPE, MOBILE]], [

                /(maemo|nokia).*(n900|lumia\s\d+)/i,                                // Nokia
                /(nokia)[\s_-]?([\w-]+)*/i
                ], [[VENDOR, 'Nokia'], MODEL, [TYPE, MOBILE]], [

                /android\s3\.[\s\w;-]{10}(a\d{3})/i                                 // Acer
                ], [MODEL, [VENDOR, 'Acer'], [TYPE, TABLET]], [

                /android\s3\.[\s\w;-]{10}(lg?)-([06cv9]{3,4})/i                     // LG Tablet
                ], [[VENDOR, 'LG'], MODEL, [TYPE, TABLET]], [
                /(lg) netcast\.tv/i                                                 // LG SmartTV
                ], [VENDOR, MODEL, [TYPE, SMARTTV]], [
                /(nexus\s[45])/i,                                                   // LG
                /lg[e;\s\/-]+(\w+)*/i
                ], [MODEL, [VENDOR, 'LG'], [TYPE, MOBILE]], [

                /android.+(ideatab[a-z0-9\-\s]+)/i                                  // Lenovo
                ], [MODEL, [VENDOR, 'Lenovo'], [TYPE, TABLET]], [

                /linux;.+((jolla));/i                                               // Jolla
                ], [VENDOR, MODEL, [TYPE, MOBILE]], [

                /((pebble))app\/[\d\.]+\s/i                                         // Pebble
                ], [VENDOR, MODEL, [TYPE, WEARABLE]], [

                /android.+;\s(glass)\s\d/i                                          // Google Glass
                ], [MODEL, [VENDOR, 'Google'], [TYPE, WEARABLE]], [

                /android.+(\w+)\s+build\/hm\1/i,                                        // Xiaomi Hongmi 'numeric' models
                /android.+(hm[\s\-_]*note?[\s_]*(?:\d\w)?)\s+build/i,                   // Xiaomi Hongmi
                /android.+(mi[\s\-_]*(?:one|one[\s_]plus)?[\s_]*(?:\d\w)?)\s+build/i    // Xiaomi Mi
                ], [[MODEL, /_/g, ' '], [VENDOR, 'Xiaomi'], [TYPE, MOBILE]], [

                /(mobile|tablet);.+rv\:.+gecko\//i                                  // Unidentifiable
                ], [[TYPE, util.lowerize], VENDOR, MODEL]

                /*//////////////////////////
                // TODO: move to string map
                ////////////////////////////
                /(C6603)/i                                                          // Sony Xperia Z C6603
                ], [[MODEL, 'Xperia Z C6603'], [VENDOR, 'Sony'], [TYPE, MOBILE]], [
                /(C6903)/i                                                          // Sony Xperia Z 1
                ], [[MODEL, 'Xperia Z 1'], [VENDOR, 'Sony'], [TYPE, MOBILE]], [
                /(SM-G900[F|H])/i                                                   // Samsung Galaxy S5
                ], [[MODEL, 'Galaxy S5'], [VENDOR, 'Samsung'], [TYPE, MOBILE]], [
                /(SM-G7102)/i                                                       // Samsung Galaxy Grand 2
                ], [[MODEL, 'Galaxy Grand 2'], [VENDOR, 'Samsung'], [TYPE, MOBILE]], [
                /(SM-G530H)/i                                                       // Samsung Galaxy Grand Prime
                ], [[MODEL, 'Galaxy Grand Prime'], [VENDOR, 'Samsung'], [TYPE, MOBILE]], [
                /(SM-G313HZ)/i                                                      // Samsung Galaxy V
                ], [[MODEL, 'Galaxy V'], [VENDOR, 'Samsung'], [TYPE, MOBILE]], [
                /(SM-T805)/i                                                        // Samsung Galaxy Tab S 10.5
                ], [[MODEL, 'Galaxy Tab S 10.5'], [VENDOR, 'Samsung'], [TYPE, TABLET]], [
                /(SM-G800F)/i                                                       // Samsung Galaxy S5 Mini
                ], [[MODEL, 'Galaxy S5 Mini'], [VENDOR, 'Samsung'], [TYPE, MOBILE]], [
                /(SM-T311)/i                                                        // Samsung Galaxy Tab 3 8.0
                ], [[MODEL, 'Galaxy Tab 3 8.0'], [VENDOR, 'Samsung'], [TYPE, TABLET]], [
                /(R1001)/i                                                          // Oppo R1001
                ], [MODEL, [VENDOR, 'OPPO'], [TYPE, MOBILE]], [
                /(X9006)/i                                                          // Oppo Find 7a
                ], [[MODEL, 'Find 7a'], [VENDOR, 'Oppo'], [TYPE, MOBILE]], [
                /(R2001)/i                                                          // Oppo YOYO R2001
                ], [[MODEL, 'Yoyo R2001'], [VENDOR, 'Oppo'], [TYPE, MOBILE]], [
                /(R815)/i                                                           // Oppo Clover R815
                ], [[MODEL, 'Clover R815'], [VENDOR, 'Oppo'], [TYPE, MOBILE]], [
                 /(U707)/i                                                          // Oppo Find Way S
                ], [[MODEL, 'Find Way S'], [VENDOR, 'Oppo'], [TYPE, MOBILE]], [
                /(T3C)/i                                                            // Advan Vandroid T3C
                ], [MODEL, [VENDOR, 'Advan'], [TYPE, TABLET]], [
                /(ADVAN T1J\+)/i                                                    // Advan Vandroid T1J+
                ], [[MODEL, 'Vandroid T1J+'], [VENDOR, 'Advan'], [TYPE, TABLET]], [
                /(ADVAN S4A)/i                                                      // Advan Vandroid S4A
                ], [[MODEL, 'Vandroid S4A'], [VENDOR, 'Advan'], [TYPE, MOBILE]], [
                /(V972M)/i                                                          // ZTE V972M
                ], [MODEL, [VENDOR, 'ZTE'], [TYPE, MOBILE]], [
                /(i-mobile)\s(IQ\s[\d\.]+)/i                                        // i-mobile IQ
                ], [VENDOR, MODEL, [TYPE, MOBILE]], [
                /(IQ6.3)/i                                                          // i-mobile IQ IQ 6.3
                ], [[MODEL, 'IQ 6.3'], [VENDOR, 'i-mobile'], [TYPE, MOBILE]], [
                /(i-mobile)\s(i-style\s[\d\.]+)/i                                   // i-mobile i-STYLE
                ], [VENDOR, MODEL, [TYPE, MOBILE]], [
                /(i-STYLE2.1)/i                                                     // i-mobile i-STYLE 2.1
                ], [[MODEL, 'i-STYLE 2.1'], [VENDOR, 'i-mobile'], [TYPE, MOBILE]], [

                /(mobiistar touch LAI 512)/i                                        // mobiistar touch LAI 512
                ], [[MODEL, 'Touch LAI 512'], [VENDOR, 'mobiistar'], [TYPE, MOBILE]], [
                /////////////
                // END TODO
                ///////////*/

            ],

            engine : [[

                /windows.+\sedge\/([\w\.]+)/i                                       // EdgeHTML
                ], [VERSION, [NAME, 'EdgeHTML']], [

                /(presto)\/([\w\.]+)/i,                                             // Presto
                /(webkit|trident|netfront|netsurf|amaya|lynx|w3m)\/([\w\.]+)/i,     // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m
                /(khtml|tasman|links)[\/\s]\(?([\w\.]+)/i,                          // KHTML/Tasman/Links
                /(icab)[\/\s]([23]\.[\d\.]+)/i                                      // iCab
                ], [NAME, VERSION], [

                /rv\:([\w\.]+).*(gecko)/i                                           // Gecko
                ], [VERSION, NAME]
            ],

            os : [[

                // Windows based
                /microsoft\s(windows)\s(vista|xp)/i                                 // Windows (iTunes)
                ], [NAME, VERSION], [
                /(windows)\snt\s6\.2;\s(arm)/i,                                     // Windows RT
                /(windows\sphone(?:\sos)*|windows\smobile|windows)[\s\/]?([ntce\d\.\s]+\w)/i
                ], [NAME, [VERSION, mapper.str, maps.os.windows.version]], [
                /(win(?=3|9|n)|win\s9x\s)([nt\d\.]+)/i
                ], [[NAME, 'Windows'], [VERSION, mapper.str, maps.os.windows.version]], [

                // Mobile/Embedded OS
                /\((bb)(10);/i                                                      // BlackBerry 10
                ], [[NAME, 'BlackBerry'], VERSION], [
                /(blackberry)\w*\/?([\w\.]+)*/i,                                    // Blackberry
                /(tizen)[\/\s]([\w\.]+)/i,                                          // Tizen
                /(android|webos|palm\sos|qnx|bada|rim\stablet\sos|meego|contiki)[\/\s-]?([\w\.]+)*/i,
                                                                                    // Android/WebOS/Palm/QNX/Bada/RIM/MeeGo/Contiki
                /linux;.+(sailfish);/i                                              // Sailfish OS
                ], [NAME, VERSION], [
                /(symbian\s?os|symbos|s60(?=;))[\/\s-]?([\w\.]+)*/i                 // Symbian
                ], [[NAME, 'Symbian'], VERSION], [
                /\((series40);/i                                                    // Series 40
                ], [NAME], [
                /mozilla.+\(mobile;.+gecko.+firefox/i                               // Firefox OS
                ], [[NAME, 'Firefox OS'], VERSION], [

                // Console
                /(nintendo|playstation)\s([wids3portablevu]+)/i,                    // Nintendo/Playstation

                // GNU/Linux based
                /(mint)[\/\s\(]?(\w+)*/i,                                           // Mint
                /(mageia|vectorlinux)[;\s]/i,                                       // Mageia/VectorLinux
                /(joli|[kxln]?ubuntu|debian|[open]*suse|gentoo|arch|slackware|fedora|mandriva|centos|pclinuxos|redhat|zenwalk|linpus)[\/\s-]?([\w\.-]+)*/i,
                                                                                    // Joli/Ubuntu/Debian/SUSE/Gentoo/Arch/Slackware
                                                                                    // Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus
                /(hurd|linux)\s?([\w\.]+)*/i,                                       // Hurd/Linux
                /(gnu)\s?([\w\.]+)*/i                                               // GNU
                ], [NAME, VERSION], [

                /(cros)\s[\w]+\s([\w\.]+\w)/i                                       // Chromium OS
                ], [[NAME, 'Chromium OS'], VERSION],[

                // Solaris
                /(sunos)\s?([\w\.]+\d)*/i                                           // Solaris
                ], [[NAME, 'Solaris'], VERSION], [

                // BSD based
                /\s([frentopc-]{0,4}bsd|dragonfly)\s?([\w\.]+)*/i                   // FreeBSD/NetBSD/OpenBSD/PC-BSD/DragonFly
                ], [NAME, VERSION],[

                /(ip[honead]+)(?:.*os\s*([\w]+)*\slike\smac|;\sopera)/i             // iOS
                ], [[NAME, 'iOS'], [VERSION, /_/g, '.']], [

                /(mac\sos\sx)\s?([\w\s\.]+\w)*/i,
                /(macintosh|mac(?=_powerpc)\s)/i                                    // Mac OS
                ], [[NAME, 'Mac OS'], [VERSION, /_/g, '.']], [

                // Other
                /((?:open)?solaris)[\/\s-]?([\w\.]+)*/i,                            // Solaris
                /(haiku)\s(\w+)/i,                                                  // Haiku
                /(aix)\s((\d)(?=\.|\)|\s)[\w\.]*)*/i,                               // AIX
                /(plan\s9|minix|beos|os\/2|amigaos|morphos|risc\sos|openvms)/i,
                                                                                    // Plan9/Minix/BeOS/OS2/AmigaOS/MorphOS/RISCOS/OpenVMS
                /(unix)\s?([\w\.]+)*/i                                              // UNIX
                ], [NAME, VERSION]
            ]
        };


        /////////////////
        // Constructor
        ////////////////


        var UAParser = function (uastring, extensions) {

            if (!(this instanceof UAParser)) {
                return new UAParser(uastring, extensions).getResult();
            }

            var ua = uastring || ((window && window.navigator && window.navigator.userAgent) ? window.navigator.userAgent : EMPTY);
            var rgxmap = extensions ? util.extend(regexes, extensions) : regexes;

            this.getBrowser = function () {
                var browser = mapper.rgx.apply(this, rgxmap.browser);
                browser.major = util.major(browser.version);
                return browser;
            };
            this.getCPU = function () {
                return mapper.rgx.apply(this, rgxmap.cpu);
            };
            this.getDevice = function () {
                return mapper.rgx.apply(this, rgxmap.device);
            };
            this.getEngine = function () {
                return mapper.rgx.apply(this, rgxmap.engine);
            };
            this.getOS = function () {
                return mapper.rgx.apply(this, rgxmap.os);
            };
            this.getResult = function() {
                return {
                    ua      : this.getUA(),
                    browser : this.getBrowser(),
                    engine  : this.getEngine(),
                    os      : this.getOS(),
                    device  : this.getDevice(),
                    cpu     : this.getCPU()
                };
            };
            this.getUA = function () {
                return ua;
            };
            this.setUA = function (uastring) {
                ua = uastring;
                return this;
            };
            this.setUA(ua);
            return this;
        };

        UAParser.VERSION = LIBVERSION;
        UAParser.BROWSER = {
            NAME    : NAME,
            MAJOR   : MAJOR, // deprecated
            VERSION : VERSION
        };
        UAParser.CPU = {
            ARCHITECTURE : ARCHITECTURE
        };
        UAParser.DEVICE = {
            MODEL   : MODEL,
            VENDOR  : VENDOR,
            TYPE    : TYPE,
            CONSOLE : CONSOLE,
            MOBILE  : MOBILE,
            SMARTTV : SMARTTV,
            TABLET  : TABLET,
            WEARABLE: WEARABLE,
            EMBEDDED: EMBEDDED
        };
        UAParser.ENGINE = {
            NAME    : NAME,
            VERSION : VERSION
        };
        UAParser.OS = {
            NAME    : NAME,
            VERSION : VERSION
        };

        return UAParser;

    })(window)();

    function isMobile(){
        if(navigator.userAgent.search(/Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/i) > -1){
            return true;
        }
        else {
            return false;
        }
    }

    /**
    * Detect Vendor Prefix with JavaScript
    * CREDITS: http://davidwalsh.name/vendor-prefix
    */
    function vendorPrefix(){
        var styles = window.getComputedStyle(document.documentElement, ''),
                pre = (Array.prototype.slice
                        .call(styles)
                        .join('')
                        .match(/-(moz|webkit|ms)-/) || (styles.OLink === '' && ['', 'o'])
                        )[1],
                dom = ('WebKit|Moz|MS|O').match(new RegExp('(' + pre + ')', 'i'))[1];
        return {
            dom: dom,
            lowercase: pre,
            css: '-' + pre + '-',
            js: $p.utils.ucfirst(pre)
        };
    }

    return {
        browser: UAParser.browser,
        cpu: UAParser.cpu,
        device: UAParser.device,
        engine: UAParser.engine,
        os: UAParser.os,
        string: navigator.userAgent,
        prefix: vendorPrefix(),
        isMobile: isMobile()
    };
})();

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2015 Radosław Włodkowski, radoslaw@wlodkowski.net
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 * Code borrowed from:
 * Modernizr 2.8.3 (Custom Build) | MIT & BSD
 *
 */
(function(window, document, $, $p){

    "use strict";
    
$p.features = (function () {

    var Modernizr = {},
        features = {},
        docElement = document.documentElement,
        mod = 'modernizr',
        modElem = document.createElement(mod),
        mStyle = modElem.style,
        inputElem,
        toString = {}.toString,
        prefixes = ' -webkit- -moz- -o- -ms- '.split(' '),
        omPrefixes = 'Webkit Moz O ms',
        cssomPrefixes = omPrefixes.split(' '),
        domPrefixes = omPrefixes.toLowerCase().split(' '),
        ns = {
            'svg': 'http://www.w3.org/2000/svg'
        },
        tests = {},
        inputs = {},
        attrs = {},
        classes = [],
        slice = classes.slice,
        featureName,
        injectElementWithStyles = function (rule, callback, nodes, testnames) {

            var style, ret, node, docOverflow,
                div = document.createElement('div'),
                body = document.body,
                fakeBody = body || document.createElement('body');

            if (parseInt(nodes, 10)) {
                while (nodes--) {
                    node = document.createElement('div');
                    node.id = testnames ? testnames[nodes] : mod + (nodes + 1);
                    div.appendChild(node);
                }
            }

            style = ['&#173;', '<style id="s', mod, '">', rule, '</style>'].join('');
            div.id = mod;
            (body ? div : fakeBody).innerHTML += style;
            fakeBody.appendChild(div);
            if (!body) {
                fakeBody.style.background = '';
                fakeBody.style.overflow = 'hidden';
                docOverflow = docElement.style.overflow;
                docElement.style.overflow = 'hidden';
                docElement.appendChild(fakeBody);
            }

            ret = callback(div, rule);
            if (!body) {
                fakeBody.parentNode.removeChild(fakeBody);
                docElement.style.overflow = docOverflow;
            } else {
                div.parentNode.removeChild(div);
            }

            return !!ret;

        },
        isEventSupported = (function () {

            var TAGNAMES = {
                'select': 'input',
                'change': 'input',
                'submit': 'form',
                'reset': 'form',
                'error': 'img',
                'load': 'img',
                'abort': 'img'
            };

            function isEventSupported (eventName, element) {

                element = element || document.createElement(TAGNAMES[eventName] || 'div');
                eventName = 'on' + eventName;

                var isSupported = eventName in element;

                if (!isSupported) {
                    if (!element.setAttribute) {
                        element = document.createElement('div');
                    }
                    if (element.setAttribute && element.removeAttribute) {
                        element.setAttribute(eventName, '');
                        isSupported = is(element[eventName], 'function');

                        if (!is(element[eventName], 'undefined')) {
                            element[eventName] = undefined;
                        }
                        element.removeAttribute(eventName);
                    }
                }

                element = null;
                return isSupported;
            }
            return isEventSupported;
        })(),
        _hasOwnProperty = ({}).hasOwnProperty, hasOwnProp;

    Modernizr._prefixes = prefixes;
    Modernizr._domPrefixes = domPrefixes;
    Modernizr._cssomPrefixes = cssomPrefixes;
    Modernizr.hasEvent = isEventSupported;
    Modernizr.testProp = function (prop) {
        return testProps([prop]);
    };
    Modernizr.testAllProps = testPropsAll;
    Modernizr.testStyles = injectElementWithStyles;
    Modernizr.prefixed = function (prop, obj, elem) {
        if (!obj) {
            return testPropsAll(prop, 'pfx');
        } else {
            return testPropsAll(prop, obj, elem);
        }
    };

    if (!is(_hasOwnProperty, 'undefined') && !is(_hasOwnProperty.call, 'undefined')) {
        hasOwnProp = function (object, property) {
            return _hasOwnProperty.call(object, property);
        };
    }
    else {
        hasOwnProp = function (object, property) {
            return ((property in object) && is(object.constructor.prototype[property], 'undefined'));
        };
    }

    if (!Function.prototype.bind) {
        Function.prototype.bind = function bind (that) {

            var target = this;

            if (typeof target != "function") {
                throw new TypeError();
            }

            var args = slice.call(arguments, 1),
                bound = function () {

                    if (this instanceof bound) {

                        var F = function () {
                        };
                        F.prototype = target.prototype;
                        var self = new F();

                        var result = target.apply(
                            self,
                            args.concat(slice.call(arguments))
                            );
                        if (Object(result) === result) {
                            return result;
                        }
                        return self;

                    } else {

                        return target.apply(
                            that,
                            args.concat(slice.call(arguments))
                            );

                    }

                };

            return bound;
        };
    }

    function setCss (str) {
        mStyle.cssText = str;
    }

    function setCssAll (str1, str2) {
        return setCss(prefixes.join(str1 + ';') + (str2 || ''));
    }

    function is (obj, type) {
        return typeof obj === type;
    }

    function contains (str, substr) {
        return !!~('' + str).indexOf(substr);
    }

    function testProps (props, prefixed) {
        /* eslint-disable guard-for-in */
        for (var i in props) {
            var prop = props[i];
            if (!contains(prop, "-") && mStyle[prop] !== undefined) {
                return prefixed == 'pfx' ? prop : true;
            }
        }
        /* eslint-enable */
        return false;
    }

    function testDOMProps (props, obj, elem) {
        /* eslint-disable guard-for-in */
        for (var i in props) {
            var item = obj[props[i]];
            if (item !== undefined) {

                if (elem === false) {
                    return props[i];
                }

                if (is(item, 'function')) {
                    return item.bind(elem || obj);
                }

                return item;
            }
        }
        /* eslint-enable */
        return false;
    }

    function testPropsAll (prop, prefixed, elem) {

        var ucProp = prop.charAt(0).toUpperCase() + prop.slice(1),
            props = (prop + ' ' + cssomPrefixes.join(ucProp + ' ') + ucProp).split(' ');

        if (is(prefixed, "string") || is(prefixed, "undefined")) {
            return testProps(props, prefixed);

        } else {
            props = (prop + ' ' + (domPrefixes).join(ucProp + ' ') + ucProp).split(' ');
            return testDOMProps(props, prefixed, elem);
        }
    }

    tests['canvas'] = function () {
        var elem = document.createElement('canvas');
        return !!(elem.getContext && elem.getContext('2d'));
    };

    tests['canvastext'] = function () {
        return !!(Modernizr['canvas'] && is(document.createElement('canvas')
            .getContext('2d').fillText, 'function'));
    };

    tests['csstransitions'] = function() {
        return testPropsAll('transition');
    };

    tests['touch'] = function () {
        var bool;

        if (('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch) {
            bool = true;
        } else {
            injectElementWithStyles(['@media (', prefixes.join('touch-enabled),('), mod, ')',
                '{#modernizr{top:9px;position:absolute}}'].join(''), function (node) {
                bool = node.offsetTop === 9;
            });
        }

        return bool;
    };
    tests['svg'] = function () {
        return !!document.createElementNS && !!document.createElementNS(ns.svg, 'svg').createSVGRect;
    };

    tests['inlinesvg'] = function () {
        var div = document.createElement('div');
        div.innerHTML = '<svg/>';
        return (div.firstChild && div.firstChild.namespaceURI) == ns.svg;
    };

    tests['inlinevideo'] = function() {
        var isIPhone = $p.userAgent.device.model === 'iPhone',
            isWindowsPhone = $p.userAgent.os.name === 'Windows Phone',
            isAndroid = $p.userAgent.os.name === 'Android',
            ieMobileVer = ($p.userAgent.browser.name === 'IEMobile') ? parseInt($p.userAgent.browser.major) : 0,
            osVer = parseFloat($p.userAgent.os.version);

        return (!isIPhone || (isIPhone && osVer >= 10)) && (!isWindowsPhone || (isWindowsPhone && osVer >= 8.1 && ieMobileVer >= 11)) && (!isAndroid || isAndroid && osVer >= 3);
    };

    tests['localstorage'] = function () {
        var mod = 'modernizr';
        try {
            localStorage.setItem(mod, mod);
            localStorage.removeItem(mod);
            return true;
        } catch (e) {
            return false;
        }
    };

    tests['mse'] = function(){
        return !!(window.MediaSource || window.WebKitMediaSource);
    };
    
    tests['eme'] = function () {
        var result = false,
            testVideoEl = document.createElement('video');
        
        // EME
        if (window.navigator.requestMediaKeySystemAccess) {
            if (typeof window.navigator.requestMediaKeySystemAccess === 'function') {
                result = true;
            }
        }
        // MS-EME
        else if (window.MSMediaKeys) {
            if (typeof window.MSMediaKeys === 'function') {
                result = true;
            }
        }
        // WEBKIT-EME    
        else if (testVideoEl.webkitGenerateKeyRequest) {
            if (typeof testVideoEl.webkitGenerateKeyRequest === 'function') {
                result = true;
            }
        }

        return result;
    };

    tests['hlsjs'] = function(){
        window.MediaSource = window.MediaSource || window.WebKitMediaSource;
        return (window.MediaSource &&
            typeof window.MediaSource.isTypeSupported === 'function' &&
            window.MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
    };

    tests['volumecontrol'] = function(){
        var result = false,
            testVideoEl = document.createElement('video'),
            testVol = 0.4;

            testVideoEl.volume = testVol;
            
            return (testVideoEl.volume === testVol);
    };

    for (var feature in tests) {
        if (hasOwnProp(tests, feature)) {
            featureName = feature.toLowerCase();
            features[featureName] = tests[feature]();
            classes.push((features[featureName] ? '' : 'no-') + featureName);
        }
    }

    setCss('');
    modElem = inputElem = null;

    return features;

})();

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2015 Radosław Włodkowski, radoslaw@wlodkowski.net
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 */
(function (window, document, $, $p) {
  "use strict";

  $p.fullscreenApi = (function () {
    var videoElement = document.createElement("video"),
      fsApiVersionsMap = {
        /*
         * mediaonly API applies to HTMLVideoElement, mainly on iOS and Android devices (WebKit)
         */
        mediaonly: {
          /*
           * Methods
           */
          enterFullscreen: ["enterFullscreen", "enterFullScreen"],
          exitFullscreen: [
            "exitFullscreen",
            "exitFullScreen",
            "cancelFullScreen",
            "cancelFullscreen",
          ],
          /*
           * Properties
           */
          supportsFullscreen: ["supportsFullscreen", "supportsFullScreen"],
          displayingFullscreen: [
            "displayingFullscreen",
            "fullScreen",
            "isFullScreen",
            "isFullscreen",
          ],
          /*
           * Events
           */
          beginfullscreen: "webkitbeginfullscreen", // webkit specific, NOTE: this event is unexposed
          // in the newest versions of WebKit based browsers, but it's still dispatched
          endfullscreen: "webkitendfullscreen", // ditto
        },
        /*
         * HTML5 fully blown fullscreen API in different flavours. There are differences in function names
         * and naming conventions between implementations of fullscreen API so we list all of known versions
         * and map them to those specified in WHATWG Fullscreen API Living Standard — Last Updated 29 September 2015.
         * Eventually we are trying to determine which combination does current browser use (if any).
         */
        full: {
          /*
           * Methods
           */
          // HTMLElement
          requestFullscreen: [
            "requestFullscreen",
            "requestFullScreen",
            "enterFullscreen",
            "enterFullScreen",
          ],
          // DOMDocument
          exitFullscreen: [
            "exitFullscreen",
            "exitFullScreen",
            "cancelFullScreen",
            "cancelFullscreen",
          ],
          /*
           * Properties
           */
          // DOMDocument property informing if you can use the API
          fullscreenEnabled: [
            "fullscreenEnabled",
            "fullScreenEnabled",
            "supportsFullscreen",
            "supportsFullScreen",
          ],
          // DOMDocument property returning element which is currently in the fullscreen stage
          fullscreenElement: [
            "fullscreenElement",
            "fullScreenElement",
            "currentFullScreenElement",
          ],
          // DOMDocument property informing if the browser is currently in the fullscreen stage. There is no W3C proposal for this property.
          isFullscreen: [
            "fullScreen",
            "isFullScreen",
            "isFullscreen",
            "displayingFullscreen",
            "displayingFullScreen",
          ],
          /*
           * Events
           */
          // fired on DOMDocument
          // NOTE: Internet Explorer 11 and IEMobile on Windows Phone 8.1 are using cammelcase, prefixed, event names
          // for addEventListener (e.g. MSFullscreenChange) but have lowercase event names in document object (e.g. onmsfullscreenchange)
          // so in this case detection is useless cause when we detect lowercase event name we can't use it with addEventListener
          // - there is need for exception
          fullscreenchange: [
            "fullscreenchange",
            "webkitfullscreenchange",
            "mozfullscreenchange",
          ],
          fullscreenerror: [
            "fullscreenerror",
            "webkitfullscreenerror",
            "mozfullscreenerror",
          ],
        },
      },
      /**
       * this object contains proper names for current UA native fullscreen API functions,
       * properties and events
       */
      fullscreenApi = {
        type: "none",
        mediaonly: {
          enterFullscreen: "",
          exitFullscreen: "",
          supportsFullscreen: "",
          displayingFullscreen: "",
          beginfullscreen: fsApiVersionsMap.mediaonly["beginfullscreen"], // because in the newest versions of WebKit based browsers this event is unexposed,
          // but it is still dispatched the string value is fixed (not detected)
          endfullscreen: fsApiVersionsMap.mediaonly["endfullscreen"], // ditto
        },
        /*
         * HTML5 fully blown fullscreen API in different flavours. There are differences in function names
         * and naming conventions between implementations of fullscreen API so we list all of known versions
         * and map them to those specified in WHATWG Fullscreen API Living Standard — Last Updated 29 September 2015.
         * Eventually we are trying to determine which combination does current browser use (if any).
         */
        full: {
          requestFullscreen: "",
          exitFullscreen: "",
          fullscreenEnabled: "",
          fullscreenElement: "",
          isFullscreen: "",
          fullscreenchange: "",
          fullscreenerror: "",
        },
      },
      prefix = $p.userAgent.prefix.lowercase;

    // find if there are two distinctive values
    fullscreenApi.mediaonly.enterFullscreen = $p.utils.hasProp(
      videoElement,
      fsApiVersionsMap.mediaonly.enterFullscreen.slice(),
      prefix
    );
    fullscreenApi.full.exitFullscreen = $p.utils.hasProp(
      document,
      fsApiVersionsMap.full.exitFullscreen.slice(),
      prefix
    );

    // if there is full fullscreen API support then of course the mediaonly is also supported
    if (!!fullscreenApi.full.exitFullscreen) {
      fullscreenApi.type = "full";
    } else if (!!fullscreenApi.mediaonly.enterFullscreen) {
      fullscreenApi.type = "mediaonly";
    }

    // detect versions of all other functions/properties/events
    switch (fullscreenApi.type) {
      case "mediaonly":
        fullscreenApi.mediaonly.exitFullscreen = $p.utils.hasProp(
          videoElement,
          fsApiVersionsMap.mediaonly.exitFullscreen.slice(),
          prefix
        );
        fullscreenApi.mediaonly.supportsFullscreen = $p.utils.hasProp(
          videoElement,
          fsApiVersionsMap.mediaonly.supportsFullscreen.slice(),
          prefix
        );
        fullscreenApi.mediaonly.displayingFullscreen = $p.utils.hasProp(
          videoElement,
          fsApiVersionsMap.mediaonly.displayingFullscreen.slice(),
          prefix
        );
        break;

      case "full":
        fullscreenApi.full.requestFullscreen = $p.utils.hasProp(
          videoElement,
          fsApiVersionsMap.full.requestFullscreen.slice(),
          prefix
        );
        fullscreenApi.full.fullscreenEnabled = $p.utils.hasProp(
          document,
          fsApiVersionsMap.full.fullscreenEnabled.slice(),
          prefix
        );
        fullscreenApi.full.fullscreenElement = $p.utils.hasProp(
          document,
          fsApiVersionsMap.full.fullscreenElement.slice(),
          prefix
        );
        fullscreenApi.full.isFullscreen = $p.utils.hasProp(
          document,
          fsApiVersionsMap.full.isFullscreen.slice(),
          prefix
        );

        // Internet Explorer 11 and IEMobile on Windows Phone 8.1
        if (prefix === "ms") {
          fullscreenApi.full.fullscreenchange = "onMSFullscreenChange";
          fullscreenApi.full.fullscreenerror = "onMSFullscreenError";
        } else {
          fullscreenApi.full.fullscreenchange = $p.utils.hasProp(
            document,
            fsApiVersionsMap.full.fullscreenchange.slice()
          );
          fullscreenApi.full.fullscreenerror = $p.utils.hasProp(
            document,
            fsApiVersionsMap.full.fullscreenerror.slice()
          );
        }
        break;
    }

    return fullscreenApi;
  })();
})(window, document, jQuery, projekktor);
/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2015 Radosław Włodkowski, radoslaw@wlodkowski.net
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 */
var projekktorPersistentStorage = (function (window, document, $, $p){

    "use strict";
    
function projekktorPersistentStorage(pp){
    this.pp = pp;
}

projekktorPersistentStorage.prototype = (function () {
    var persistentStorage = {

        save: function (key, value) {
            var ns = this.pp.getNS(),
                nskey = ns + '_' + key;

            if (window.$p.features.localstorage) {
                try {
                    window.localStorage.setItem(nskey, JSON.stringify(value));
                    return true;
                } catch (e) {
                    return false;
                }
            }
        },

        restore: function (key) {
            var ns = this.pp.getNS(),
                nskey = ns + '_' + key;

            if (window.$p.features.localstorage){
                try {
                    return JSON.parse(window.localStorage.getItem(nskey));
                } catch (e) {}
            }
        },

        remove: function(key) {
            var ns = this.pp.getNS(),
                nskey = ns + '_' + key;

            if (window.$p.features.localstorage){
                try {
                    window.localStorage.removeItem(nskey);
                } catch (e) {}
            }
        },

        list: function() {
            var ns = this.pp.getNS() + '_',
                regexp = new RegExp('^' + ns),
                result = {},
                key;

            if (window.$p.features.localstorage){
                try {
                    for (key in window.localStorage){
                        if(regexp.test(key)){
                            result[key] = window.localStorage.getItem(key);
                        }
                    }
                } catch (e) {}
            }

            return result;
        },

        clear: function() {
            var ns = this.pp.getNS() + '_',
                regexp = new RegExp('^' + ns),
                key;

            if (window.$p.features.localstorage){
                try {
                    for (key in window.localStorage){
                        if(regexp.test(key)){
                            window.localStorage.removeItem(key);
                        }
                    }
                } catch (e) {}
            }
        }
    };

    return persistentStorage;
})();

return projekktorPersistentStorage;

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010, 2011, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2014-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 */

(function(window, document, $, $p){

    "use strict";
    
    var testVideoEl = document.createElement('video');

    $p.platforms = {
        videojs: function() {
            return "1";
        },

        /**
         * returns 1 if MSE is available 0 otherwise
         */
        mse: function() {
            return $p.features.mse ? "1" : "0";
        },

        android: function () {
            if($p.userAgent.os.name === "Android"){
                return $p.userAgent.os.version || "0";
            }
            return "0";
        },

        ios: function () {
            if($p.userAgent.os.name === "iOS"){
                return $p.userAgent.os.version || "0";
            }
            return "0";
        },

        native: function (type) {
            switch (testVideoEl.canPlayType(type)) {
                    case null:
                    case "no":
                    case "":
                        return "0";
                    case "maybe":
                    case "probably":
                    default:
                        return "1";
            }
        },
        
        browser: function () {
            return "1";
        }
    };
    
}(window, document, jQuery, projekktor));
(function (window, document, $, $p) {

    "use strict";

        var drmSystems = {
                widevine: ['com.widevine.alpha'],
                playready: ['com.microsoft.playready', 'com.youtube.playready'],
                clearkey: ['webkit-org.w3.clearkey', 'org.w3.clearkey'],
                primetime: ['com.adobe.primetime', 'com.adobe.access'],
                fairplay: ['com.apple.fairplay']
            },
            supportedDrmSystems = [],
            emeType = getEmeType(),
            testConfig = [{
                initDataTypes: ['cenc', 'webm'],
                sessionTypes: ['temporary'],
                audioCapabilities: [{
                        contentType: 'audio/mp4; codecs="mp4a.40.5"',
                        robustness: 'SW_SECURE_CRYPTO'
                    },
                    {
                        contentType: 'audio/mp4; codecs="mp4a.40.2"',
                        robustness: 'SW_SECURE_CRYPTO'
                    },
                    {
                        contentType: 'audio/webm; codecs="vorbis"',
                        robustness: 'SW_SECURE_CRYPTO'
                    },
                ],
                videoCapabilities: [{
                        contentType: 'video/webm; codecs="vp9"',
                        robustness: 'HW_SECURE_ALL'
                    },
                    {
                        contentType: 'video/webm; codecs="vp9"',
                        robustness: 'SW_SECURE_DECODE'
                    },
                    {
                        contentType: 'video/mp4; codecs="avc1.640028"',
                        robustness: 'HW_SECURE_ALL'
                    },
                    {
                        contentType: 'video/mp4; codecs="avc1.640028"',
                        robustness: 'SW_SECURE_DECODE'
                    },
                    {
                        contentType: 'video/mp4; codecs="avc1.4d401e"',
                        robustness: 'HW_SECURE_ALL'
                    },
                    {
                        contentType: 'video/mp4; codecs="avc1.4d401e"',
                        robustness: 'SW_SECURE_DECODE'
                    },
                ],
            }];

        function getEmeType() {

            if (navigator.requestMediaKeySystemAccess &&
                MediaKeySystemAccess.prototype.getConfiguration) {
                return 'eme'; // current EME as of 16 March 2017
            } else if (HTMLMediaElement.prototype.webkitGenerateKeyRequest) {
                return 'webkit'; // webkit-prefixed EME v0.1b
            } else if (HTMLMediaElement.prototype.generateKeyRequest) {
                return 'oldunprefixed'; // nonprefixed EME v0.1b
            } else if (window.MSMediaKeys) {
                return 'ms'; // ms-prefixed EME v20140218
            } else {
                return 'none'; // EME unavailable
            }
        }

        function msIsTypeSupportedPromissified(keySystem) {
            return new Promise(function (resolve, reject) {
                var e;
                if (window.MSMediaKeys.isTypeSupported && window.MSMediaKeys.isTypeSupported(keySystem)) {
                    resolve({
                        keySystem: keySystem
                    });
                } else {
                    e = new Error('Unsupported keySystem');
                    e.name = 'NotSupportedError';
                    e.code = DOMException.NOT_SUPPORTED_ERR;
                    reject(e);
                    throw e;
                }
            });
        }

        function getSupportedDrmSystems() {
            var ref = this,
                isKeySupported,
                promises = [];

            if (emeType === 'eme') {
                isKeySupported = window.navigator.requestMediaKeySystemAccess.bind(window.navigator);
            } 
            else if (emeType === 'ms') {
                isKeySupported = msIsTypeSupportedPromissified;
            }
            else {
                // if there is no EME then resolve promise immediately
                return Promise.resolve();
            }

            Object.keys(drmSystems).forEach(function(keySystemName) {
                var keySystemNS = drmSystems[keySystemName];

                keySystemNS.forEach(function (ks) {
                    promises.push(isKeySupported(ks, testConfig).then(
                        function (val) {
                            supportedDrmSystems.push(keySystemName);
                        },
                        function (error) {
                            // skip
                        }
                    ));
                }, ref);
            });

            return Promise.all(promises);
        };

        $p.initPromises.push(
            getSupportedDrmSystems().then(function (val) {
                $p.drm = {
                    supportedDrmSystems: supportedDrmSystems,
                    drmSystems: drmSystems,
                    emeType: emeType
                };
                return Promise.resolve();
            })
        );
}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010-2013 Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 */
var projekktorPluginInterface = (function (window, document, $, $p){

    "use strict";
    
    function projekktorPluginInterface() {}

    projekktorPluginInterface.prototype = {

        pluginReady: false,
        reqVer: null,
        name: '',
        pp: {},
        config: {},
        playerDom: null,

        _appliedDOMObj: [],
        _pageDOMContainer: {},
        _childDOMContainer: {},

        _init: function (pluginConfig) {
            this.config = $.extend(true, this.config, pluginConfig);
            if (this.reqVer != null) {
                if (!$p.utils.versionCompare(this.pp.getVersion(), this.reqVer)) {
                    alert("Plugin '" + this.name + "' requires Projekktor v" + this.reqVer + " or later! Please visit http://www.projekktor.com and get the most recent version.");
                    this.pluginReady = true;
                    return;
                }
            }
            this.initialize();
        },

        getConfig: function (idx, defaultValue) {
            var result = null,
                def = defaultValue || null;

            if (this.pp.getConfig('plugin_' + this.name) != null) {
                result = this.pp.getConfig('plugin_' + this.name)[idx];
            }

            if (result == null) {
                result = this.pp.getConfig(idx);
            }

            if (result == null) {
                result = this.config[idx];
            }

            if ($.isPlainObject(result)) {
                result = $.extend(true, {}, result, this.config[idx]);
            } else if ($.isArray(result)) {
                result = $.extend(true, [], this.config[idx] || [], result || []);
            }

            if (idx == undefined) {
                return this.pp.getConfig();
            }
            return (result == null) ? def : result;
        },

        getDA: function (name) {
            return 'data-' + this.pp.getNS() + '-' + this.name + '-' + name;
        },

        getCN: function (name) {
            return this.pp.getNS() + name;
        },

        sendEvent: function (eventName, data) {
            this.pp._promote({
                _plugin: this.name,
                _event: eventName
            }, data);
        },

        deconstruct: function () {
            this.pluginReady = false;
            $.each(this._appliedDOMObj, function () {
                $(this).off();
            });
        },

        /**
         * applies a new dom element to the player in case it is not yet present
         * also transparently applies the cssclass prefix as configured
         *
         * @private
         * @element (Object) the element
         * @fu (String) function, default 'container'
         * @visible (Boolean) display on init, default is 'false'
         * @return (Object) the element
         */
        applyToPlayer: function (element, fu, visible) {
            if (!element) {
                return null;
            }

            var func = fu || 'container',
                tmpClass = '',
                ref = this;

            try {
                tmpClass = element.attr("class") || this.name;
            } catch (e) {
                tmpClass = this.name;
            }

            this._pageDOMContainer[func] = $("[" + this.getDA('host') + "='" + this.pp.getId() + "'][" + this.getDA('func') + "='" + func + "']");
            this._childDOMContainer[func] = this.playerDom.find("[" + this.getDA('func') + "='" + func + "'],." + this.getCN(tmpClass) + ":not([" + this.getDA('func') + "=''])");

            // check if this element already exists somewhere on page
            if (this._pageDOMContainer[func].length > 0) {
                this._pageDOMContainer[func].removeClass('active').addClass('inactive');

                $.each(this._pageDOMContainer[func], function () {
                    ref._appliedDOMObj.push($(this));
                });

                return this._pageDOMContainer[func];
            }

            // add new DOM container to the player
            if (this._childDOMContainer[func].length == 0) {
                element
                    .removeClass(tmpClass)
                    .addClass(this.pp.getNS() + tmpClass)
                    .removeClass('active')
                    .addClass('inactive')
                    .attr(this.getDA('func'), func)
                    .appendTo(this.playerDom);

                this._childDOMContainer[func] = element;
                this._appliedDOMObj.push(element);
                if (visible === true) {
                    element.addClass('active').removeClass('inactive');
                }

                return element;
            } else {
                $.each(this._childDOMContainer[func], function () {
                    $(this).attr(ref.getDA('func'), func);
                    ref._appliedDOMObj.push($(this));
                });
            }

            if (visible === true) {
                this._childDOMContainer[func].addClass('active').removeClass('inactive');
            }

            return $(this._childDOMContainer[func][0]);
        },

        getElement: function (name) {
            return this.pp.env.playerDom.find('.' + this.pp.getNS() + name);
        },

        setInactive: function () {
            $(this._pageDOMContainer['container']).removeClass('active').addClass('inactive');
            $(this._childDOMContainer['container']).removeClass('active').addClass('inactive');
            this.sendEvent('inactive', $.extend(true, {}, this._pageDOMContainer['container'], this._childDOMContainer['container']));
        },

        setActive: function (elm, on) {
            var dest = (typeof elm == 'object') ? elm : this.getElement(elm);

            if (elm == null) {
                this._pageDOMContainer['container'].removeClass('inactive').addClass('active');
                this._childDOMContainer['container'].removeClass('inactive').addClass('active');
                this.sendEvent('active', $.extend(true, {}, this._pageDOMContainer['container'], this._childDOMContainer['container']));
                return dest;
            }

            if (on != false) {
                dest.addClass('active').removeClass('inactive');
            } else {
                dest.addClass('inactive').removeClass('active');
            }

            dest.css('display', '');

            return dest;
        },

        getActive: function (elm) {
            return $(elm).hasClass('active');
        },

        // triggered on plugin-instantiation
        initialize: function () {},

        isReady: function () {
            return this.pluginReady;
        },

        clickHandler: function (what) {
            try {
                this.pp[this.getConfig(what + 'Click').callback](this.getConfig(what + 'Click').value);
            } catch (e) {
                try {
                    this.getConfig(what + 'Click')(this.getConfig(what + 'Click').value);
                } catch (e) {}
            }
            return false;
        },
        
        // important
        eventHandler: function () {}
    };

    return projekktorPluginInterface;

}(window, document, jQuery, projekktor));var projekktorMessages = (function (window, document, $, $p) {

    "use strict";

    return {

        // controlbar 
        "play": "odtwarzaj",
        "pause": "pauza",
        "fsexit": "wyłącz widok pełnoekranowy",
        "fsenter": "włącz widok pełnoekranowy",
        "settingsbtn": "ustawienia",
        "vmax": "maksymalna głośność",
        "vslider": "głośność",
        "vmarker": "głośność",
        "vknob": "głośność",
        "mute": "wycisz",
        "timeleft": "czas materiału",
        "golive": "na żywo",
        "scrubberdrag": "przewiń",
        "subtitlesbtn": "napisy",
        "prevC": "poprzedni",
        "nextC": "następny",

        // settings 
        "help": "pomoc:",
        "keyboard controls": "klawiatura",
        "debug": "debug",
        "player info": "info",
        "platform": "platforma",
        "platform_flash": "Flash",
        "platform_native": "HTML5",
        "platform_mse": "MSE",
        "auto": "auto",
        "quality": "jakość",
        "high": "wysoka",
        "medium": "średnia",
        "low": "niska",

        // settings
        'ok': 'OK',
        'report': 'Zgłoś błąd',
        'cancel': 'anuluj',
        'continue': 'dalej',
        'sendto': 'Wyślij informację do administratora strony.',
        'please': 'Opisz błąd, który wystąpił na tyle dokładnie na ile to możliwe.',
        'thanks': 'Dziękujemy.',
        'error': 'Wystąpił błąd',
        'help1': '<em>spacja</em> odtwarzanie / pauza',
        'help2': '<em>góra</em><em>dół</em> głośność <em>lewo</em><em>prawo</em> przewijanie',
        'help3': '<em>ENTER</em> pełen ekran',
        'help4': 'Aby korzystać ze skrótów klawiaturowych wskaźnik myszy musi być na obszarze odtwarzacza.',

        // flash & native:
        "error0": '#0 Wystąpił nieznany błąd. Przepraszamy.',
        "error1": '#1 Anulowałeś odtwarzanie.',
        "error2": '#2 Problem sieciowy spowodował przerwanie ściągania pliku.',
        "error3": '#3 Odtwarzanie zostało przerwane ze względu na uszkodzenie pliku. Przepraszamy.',
        "error4": '#4 Wideo (%{title}) nie może zostać załadowane ze względu na problem z siecią bądź serwerem.',
        "error5": '#5 Przepraszamy, ale Twoja przeglądarka nie obsługuje wybranego formatu wideo. Skorzystaj z innej przeglądarki bądź zainstaluj plugin Adobe Flash.',
        "error6": '#6 Twoja przeglądarka nie posiada obsługi pluginu Flash w wersji %{flashver} bądź wyższej.',
        "error7": '#7 Brak plików do odtworzenia.',
        "error8": '#8 ! Skonfigurowano błędny model odtwarzania !',
        "error9": '#9 Plik (%{file}) nie został odnaleziony.',
        "error10": '#10 Błędne lub brakujące ustawienia jakości dla %{title}.',
        "error11": '#11 Błędny streamType i/lub streamServer dla %{title}.',
        "error12": '#12 Błędne lub niespójne ustawienia jakości dla %{title}.',
        "error13": '#13 Błędna playlista bądź brakujący/nieprawidłowy parser playlisty. Brak plików do odtworzenia.',
        "error20": '#20 Błędny lub uszkodzony parser.',
        "error80": '#80 Przepraszamy. Wideo nie może zostać odtworzone. Jeśli korzystasz z programów blokujących reklamy i/lub skrypty, wyłącz je, a następnie odśwież stronę i ponów próbę.',
        "error97": 'Brak multimediów do odtworzenia.',
        "error98": 'Błędne lub niespójne dane playlisty!',
        "error99": 'Kliknij ekran aby kontynuować.',
        "error100": 'Skróty klawiaturowe',

        "error200": 'Upłynął limit czasu żądania',

        // DRM errors
        "error300": "#300 Brak wsparcia dla systemów DRM użytych do zaszyfrowania tego pliku audio/video.",
        "error301": "#301 System DRM jest wymagadny do odtworzenia tego pliku lecz nie znaleziono konfiguracji dla serwera licencyjnego.",
        "error302": "#302 Licencja DRM nieprawidłowa bądź serwer licencyjny nie jest dostępny.",

        // youtube errors: 
        "error500": 'To wideo zostało usunięte albo zostało ustawione jako prywatne',
        "error501": 'Użytkownik Youtube będący właścicielem tego wideo wyłączył możliwość jego załączania na serwisach zewnętrznych.',
        "error502": 'Błędnie ustawione Youtube Video-Id.'
    };

}(window, document, jQuery, projekktor));
/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010, 2011, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 */
var playerModel = (function(window, document, $, $p){

    "use strict";

    function playerModel() {}

    playerModel.prototype = {
        modelId: 'player',
        browserVersion: '1.0',
        iLove: [],
        platform: ['browser'],
        // all the player states
        _currentState: null,
        _currentBufferState: 'EMPTY', // EMPTY / FULL
        _currentSeekState: null,
        _ap: false, // autoplay
        _volume: 1, // async
        _fixedVolume: false,
        _muted: false,
        _quality: 'auto',
        _displayReady: false,
        _isPlaying: false,
        _isReady: false,
        _isDVR: false,
        _isLive: false,
        _id: null,
        // experimental
        _KbPerSec: 0,
        _bandWidthTimer: null,
        // flags
        _isPoster: false,
        _isFullscreen: false,
        hasGUI: false,
        allowRandomSeek: false,
        mediaElement: null,
        pp: {},
        media: {
            duration: 0,
            position: 0,
            maxpos: 0,
            file: false,
            poster: '',
            ended: false,
            loadProgress: 0,
            errorCode: 0
        },
        /*******************************
         *        CORE
         *******************************/
        _init: function (params) {
            this.pp = params.pp || null;
            this.media = $.extend(true, {}, this.media, params.media);
            this.mediaId = params.media.id;
            this._ap = params.autoplay;
            this._isFullscreen = params.fullscreen;
            this._id = $p.utils.randomId(8);
            this._quality = params.quality || this._quality;
            this._volume = params.environment.volume;
            this._muted = params.environment.muted;
            this.init();
        },
        init: function (params) {
            this.ready();
        },
        ready: function () {
            this.sendUpdate('modelReady');
            this._isReady = true;
            if (!this._ap) {
                this.displayItem(false);
            }
            else {
                this.displayReady();
            }
        },
        /* apply poster while sleeping or get ready for true multi media action */
        displayItem: function (showMedia) {
            // reset
            this._displayReady = false;
            this._isPoster = false;

            this.pp.removeListener('fullscreen.poster');
            this.pp.removeListener('resize.poster');

            // poster
            if (showMedia !== true || this.getState('STOPPED')) {
                this._setState('idle');
                this.applyImage(this.getPoster(), this.pp.getMediaContainer().html(''));
                this._isPoster = true;
                this.displayReady();
                return;
            }

            // media
            $('#' + this.pp.getMediaId() + "_image").remove();
            // apply media
            this.applyMedia(this.pp.getMediaContainer());
        },
        applyMedia: function () {
        },
        sendUpdate: function (type, value) {
            // type = type.toLowerCase();
            this.pp._modelUpdateListener(type, value);
            if (type == 'error') {
                this.removeListeners();
                this.detachMedia();
                this._setState('error');
            }
        },
        /* wait for the playback element to initialize */
        displayReady: function () {
            this._displayReady = true;
            this.pp._modelUpdateListener('displayReady');
        },
        start: function () {

            if (this.mediaElement == null && this.modelId !== 'PLAYLIST') {
                return;
            }

            if (this.getState('STARTING')) {
                return;
            }

            // check if there is start position configured
            // and try to seek to it before play
            // TODO: this is definitely sub-optimal solution
            // and probably not working on some platform
            // We need to use per-platform/model approach
            // using Temporal Dimension of Media Fragments URI etc.
            if($.isNumeric(this.media.config.start)){
                this.setSeek(this.media.config.start);
            }

            this._setState('STARTING');

            if (!this.getState('STOPPED')) {
                this.addListeners();
            }

            this.applyCommand('volume', this.pp.getVolume());

            this.setPlay();
        },
        addListeners: function () {
        },
        removeListeners: function () {
            try {
                this.mediaElement.off('.projekktor' + this.pp.getId());
            } catch (e) {
            }
        },
        detachMedia: function () {
        },
        destroy: function () {

            this.removeListeners();

            if (!this.getState('IDLE')) {
                this._setState('destroying');
            }

            this.detachMedia();

            try {
                $('#' + this.mediaElement.id).empty();
            } catch (e) {
            }

            this.mediaElement = null;

            this.media.loadProgress = 0;
            this.media.playProgress = 0;
            this.media.frame = 0;
            this.media.position = 0;
            this.media.duration = 0;
        },
        applyCommand: function (command, value) {
            switch (command) {
                case 'quality':
                    this.setQuality(value);
                    break;
                case 'error':
                    this._setState('error');
                    this.pp._modelUpdateListener('error', value);
                    break;
                case 'play':
                    if (this.getState('ERROR')) {
                        break;
                    }
                    if (this.getState('IDLE')) {
                        this._setState('awakening');
                        break;
                    }
                    this.setPlay();
                    break;
                case 'pause':
                    if (this.getState('ERROR')) {
                        break;
                    }
                    this.setPause();
                    break;
                case 'volume':
                    if (this.getState('ERROR')) {
                        break;
                    }
                    this.setVolume(value);
                    break;
                case 'stop':
                    this.setStop();
                    break;
                case 'frame':
                    this.setFrame(value);
                    break;
                case 'seek':
                    if (this.getState('ERROR')) {
                        break;
                    }

                    if (this.getSeekState('SEEKING')) {
                        break;
                    }

                    if (this.getState('IDLE')) {
                        break;
                    }

                    if (this.media.loadProgress == -1) {
                        break;
                    }

                    this._setSeekState('seeking', value);
                    this.setSeek(value);
                    break;
                case 'fullscreen':
                    /*
                     * It is vital to first tell the controller what happened in order to have an already altered DOM
                     * before processing further scaling processes.
                     * This is a break in the logic but seems to work.
                     */
                    if (value !== this._isFullscreen) {
                        this._isFullscreen = value;
                        this.setFullscreen();
                    }
                    break;
                case 'resize':
                    this.setResize();
                    this.sendUpdate('resize', value);
                    break;
            }
        },
        /*******************************
         *   PUBLIC ELEMENT SETTERS
         *******************************/
        setFrame: function (frame) {
            var newPos = (frame / this.pp.getConfig('fps')) + 0.00001;
            this.setSeek(newPos);
        },
        setSeek: function (newpos) {
        },
        setPlay: function () {
        },
        setPause: function () {
        },
        setStop: function () {
            this.detachMedia();
            this._setState('stopped');
            // this._ap=false;
            this.displayItem(false);

        },
        setVolume: function (volume) {
            this.volumeListener(volume);
        },
        setMuted: function(muted) {

        },
        setFullscreen: function (inFullscreen) {
            this.sendUpdate('fullscreen', this._isFullscreen);
            this.setResize();
        },
        setResize: function () {
            if (this.element === 'audio' || this.getState('ERROR')) {
                return;
            }
            this._scaleVideo();
        },
        setPosterLive: function () {
        },
        setSrc: function(src) {
            try {
                this.media.file[0].src = src;
            } catch (e) {}
        },
        setQuality: function (quality) {
            if (this._quality === quality) {
                return;
            }

            this._quality = quality;

            try {
                this.applySrc();
            }
            catch (e) {
            }

            this.qualityChangeListener();
        },
        /*******************************
         ELEMENT GETTERS
         *******************************/
        getId: function () {
            return this.mediaId;
        },
        getQuality: function () {
            return this._quality;
        },
        getVolume: function () {
            return this._volume;
        },
        getMuted: function () {
            return this._muted;
        },
        getLoadProgress: function () {
            return this.media.loadProgress || 0;
        },
        getLoadPlaybackProgress: function () {
            return this.media.playProgress || 0;
        },
        getPosition: function () {
            return this.media.position || 0;
        },
        getFrame: function () {
            return this.media.frame || 0;
        },
        getDuration: function () {
            return this.media.duration || this.pp.getConfig('duration') || 0;
        },
        getMaxPosition: function () {
            return this.media.maxpos || 0;
        },
        getPlaybackQuality: function () {
            return ($.inArray(this._quality, this.media.qualities) > -1) ? this._quality : 'auto';
        },
        getIsFullscreen: function () {
            return this.pp.getIsFullscreen();
        },
        getKbPerSec: function () {
            return this._KbPerSec;
        },
        getState: function (isThis) {
            var result = (this._currentState == null) ? 'IDLE' : this._currentState;
            if (isThis != null) {
                return (result == isThis.toUpperCase());
            }
            return result;
        },
        getBufferState: function (isThis) {
            var result = this._currentBufferState;
            if (isThis != null) {
                return (result === isThis.toUpperCase());
            }
            return result;
        },
        getSeekState: function (isThis) {
            var result = (this._currentSeekState == null) ? 'NONE' : this._currentSeekState;
            if (isThis != null) {
                return (result == isThis.toUpperCase());
            }
            return result;
        },
        getSrc: function () {
            try {
                return this.mediaElement.get(0).currentSrc;
            }
            catch (e) {
            }

            try {
                return this.media.file[0].src;
            }
            catch (e) {
            }

            try {
                return this.getPoster();
            }
            catch (e) {
            }
            return null;
        },
        getModelName: function () {
            return this.modelId || null;
        },
        getMediaElementId: function() {
            try {
                return this.pp.getMediaId() + "_" + this.getModelName().toLowerCase();
            }
            catch(e){
                return "";
            }
        },
        getHasGUI: function () {
            return (this.hasGUI && !this._isPoster);
        },
        getIsReady: function () {
            return this._isReady;
        },
        getPoster: function (type) {
            var type = type || 'poster',
                result = null,
                cfg = this.pp.getConfig(type),
                qual = 'default',
                quals = [];

            if (typeof cfg !== 'object') {
                return cfg;
            }

            for (var i in cfg) {
                if (cfg[i].quality) {
                    quals.push(cfg[i].quality);
                }
            }

            qual = this.pp.getAppropriateQuality(quals);

            for (var j in cfg) {
                if (cfg[j].src != undefined && (cfg[j].quality == qual || result == "" || qual == "default")) {
                    result = cfg[j].src;
                }
            }
            return result;
        },
        getMediaElement: function () {
            return this.mediaElement || $('<video/>');
        },
        getMediaDimensions: function () {
            return {
                width: this.media.videoWidth || 0,
                height: this.media.videoHeight || 0
            };
        },
        getSource: function () {

            var resultSrc = [],
                ref = this;

            $.each(this.media.file || [], function () {
                // set proper quality source
                if (ref._quality !== this.quality && ref._quality !== null) {
                    return true;
                }

                resultSrc.push(this);
                return true;
            });

            if (resultSrc.length === 0) {
                return this.media.file;
            }
            else {
                return resultSrc;
            }
        },
        /*******************************
         *      ELEMENT LISTENERS
         *******************************/
        timeListener: function (obj) {
            if (typeof obj !== 'object' || obj === null) {
                return;
            }

            var position = parseFloat((obj.position || obj.currentTime || this.media.position || 0).toFixed(2)),
                duration = null;

            /*
             * When the duration is POSITIVE_INFINITY then we're dealing with a native live stream (e.g. HLS)
             */
            if (obj.duration === Number.POSITIVE_INFINITY && obj.seekable && obj.seekable.length) {

                /*
                 * When the seekable.end(0) === POSITIVE_INFINITY we don't have any option to determine DVR window,
                 * so we set _isLive to true and propagate streamTypeChange event with 'live' value
                 */
                if(obj.seekable.end(0) === Number.POSITIVE_INFINITY){
                    // set live and DVR flag to true and propagate streamTypeChange event with 'dvr' value (mainly to the controlbar plugin)
                    if (!this._isLive) {
                        this._isLive = true;
                        this._isDVR = false;
                        this.sendUpdate('streamTypeChange', 'live');
                    }
                }
                /*
                 * Otherwise we've got DVR stream
                 */
                else {
                    // set live and DVR flag to true and propagate streamTypeChange event with 'dvr' value (mainly to the controlbar plugin)
                    if (!this._isDVR && !this._isLive) {
                        this._isLive = true;
                        this._isDVR = true;
                        this.sendUpdate('streamTypeChange', 'dvr');
                    }
                    /*
                     * When seekable.start(0) is >0 the seekable.start is probably set properly (e.g. Safari 7.0.5 on OS X 10.9.4)
                     * so we could use it to determine DVR window duration
                     */
                    if (obj.seekable.start(0) > 0) {
                        duration = parseFloat((obj.seekable.end(0) - obj.seekable.start(0)).toFixed(2));
                    }
                    /*
                     * When seekable.start(0) == 0 then the only way to determine DVR window is to get the first known seekable.end(0)
                     * value and store it for the whole live session (e.g. Safari 7.0 on iOS 7.1.2).
                     * It's not 100% reliable method, but it's the best estimation we could possibly get.
                     */
                    else {
                        if (obj.seekable.end(0) > 0 && this.media.duration === 0) {
                            duration = parseFloat(obj.seekable.end(0).toFixed(2));
                        }
                        else {
                            duration = this.media.duration;
                        }
                    }
                    position = (duration - (obj.seekable.end(0) - obj.currentTime));
                    position = position < 0 ? 0 : parseFloat(position.toFixed(2));
                }
            }
            /*
             * If duration is a number
             */
            else if (!isNaN(obj.duration)) {
                duration = obj.duration > position ? parseFloat((obj.duration || 0).toFixed(2)) : 0; // Android native browsers tend to report bad duration (1-100s)
            }

            // duration has changed:
            if (duration !== null && (duration !== this.media.duration)) {
                this.media.duration = duration;
                this.sendUpdate('durationChange', duration);
            }

            this.media.position = position;

            this.media.maxpos = Math.max(this.media.maxpos || 0, this.media.position || 0);
            this.media.playProgress = parseFloat((this.media.position > 0 && this.media.duration > 0) ? this.media.position * 100 / this.media.duration : 0);
            this.media.frame = this.media.position * this.pp.getConfig('fps');

            this.sendUpdate('time', this.media.position);

            this.loadProgressUpdate();
        },
        loadProgressUpdate: function () {

            var me = this.mediaElement.get(0),
                progress = 0;

            if (this.media.duration === 0) {
                return;
            }
            if (typeof me.buffered !== 'object') {
                return;
            }
            if (me.buffered.length === 0 && me.seekable.length === 0) {
                return;
            }
            if (this.media.loadProgress === 100) {
                return;
            }

            if (me.seekable && me.seekable.length > 0) {
                progress = Math.round(me.seekable.end(0) * 100 / this.media.duration);
            } else {
                progress = Math.round(me.buffered.end(me.buffered.length - 1) * 100) / this.media.duration;
            }

            if (this.media.loadProgress > progress) {
                return;
            }

            this.media.loadProgress = (this.allowRandomSeek === true) ? 100 : -1;
            this.media.loadProgress = (this.media.loadProgress < 100 || this.media.loadProgress === undefined) ? progress : 100;

            this.sendUpdate('progress', this.media.loadProgress);

        },
        progressListener: function (obj, evt) {

            // we prefer time ranges but keep catching "progress" events by default
            // for historical and compatibility reasons:
            if (this.mediaElement instanceof jQuery) { // fix this - make sure all instances are jquery objects
                if (typeof this.mediaElement.get(0).buffered === 'object') {
                    if (this.mediaElement.get(0).buffered.length > 0) {
                        this.mediaElement.off('progress');
                        return;
                    }
                }
            }

            if (this._bandWidthTimer == null) {
                this._bandWidthTimer = (new Date()).getTime();
            }

            var current = 0,
                total = 0;

            try {
                if (!isNaN(evt.loaded / evt.total)) {
                    current = evt.loaded;
                    total = evt.total;
                } else if (evt.originalEvent && !isNaN(evt.originalEvent.loaded / evt.originalEvent.total)) {
                    current = evt.originalEvent.loaded;
                    total = evt.originalEvent.total;
                }
            } catch (e) {
                if (obj && !isNaN(obj.loaded / obj.total)) {
                    current = obj.loaded;
                    total = obj.total;
                }
            }

            var loadedPercent = (current > 0 && total > 0) ? current * 100 / total : 0;

            if (Math.round(loadedPercent) > Math.round(this.media.loadProgress)) {
                this._KbPerSec = ((current / 1024) / (((new Date()).getTime() - this._bandWidthTimer) / 1000));
            }

            loadedPercent = (this.media.loadProgress !== 100) ? loadedPercent : 100;
            loadedPercent = (this.allowRandomSeek === true) ? 100 : 5 * Math.round(loadedPercent / 5);

            if (this.media.loadProgress != loadedPercent) {
                this.media.loadProgress = loadedPercent;
                this.sendUpdate('progress', loadedPercent);
            }

            // Mac flash fix:
            if (this.media.loadProgress >= 100 && this.allowRandomSeek === false) {
                this._setBufferState('FULL');
            }
        },
        qualityChangeListener: function () {
            this.sendUpdate('qualityChange', this._quality);
        },
        endedListener: function (obj) {
            if (this.mediaElement === null) {
                return;
            }
            if (this.media.maxpos <= 0) {
                return;
            }
            if (this.getState() === 'STARTING') {
                return;
            } 
            this._setState('completed');
        },
        waitingListener: function (event) {
            this._setBufferState('EMPTY');
        },
        canplayListener: function (obj) {
            this._setBufferState('FULL');
        },
        canplaythroughListener: function (obj) {
            this._setBufferState('FULL');
        },
        playingListener: function (obj) {
            this._setState('playing');
        },
        pauseListener: function (obj) {
            this._setState('paused');
        },
        fullscreenchangeListener: function(value){
            this.applyCommand('fullscreen', value);
        },
        resizeListener: function(obj) {
            try {
                if(this.media.videoWidth !== obj.videoWidth || this.media.videoHeight !== obj.videoHeight){
                    this.media.videoWidth = obj.videoWidth;
                    this.media.videoHeight = obj.videoHeight;
                    this._scaleVideo();
                }
            }
            catch(e){
                $p.log('resizeListener error', e);
            }
        },
        seekedListener: function (value) {
            this._setSeekState('SEEKED', value || this.media.position);
        },
        volumeListener: function (obj) {
            var newVolume = obj.volume !== void(0) ? parseFloat(obj.volume) : parseFloat(obj);
            if(newVolume !== this._volume) {
                this._volume = newVolume;
                
                // mute / unmute 
                this.setMuted(this._volume === 0);
                this.sendUpdate('volume', newVolume);
            }
        },
        errorListener: function (event, obj) {
        },
        nullListener: function (obj) {
        },
        applySrc: function () {
        },
        applyImage: function (url, destObj) {

            var imageObj = $('<img/>').hide(),
                currentImageObj = $("." + this.pp.getMediaId() + "_image"),
                // select by class to workaround timing issues causing multiple <img> of the same ID being present in the DOM
                ref = this;

            $p.utils.blockSelection(imageObj);

            // empty URL... apply placeholder
            if (url == null || url === false) {
                currentImageObj.remove();
                return $('<img/>').attr({
                    "id": this.pp.getMediaId() + "_image",
                    "src": $p.utils.imageDummy()
                }).appendTo(destObj);
            }

            // no changes
            if ($(currentImageObj[0]).attr('src') == url) {
                if ($p.utils.stretch(ref.pp.getConfig('imageScaling'), $(currentImageObj[0]), destObj.width(), destObj.height())) {
                    try {
                        ref.sendUpdate('scaled', {
                            originalWidth: currentImageObj._originalDimensions.width,
                            originalHeight: currentImageObj._originalDimensions.height,
                            scaledWidth: ref.mediaElement.width(),
                            scaledHeight: ref.mediaElement.height(),
                            displayWidth: destObj.width(),
                            displayHeight: destObj.height()
                        });
                    } catch (e) {
                    }
                }
                return $(currentImageObj[0]);
            }

            imageObj.on("load", function (event) {
                var target = $(event.currentTarget),
                    imgObj;

                if (!imageObj.attr("data-od-width")){
                    imageObj.attr("data-od-width", target[0].naturalWidth);
                }
                if (!imageObj.attr("data-od-height")){
                    imageObj.attr("data-od-height", target[0].naturalHeight);
                }

                currentImageObj.remove();

                imageObj.attr('id', ref.pp.getMediaId() + "_image");
                imageObj.show();

                if ($p.utils.stretch(ref.pp.getConfig('imageScaling'), target, destObj.width(), destObj.height())) {
                    try {
                        ref.sendUpdate('scaled', {
                            originalWidth: imgObj._originalDimensions.width,
                            originalHeight: imgObj._originalDimensions.height,
                            scaledWidth: ref.mediaElement.width(),
                            scaledHeight: ref.mediaElement.height(),
                            displayWidth: destObj.width(),
                            displayHeight: destObj.height()
                        });
                    } catch (e) {
                    }
                }
            });

            imageObj.removeData('od');

            this.pp.removeListener('fullscreen.poster');
            this.pp.removeListener('resize.poster');

            this.pp.addListener('fullscreen.poster', function () {
                ref.applyImage(ref.getPoster(), destObj);
            });

            this.pp.addListener('resize.poster', function () {
                ref.applyImage(ref.getPoster(), destObj);
            });

            imageObj.appendTo(destObj).attr({
                "alt": this.pp.getConfig('title') || ''
            }).css({
                position: 'absolute'
            }).addClass(this.pp.getMediaId() + "_image");

            // IE<9 trap:
            imageObj.attr('src', url);

            imageObj.on("error", function (event) {
                $(this).remove();
                currentImageObj.show();
            });

            return imageObj;
        },
        _setState: function (state) {
            var ref = this,
                state = state.toUpperCase(),
                old = this._currentState;

            this._currentState = state.toUpperCase();

            if (old !== state && old !== 'ERROR') {
                if (old === 'PAUSED' && state === 'PLAYING') {
                    this.sendUpdate('resume', this.media);
                    this._isPlaying = true;
                }

                if ((old === 'IDLE' || old === 'STARTING') && state === 'PLAYING') {
                    this.sendUpdate('start', this.media);
                    this._isPlaying = true;
                }

                if (state === 'PAUSED') {
                    this._isPlaying = false;
                    this._setBufferState('FULL');
                }

                if (state === 'ERROR') {
                    this.setPlay = this.setPause = function () {
                        ref.sendUpdate('start');
                    };
                }

                this.sendUpdate('state', this._currentState);
            }
        },
        _setBufferState: function (state) {
            if (this._currentBufferState !== state.toUpperCase()) {
                this._currentBufferState = state.toUpperCase();
                this.sendUpdate('buffer', this._currentBufferState);
            }
        },
        _setSeekState: function (state, value) {
            if (this._currentSeekState !== state.toUpperCase()) {
                this._currentSeekState = state.toUpperCase();
                this.sendUpdate('seek', this._currentSeekState, value);
            }
        },
        _scaleVideo: function () {
            var mediaDisplay = this.pp.getMediaContainer(),
                displayWidth, displayHeight,
                videoWidth, videoHeight;

            try {
                displayWidth = mediaDisplay.width();
                displayHeight = mediaDisplay.height();
                videoWidth = this.media.videoWidth;
                videoHeight = this.media.videoHeight;

                if (this.mediaElement.attr("data-od-width") != videoWidth) {
                    this.mediaElement.attr("data-od-width", videoWidth);
                }
                if (this.mediaElement.attr("data-od-height") != videoHeight) {
                    this.mediaElement.attr("data-od-height", videoHeight);
                }

                if ($p.utils.stretch(this.pp.getConfig('videoScaling'), this.mediaElement, displayWidth, displayHeight)) {
                    this.sendUpdate('scaled', {
                        originalWidth: videoWidth,
                        originalHeight: videoHeight,
                        scaledWidth: this.mediaElement.width(),
                        scaledHeight: this.mediaElement.height(),
                        displayWidth: displayWidth,
                        displayHeight: displayHeight
                    });
                }
            } catch (e) {
                $p.utils.log('_scaleVideo error', e);
            }
        }
    };

    return playerModel;
    
}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010, 2011, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
*/
(function(window, document, $, $p){

    "use strict";
    
$p.newModel({
    modelId: 'NA',
    browserVersion: '1.0',
    iLove: [
        {ext:'na', type:'none/none', platform: ['browser']}
    ],
    hasGUI: true,

    applyMedia: function(destContainer) {

        destContainer.html('');
        this.displayReady();

        this.sendUpdate( 'error', this.media.errorCode);

        if (!this.pp.getConfig('enableTestcard')) {
            if(this.media.file.length && this.media.file[0].src) {
                window.location.href = this.media.file[0].src;
            }
        }
    }
});

}(window, document, jQuery, projekktor));
/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2010, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 */
(function (window, document, $, $p) {
  "use strict";

  $p.newModel({
    modelId: "VIDEO",
    androidVersion: "4.0",
    iosVersion: "5.0",
    nativeVersion: "1.0",
    iLove: [
      { ext: "mp4", type: "video/mp4", platform: ["ios", "android", "native"] },
      { ext: "m4v", type: "video/mp4", platform: ["ios", "android", "native"] },
      { ext: "ogv", type: "video/ogg", platform: ["native"] },
      { ext: "webm", type: "video/webm", platform: ["native"] },
      { ext: "ogg", type: "video/ogg", platform: ["native"] },
      { ext: "anx", type: "video/ogg", platform: ["native"] },
    ],

    _eventMap: {
      pause: "pauseListener",
      play: "playingListener",
      volumechange: "volumeListener",
      progress: "progressListener",
      timeupdate: "_timeupdate",
      ended: "_ended",
      waiting: "waitingListener",
      canplaythrough: "canplayListener",
      canplay: "canplayListener",
      // suspend:        "suspendListener",
      // abort:          "abortListener",
      error: "errorListener",
      emptied: "emptiedListener",
      stalled: "stalledListener",
      seeked: "seekedListener",
      loadedmetadata: "resizeListener",
      loadeddata: "resizeListener",
      resize: "resizeListener",
      // loadstart:      null,
      webkitbeginfullscreen: "webkitBeginFullscreenListener",
      webkitendfullscreen: "webkitEndFullscreenListener",
    },
    _eventsBinded: [],
    allowRandomSeek: false,
    videoWidth: 0,
    videoHeight: 0,
    wasPersistent: true,
    endedTimeout: 0,
    displayingFullscreen: false,
    _lastPosition: null,

    init: function () {
      this._lastPosition = null;
      this._eventsBinded = [];
      this.ready();
    },

    applyMedia: function (destContainer) {
      if ($("#" + this.pp.getMediaId() + "_html").length === 0) {
        this.wasPersistent = false;

        destContainer.html("").append(
          $("<video/>")
            .attr({
              id: this.pp.getMediaId() + "_html",
              loop: false,
              autoplay: false,
              preload: "none",
              "x-webkit-airplay": "allow",
              playsinline: "",
            })
            .prop({
              controls: false,
              volume: this.getVolume(),
              muted: this.getMuted(),
            })
            .css({
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            })
        );
      }

      this.mediaElement = $("#" + this.pp.getMediaId() + "_html");
      this.addListeners();
      this.applySrc();
    },

    applySrc: function () {
      var ref = this,
        media = this.getSource(),
        wasAwakening = ref.getState("AWAKENING");

      /*
       * Using 'src' attribute directly in <video> element is safer than using it inside <source> elements.
       * Some of the mobile browsers (e.g. Samsung Galaxy S2, S3 Android native browsers <= 4.2.2)
       * will not initialize video playback with <source> elements at all, displaying only gray screen instead.
       * HLS stream on iOS and Android will not work if its URL is defined through <source> 'src' attribute
       * instead of <video> 'src' attribute.
       */
      this.mediaElement.attr("src", media[0].src);
      this.mediaElement.attr("type", media[0].type);

      /*
       * Some of the mobile browsers (e.g. Android native browsers <= 4.2.x, Opera Mobile)
       * have by default play/pause actions bound directly to click/mousedown events of <video>.
       * That causes conflict with display plugin play/pause actions, which makes it impossible
       * to pause the currently playing video. Precisely _setState is called twice:
       * first by pauseListener triggered by <video> default click/mousedown action,
       * secondly by display plugin actions bound to mousedown events. The result is that
       * the video is paused by native <video> events and then immediately started by display
       * plugin that uses the setPlayPause function. setPlayPause function toggles between
       * "PAUSED" and "PLAYING" states, so when a video is being played, the function causes its pausing.
       */
      this.mediaElement.on(
        "mousedown.projekktorqs" + this.pp.getId(),
        this.disableDefaultVideoElementActions
      );
      this.mediaElement.on(
        "click.projekktorqs" + this.pp.getId(),
        this.disableDefaultVideoElementActions
      );

      var func = function (e) {
        ref.mediaElement.off("loadstart.projekktorqs" + ref.pp.getId());
        ref.mediaElement.off("loadeddata.projekktorqs" + ref.pp.getId());
        ref.mediaElement.off("canplay.projekktorqs" + ref.pp.getId());

        ref.mediaElement = $("#" + ref.pp.getMediaId() + "_html");

        if (wasAwakening) {
          ref.displayReady();
          return;
        }

        if (ref.getSeekState("SEEKING")) {
          if (ref._isPlaying) {
            ref.setPlay();
          }

          ref.seekedListener();
          return;
        }

        ref.setSeek(ref.media.position || 0);

        if (ref._isPlaying) {
          ref.setPlay();
        }
      };

      this.mediaElement.on("loadstart.projekktorqs" + this.pp.getId(), func);
      this.mediaElement.on("loadeddata.projekktorqs" + this.pp.getId(), func);
      this.mediaElement.on("canplay.projekktorqs" + this.pp.getId(), func);

      this.mediaElement[0].load(); // important especially for iOS devices
    },

    detachMedia: function () {
      try {
        this.mediaElement.off(".projekktorqs" + this.pp.getId());
        this.mediaElement[0].pause();
      } catch (e) {}
    },

    /*****************************************
     * Handle Events
     ****************************************/
    addListeners: function (evtId, subId) {
      if (this.mediaElement == null) {
        return;
      }
      var id =
          subId != null
            ? ".projekktor" + subId + this.pp.getId()
            : ".projekktor" + this.pp.getId(),
        ref = this,
        evt = evtId == null ? "*" : evtId;

      $.each(this._eventMap, function (key, value) {
        if (
          (key == evt || evt == "*") &&
          value != null &&
          ref._eventsBinded.indexOf(key) === -1
        ) {
          ref.mediaElement.on(key + id, function (evt) {
            ref[value](this, evt);
          });
          ref._eventsBinded.push(key);
        }
      });
    },

    removeListeners: function (evt, subId) {
      if (this.mediaElement == null) {
        return;
      }
      evt = evt === void 0 ? "*" : evt;

      var id =
          subId != null
            ? ".projekktor" + subId + this.pp.getId()
            : ".projekktor" + this.pp.getId(),
        ref = this;

      $.each(this._eventMap, function (key, value) {
        if (key === evt || evt === "*") {
          ref.mediaElement.off(key + id);
          var idx = ref._eventsBinded.indexOf(key);
          if (idx > -1) {
            ref._eventsBinded.splice(idx, 1);
          }
        }
      });
    },

    // Workaround for problems with firing ended event in Chromium based browsers
    // e.g. Samsung Galaxy S4 on Android 4.4.2 KitKat native Internet Browser 1.5.28 1528 based on Chrome 28.0.1500.94
    // More info about the issues with ended event here: https://code.google.com/p/chromium/issues/detail?id=349543
    _timeupdate: function (video, event) {
      var ref = this;
      if (video.duration - video.currentTime < 1) {
        this.endedTimeout = setTimeout(function () {
          clearTimeout(ref.endedTimeout);
          if (
            !video.paused &&
            Math.round(video.duration - video.currentTime) === 0
          ) {
            $p.utils.log("VIDEO model: ended event forced");
            ref._ended();
          }
        }, 1000);
      }
      // check for video size change (e.g. HLS on Safari OSX or iOS)
      this.resizeListener(video);

      // IE & Edge firing timeupdate event even if the currentTime didn't change,
      // this has place when the video is buffering and cause IE & Edge
      // don't fire waiting & stalled events we can use that bug to set
      // buffering state to 'EMPTY'. It's a hack but it's working.
      if (video.currentTime !== this._lastPosition) {
        // we assume that the buffer is full when the video time was updated
        if (this._lastPosition !== null) {
          this._setBufferState("FULL");
        }
        this._lastPosition = video.currentTime;
        this.timeListener.apply(this, arguments);
      } else {
        this._setBufferState("EMPTY");
      }
    },

    _ended: function () {
      clearTimeout(this.endedTimeout);

        if (!this.mediaElement) {
            this.emptiedListener(this);
            return;
        }

        var dur = this.mediaElement[0].duration, // strange android behavior workaround
            complete = (Math.round(this.media.position) === Math.round(dur)),
            fixedEnd = ( (dur-this.media.maxpos) < 2 ) && (this.media.position===0) || false;

      if (complete || fixedEnd) {
        this.endedListener(this);
      } else {
        this.pauseListener(this);
      }
    },

    playingListener: function (obj) {
      var ref = this;
      (function pl() {
        try {
          if (ref.getDuration() === 0) {
            if (
              ref.mediaElement.get(0).currentSrc !== "" &&
              ref.mediaElement.get(0).networkState ==
                ref.mediaElement.get(0).NETWORK_NO_SOURCE
            ) {
              ref.sendUpdate("error", 80);
              return;
            }
            setTimeout(pl, 500);
            return;
          }
        } catch (e) {}
      })();

      this._setState("playing");
    },

    errorListener: function (obj, evt) {
      try {
        switch (evt.target.error.code) {
          case evt.target.error.MEDIA_ERR_ABORTED:
            this.sendUpdate("error", 1);
            break;
          case evt.target.error.MEDIA_ERR_NETWORK:
            this.sendUpdate("error", 2);
            break;
          case evt.target.error.MEDIA_ERR_DECODE:
            this.sendUpdate("error", 3);
            break;
          case evt.target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
            this.sendUpdate("error", 4);
            break;
          default:
            this.sendUpdate("error", 5);
            break;
        }
      } catch (e) {}
    },

    emptiedListener: function (obj) {
      this._setBufferState("EMPTY");
    },

    stalledListener: function (obj) {
      this._setBufferState("EMPTY");
    },

    canplayListener: function (obj) {
      this._setBufferState("FULL");
    },

    webkitBeginFullscreenListener: function (evt) {
      this.displayingFullscreen = true;
      this.fullscreenchangeListener(this.displayingFullscreen);
    },

    webkitEndFullscreenListener: function (evt) {
      this.displayingFullscreen = false;
      this.fullscreenchangeListener(this.displayingFullscreen);
    },

    disableDefaultVideoElementActions: function (evt) {
      evt.preventDefault();
    },

    getMediaStatus: function (name) {
      if ($p.utils.logging) {
        var m = this.mediaElement[0],
          networkState = m.networkState,
          readyState = m.readyState,
          error = m.error,
          pos = m.currentTime,
          dur = m.duration,
          buffered = m.buffered,
          seekable = m.seekable;

        $p.utils.log("| " + name + " |");
        $p.utils.log(
          "| networkState: ",
          this._getNetworkStateName(networkState),
          "readyState: ",
          this._getReadyStateName(readyState),
          "error: ",
          this._getErrorName(error)
        );
        $p.utils.log("| duration: ", dur, "currentTime: ", pos);
        $p.utils.log("| buffered: ", this._loopThroughTimeRanges(buffered));
        $p.utils.log("| seekable: ", this._loopThroughTimeRanges(seekable));
      }
    },

    _getNetworkStateName: function (networkStateCode) {
      var result = networkStateCode + " - ";
      switch (networkStateCode) {
        case 0:
          result += "NETWORK_EMPTY";
          break;
        case 1:
          result += "NETWORK_IDLE";
          break;
        case 2:
          result += "NETWORK_LOADING";
          break;
        case 3:
          result += "NETWORK_NO_SOURCE";
          break;
      }
      return result;
    },

    _getReadyStateName: function (readyStateCode) {
      var result = readyStateCode + " - ";
      switch (readyStateCode) {
        case 0:
          result += "HAVE_NOTHING";
          break;
        case 1:
          result += "HAVE_METADATA";
          break;
        case 2:
          result += "HAVE_CURRENT_DATA";
          break;
        case 3:
          result += "HAVE_FUTURE_DATA";
          break;
        case 4:
          result += "HAVE_ENOUGH_DATA";
          break;
      }
      return result;
    },

    _getErrorName: function (errorCode) {
      var result = errorCode + " - ";
      switch (errorCode) {
        case 1:
          result += "MEDIA_ERR_ABORTED";
          break;
        case 2:
          result += "MEDIA_ERR_NETWORK";
          break;
        case 3:
          result += "MEDIA_ERR_DECODE";
          break;
        case 4:
          result += "MEDIA_ERR_SRC_NOT_SUPPORTED";
          break;
      }
      return result;
    },

    _loopThroughTimeRanges: function (timeRanges) {
      var i = 0,
        l = timeRanges.length,
        result = "length: " + l + "; ";

      for (; i < l; i++) {
        result += "#" + i + " - ";
        result += "start: " + timeRanges.start(i) + ", ";
        result += "end: " + timeRanges.end(i);
        result += "; ";
      }

      return result;
    },

    /*****************************************
     * Setters
     ****************************************/
    setPlay: function () {
      var ref = this,
        promise;

      try {
        promise = this.mediaElement[0].play();

        if (promise !== undefined) {
          promise.catch(function (error) {
            // Auto-play was prevented reset and disable autoplay
            ref.pp.setActiveItem(0, false);
          });
        }
      } catch (e) {}
    },

    setPause: function () {
      try {
        this.mediaElement[0].pause();
      } catch (e) {}
    },

    setVolume: function (volume) {
      if (this.mediaElement === null || !$p.features.volumecontrol) {
        this.volumeListener(volume);
      } else {
        this.mediaElement.prop("volume", volume);
      }
    },

    setMuted: function (muted) {
      if (this.mediaElement === null) {
        this.volumeListener(0);
      } else {
        this.mediaElement.prop("muted", muted);
      }
    },

    setSeek: function (newpos) {
      var ref = this,
        np = newpos,
        relPos = true;

      // IE9 sometimes raises INDEX_SIZE_ERR
      (function ss() {
        try {
          // if it's a DVR stream
          if (ref._isDVR) {
            /*
             * iOS 7.1.2 Safari 7.0 behavior is weird cause it takes absolute values
             * when the OSX 10.9.4 Safari 7.0.5 takes relative values for seeking through timeline.
             * E.g. when we want to seek to the beginning of the DVR window which duration is 60s
             * and the stream already plays for 120s on iOS Safari we must seek to 0 position, when
             * on OSX Safari we must seek to 60 position. Same for seeking to the live point:
             * on iOS Safari we must seek to the 60 position (duration of DVR window) but on
             * OSX Safari we must seek to the seeking.end(0) position, which is in our case 120.
             */
            relPos = ref.mediaElement[0].seekable.start(0) > 0;
            if (newpos < 0) {
              // snap to live position
              if (relPos) {
                np = ref.mediaElement[0].seekable.end(0) - 2;
              } else {
                np = ref.media.duration;
              }
            } else {
              if (relPos) {
                np =
                  ref.mediaElement[0].seekable.end(0) -
                  (ref.media.duration - newpos);
              } else {
                np = newpos;
              }
            }
          }

          ref.mediaElement[0].currentTime = np;
          ref.timeListener({ position: np });
        } catch (e) {
          if (ref.mediaElement !== null) {
            setTimeout(ss, 100);
          }
        }
      })();
    },
    /************************************************
     * getters
     ************************************************/

    getVolume: function () {
      if (this.mediaElement === null) {
        return this._volume;
      }

      return this.mediaElement.prop("volume");
    },

    getMuted: function () {
      if (this.mediaElement === null) {
        return this._volume === 0;
      }

      return this.mediaElement.prop("muted");
    },
  });

  $p.newModel(
    {
      modelId: "AUDIO",

      iLove: [
        { ext: "ogg", type: "audio/ogg", platform: ["native"] },
        { ext: "oga", type: "audio/ogg", platform: ["native"] },
        {
          ext: "mp3",
          type: "audio/mp3",
          platform: ["ios", "android", "native"],
        },
        {
          ext: "mp3",
          type: "audio/mpeg",
          platform: ["ios", "android", "native"],
        },
      ],

      imageElement: {},

      applyMedia: function (destContainer) {
        $p.utils.blockSelection(destContainer);

        if ($("#" + this.pp.getMediaId() + "_html").length === 0) {
          this.wasPersistent = false;
          destContainer.append(
            $("<audio/>")
              .attr({
                id: this.pp.getMediaId() + "_html",
                poster: $p.utils.imageDummy(),
                loop: false,
                autoplay: false,
                preload: "none",
                "x-webkit-airplay": "allow",
                playsinline: "",
              })
              .prop({
                controls: false,
                volume: this.getVolume(),
              })
              .css({
                width: "1px",
                height: "1px",
                position: "absolute",
                top: 0,
                left: 0,
              })
          );
        }
        // create cover image
        this.imageElement = this.applyImage(
          this.getPoster("cover") || this.getPoster("poster"),
          destContainer
        );
        this.imageElement.css({ border: "0px" });

        this.mediaElement = $("#" + this.pp.getMediaId() + "_html");
        this.applySrc();
      },

      setPosterLive: function () {
        if (this.imageElement.parent) {
          var dest = this.imageElement.parent(),
            ref = this;

          if (
            this.imageElement.attr("src") == this.getPoster("cover") ||
            this.getPoster("poster")
          ) {
            return;
          }

          this.imageElement.fadeOut("fast", function () {
            $(this).remove();
            ref.imageElement = ref.applyImage(
              ref.getPoster("cover") || ref.getPoster("poster"),
              dest
            );
          });
        }
      },
    },
    "VIDEO"
  );
})(window, document, jQuery, projekktor);
/*
 * this file is part of:
 * projekktor zwei
 * http://www.projekktor.com
 *
 * Copyright 2014, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
*/
(function(window, document, $, $p){
    
    "use strict";
    
$p.newModel({
    modelId: 'VIDEOHLS',
    androidVersion: '4.1',
    iosVersion: '5.0',
    iLove: [
        {ext:'m3u8', type:'application/vnd.apple.mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'application/vnd.apple.mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u8', type:'application/x-mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'application/x-mpegurl', platform: ['ios', 'android', 'native']}
    ]
}, 'VIDEO');

$p.newModel({
    modelId: 'AUDIOHLS',
    androidVersion: '4.1',
    iosVersion: '5.0',
    iLove: [
        {ext:'m3u8', type:'application/vnd.apple.mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'application/vnd.apple.mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u8', type:'application/x-mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'application/x-mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u8', type:'audio/mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'audio/mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u8', type:'audio/x-mpegurl', platform: ['ios', 'android', 'native']},
        {ext:'m3u', type:'audio/x-mpegurl', platform: ['ios', 'android', 'native']}
    ]
}, 'AUDIO');

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor zwei
 * http://filenew.org/projekktor/
 *
 * Copyright 2010, 2011, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
*/
(function(window, document, $, $p){
    
    "use strict";

$p.newModel({

    modelId: 'PLAYLIST',
    browserVersion: '1.0',
    iLove: [
        {ext:'json', type:'text/json', platform: ['browser']},
        {ext:'xml', type:'text/xml', platform: ['browser']},
        {ext:'json', type:'application/json', platform: ['browser']},
        {ext:'xml', type:'application/xml', platform: ['browser']}
    ],

    applyMedia: function(destContainer) {
        this.displayReady();
    },

    setPlay: function() {
        this.sendUpdate('playlist', this.media);
    }
});

}(window, document, jQuery, projekktor));
/*
 * this file is part of:
 * projekktor zwei
 * http://filenew.org/projekktor/
 *
 * Copyright 2010, 2011, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
*/

(function(window, document, $, $p){

    "use strict";

$p.newModel({

    modelId: 'IMAGE',
    browserVersion: "1.0",
    iLove: [
        {ext:'jpg', type:'image/jpeg', platform: ['browser']},
        {ext:'gif', type:'image/gif', platform: ['browser']},
        {ext:'png', type:'image/png', platform: ['browser']}
    ],

    allowRandomSeek: true,

    _position: 0,
    _duration: 0,
    _fixedVolume: true,

    applyMedia: function(destContainer) {
        this.mediaElement = this.applyImage(this.media.file[0].src, destContainer.html(''));
        this._duration = this.pp.getConfig('duration') || 1;
        this._position = -1;
        this.displayReady();
        this._position = -0.5;
    },

    /* start timer */
    setPlay: function() {

        var ref = this;

        this._setBufferState('FULL');
        this.progressListener(100);
        this.playingListener();

        if (this._duration==0) {
            ref._setState('completed');
            return;
        }

        (function sp() {
            if (ref._position>=ref._duration) {
                ref._setState('completed');
                return;
            }

            if (!ref.getState('PLAYING')) {
                return;
            }

            ref.timeListener({duration: ref._duration, position:ref._position});
            setTimeout(sp, 200);
            ref._position += 0.2;
        })();

    },

    detachMedia: function() {
        this.mediaElement.remove();
    },

    setPause: function() {
        this.pauseListener();
    },

    setSeek: function(newpos) {
        if (newpos<this._duration) {
            this._position = newpos;
            this.seekedListener()
        }
    }

});

$p.newModel({

    modelId: 'HTML',
    browserVersion: "1.0",
    iLove: [
        {ext:'html', type:'text/html', platform: ['browser']}
    ],

   applyMedia: function(destContainer) {
        var ref = this;

        this.mediaElement = $(document.createElement('iframe')).attr({
            "id": this.pp.getMediaId()+"_iframe",
            "name": this.pp.getMediaId()+"_iframe",
            "src": this.media.file[0].src,
            "scrolling": 'no',
            "frameborder": "0",
            'width': '100%',
            'height': '100%'
        }).css({
            'overflow': 'hidden',
            'border': '0px',
            "width": '100%',
            "height": '100%'
        }).appendTo(destContainer.html(''));

        this.mediaElement.load(function(event){ref.success();});
        this.mediaElement.error(function(event){ref.remove();});

        this._duration = this.pp.getConfig('duration');

    },

    success: function() {
        this.displayReady();
    },

    remove: function() {
        this.mediaElement.remove();
    }
}, 'IMAGE');

}(window, document, jQuery, projekktor));/*
 * this file is part of:
 * projekktor player
 * http://www.projekktor.com
 *
 * Copyright 2016-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * 
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 * This model is interfacing hls.js library
 *
 * hls.js
 * Website: https://github.com/video-dev/hls.js
 * License: Apache 2.0 License
 *
 */

(function(window, document, $, $p){

    "use strict";

    $p.newModel({

        modelId: 'MSEVIDEOHLS',
        mseVersion: '1.0',

        iLove: [{
            ext: 'm3u8',
            type: 'application/x-mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u8',
            type: 'application/vnd.apple.mpegurl',
            platform: ['mse']
        }],

        _hlsjs: null,
        _hlsjsPlatformConfig: {},

        availableQualities: {},

        _qualitySwitching: false,
        _isDynamicStream: false,
        _requestedDynamicStreamIndex: -1, // inited with "auto switch" value to indicate that no index was manually requested
        _bufferTime: 0,
        _liveOffset: 2,

        applyMedia: function (destContainer) {

            var ref = this,
                hlsJsLoadSuccess = function () {
                    if ($('#' + ref.pp.getMediaId() + "_html").length === 0) {

                        ref.wasPersistent = false;

                        destContainer.html('').append(
                            $('<video/>')
                            .attr({
                                "id": ref.pp.getMediaId() + "_html",
                                "poster": $p.utils.imageDummy(),
                                "loop": false,
                                "autoplay": false,
                                "preload": "auto",
                                "x-webkit-airplay": "allow",
                                "playsinline": ""
                            }).prop({
                                controls: false,
                                volume: ref.getVolume()
                            }).css({
                                'width': '100%',
                                'height': '100%',
                                'position': 'absolute',
                                'top': 0,
                                'left': 0
                            })
                        );
                    }

                    ref.mediaElement = $('#' + ref.pp.getMediaId() + "_html");
                    ref.addListeners();
                    ref.applySrc();
                },
                hlsJsLoadFailed = function (jqxhr, settings, exception) {
                    ref.sendUpdate('error', 2);
                },
                msePlatformConfig = this.pp.getConfig('platformsConfig').mse || {};
            
            // guarantee hls.js config values
            $.extend(true, ref._hlsjsPlatformConfig, {src:'/MISSING_PATH_TO_HLSJS_LIB/', initVars:{}}, msePlatformConfig.hlsjs);
            
            // check if hls.js is already loaded
            if (window.Hls && typeof window.Hls.isSupported === 'function') {
                // just continue
                hlsJsLoadSuccess();
            } else {
                // load hls.js
                $p.utils.getScript(ref._hlsjsPlatformConfig.src, {
                        cache: true
                    })
                    .done(hlsJsLoadSuccess)
                    .fail(hlsJsLoadFailed);
            }
        },

        applySrc: function () {
            var ref = this,
                media = ref.getSource(),
                wasAwakening = ref.getState('AWAKENING');

            ref._hlsjs = new Hls(ref._hlsjsPlatformConfig.initVars);

            ref._hlsjs.loadSource(media[0].src);
            ref._hlsjs.attachMedia(ref.mediaElement[0]);
            // add hlsjs event listeners
            ref._hlsjs.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                ref.updateAvailableDynamicStreamsQualities(data);
                if (wasAwakening) {
                    ref.displayReady();
                    return;
                }

                if (ref.getSeekState('SEEKING')) {
                    if (ref._isPlaying) {
                        ref.setPlay();
                    }

                    ref.seekedListener();
                    return;
                }

                if (ref._isPlaying) {
                    ref.setPlay();
                }
            });
            ref._hlsjs.on(Hls.Events.LEVEL_SWITCH, function (event, data) {
                ref.qualityChangeListener();
            });

            /*
             * Some of the mobile browsers (e.g. Android native browsers <= 4.2.x, Opera Mobile)
             * have by default play/pause actions bound directly to click/mousedown events of <video>.
             * That causes conflict with display plugin play/pause actions, which makes it impossible
             * to pause the currently playing video. Precisely _setState is called twice:
             * first by pauseListener triggered by <video> default click/mousedown action,
             * secondly by display plugin actions bound to mousedown events. The result is that
             * the video is paused by native <video> events and then immediately started by display
             * plugin that uses the setPlayPause function. setPlayPause function toggles between
             * "PAUSED" and "PLAYING" states, so when a video is being played, the function causes its pausing.
             */
            this.mediaElement.on('mousedown.projekktorqs' + this.pp.getId(), this.disableDefaultVideoElementActions);
            this.mediaElement.on('click.projekktorqs' + this.pp.getId(), this.disableDefaultVideoElementActions);
        },

        detachMedia: function () {
            try {
                this._hlsjs.detachMedia();
                this._hlsjs.destroy();
                this.mediaElement.off('.projekktorqs' + this.pp.getId());
            } catch (e) {}
        },

        /**
         * Update projekktor internal quality keys for currently active playlist item
         * with hls.js dynamic stream item values
         *
         * To use different quality keys format than default:
         * audio/video key: '%{height}p | %{bitrate}kbps'
         * audio-only key: 'audio | %{bitrate}kbps'
         *
         * set 'dynamicStreamQualityKeyFormatAudioVideo', 'dynamicStreamQualityKeyFormatAudioOnly' config options respectively.
         *
         * To show audio-only qualities set 'dynamicStreamShowAudioOnlyQualities' config option to true (default: false)
         *
         * Note: Quality keys must have unique names, otherwise they will be overwritten.
         *
         * @returns {Array} - returns available dynamic streams quality keys in the projekktor's format
         */
        updateAvailableDynamicStreamsQualities: function (data) {

            var dynamicStreams = data.levels,
                numStreams = dynamicStreams.length,
                keyName = '',
                isAudioOnly = false,
                showAudioOnly = this.pp.getConfig('dynamicStreamShowAudioOnlyQualities'),
                avKeyFormat = this.pp.getConfig('dynamicStreamQualityKeyFormatAudioVideo'),
                aoKeyFormat = this.pp.getConfig('dynamicStreamQualityKeyFormatAudioOnly'),
                dpc = this.pp.getConfig('dynamicStreamQualityKeyBitrateRoundingDecimalPlacesCount'),
                bitrate = 0,
                bitrateKbps = 0,
                bitrateMbps = 0,
                bitrateUnit = 'kbps',
                qualityKeys = [];

            this.availableQualities = {};

            for (var i = 0; i < numStreams; i++) {
                if (dynamicStreams[i].bitrate !== undefined) {

                    bitrateKbps = Math.floor(dynamicStreams[i].bitrate / 1000);
                    bitrateMbps = $p.utils.roundNumber(bitrateKbps / 1000, dpc);
                    bitrate = bitrateKbps < 1000 ? bitrateKbps : bitrateMbps;
                    bitrateUnit = bitrateKbps < 1000 ? 'kbps' : 'Mbps';

                    // audio/video stream quality
                    if (dynamicStreams[i].height > 0) {
                        isAudioOnly = false;
                        keyName = $p.utils.parseTemplate(avKeyFormat, {
                            height: dynamicStreams[i].height,
                            width: dynamicStreams[i].width,
                            bitrate: bitrate,
                            bitrateunit: bitrateUnit,
                            bitratekbps: bitrateKbps,
                            bitratembps: bitrateMbps
                        });
                    }
                    // audio-only stream quality
                    else {
                        isAudioOnly = true;
                        if (showAudioOnly) {
                            keyName = $p.utils.parseTemplate(aoKeyFormat, {
                                bitrate: bitrate,
                                bitrateunit: bitrateUnit,
                                bitratekbps: bitrateKbps,
                                bitratembps: bitrateMbps
                            });
                        }
                    }

                    if (keyName.length && (isAudioOnly === showAudioOnly)) {
                        this.availableQualities[keyName] = i;
                        qualityKeys.push(keyName);
                    }
                }
            }

            // always add auto
            qualityKeys.push('auto');

            this._isDynamicStream = true; // important: set this before sending the update

            this.sendUpdate('availableQualitiesChange', qualityKeys);
            return qualityKeys;
        },

        /**
         * Switch to a specific dynamic stream index.
         *
         * @param {int} index - if < 0 then the automatic stream switch will be enabled,
         * otherwise if the index value is a valid stream index the manual switch will be performed
         *
         * @returns {mixed} - if the requested index is invalid, is the same as current index or is out of valid range function returns false
         * otherwise it returns requested index value.
         * Note: Always use strict comparison when using return value cause the lowest valid index could be 0.
         *
         * Note:  If the media is paused, switching will not take place until after play resumes.
         */
        switchDynamicStreamIndex: function (index) {
            // return if the index is NaN or is the current index or is out of range
            if ((isNaN(index) ||
                    (index < 0 && this.getAutoDynamicStreamSwitch()) ||
                    (index === this.getCurrentDynamicStreamIndex() && !this.getAutoDynamicStreamSwitch()) ||
                    index > this.getMaxAllowedDynamicStreamIndex())) {
                return false;
            }

            this._requestedDynamicStreamIndex = index;

            this.getDynamicStreamingStatus('before switch');

            // auto quality switching if requested index is < 0
            if (index < 0) {
                this.setAutoDynamicStreamSwitch(true);
            }
            // manual quality switching
            else {
                // auto dynamic stream switch must be set to false before any attempt of manual index switching
                this.setAutoDynamicStreamSwitch(false);

                // if there is attempt to manual switch but after disabling auto switching
                // current index is already the requested one (without that check the player tend to hang)
                if (index !== this.getCurrentDynamicStreamIndex()) {
                    this._hlsjs.currentLevel = index;
                }
            }

            this.getDynamicStreamingStatus('after switchDynamicStreamIndexTo');

            return index;
        },

        getStreamItems: function () {
            return this._hlsjs.levels;
        },

        getNumDynamicStreams: function () {
            return this._hlsjs.levels.length;
        },

        /**
         * The maximum allowed index. This can be set at run-time to
         * provide a ceiling for the switching profile, for example,
         * to keep from switching up to a higher quality stream when
         * the current video is too small to handle a higher quality stream.
         *
         * The default is the highest stream index.
         */
        getMaxAllowedDynamicStreamIndex: function () {
            if (this.getAutoDynamicStreamSwitch() && this._hlsjs.autoLevelCapping >= 0) {
                return this._hlsjs.autoLevelCapping;
            } else {
                return this.getNumDynamicStreams() - 1;
            }
        },

        setMaxAllowedDynamicStreamIndex: function (val) {
            if (!isNaN(val) && val !== this.getMaxAllowedDynamicStreamIndex() && val >= 0 && val < this.getNumDynamicStreams()) {
                this._hlsjs.autoLevelCapping = val;
            } else if (val < 0) {
                this._hlsjs.autoLevelCapping = -1;
            }
        },

        /**
         * The index of the current dynamic stream. Uses a zero-based index.
         */
        getCurrentDynamicStreamIndex: function () {
            return this._hlsjs.currentLevel;
        },

        /**
         * Defines whether or not the model should be in manual
         * or auto-switch mode. If in manual mode the switchDynamicStreamIndex
         * method can be used to manually switch to a specific stream index.
         */
        getAutoDynamicStreamSwitch: function () {
            return this._hlsjs.autoLevelEnabled;
        },

        setAutoDynamicStreamSwitch: function (val) {
            if (val === true) { // enable auto stream switching
                this._hlsjs.currentLevel = -1;
                this._hlsjs.nextLevel = -1;
                this._hlsjs.loadLevel = -1;
            }
        },

        getDynamicStreamingStatus: function (name) {
            if ($p.utils.logging) {
                $p.utils.log('| ' + name + ' | getDynamicStreamingStatus ===');
                $p.utils.log(
                    '| reqIdx: ', this._requestedDynamicStreamIndex,
                    ', current index: ', this.getCurrentDynamicStreamIndex(),
                    ', max allowed index: ', this.getMaxAllowedDynamicStreamIndex(),
                    ', num streams: ', this.getNumDynamicStreams(),
                    ', auto:', this.getAutoDynamicStreamSwitch()
                );
                var streams = this.getStreamItems();
                for (var index in streams) {
                    if (streams.hasOwnProperty(index) && streams[index].bitrate !== undefined) {
                        name = index + ' dimensions: ' + streams[index].width + "x" + streams[index].height + " | bitrate: " + streams[index].bitrate + ' | streamName: ' + streams[index].streamName;
                        $p.utils.log('| ' + name);
                    }
                }
                $p.utils.log('| ======================================');
            }
        },

        setQuality: function (quality) {
            if (this._quality == quality) {
                return;
            }
            this._quality = quality;

            // dynamic streams
            if (this._isDynamicStream === true) {
                this.switchDynamicStreamIndex((quality == 'auto') ? -1 : this.availableQualities[quality]);
            }
        },

    }, 'VIDEO');

    $p.newModel({

        modelId: 'MSEAUDIOHLS',

        mseVersion: '1.0',
        platform: 'mse',

        iLove: [{
            ext: 'm3u8',
            type: 'application/vnd.apple.mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u',
            type: 'application/vnd.apple.mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u8',
            type: 'application/x-mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u',
            type: 'application/x-mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u8',
            type: 'audio/mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u',
            type: 'audio/mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u8',
            type: 'audio/x-mpegurl',
            platform: ['mse']
        }, {
            ext: 'm3u',
            type: 'audio/x-mpegurl',
            platform: ['mse']
        }],
        applyMedia: function (destContainer) {
            var ref = this,
                hlsJsLoadSuccess = function () {

                    $p.utils.blockSelection(destContainer);

                    if ($('#' + ref.pp.getMediaId() + "_html").length === 0) {
                        ref.wasPersistent = false;

                        destContainer.html('').append(
                            $('<audio/>')
                            .attr({
                                "id": ref.pp.getMediaId() + "_html",
                                "poster": $p.utils.imageDummy(),
                                "loop": false,
                                "autoplay": false,
                                "preload": "auto",
                                "x-webkit-airplay": "allow",
                                "playsinline": ""
                            }).prop({
                                controls: false,
                                volume: ref.getVolume()
                            }).css({
                                'width': '1px',
                                'height': '1px',
                                'position': 'absolute',
                                'top': 0,
                                'left': 0
                            })
                        );
                    }
                    // create cover image
                    ref.imageElement = ref.applyImage(ref.getPoster('cover') || ref.getPoster('poster'), destContainer);
                    ref.imageElement.css({
                        border: '0px'
                    });
                    ref.mediaElement = $('#' + ref.pp.getMediaId() + "_html");
                    ref.addListeners();
                    ref.applySrc();
                },
                hlsJsLoadFailed = function (jqxhr, settings, exception) {
                    ref.sendUpdate('error', 2);
                };

            // check if hls.js is already loaded
            if (window.Hls && typeof window.Hls.isSupported === 'function') {
                // just continue
                hlsJsLoadSuccess();
            } else {
                // load hls.js
                $p.utils.getScript(ref.pp.getConfig('platformsConfig').mse.src, {
                        cache: true
                    })
                    .done(hlsJsLoadSuccess)
                    .fail(hlsJsLoadFailed);
            }
        }
    }, 'MSEVIDEOHLS');
    
}(window, document, jQuery, projekktor));(function (window, document, $, $p) {

    "use strict";

    $p.newModel({
        modelId: 'MSEVIDEODASH',
        mseVersion: '1.0',

        iLove: [{
                ext: 'ism',
                type: 'application/dash+xml',
                platform: ['mse'],
                drm: ['widevine', 'playready']
            },
            {
                ext: 'mpd',
                type: 'application/dash+xml',
                platform: ['mse'],
                drm: ['widevine', 'playready']
            }
        ],

        _dashjs: null,
        _dashjsPlatformConfig: {},
        _video: null,
        _quality: null,
        _qualityMap: null,
        _showAudioOnly: null,

        mediaElement: null,

        applyMedia: function (destContainer) {
            var ref = this;

            this._showAudioOnly = this.pp.getConfig('dynamicStreamShowAudioOnlyQualities');

            this._fetchDashJs(function (dashjsLib) {
                $p.utils.log('dashjs lib successfully loaded');

                ref._initMedia(destContainer);
            });
        },

        /**
         *  `_initMedia` setting up DashJS.
         * 
         * @param {object} destContainer
         *        container element for <video>
         */
        _initMedia: function (destContainer) {
            var ref = this,
                dashjsConfig = ref._dashjsPlatformConfig.initVars,
                wasAwakening = ref.getState('AWAKENING');

            ///// Stage 1:
            // Create dash.js MediaPlayer instance.
            this._dashjs = window.dashjs.MediaPlayer().create();

            ///// Stage 2:
            // If there is <video> element in the display container then use it,
            // otherwise create new one. 
            var videoID = this.pp.getMediaId() + "_html";
            this._video = document.getElementById(videoID);

            if (!this._video) {
                this._video = $('<video/>').attr({
                    "id": videoID,
                    "poster": $p.utils.imageDummy(),
                    "loop": false,
                    "autoplay": false,
                    "preload": "none",
                    "x-webkit-airplay": "allow",
                    "playsinline": ""
                }).prop({
                    controls: false,
                    volume: this.getVolume()
                }).css({
                    'width': '100%',
                    'height': '100%',
                    'position': 'absolute',
                    'top': 0,
                    'left': 0
                })[0];

                destContainer.html('').append(this._video);
            }

            this.mediaElement = $(this._video);

            ///// Stage 3:
            // Attach event listeners `this._dashjs`.
            var events = window.dashjs.MediaPlayer.events;

            this._dashjs.on(events["STREAM_INITIALIZED"], function (data) {

                // after "STREAM_INITIALIZED" it should be safe to set config values
                ref._setDashJsConfig(dashjsConfig);

                if (wasAwakening) {
                    ref.displayReady();
                    return;
                }

                if (ref.getSeekState('SEEKING')) {
                    if (ref._isPlaying) {
                        ref.setPlay();
                    }

                    ref.seekedListener();
                    return;
                }

                if (ref._isPlaying) {
                    ref.setPlay();
                }
            });

            this._dashjs.on(events["PLAYBACK_METADATA_LOADED"], function () {
                var qualityList = ref._getQualityList();

                if (ref._qualityMap === null) {
                    ref._qualityMap = {};
                }

                for (var i = 0; i < qualityList.length; i++) {
                    ref._qualityMap[qualityList[i]] = i;
                }

                ref.sendUpdate('availableQualitiesChange', qualityList);
            });

            this._dashjs.on(events["QUALITY_CHANGE_REQUESTED"], function () {
                ref.qualityChangeListener();
            });

            this._dashjs.on(events["ERROR"], function (error) {
                ref.sendUpdate('error', 4, error);
            });

            this._dashjs.on(events["PLAYBACK_ERROR"], function (error) {
                ref.sendUpdate('error', 5, error);
            });

            this._dashjs.on("public_keyError", function (error) {
                ref.sendUpdate('error', 302, error);
            });

            this._dashjs.on("public_keySessionClosed", function (event) {
                if (event.error !== undefined) {
                    ref.sendUpdate('error', 302, event.error);
                }
            });
            this._dashjs.on("public_licenseRequestComplete", function (event) {
                if (event.error !== undefined) {
                    ref.sendUpdate('error', 302, event.error);
                }
            });

            // set config set only 'debug' value here
            this._setDashJsConfig({
                debug: dashjsConfig.debug ? true : false
            });

            this.applySrc();
        },

        _setDashJsConfig: function(dashjsConfig){

            var ref = this;

            Object.keys(dashjsConfig).forEach(function (configKey) {

                var configVal = dashjsConfig[configKey];

                // not all of the methods are available in every phase of dashjs instance
                // life cycle so we need to catch that 
                try {
                    switch (configKey) {
                        case 'debug':
                            ref._dashjs.getDebug().setLogToBrowserConsole(configVal);
                            break;
                        case 'fastSwitchEnabled':
                            ref._dashjs.setFastSwitchEnabled(configVal);
                            break;
                        case 'limitBitrateByPortal':
                            ref._dashjs.setLimitBitrateByPortal(configVal);
                            break;
                        case 'usePixelRatioInLimitBitrateByPortal':
                            ref._dashjs.setUsePixelRatioInLimitBitrateByPortal(configVal);
                            break;
                    }
                } catch (error) {
                    $p.utils.log("DASHJS config setting failed on: ", configKey, configVal, error);
                }
            });
        },

        detachMedia: function () {

            if (this.mediaElement) {
                this.mediaElement = null;
            }

            if (this._dashjs) {
                if (this._dashjs.isReady()) {
                    this._dashjs.reset();
                }
                this._dashjs = null;
            }

            this._video = null;

            this._qualityMap = null;
            this._quality = null;
        },

        applySrc: function () {

            var file = this.getSource()[0],
                fileDrmConfig = Array.isArray(file.drm) ? file.drm : [],
                drmConfig = this.pp.getConfig('drm') || {}, // item or global
                availableDrmConfig = $p.utils.intersect(fileDrmConfig, Object.keys(drmConfig)),
                dashjsProtectionDataConf;

            if (fileDrmConfig.length > 0) {
                if (availableDrmConfig.length > 0) {
                    // DRM config required and available
                    dashjsProtectionDataConf = {};
                } else {
                    // DRM system required but no valid license server config defined
                    this.sendUpdate('error', 301);
                    return;
                }
            }

            availableDrmConfig.forEach(function (drm) {
                var dpc = dashjsProtectionDataConf;

                switch (drm) {
                    case 'widevine':
                        dpc["com.widevine.alpha"] = {
                            serverURL: drmConfig[drm]
                        };
                        break;
                    case 'playready':
                        dpc["com.microsoft.playready"] = {
                            serverURL: drmConfig[drm]
                        };
                        break;
                }
            });

            if (dashjsProtectionDataConf !== undefined) {
                this._dashjs.setProtectionData(dashjsProtectionDataConf);
            }

            // Initialize dash.js MediaPlayer
            this._dashjs.initialize(this._video, file.src, false);
        },

        /**
         * `_fetchDashJs` return `window.dashjs` if it's available.
         * Otherwise load DashJS lib from URL.
         * 
         * @param {function|null} cb
         *        {function} Callback function called after successful load of DashJS lib
         *                   Usage: `cb(dashjs)`
         *                  `dashjs` - reference to the DashJS lib
         *        {null} Callback function not specified.
         */
        _fetchDashJs: function (cb) {
            var ref = this,
                msePlatformConfig = this.pp.getConfig('platformsConfig').mse || {};

            // guarantee hls.js config values
            $.extend(true, ref._dashjsPlatformConfig, {src:'/MISSING_PATH_TO_DASHJS_LIB/', initVars:{}}, msePlatformConfig.dashjs);

            if (typeof window.dashjs === "object") {
                cb(window.dashjs);
            } else {
                $p.utils.getScript(ref._dashjsPlatformConfig.src, {
                    cache: true
                }).done(function () {
                    if (typeof window.dashjs === "object") {
                        cb(window.dashjs);
                    } else {
                        ref.sendUpdate('error', 2);
                    }
                }).fail(function () {
                    ref.sendUpdate('error', 2);
                });
            }
        },

        _getQualityList: function () {

            var avKeyFormat = this.pp.getConfig('dynamicStreamQualityKeyFormatAudioVideo'),
                aoKeyFormat = this.pp.getConfig('dynamicStreamQualityKeyFormatAudioOnly'),
                dpc = this.pp.getConfig('dynamicStreamQualityKeyBitrateRoundingDecimalPlacesCount'),
                bitrateKbps = 0,
                bitrateMbps = 0,
                bitrateUnit = 'kbps',
                bitrate = 0,
                audioList = null,
                videoList = null,
                buffer = [],
                keyName = null;


            if (!!this._showAudioOnly) {
                // Audio:
                audioList = this._dashjs.getBitrateInfoListFor('audio');

                for (var i = 0; i < audioList.length; i++) {
                    var item = audioList[i];

                    bitrateKbps = Math.floor(item['bitrate'] / 1000);
                    bitrateMbps = $p.utils.roundNumber(bitrateKbps / 1000, dpc);
                    bitrate = bitrateKbps < 1000 ? bitrateKbps : bitrateMbps;
                    bitrateUnit = bitrateKbps < 1000 ? 'kbps' : 'Mbps';

                    keyName = $p.utils.parseTemplate(aoKeyFormat, {
                        bitrate: bitrate,
                        bitrateunit: bitrateUnit,
                        bitratekbps: bitrateKbps,
                        bitratembps: bitrateMbps
                    });

                    buffer.push("" + keyName);
                }
            } else {
                // Video:
                videoList = this._dashjs.getBitrateInfoListFor('video');

                for (var i = 0; i < videoList.length; i++) {
                    var item = videoList[i];

                    bitrateKbps = Math.floor(item['bitrate'] / 1000);
                    bitrateMbps = $p.utils.roundNumber(bitrateKbps / 1000, dpc);
                    bitrate = bitrateKbps < 1000 ? bitrateKbps : bitrateMbps;
                    bitrateUnit = bitrateKbps < 1000 ? 'kbps' : 'Mbps';

                    keyName = $p.utils.parseTemplate(avKeyFormat, {
                        height: item['height'],
                        width: item['width'],
                        bitrate: bitrate,
                        bitrateunit: bitrateUnit,
                        bitratekbps: bitrateKbps,
                        bitratembps: bitrateMbps
                    });

                    buffer.push("" + keyName);
                }
            }

            buffer.push('auto');
            return buffer;
        },

        /*****************************************
         * Setters
         ****************************************/

        setQuality: function (quality) {

            if (this._quality === quality) {
                return;
            }

            if (!!this._showAudioOnly) {
                if (quality === "auto") {
                    this._dashjs.setAutoSwitchQualityFor('audio', true);
                } else {
                    this._dashjs.setAutoSwitchQualityFor('audio', false);
                    this._dashjs.setQualityFor('audio', this._qualityMap[quality]);
                }
            } else {
                if (quality === "auto") {
                    this._dashjs.setAutoSwitchQualityFor('video', true);
                } else {
                    this._dashjs.setAutoSwitchQualityFor('video', false);
                    this._dashjs.setQualityFor('video', this._qualityMap[quality]);
                }
            }

            this._quality = quality;
        },

        /************************************************
         * Getters
         ************************************************/

        getQuality: function () {
            return this._quality;
        }

    }, 'VIDEO');

}(window, document, jQuery, projekktor));/*
 * Copyright 2016-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.filenew.org/projekktor/license/
 *
 * This model is interfacing video.js library
 *
 * video.js
 * Website: http://videojs.com/
 * License: Apache 2.0 License
 *
 */

(function(window, document, $, $p){
    
    "use strict";

    $p.newModel({
        modelId: 'VIDEOJS',
        videojsVersion: '1.0',

        iLove: [{
            ext: 'mp4',
            type: 'video/mp4',
            platform: ['videojs']
        }],

        _videojs: null,

        _eventMap: {
            pause: "vjsPauseListener",
            play: "vjsPlayingListener",
            volumechange: "vjsVolumeListener",
            progress: "vjsProgressListener",
            timeupdate: "vjsTimeListener",
            ended: "vjsEndedListener",
            waiting: "vjsWaitingListener",
            canplaythrough: "vjsCanplayListener",
            canplay: "vjsCanplayListener",
            error: "vjsErrorListener",
            emptied: "vjsEmptiedListener",
            stalled: "vjsStalledListener",
            seeked: "vjsSeekedListener",
            loadedmetadata: "vjsResizeListener",
            loadeddata: "vjsResizeListener",
            resize: "vjsResizeListener"
        },

        applyMedia: function (destContainer) {
            var ref = this,
                videoJsLoadSuccess = function () {
                    if ($('#' + ref.getMediaElementId()).length === 0) {

                        ref.wasPersistent = false;

                        destContainer.html('').append(
                            $('<video/>')
                            .attr({
                                "id": ref.getMediaElementId(),
                                "poster": $p.utils.imageDummy(),
                                "src": ref.getSource()[0].src,
                                "loop": false,
                                "autoplay": false,
                                "preload": "none",
                                "x-webkit-airplay": "allow",
                                "playsinline": ""
                            }).prop({
                                controls: false,
                                volume: ref.getVolume()
                            }).css({
                                'width': '100%',
                                'height': '100%',
                                'position': 'absolute',
                                'top': 0,
                                'left': 0
                            })
                        );
                    }

                    ref.mediaElement = $('#' + ref.getMediaElementId());
                    ref.initVideoJs();
                },
                videoJsLoadFailed = function (jqxhr, settings, exception) {
                    ref.sendUpdate('error', 2);
                };

            // check if videojs.js is already loaded
            if (window.videojs && typeof window.videojs === 'function') {
                // just continue
                videoJsLoadSuccess();
            } else {
                // load video.js CSS
                $p.utils.getCss(ref.pp.getConfig('platformsConfig').videojs.css);
                // load video.js JS
                $p.utils.getScript(ref.pp.getConfig('platformsConfig').videojs.src, {
                        cache: true
                    })
                    .done(videoJsLoadSuccess)
                    .fail(videoJsLoadFailed);
            }
        },

        initVideoJs: function () {
            var ref = this,
                wasAwakening = ref.getState('AWAKENING'),
                vjsConfig = ref.pp.getConfig('platformsConfig').videojs.initVars;

            ref._videojs = window.videojs(ref.mediaElement[0], vjsConfig, function (event, data) {
                // on video.js ready
                ref.mediaElement = $(this.contentEl());

                ref.addVideoJsEventListeners();
                if (wasAwakening) {
                    ref.displayReady();
                    return;
                }

                if (ref.getSeekState('SEEKING')) {
                    if (ref._isPlaying) {
                        ref.setPlay();
                    }

                    ref.seekedListener();
                    return;
                }

                if (ref._isPlaying) {
                    ref.setPlay();
                }
            });
        },

        detachMedia: function () {
            try {
                this._videojs.dispose();
            } catch (e) {}
        },

        /*****************************************
         * Handle Events
         ****************************************/
        addVideoJsEventListeners: function () {
            var ref = this;
            // add model reference to current videojs instance for later usage within event handlers
            // NOTE: all event listeners in video.js are binded to the video.js instance (this === _videojs)
            ref._videojs._ppModel = ref;

            // add event listeners
            $.each(this._eventMap, function (key, value) {
                var listener = ref[value];
                ref._videojs.on(key, listener);
            });
        },

        removeVideoJsEventListeners: function () {
            var ref = this;

            // remove event listeners
            $.each(this._eventMap, function (key, value) {
                var listener = ref[value];
                ref._videojs.off(key, listener);
            });
        },

        vjsPlayingListener: function (evt) {
            var ref = this._ppModel;
            ref.playingListener();
        },

        vjsPauseListener: function (evt) {
            var ref = this._ppModel;
            ref.pauseListener();
        },
        vjsVolumeListener: function (evt) {
            var ref = this._ppModel;
            ref.volumeListener(this.volume());
        },

        vjsProgressListener: function (evt) {
            var ref = this._ppModel;
            ref.progressListener(evt);
        },
        vjsSeekedListener: function (evt) {
            var ref = this._ppModel;
            ref.seekedListener(this.currentTime());
        },

        vjsTimeListener: function (evt) {
            var ref = this._ppModel,
                time = {
                    position: this.currentTime(),
                    duration: this.duration()
                };
            ref.timeListener(time);
        },

        vjsEndedListener: function (evt) {
            var ref = this._ppModel || this;
            ref.removeVideoJsEventListeners();
            ref.endedListener(evt);
        },

        vjsResizeListener: function (evt) {
            var ref = this._ppModel,
                size = {
                    videoWidth: this.videoWidth(),
                    videoHeight: this.videoHeight()
                };

            ref.resizeListener(size);
        },

        vjsWaitingListener: function (evt) {
            var ref = this._ppModel;
            ref.waitingListener(evt);
        },

        vjsCanplayListener: function (evt) {
            var ref = this._ppModel;
            ref.canplayListener(evt);
        },

        vjsEmptiedListener: function (evt) {
            var ref = this._ppModel;
            ref._setBufferState('EMPTY');
        },

        vjsStalledListener: function (evt) {
            var ref = this._ppModel;
            ref._setBufferState('EMPTY');
        },

        vjsErrorListener: function (evt, vjsRef) {
            var ref = this._ppModel || this,
                vjsPlayer = vjsRef || this,
                error = vjsPlayer.error() || evt.error;
            try {
                switch (error.code) {
                    case error.MEDIA_ERR_ABORTED:
                        ref.sendUpdate('error', 1);
                        break;
                    case error.MEDIA_ERR_NETWORK:
                        ref.sendUpdate('error', 2);
                        break;
                    case error.MEDIA_ERR_DECODE:
                        ref.sendUpdate('error', 3);
                        break;
                    case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                        ref.sendUpdate('error', 4);
                        break;
                    default:
                        ref.sendUpdate('error', 5);
                        break;
                }
            } catch (e) {
                $p.utils.log(error, e);
            }
        },

        /*****************************************
         * Setters
         ****************************************/
        setPlay: function () {
            try {
                this._videojs.play();
            } catch (e) {}
        },

        setPause: function () {
            try {
                this._videojs.pause();
            } catch (e) {}
        },

        setVolume: function (volume) {
            if (this.mediaElement === null) {
                this.volumeListener(volume);
            } else {
                this._videojs.volume(volume);
            }
        },

        setSeek: function (newpos) {
            var ref = this,
                np = newpos;

            (function sk() {
                try {
                    ref._videojs.currentTime(np);
                    ref.timeListener({
                        position: np
                    });
                } catch (e) {
                    if (ref.mediaElement !== null) {
                        setTimeout(sk, 100);
                    }
                }
            })();
        },
        /************************************************
         * getters
         ************************************************/

        getVolume: function () {
            if (this.mediaElement === null) {
                return this._volume;
            }

            return this._videojs.volume();
        }
    });
    
}(window, document, jQuery, projekktor));/*
 * Projekktor II Plugin: Display
 *
 * DESC: Provides a standard display for cover-art, video or html content
 * features startbutton, logo-overlay and buffering indicator
 * Copyright 2010-2013, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    function projekktorDisplay() {}

    projekktorDisplay.prototype = {

        version: '1.1.2',
        reqVer: '1.8.0',

        logo: null,
        logoIsFading: false,

        display: null,

        displayClicks: 0,

        buffIcn: null,
        buffIcnSprite: null,
        buffIcnHangWatcher: null,
        bufferDelayTimer: null,


        _controlsDims: null,

        config: {
            displayClick: {
                callback: 'setPlayPause',
                value: null
            },
            displayPlayingClick: {
                callback: 'setPlayPause',
                value: null
            },
            displayDblClick: {
                callback: null,
                value: null
            },

            staticControls: false,

            /* time to delay buffering-icon-overlay once "waiting" event has been triggered */
            bufferIconDelay: 1000,

            bufferIconHangWatcherInterval: 5000,

            /* if set the indicator animation is tinkered from a cssprite - must be horizontal */
            spriteUrl: '',
            spriteWidth: 50,
            spriteHeight: 50,
            spriteTiles: 25,
            spriteOffset: 1,
            spriteCountUp: false
        },


        /* triggered on plugin-instantiation */
        initialize: function () {
            // create the display container itself
            this.display = this.applyToPlayer($('<div/>'));

            // create the startbutton
            this.startButton = this.applyToPlayer($('<div/>').addClass('start'), 'startbtn');

            // create buffericon
            this.buffIcn = this.applyToPlayer($('<div><div class="dots"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div></div>').addClass('buffering'), 'buffericn');

            this.setActive();

            // add spritelayer to buffericon (if required)
            if (this.config.spriteUrl !== '') {
                this.buffIcnSprite = $('<div/>')
                    .appendTo(this.buffIcn)
                    .css({
                        width: this.config.spriteWidth,
                        height: this.config.spriteHeight,
                        marginLeft: ((this.buffIcn.width() - this.config.spriteWidth) / 2) + "px",
                        marginTop: ((this.buffIcn.height() - this.config.spriteHeight) / 2) + "px",
                        backgroundColor: 'transparent',
                        backgroundImage: 'url(' + this.config.spriteUrl + ')',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: '0 0'
                    })
                    .addClass('inactive');
            }

            // create a dedicated media container (if none exists)
            this.pp.getMediaContainer();

            this.pluginReady = true;
        },



        /*****************************************
            EVENT HANDLERS
        *****************************************/
        displayReadyHandler: function () {

            if (this.pp.playerModel.getBufferState('FULL')) {
                this.hideBufferIcon();
            }
        },

        synchronizingHandler: function () {
            var ref = this;
            this.hideStartButton();
            this.showBufferIcon();
            // ppstart
            this.startButton.off().on('touchend click', function () {
                ref.pp.setPlay();
            });
        },

        synchronizedHandler: function () {
            this.readyHandler();
        },

        readyHandler: function () {
            this.hideBufferIcon();
            if (this.pp.getState('IDLE')) {
                this.showStartButton();
            }
        },

        bufferHandler: function (state) {
            if (this.pp.playerModel.getBufferState('EMPTY') && !this.pp.getState('PAUSED')) {
                this.showBufferIcon();
            } else {
                this.hideBufferIcon();
            }
        },

        stateHandler: function (state) {
            var bufferState = this.pp.playerModel.getBufferState();

            switch (state) {

                case 'IDLE':
                    clearTimeout(this._cursorTimer);
                    this.display.css('cursor', 'pointer');
                    this.showStartButton();
                    this.hideBufferIcon();
                    break;

                case 'PLAYING':
                    this.hideStartButton();
                    this.bufferHandler(bufferState);
                    break;

                case 'PAUSED':
                    this.showStartButton();
                    this.hideBufferIcon();
                    break;

                case 'STARTING':
                case 'AWAKENING':
                    this.showBufferIcon();
                    this.hideStartButton();
                    break;

                case 'COMPLETED':
                    this.hideBufferIcon();
                    break;

                default:
                    this.hideStartButton();
            }
        },

        errorHandler: function (errorCode) {
            this.hideBufferIcon();
            this.hideStartButton();
            if (!this.getConfig('skipTestcard')) {
                this.testCard(errorCode);
            }

        },

        startHandler: function () {
            this.mousemoveHandler();
        },

        stoppedHandler: function () {
            this.hideBufferIcon();
        },

        scheduleLoadingHandler: function () {
            this.hideStartButton();
            this.showBufferIcon();
        },

        scheduledHandler: function () {
            if (!this.getConfig('autoplay')) {
                this.showStartButton();
            }
            this.hideBufferIcon();
        },

        plugineventHandler: function (data) {
            if (data.PLUGIN == 'controlbar' && data.EVENT == 'show' && this.getConfig('staticControls')) {
                var pctCtrl = data.height * 100 / this.pp.getDC().height();
                this.display.height((100 - pctCtrl) + "%").data('sc', true);
            }
        },

        qualityChangeHandler: function () {
            var bufferState = this.pp.playerModel.getBufferState();
            this.bufferHandler(bufferState);
        },

        /*****************************************,
            DISPLAY: Mouse Handling
        *****************************************/
        mousemoveHandler: function (evt) {
            var dest = this.display;
            if (this.pp.getState('IDLE')) {
                dest.css('cursor', 'pointer');
                return;
            }
            dest.css('cursor', 'auto');
            clearTimeout(this._cursorTimer);
            if ("AWAKENING|ERROR|PAUSED".indexOf(this.pp.getState()) == -1) {
                this._cursorTimer = setTimeout(function () {
                    dest.css('cursor', 'none');
                }, 3000);
            }
        },

        mousedownHandler: function (evt) {
            var ref = this;

            if (($(evt.target).attr('id') || '').indexOf('_media') == -1 && !$(evt.target).hasClass(this.pp.getNS() + 'testcard')){
                return;
            }

            clearTimeout(this._cursorTimer);
            this.display.css('cursor', 'auto');

            if (evt.which != 1){
                return;
            }

            switch (this.pp.getState()) {
                case 'ERROR':
                    this.pp.setConfig({
                        disallowSkip: false
                    });
                    this.pp.setActiveItem('next');
                    this.display.html('').removeClass(this.pp.getNS() + 'testcard');
                    return;
                case 'IDLE':
                    this.pp.setPlay();
                    return;
            }

            if (this.pp.getHasGUI() === true){
                return;
            }

            this.displayClicks++;

            this.pp._promote('displayClick');

            if (this.displayClicks > 0) {
                setTimeout(
                    function () {
                        if (ref.displayClicks == 1) {
                            if (ref.pp.getState() == 'PLAYING'){
                                ref.clickHandler('displayPlaying');
                            }
                            else {
                                ref.clickHandler('display');
                            }
                        } 
                        else if (ref.displayClicks == 2) {
                            ref.clickHandler('displayDbl');
                        }
                        ref.displayClicks = 0;
                    }, 150
                );
            }
            return;
        },


        /*****************************************
            STARTBUTTON
        *****************************************/
        showStartButton: function () {
            this.startButton.removeClass('inactive').addClass('active');
        },

        hideStartButton: function () {
            this.startButton.removeClass('active').addClass('inactive');
        },


        /*****************************************
            BUFFERICON: fader and animator
        *****************************************/
        hideBufferIcon: function () {
            clearTimeout(this.bufferDelayTimer);
            clearInterval(this.buffIcnHangWatcher);
            this.buffIcn.addClass('inactive').removeClass('active');
        },

        showBufferIcon: function (instant) {
            var ref = this;

            clearTimeout(this.bufferDelayTimer);

            /* setup buffer icon hang watcher */
            clearInterval(this.buffIcnHangWatcher);
            if (this.getConfig('bufferIconHangWatcherInterval')) {
                this.buffIcnHangWatcher = setInterval(function () {
                    if (ref.pp.playerModel.getBufferState('FULL')) {
                        ref.hideBufferIcon();
                    }
                }, this.getConfig('bufferIconHangWatcherInterval'));
            }

            if (this.pp.getHasGUI() || this.pp.getState('IDLE')) {
                return;
            }

            if ((this.pp.getModel() === 'YTAUDIO' || this.pp.getModel() === 'YTVIDEO') && !this.pp.getState('IDLE')){
                instant = true;
            }

            if (instant !== true && this.getConfig('bufferIconDelay') > 0) {
                this.bufferDelayTimer = setTimeout(function () {
                    ref.showBufferIcon(true);
                }, this.getConfig('bufferIconDelay'));
                return;
            }

            if (this.buffIcn.hasClass('active')) {
                return;
            }
            this.buffIcn.addClass('active').removeClass('inactive');

            if (ref.buffIcnSprite === null) {
                return;
            }

            var startOffset = (ref.config.spriteCountUp === true) ? 0 : (ref.config.spriteHeight + ref.config.spriteOffset) * (ref.config.spriteTiles - 1),
                spriteOffset = startOffset;
            ref.buffIcnSprite.addClass('active').removeClass('inactive');
            (function bi() {

                if (!ref.buffIcn.is(':visible')) {
                    return;
                }
                ref.buffIcnSprite.css('backgroundPosition', '0px -' + spriteOffset + "px");

                if (ref.config.spriteCountUp === true){
                    spriteOffset += ref.config.spriteHeight + ref.config.spriteOffset;
                }
                else {
                    spriteOffset -= ref.config.spriteHeight + ref.config.spriteOffset;
                }

                if (spriteOffset > (startOffset + ref.config.spriteHeight) * ref.config.spriteTiles || spriteOffset < ref.config.spriteOffset) {
                    spriteOffset = startOffset;
                }

                setTimeout(bi, 60);
            })();
        },

        testCard: function (errorCode) {
            var msgTxt = $p.utils.errorMessage(errorCode, this.pp);

            if (this.pp.getItemCount() > 1) {
                // "press next to continue"
                msgTxt += ' ' + $p.utils.errorMessage(99, this.pp);
            }

            if (msgTxt.length < 3) {
                msgTxt = 'ERROR #' + errorCode;
            }

            this.display
                .html('')
                .addClass(this.pp.getNS() + 'testcard')
                .html('<p>' + msgTxt + '</p>');
        }


    };

    $p.plugins.projekktorDisplay = projekktorDisplay;
}(window, document, jQuery, projekktor));
/*
 * Projekktor II Plugin: Controlbar
 *
 * DESC: Adds a fully features cb element to the player
 * Copyright 2010-2014 Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2015-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    function projekktorControlbar() {}

    projekktorControlbar.prototype = {

        version: '1.2.2',
        reqVer: '1.8.0',
        
        _cTimer: null,
        _lastPos: -1,
        _isDVR: false,
        _noHide: false,
        _sSliderAct: false,
        _vSliderAct: false,

        cb: null,

        controlElements: {},
        controlElementsConfig: {
            'timeleft': null,
            'sec_dur': null,
            'min_dur': null,
            'sec_abs_dur': null,
            'min_abs_dur': null,
            'hr_dur': null,
            'sec_elp': null,
            'min_elp': null,
            'sec_abs_elp': null,
            'min_abs_elp': null,
            'hr_elp': null,
            'sec_rem': null,
            'min_rem': null,
            'sec_abs_rem': null,
            'min_abs_rem': null,
            'hr_rem': null,
            'sec_tip': null,
            'min_tip': null,
            'sec_abs_tip': null,
            'min_abs_tip': null,
            'hr_tip': null,

            'cb': null,

            'playhead': {
                on: null,
                call: null
            },
            'loaded': null, // { on:['touchstart', 'click'], call:'scrubberClk'},
            'golive': [{
                on: ['touchstart', 'click'],
                call: 'goliveClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'scrubber': null, // { on:['touchstart', 'click'], call:'scrubberClk'},
            'scrubbertip': null,
            'scrubberknob': null,
            'scrubberdrag': [{
                on: ['mouseenter', 'touchstart'],
                call: 'scrubberShowTooltip'
            }, {
                on: ['mouseout', 'touchend'],
                call: 'scrubberHideTooltip'
            }, {
                on: ['mousemove', 'touchmove'],
                call: 'scrubberdragTooltip'
            }, {
                on: ['mousedown', 'touchstart'],
                call: 'scrubberdragStartDragListener'
            }],
            'play': [{
                on: ['touchend', 'click'],
                call: 'playClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'pause': [{
                on: ['touchstart', 'click'],
                call: 'pauseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'stop': [{
                on: ['touchstart', 'click'],
                call: 'stopClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'prev': [{
                on: ['touchstart', 'click'],
                call: 'prevClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'prevC': [{
                on: ['touchstart', 'click'],
                call: 'prevCClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'next': [{
                on: ['touchstart', 'click'],
                call: 'nextClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'nextC': [{
                on: ['touchstart', 'click'],
                call: 'nextCClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'rewind': [{
                on: ['touchstart', 'click'],
                call: 'rewindClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'forward': [{
                on: ['touchstart', 'click'],
                call: 'forwardClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'fsexit': [{
                on: ['touchstart', 'click'],
                call: 'exitFullscreenClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'fsenter': [{
                on: ['touchend', 'click'],
                call: 'enterFullscreenClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'loquality': [{
                on: ['touchstart', 'click'],
                call: 'setQualityClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'hiquality': [{
                on: ['touchstart', 'click'],
                call: 'setQualityClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'vslider': [{
                on: ['touchstart', 'click'],
                call: 'vsliderClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vmarker': [{
                on: ['touchstart', 'click'],
                call: 'vsliderClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vknob': {
                on: ['mousedown'],
                call: 'vknobStartDragListener'
            },

            'volumePanel': [{
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }],
            'volume': null,

            'mute': [{
                on: ['touchstart', 'click'],
                call: 'muteClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'unmute': [{
                on: ['touchstart', 'click'],
                call: 'unmuteClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vmax': [{
                on: ['touchstart', 'click'],
                call: 'vmaxClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'open': [{
                on: ['touchstart', 'click'],
                call: 'openCloseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'close': [{
                on: ['touchstart', 'click'],
                call: 'openCloseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'loop': [{
                on: ['touchstart', 'click'],
                call: 'loopClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'controls': null,
            'title': null,
            'logo': {
                on: ['touchstart', 'click'],
                call: 'logoClk'
            }
        },

        config: {
            /* Plugin: cb - enable/disable fade away of overlayed controls */
            toggleMute: true,
            fadeDelay: 2500,
            showOnStart: false,
            showOnIdle: false,
            hideWhenPaused: false,

            /* cuepoints */
            showCuePoints: true,
            showCuePointsImmediately: true, // should the cuepoint be displayed immediately after current playlist item duration is known or only if the relevant part of the playlist item is buffered and ready to be played
            showCuePointGroups: [],
            minCuePointSize: '2px', // minimal cuepoint size
            cuePointEvents: [
                /* { // Sample global blip events config. You can set individual events for every blip within cuepoint blipEvents object.
                  'events': ['click', 'mouseover'],
                  'handler': function(e){ // the event parameter passed to the event handler has data property which contains:
                                          // pp - reference to the current projekktor instance
                                          // cuepoint - reference to the cuepoint represented by current blip
                                          // any other custom data which was passed inside 'data' property described below
                     e.data.pp.setGotoCuePoint(e.data.cuepoint.id);
                     console.log(e.data.test);
                  },
                  'data': {test:'data test'} // you can add any custom data you want
                 } */
            ],
            /**
             * displays logo on the controlbar
             * You can set the logo config globally for all playlist items in the controlbar plugin config or locally for every playlist item.
             * Playlist item config overwrites the global config.
             */
            logo: {
                /* // Sample global config (per item config follows the same schema).
                src: 'media/logo.png', // URL to your logo image (works fine with SVG too)
                title: 'visit our website', // Title added to the <img> element title and alt attributes.
                link: { // URL to go to after click on the logo [optional].
                    url: 'http://www.projekktor.com',
                    target: '_blank'
                },
                callback: function(player, e){ // Function called after click on the logo [optional]. It works only if the link config isn't present.
                                               // There are two parameters passed to the callback function:
                                               // player - reference to the current projekktor instance
                                               // e - event object
                    alert("projekktor v." + player.getVersion());
                }*/
            },

            onPrevClick: null,
            onNextClick: null,

            /* Default layout */
            controlsTemplate: '<ul class="left"><li><div %{play}></div><div %{pause}></div></li></ul><ul class="right"><li><div %{logo}></div></li><li><div %{fsexit}></div><div %{fsenter}></div></li><li><div %{settingsbtn}></div></li><li><div %{tracksbtn}></div></li><li><div %{vmax}></div></li><li><div %{vslider}><div %{vmarker}></div><div %{vknob}></div></div></li><li><div %{mute}></div><div %{unmute}></div></li><li><div %{timeleft}>%{hr_elp}:%{min_elp}:%{sec_elp} | %{hr_dur}:%{min_dur}:%{sec_dur}</div></li><li><div %{nextC}></div></li><li><div %{prevC}></div></li></ul><ul class="bottom"><li><div %{scrubber}><div %{loaded}></div><div %{playhead}></div><div %{scrubberknob}></div><div %{scrubberdrag}></div></div></li></ul><div %{scrubbertip}>%{hr_tip}:%{min_tip}:%{sec_tip}</div>'
        },

        initialize: function () {

            var ref = this,
                playerHtml = this.playerDom.html(),
                useTemplate = true,
                classPrefix = this.pp.getNS();

            // check if ANY control element already exists
            Object.keys(this.controlElementsConfig).some(function (controlElementName) {
                if (playerHtml.match(new RegExp(classPrefix + controlElementName, 'gi'))) {
                    useTemplate = false;
                    return true;
                }
            });

            if (useTemplate) {
                this.cb = this.applyToPlayer($(('<div/>')).addClass('controls'));
                this.applyTemplate(this.cb, this.getConfig('controlsTemplate'));
            } else {
                this.cb = this.playerDom.find("." + classPrefix + 'controls');
            }

            // find (inter)active elements
            Object.keys(this.controlElementsConfig).forEach(function (controlElementName) {
                ref.controlElements[controlElementName] = $(ref.playerDom).find('.' + classPrefix + controlElementName);
                $p.utils.blockSelection($(ref.controlElements[controlElementName]));
            });

            this.addGuiListeners();
            this.showcb();
            this.pluginReady = true;
        },

        /* parse and apply controls dom-template */
        applyTemplate: function (dest, templateString) {
            var classPrefix = this.pp.getNS();

            // apply template string if required:
            if (templateString) {
                // replace tags by class directive
                var tagsUsed = templateString.match(/\%{[a-zA-Z_]*\}/gi);
                if (tagsUsed != null) {
                    $.each(tagsUsed, function (key, value) {
                        var cn = value.replace(/\%{|}/gi, '');
                        if (value.match(/\_/gi)) {
                            // replace with span markup
                            templateString = templateString.replace(value, '<span class="' + classPrefix + cn + '"></span>');
                        } else {
                            templateString = templateString.replace(value, 'class="' + classPrefix + cn + '"' + $p.utils.i18n(' aria-label="%{' + cn + '}" title="%{' + cn + '}" '));
                        }
                    });
                }

                dest.html(templateString);
            }
        },

        updateDisplay: function () {
            var state = this.pp.getState();

            // nothing to do
            if (this.getConfig('controls') === false) {
                this.hidecb();
                return;
            }

            // prev / next button
            if (this.getConfig('disallowSkip')) {
                this._active('prev', false);
                this._active('prevC', false);
                this._active('next', false);
                this._active('nextC', false);
            } else {
                this._active('prev', this.pp.getPreviousItem() !== false);
                this._active('prevC', typeof this.config.onPrevClick === 'function');
                this._active('next', this.pp.getNextItem() !== false);
                this._active('nextC', typeof this.config.onNextClick === 'function');
            }

            // play / pause button
            if (this.getConfig('disablePause')) {
                this._active('play', false);
                this._active('pause', false);
            } else {
                if (state === 'PLAYING') {
                    this.drawPauseButton();
                }
                if (state === 'PAUSED') {
                    this.drawPlayButton();
                }
                if (state === 'IDLE') {
                    this.drawPlayButton();
                }    
            }

            // stop button
            this._active('stop', state !== 'IDLE');



            // rewind & forward
            this._active('forward', state !== 'IDLE');
            this._active('rewind', state !== 'IDLE');


            // fullscreen button
            if (this.pp.getIsFullscreen() === true) {
                this.drawExitFullscreenButton();
            } else {
                this.drawEnterFullscreenButton();
            }

            if (!this.pp.getFullscreenEnabled()) {
                this._active('fsexit', false);
                this._active('fsenter', false);
            }


            // loop button
            this._active('loop', true);
            this.controlElements.loop
                .addClass(this.pp.getConfig('loop') ? 'on' : 'off')
                .removeClass(!this.pp.getConfig('loop') ? 'on' : 'off');

            // hd / sd toggl
            this.displayQualityToggle();

            // init time display
            this.displayTime();

            // update progress
            this.displayProgress();

            // init volume display
            this.displayVolume(this.pp.getVolume());
        },

        deconstruct: function () {
            this.pluginReady = false;
            $.each(this.controlElements, function () {
                $(this).off();
            });
            $.each(this._appliedDOMObj, function () {
                $(this).off();
            });
        },


        /* assign listener methods to controlbar elements */
        addGuiListeners: function () {
            var ref = this;

            // if (!this.getConfig('controls')) return;

            $.each(this.controlElementsConfig, function (key, elmCfg) {
                if (elmCfg == null) {
                    return true;
                }

                if (!(elmCfg instanceof Array)) {
                    elmCfg = [elmCfg];
                }

                for (var subset = 0; subset < elmCfg.length; subset++) {

                    if (elmCfg[subset].on == null) {
                        continue;
                    }

                    $.each(elmCfg[subset].on, function (evtKey, eventName) {

                        // thanx to FF3.6 this approach became a little complicated:
                        var isSupported = ("on" + eventName in window.document),
                            callback = elmCfg[subset].call;

                        if (!isSupported) {
                            var el = document.createElement('div');
                            el.setAttribute("on" + eventName, 'return;');
                            isSupported = (typeof el["on" + eventName] == 'function');
                        }

                        if (isSupported) {
                            ref.controlElements[key].on(eventName, function (event) {
                                ref.clickCatcher(event, callback, ref.controlElements[key]);
                            });

                        }

                    });
                }
                return true;
            });
            this.cb.mousemove(function (event) {
                ref.controlsFocus(event);
            });
            this.cb.mouseout(function (event) {
                ref.controlsBlur(event);
            });
        },

        /* generic click handler for all controlbar buttons */
        clickCatcher: function (evt, callback, element) {
            //evt.stopPropagation();
            evt.preventDefault();

            this[callback](evt, element);

            return false;
        },


        touchEnd: function () {
            var ref = this;
            this._cTimer = setTimeout(function () {
                ref.hidecb();
            }, this.getConfig('fadeDelay'));
            this._noHide = false;
        },


        /*******************************
        DOM Manipulations
        *******************************/
        drawTitle: function () {
            this.controlElements['title'].html(this.getConfig('title', ''));
        },

        displayLogo: function () {
            var logoConfig = this.pp.getConfig('logo') || this.getConfig('logo'),
                logoElement = this.controlElements['logo'],
                img;

            if (logoElement && logoConfig && logoConfig.src) {
                img = $('<img>')
                    .attr({
                        src: logoConfig.src,
                        alt: logoConfig.title,
                        title: logoConfig.title
                    });

                if ((logoConfig.link && logoConfig.link.url) || typeof logoConfig.callback == 'function') {
                    img.css({
                        cursor: 'pointer'
                    });
                }

                logoElement.empty().append(img);
                this._active('logo', true);
            } else {
                this._active('logo', false);
            }
        },

        canHide: function () {
            var state = this.pp.getState(),
                result = this.cb === null ||
                this._noHide ||
                (state === 'IDLE' && this.getConfig('showOnIdle')) ||
                (state === 'PAUSED' && !this.getConfig('hideWhenPaused'));

            return !result;
        },

        canShow: function () {
            var state = this.pp.getState(),
                result = this.cb === null ||
                !this.getConfig('controls') ||
                this.pp.getHasGUI() ||
                ('ERROR|COMPLETED|DESTROYING'.indexOf(state) > -1) ||
                ('AWAKENING|STARTING'.indexOf(state) > -1 && !this.getConfig('showOnStart')) ||
                (state === 'IDLE' && !this.getConfig('showOnIdle')) ||
                false;

            return !result;
        },

        hidecb: function () {
            var wasVisible = this.cb.hasClass('active');

            clearTimeout(this._cTimer);

            // don't hide
            if (!this.canHide()) {
                return;
            }

            this.cb.removeClass('active').addClass('inactive');

            if (wasVisible) {
                this.sendEvent('hide', this.cb);
            }
        },

        showcb: function () {
            var ref = this,
                isVisible = this.cb.hasClass('active');

            // always clear timeout, stop animations
            clearTimeout(this._cTimer);
            this._cTimer = setTimeout(
                function () {
                    ref.hidecb();
                }, this.getConfig('fadeDelay')
            );

            if (!this.canShow()) {
                return;
            }

            // show up:
            if (!isVisible) {
                this.cb.removeClass('inactive').addClass('active');
                this.sendEvent('show', this.cb);
            }

            this.updateDisplay();
        },

        displayTime: function (pct, dur, pos) {
            if (this.pp.getHasGUI()) {
                return;
            }

            var percent = ((pct || this.pp.getLoadPlaybackProgress() || 0) * 10) / 10,
                duration = dur || this.pp.getDuration() || 0,
                position = pos || this.pp.getPosition() || 0,
                times;

            // limit updates to one per second
            if (Math.abs(this._lastPos - position) >= 1) {

                // check if there is anything to display
                if (duration === 0) { // hide time display elements e.g. live streams on Android
                    this._active('scrubber', false);
                    this._active('timeleft', false);
                } else { // show time display elements
                    this._active('scrubber', true);
                    this._active('timeleft', true);
                }

                times = $.extend({}, this._clockDigits(duration, 'dur'), this._clockDigits(position, 'elp'), this._clockDigits(duration - position, 'rem'));

                // update scrubber:
                this.controlElements['playhead'].css({
                    width: percent + "%"
                });
                this.controlElements['scrubberknob'].css({
                    left: percent + "%"
                });

                // update last position value
                this._lastPos = position;

                // update numeric displays
                for (var key in this.controlElements) {
                    if(this.controlElements.hasOwnProperty(key)){
                        if (key == 'cb') {
                            break;
                        }

                        if (times[key]) {
                            $.each(this.controlElements[key], function () {
                                $(this).html(times[key]);
                            });
                        }
                    }
                }
            }

        },

        displayProgress: function () {
            var percent = Math.round(this.pp.getLoadProgress() * 10) / 10,
                lastUpdatedPercent = this.controlElements['loaded'].data('pct') || undefined;

            // limit updates to 1 per 5%
            if (lastUpdatedPercent === undefined || lastUpdatedPercent !== percent) {
                this.controlElements['loaded'].data('pct', percent).css("width", percent + "%");
            };
        },

        displayVolume: function (volume) {

            if (this._vSliderAct == true) {
                return;
            }
            if (volume == null) {
                return;
            }    

            var fixed = this.getConfig('fixedVolume') || (this.pp.playerModel && this.pp.playerModel._fixedVolume),
                toggleMute = (this.controlElements['mute'].hasClass('toggle') || this.controlElements['unmute'].hasClass('toggle') || this.getConfig('toggleMute')),
                // check if the volume is in the proper range and correct its value if it's not
                volume = volume > 1 ? 1 : volume,
                volume = volume < 0 ? 0 : volume;

            // hide volume mess in case volume is fixed
            this._active('mute', !fixed);
            this._active('unmute', !fixed);
            this._active('vmax', !fixed);
            this._active('vknob', !fixed);
            this._active('vmarker', !fixed);
            this._active('vslider', !fixed);

            if (fixed) {
                return;
            }

            // make controls visible in order to allow dom manipulations
            // this.cb.stop(true, true).show();
            var vslider = this.controlElements['vslider'],
                vmarker = this.controlElements['vmarker'],
                vknob = this.controlElements['vknob'],
                orientation = vslider.width() > vslider.height() ? "horizontal" : "vertical";

            switch (orientation) {
                case "horizontal":

                    vmarker.css('width', volume * 100 + "%");
                    vknob.css('left', Math.round((vslider.width() * volume) - (vknob.width() * volume)) + "px");

                    break;

                case "vertical":

                    vmarker.css('height', volume * 100 + "%");
                    vknob.css('bottom', Math.round((vslider.height() * volume) - (vknob.height() * volume)) + "px");

                    break;
            }

            // "li" hack
            var lis = this.controlElements['volume'].find('li'),
                set = lis.length - Math.ceil((volume * 100) / lis.length);

            for (var i = 0; i <= lis.length; i++) {
                if (i >= set) {
                    $(lis[i]).addClass('active');
                }
                else {
                    $(lis[i]).removeClass('active');
                }
            }


            if (toggleMute) {
                switch (parseFloat(volume)) {
                    case 0:
                        this._active('mute', false);
                        this._active('unmute', true);
                        break;

                    default:
                        this._active('mute', true);
                        this._active('unmute', false);
                        break;
                }
            }
        },

        displayCuePoints: function (immediately) {

            if (!this.getConfig('showCuePoints')){
                return;
            }

            var ref = this,
                prefix = this.pp.getNS(),
                duration = this.pp.getDuration();

            ref.controlElements['scrubber'].children().remove('.' + prefix + 'cuepoint');

            $.each(this.pp.getCuePoints(this.pp.getItemId(), true) || [], function () {

                // display cuepoins only from given groups or all cuepoints if there are no specyfic groups defined (showCuePointGroups array is empty)
                if (ref.getConfig('showCuePointGroups').length && ref.getConfig('showCuePointGroups').indexOf(this.group) == -1) {
                    return;
                }

                var blipWidth = this.on != this.off ? (((this.off - this.on) / duration) * 100) + '%' : ref.getConfig('minCuePointSize'),
                    blipPos = (this.on / duration) * 100,
                    blip = $(document.createElement('div'))
                    .addClass(prefix + 'cuepoint')
                    .addClass(prefix + 'cuepoint_group_' + this.group)
                    .addClass(prefix + 'cuepoint_' + this.id)
                    .addClass(immediately ? 'active' : 'inactive')
                    .css('left', blipPos + "%")
                    .css('width', blipWidth),
                    blipEvents = ref.config.cuePointEvents.concat(this.blipEvents);

                if (this.title != '') {
                    blip.attr('title', this.title);
                }

                if (!immediately) {
                    this.addListener('unlock', function () {
                        $(blip).removeClass('inactive').addClass('active');
                        ref._bindCuePointBlipEvents(blip, blipEvents, {
                            pp: ref.pp,
                            cuepoint: this
                        });
                    });
                } else {
                    ref._bindCuePointBlipEvents(blip, blipEvents, {
                        pp: ref.pp,
                        cuepoint: this
                    });
                }

                ref.controlElements['scrubber'].append(blip);

            });

        },

        drawPauseButton: function (event) {
            this._active('pause', true);
            this._active('play', false);
        },

        drawPlayButton: function (event) {
            this._active('pause', false);
            this._active('play', true);
        },


        drawEnterFullscreenButton: function (event) {
            this._active('fsexit', false);
            this._active('fsenter', true);
        },

        drawExitFullscreenButton: function (event) {
            this._active('fsexit', true);
            this._active('fsenter', false);
        },

        displayQualityToggle: function (qual) {

            var qualsCfg = this.getConfig('playbackQualities'),
                qualsItm = this.pp.getPlaybackQualities(),
                classPrefix = this.pp.getNS(),
                best = [];

            // off
            if (qualsItm.length < 2 || qualsCfg.length < 2) {
                this.controlElements['loquality'].removeClass().addClass('inactive').addClass(classPrefix + 'loquality').data('qual', '');
                this.controlElements['hiquality'].removeClass().addClass('inactive').addClass(classPrefix + 'hiquality').data('qual', '');
                return;
            }

            // get two best variants
            qualsCfg.sort(function (a, b) {
                return a.minHeight - b.minHeight;
            });
            for (var i = qualsCfg.length; i--; i > 0) {
                if ($.inArray(qualsCfg[i].key, qualsItm) > -1){
                    best.push(qualsCfg[i].key);
                }
                if (best.length > 1) {
                    break;
                }
            }

            this.cb.addClass('qualities');
            if (best[0] == this.pp.getPlaybackQuality()) {
                this._active('loquality', true).addClass('qual' + best[1]).data('qual', best[1]);
                this._active('hiquality', false).addClass('qual' + best[0]).data('qual', best[0]);
            } else {
                this._active('loquality', false).addClass('qual' + best[1]).data('qual', best[1]);
                this._active('hiquality', true).addClass('qual' + best[0]).data('qual', best[0]);
            }
        },


        /*******************************
        Player Event Handlers
        *******************************/
        itemHandler: function (data) {

            $(this.cb).find('.' + this.pp.getNS() + 'cuepoint').remove();
            this._lastPos = -1;
            this.updateDisplay();
            this.drawTitle();
            this.displayLogo();
            this.pluginReady = true;
        },

        startHandler: function () {
            if (this.getConfig('showOnStart') === true) {
                this.showcb();
            } else {
                this.hidecb();
            }
        },

        readyHandler: function (data) {
            this.showcb();
            this.pluginReady = true;
        },

        stateHandler: function (state) {
            this.updateDisplay();

            if ('STOPPED|AWAKENING|IDLE|COMPLETED'.indexOf(state) > -1) {
                this.displayTime(0, 0, 0);
                this.displayProgress(0);
            }

            if ('PLAYING|STOPPED|COMPLETED|DESTROYING'.indexOf(state) > -1) {
                return;
            }

            if ('ERROR'.indexOf(state) > -1) {
                this._noHide = false;
            }

            this.showcb();

            this.displayProgress();
        },

        scheduleModifiedHandler: function () {
            if (this.pp.getState() === 'IDLE') {
                return;
            }
            this.updateDisplay();
            this.displayTime();
            this.displayProgress();
        },

        volumeHandler: function (value) {
            this.displayVolume(value);
        },

        progressHandler: function (obj) {
            this.displayProgress();
        },

        timeHandler: function (obj) {
            this.displayTime();
            this.displayProgress();
        },

        qualityChangeHandler: function (qual) {
            this.displayQualityToggle(qual);
        },

        streamTypeChangeHandler: function (streamType) {
            if (streamType === 'dvr' || streamType === 'live') {
                this._isDVR = true;
                this.setActive(this.controlElements['golive'], true);
            } else {
                this._isDVR = false;
                this.setActive(this.controlElements['golive'], false);
            }
        },

        isLiveHandler: function (islive) {
            if (islive) {
                this.controlElements['golive'].addClass('on').removeClass('off');
            } else {
                this.controlElements['golive'].addClass('off').removeClass('on');
            }
        },

        fullscreenHandler: function (inFullscreen) {

            this._noHide = false;
            this._vSliderAct = false;

            if (!this.getConfig('controls')) {
                return;
            }
            if (!this.pp.getFullscreenEnabled()) {
                return;
            }

            if (inFullscreen) {
                this.cb.addClass('fullscreen');
                this.drawExitFullscreenButton();
            } else {
                this.cb.removeClass('fullscreen');
                this.drawEnterFullscreenButton();
            }
        },

        durationChangeHandler: function () {
            if (this.pp.getDuration() != 0) {
                this.displayCuePoints(this.getConfig('showCuePointsImmediately'));
            }
        },

        cuepointsSyncHandler: function (cuepoints) {
            if (this.pp.getDuration() != 0) {
                this.displayCuePoints(this.getConfig('showCuePointsImmediately'));
            }
        },

        errorHandler: function (value) {
            this._noHide = false;
            this.hidecb();
        },

        leftclickHandler: function () {
            this.mouseleaveHandler();
        },

        focusHandler: function (evt) {
            this.showcb();
        },

        mouseenterHandler: function (evt) {
            this.showcb();
        },

        mousemoveHandler: function (evt) {
            if (this.pp.getState('STARTING')) {
                return;
            }
            this.showcb();
        },

        mouseleaveHandler: function () {},

        mousedownHandler: function (evt) {
            this.showcb();
        },

        /*******************************
        ControlUI Event LISTENERS
        *******************************/
        controlsFocus: function (evt) {

            this._noHide = true;
        },

        controlsBlur: function (evt) {
            this._noHide = false;
        },

        setQualityClk: function (evt) {
            this.pp.setPlaybackQuality($(evt.currentTarget).data('qual'));
        },

        goliveClk: function (evt) {
            this.pp.setSeek(-1);
        },

        playClk: function (evt) {
            this.pp.setPlay();
        },

        pauseClk: function (evt) {
            this.pp.setPause();
        },

        stopClk: function (evt) {
            this.pp.setStop();
        },

        startClk: function (evt) {
            this.pp.setPlay();
        },

        controlsClk: function (evt) {},

        prevClk: function (evt) {
            this.pp.setActiveItem('previous');
        },

        nextClk: function (evt) {
            this.pp.setActiveItem('next');
        },

        prevCClk: function (evt) {
            this.config.onPrevClick();
        },

        nextCClk: function (evt) {
            this.config.onNextClick();
        },

        forwardClk: function (evt) {
            this.pp.setPlayhead('+10');
        },

        rewindClk: function (evt) {
            this.pp.setPlayhead('-10');
        },

        muteClk: function (evt) {
            this.pp.setMuted(true);
        },

        unmuteClk: function (evt) {
            this.pp.setMuted(false);
        },

        vmaxClk: function (evt) {
            this.pp.setVolume(1);
        },

        enterFullscreenClk: function (evt) {
            this.pp.setFullscreen(true);
        },

        exitFullscreenClk: function (evt) {
            this.pp.setFullscreen(false);
        },

        loopClk: function (evt) {
            this.pp.setLoop($(evt.currentTarget).hasClass('inactive') || false);
            this.updateDisplay();
        },

        vmarkerClk: function (evt) {
            this.vsliderClk(evt);
        },

        openCloseClk: function (evt) {
            var ref = this;
            $($(evt.currentTarget).attr('class').split(/\s+/)).each(function (key, value) {
                if (value.indexOf('toggle') === -1) {
                    return;
                }
                ref.playerDom.find('.' + value.substring(6)).slideToggle('slow', function () {
                    ref.pp.setSize();
                });
                ref.controlElements['open'].toggle();
                ref.controlElements['close'].toggle();
            });
        },

        logoClk: function (evt) {
            var logoConfig = this.pp.getConfig('logo') || this.getConfig('logo');
            if (logoConfig) {
                if (logoConfig.link && logoConfig.link.url) {
                    window.open(logoConfig.link.url, logoConfig.link.target);
                } else if (typeof logoConfig.callback === 'function') {
                    logoConfig.callback(this.pp, evt);
                }
            }
        },

        volumeBtnHover: function (evt) {
            clearTimeout(this._outDelay);
            this.setActive(this.controlElements['volumePanel'], true);
        },

        volumeBtnOut: function (evt, elm) {
            var ref = this;
            if (evt.currentTarget != elm.get(0)) {
                return;
            }    
            if (evt.relatedTarget == elm.get(0)) {
                return;
            }
            this._outDelay = setTimeout(function () {
                ref.setActive(ref.controlElements['volumePanel'], false);
            }, 100);
        },

        vsliderClk: function (evt) {
            if (this._vSliderAct == true) {
                return;
            }


            var slider = $(this.controlElements['vslider']),
                orientation = slider.width() > slider.height() ? 'hor' : 'vert',
                totalDim = (orientation == 'hor') ? slider.width() : slider.height(),
                pageX = (evt.originalEvent.touches) ? evt.originalEvent.touches[0].pageX : evt.pageX,
                pageY = (evt.originalEvent.touches) ? evt.originalEvent.touches[0].pageY : evt.pageY,
                requested = (orientation == 'hor') ? pageX - slider.offset().left : pageY - slider.offset().top,
                result = 0;

            if (requested < 0 || isNaN(requested) || requested == undefined) {
                result = 0;
            } else {
                result = (orientation == 'hor') ? (requested / totalDim) : 1 - (requested / totalDim);
            }

            this.pp.setVolume(result);
        },

        scrubberShowTooltip: function (event) {
            var pointerPosition = this._getPointerPosition(event);

            if (this.pp.getDuration() === 0) {
                return;
            }
            clearTimeout(this._cTimer);

            this.updateScrubberTooltip(pointerPosition);
        },

        scrubberHideTooltip: function (event) {
            this.setActive(this.controlElements['scrubbertip'], false);
        },

        scrubberdragTooltip: function (event) {
            
            var pointerPosition = this._getPointerPosition(event);

            // IE amd Chrome issues (mouseenter,mouseleave)
            if (this.pp.getDuration() === 0) {
                return;
            }

            this.updateScrubberTooltip(pointerPosition);
        },

        updateScrubberTooltip: function (pointerPosition) {
            var ref = this,
                slider = $(this.controlElements['scrubberdrag'][0]),
                tip = $(this.controlElements['scrubbertip']),
                newPos = pointerPosition.clientX - slider.offset().left - (tip.outerWidth() / 2),
                timeIdx = this.pp.getDuration() / 100 * ((pointerPosition.clientX - slider.offset().left) * 100 / slider.width()),
                times = this._clockDigits(timeIdx, 'tip', 0, this.pp.getDuration());

            this.setActive(this.controlElements['scrubbertip'], true);

            Object.keys(times).forEach(function (key) {
                if (ref.controlElements.hasOwnProperty(key)) {
                    $(ref.controlElements[key]).html(times[key]);
                }
            });

            newPos = (newPos < 0) ? 0 : newPos;
            newPos = (newPos > slider.width() - tip.outerWidth()) ? slider.width() - tip.outerWidth() : newPos;

            tip.css({
                left: newPos + "px"
            });
        },

        updateScrubberKnobAndPlayhead: function (pointerPosition) {
            var slider = $(this.controlElements['scrubberdrag'][0]),
                knob = $(this.controlElements['scrubberknob']),
                playhead = $(this.controlElements['playhead']),
                newPos = pointerPosition.clientX - slider.offset().left;

            newPos = (newPos < 0) ? 0 : newPos;
            newPos = newPos / slider.width() * 100;
            newPos = (newPos > 100) ? 100 : newPos;

            knob.css({
                left: newPos + "%"
            });
            playhead.css({
                width: newPos + "%"
            });
        },

        scrubberdragStartDragListener: function (event) {

            if (this.getConfig('disallowSkip') === true) {
                return;
            }

            this._sSliderAct = true;

            var ref = this,
                jqEventNS = '.' + this.pp.getNS() + 'scrubberdrag',
                slider = ref.controlElements['scrubberdrag'],
                loaded = ref.controlElements['loaded'],
                lastPointerPosition = this._getPointerPosition(event),
                seekDelayTimer,

                applyValue = function (pointerPosition) {

                    var newPos = Math.abs(slider.offset().left - pointerPosition.clientX);

                    newPos = (newPos > slider.width()) ? slider.width() : newPos;
                    newPos = (newPos > loaded.width()) ? loaded.width() : newPos;
                    newPos = (newPos < 0) ? 0 : newPos;
                    newPos = Math.abs(newPos / slider.width()) * ref.pp.getDuration();

                    if (newPos > 0) {
                        ref.updateScrubberKnobAndPlayhead(pointerPosition);
                        // delay the seek call
                        clearInterval(seekDelayTimer);
                        seekDelayTimer = setTimeout(function() {
                            ref.pp.setPlayhead(newPos);
                        }, 100);
                    }

                },

                pointerUp = function (evt) {
                    $(window).off(jqEventNS);

                    applyValue(lastPointerPosition);

                    ref._sSliderAct = false;
                    return false;
                },

                pointerMove = function (evt) {
                    lastPointerPosition = ref._getPointerPosition(evt);
                    
                    clearTimeout(ref._cTimer);
                    applyValue(lastPointerPosition);
                    return false;
                };
                
                if($p.features.touch){
                    $(window).on('touchmove' + jqEventNS, pointerMove);
                    $(window).on('touchend' + jqEventNS, pointerUp);
                }
                else {
                    $(window).on('mousemove' + jqEventNS, pointerMove);
                    $(window).on('mouseup' + jqEventNS, pointerUp);
                }

            applyValue(lastPointerPosition);
        },

        vknobStartDragListener: function (event, domObj) {
            this._vSliderAct = true;

            var ref = this,

                jqEventNS = '.' + this.pp.getNS() + 'vknob', 
                vslider = ref.controlElements['vslider'],
                vmarker = ref.controlElements['vmarker'],
                vknob = ref.controlElements['vknob'],

                orientation = vslider.width() > vslider.height() ? "horizontal" : "vertical",

                volume = 0,

                mouseUp = function (mouseUpEvent) {
                    $(window).off(jqEventNS);

                    ref._vSliderAct = false;

                    return false;
                },

                mouseMove = function (dragEvent) {
                    clearTimeout(ref._cTimer);

                    var newXPos = (dragEvent.clientX - vslider.offset().left),
                        newXPos = (newXPos > vslider.width()) ? vslider.width() : newXPos,
                        newXPos = (newXPos < 0) ? 0 : newXPos,

                        newYPos = (dragEvent.clientY - vslider.offset().top),
                        newYPos = (newYPos > vslider.height()) ? vslider.height() : newYPos,
                        newYPos = (newYPos < 0) ? 0 : newYPos;



                    switch (orientation) {
                        case "horizontal":
                            volume = Math.abs(newXPos / vslider.width());

                            vmarker.css('width', volume * 100 + "%");
                            vknob.css('left', Math.round((vslider.width() * volume) - (vknob.width() * volume)) + "px");

                            break;

                        case "vertical":
                            volume = 1 - Math.abs(newYPos / vslider.height());

                            vmarker.css('height', volume * 100 + "%");
                            vknob.css('bottom', Math.round((vslider.height() * volume) - (vknob.height() * volume)) + "px");

                            break;
                    }

                    ref.pp.setVolume(volume);
                    return false;
                };

                $(window).on('mousemove' + jqEventNS, mouseMove);
                $(window).on('mouseup' + jqEventNS, mouseUp);
        },

        /*******************************
            GENERAL HELPERS
        *******************************/
        _active: function (elmName, on) {
            var dest = this.controlElements[elmName];
            if (on == true) {
                dest.addClass('active').removeClass('inactive');
            } else {
                dest.addClass('inactive').removeClass('active');
            }
            return dest;
        },

        /* convert a num of seconds to a digital-clock like display string */
        _clockDigits: function (secs, postfix, minValSecs, maxValSecs) {

            if (isNaN(secs) || secs === undefined) {
                secs = 0;
            }

            if(minValSecs !== undefined){
                secs = secs < minValSecs ? minValSecs : secs;
            }

            if(maxValSecs !== undefined){
                secs = secs > maxValSecs ? maxValSecs : secs;
            }

            var hr = Math.floor(secs / (60 * 60)),
                divisor_for_minutes = secs % (60 * 60),
                min = Math.floor(divisor_for_minutes / 60),
                min_abs = hr * 60 + min,
                divisor_for_seconds = divisor_for_minutes % 60,
                sec = Math.floor(divisor_for_seconds),
                sec_abs = secs,
                result = {};

            result['min_' + postfix] = (min < 10) ? "0" + min : min;
            result['min_abs_' + postfix] = (min_abs < 10) ? "0" + min_abs : min_abs;
            result['sec_' + postfix] = (sec < 10) ? "0" + sec : sec;
            result['sec_abs_' + postfix] = (sec_abs < 10) ? "0" + sec_abs : sec_abs;
            result['hr_' + postfix] = (hr < 10) ? "0" + hr : hr;

            return result;
        },
        _bindCuePointBlipEvents: function (blip, events, data) {
            if (events.length) { // bind events if there are some
                for (var i = 0; i < events.length; i++) {
                    var e = events[i]['events'].join(' '),
                        d = $.extend({}, events[i]['data'], data) || {},
                        h = (typeof events[i]['handler'] == 'function' ? events[i]['handler'] : function (e) {});
                    blip.on(e, d, h);
                }
            } else { // otherwise make the blip 'invisible' for mouse events (works everywhere but IE up to 10)
                blip.css('pointer-events', 'none');
            }
        },
        _getPointerPosition: function(event){

            var positionSource = {};

            if(event) {

                if(('touches' in event.originalEvent) && event.originalEvent.touches.length > 0) {
                    positionSource = event.originalEvent.touches[0];
                }
                else {
                    positionSource = event;
                }

                return {
                    clientX: positionSource.clientX,
                    clientY: positionSource.clientY,
                    pageX: positionSource.pageX,
                    pageY: positionSource.pageY
                };
            }
        }
    };

    $p.plugins.projekktorControlbar = projekktorControlbar;
}(window, document, jQuery, projekktor));
/*
 * Projekktor II Plugin: Settings Service Menu
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    function projekktorSettings() {}

    projekktorSettings.prototype = {

        version: '1.0.2',
        reqVer: '1.8.0',

        _qualities: [],

        config: {
            contextTitle: 'Settings',
            feedbackUrl: false,
            settingsMenu: '<ul data-id="tool" class="ppsettingslist active">' +
                '<li class="first label">%{help}</li>' +
                '<li data-pp-settings-func="tool_help" class="inactive">%{keyboard controls}</li>' +
                '<li data-pp-settings-func="tool_debug" class="inactive">%{debug}</li>' +
                '<li data-pp-settings-func="tool_version" class="inactive">%{player info}</li>' +
                '<li></li>' +
                '</ul>' +
                '<ul data-id="quality" class="ppsettingslist active">' +
                '<li class="first label">%{quality}</li>' +
                '</ul>' +
                '<div class="ppclear"></div>',

            versionTpl: '<div data-pp-settings-func="toolwindow_version">' +
                '<p>Projekktor V%{version}</p>' +
                '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
                '</div>',


            debugTpl: '<div data-pp-settings-func="toolwindow_debug">' +
                '<div class="wizzard inactive" data-id="debug_1">' +
                '<p><b>%{report}</b></p>' +
                '<p><textarea data-id="message">%{please}</textarea></p>' +
                '<p>' +
                '<a class="btn cancel" href="#">%{cancel}</a>' +
                '<a class="btn next" data-step="2" href="#">%{continue}</a>' +
                '</p>' +
                '</div>' +
                '<div class="wizzard inactive" data-id="debug_2">' +
                '<p><b>%{sendto}</b></p>' +
                '<p><textarea data-id="result">%{please}</textarea></p>' +
                '<p><a class="btn next" href="#" data-step="3">%{ok}</a></p>' +
                '</div>' +
                '<div class="wizzard inactive" data-id="debug_3">' +
                '<p>%{thanks}</p>' +
                '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
                '</div>' +
                '</div>' +
                '<div data-pp-settings-func="toolwindow_error">' +
                '<div class="wizzard inactive" data-id="error_1">' +
                '<p><b>%{error}<br/> %{sendto}</b></p>' +
                '<p><textarea data-id="errortxt"></textarea></p>' +
                '<p><a class="btn next" href="#" data-step="3">%{ok}</a></p>' +
                '</div>' +
                '<div class="wizzard inactive" data-id="error_2">' +
                '<p>%{thanks}</p>' +
                '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
                '</div>' +
                '</div>',

            helpTpl: '<div data-pp-settings-func="toolwindow_help">' +
                '<p><b>%{keyboard assignments}</b></p>' +
                '<p class="key">%{help1}</p>' +
                '<p class="key">%{help2}</p>' +
                '<p class="key">%{help3}</p>' +
                '<p>%{help4}</p>' +
                '<p><a class="btn cancel" href="#">%{ok}</a></p>' +
                '</div>'

        },

        initialize: function () {

            var ref = this,
                _outDelay = 0;

            // button, main container and options
            this.dest = this.applyToPlayer($('<div/>').addClass('settingsmenu').html($p.utils.i18n(this.getConfig('settingsMenu'))));
            this.btn = this.applyToPlayer($('<div/>').addClass('settingsbtn'), 'btn');
            this.tool = this.applyToPlayer($('<div/>').addClass('tool'), 'toolwindow');

            this.setActive(this.btn, true);

            // hide menu
            this.setInactive();
            $p.utils.blockSelection(this.dest);

            // fade in / out
            this.dest.on('mouseleave', function () {
                clearTimeout(_outDelay);
                _outDelay = setTimeout(function () {
                    ref.setInactive();
                }, 200);
            });

            this.dest.on('mouseenter', function () {
                clearTimeout(_outDelay);
            });

            // enable "settings" button
            this.btn.click(function (evt) {
                if (ref.dest.hasClass('active')) {
                    ref.setInactive();
                } else {
                    ref.setActive();
                }
                evt.stopPropagation();
                evt.preventDefault();
                return false;
            });

            this.btn.on('mouseleave', function () {
                $(this).blur();
                clearTimeout(_outDelay);
                _outDelay = setTimeout(function () {
                    ref.setInactive();
                }, 200);
            });

            this.btn.on('mouseenter', function () {
                clearTimeout(_outDelay);
            });

            this.pluginReady = true;
        },

        optionSelect: function (dest, func, value) {
            // visual feedback
            if (this[func + 'Set'](value) === true) {
                dest.parent().find('li').each(function () {
                    if (!$(this).hasClass('first')) {
                        $(this).addClass('off').removeClass('on');
                    }
                });
                dest.addClass('on').removeClass('off');
            }
        },

        /*****************************************************
         * Player Event Handlers
         * **************************************************/

        itemHandler: function () {
            this._qualities = [];
            this.setupSettingsMenu();
        },

        plugin_controlbarHideHandler: function (controlBar) {
            this.setInactive();
            this.btn.addClass('off').removeClass('on');
        },

        availableQualitiesChangeHandler: function (qualities) {
            this._qualities = qualities.slice().reverse();
            this.setupSettingsMenu();
        },

        qualityChangeHandler: function (val) {
            this.qualitySet(val);
            this.setupSettingsMenu();
        },

        errorHandler: function (code) {
            var msg = $p.utils.i18n("%{error" + code + "}");
            this.toolSet('error', 1, msg);
        },

        /*****************************************************
         * availability checks
         * **************************************************/
        toolCheck: function (value) {
            return true;
        },

        qualityCheck: function (value) {
            if ($.inArray(value, this.pp.getPlaybackQualities()) == -1) {
                return false;
            }
            return true;
        },

        /*****************************************************
         * Config SETTERS
         * **************************************************/
        toolSet: function (func, stp, data) {

            var tpl = this.applyToPlayer($('<div/>'), 'toolwindow_' + func),
                step = stp || 1,
                ref = this,
                isPlaying = this.pp.getState('PLAYING');

            if (func == 'debug' && this.getConfig('feedbackUrl')) {
                window.location.href = this.getConfig('feedbackUrl');
                return;
            }

            tpl.html($p.utils.i18n(this.getConfig(func + 'Tpl')));

            this.tool.html($p.utils.parseTemplate(tpl.html(), this.pp.config));
            this.tool.find('.wizzard').addClass('inactive').removeClass('active');
            this.tool.find('[data-id="' + func + '_' + step + '"]').addClass('active').removeClass('inactive');
            this.setActive(this.tool);


            if (data == null) {
                this.tool.find('[data-id="message"]').focus(function () {
                    $(this).html('').off('focus').css({
                        color: '#000'
                    });
                });
                this.tool.find('[data-id="message"]').css({
                    color: '#aaa'
                });
            } else {
                var topHref = this.pp.getIframe() && window.top.location.href;

                var debugData = {
                    version: this.pp.getVersion(),
                    message: data,
                    timestamp: new Date().getTime(),
                    userAgent: $p.userAgent,
                    features: $p.features,
                    iframeHref: window.location.href,
                    topHref: topHref,
                    referrer: window.document.referrer,
                    modelstate: this.pp.getState(),
                    duration: this.pp.getDuration(),
                    position: this.pp.getPosition(),
                    maxposition: this.pp.getMaxPosition(),
                    platform: this.pp.getPlatform(),
                    platformscfg: this.pp.config._platforms,
                    plugins: this.pp.config._plugins,
                    media: this.pp.media,
                    compTable: this.pp.getSupportedPlatforms(),
                    rnd: $p.utils.randomId(22)
                };

                $.each(this.pp.config._platforms, function (key, value) {
                    debugData[value + 'ver'] = $p.platforms[value]();
                });

                this.tool.find((func == 'debug') ? '[data-id="result"]' : '[data-id="errortxt"]')
                    .attr({
                        readonly: 'readonly'
                    })
                    .val(
                        $p.utils.stringify(debugData)
                    )
                    .off()
                    .on('focus', function () {
                        $(this).select();
                    });
            }

            $(this.pp.getDC().find('.next')).click(function () {
                $(this).off();
                ref.toolSet('debug', parseInt($(this).attr('data-step'), 10), ref.tool.find('[data-id="message"]').val());
                return false;
            });

            $(this.pp.getDC().find('.cancel')).click(function () {
                $(this).off();
                ref.setActive(ref.tool, false);
                if (isPlaying) {
                    ref.pp.setPlay();
                }
                return false;
            });

            this.tool.css({
                margin: '-' + (this.tool.outerHeight() / 2) + 'px 0 0 -' + (this.tool.outerWidth() / 2) + 'px'
            });

            if (this.pp.getConfig('streamType').toUpperCase().indexOf('LIVE') == -1 && func != null) {
                this.pp.setPause();
            }

            this.setInactive();
            return false;
        },


        qualitySet: function (val) {

            var value = val || this.pp.storage.restore('quality') || null;

            if (value === 'auto' || !this.qualityCheck(value)) {
                this.pp.storage.remove('quality');
                value = this.pp.getAppropriateQuality();
            }

            if (value !== null) {
                this.pp.storage.save('quality', value);
            }

            if (this.pp.getPlaybackQuality() !== value) {
                this.pp.setPlaybackQuality(value);
            }

            return true;
        },

        _keyStr: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

        // public method for encoding
        encode: function (input) {
            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            input = this._utf8_encode(input);

            while (i < input.length) {

                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                    this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                    this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);

            }

            return output;
        },

        // private method for UTF-8 encoding
        _utf8_encode: function (string) {
            string = string.replace(/\r\n/g, "\n");
            var utftext = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utftext += String.fromCharCode(c);
                } else if ((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                } else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }

            }

            return utftext;
        },

        setupSettingsMenu: function () {
            var ref = this,
                pCount = 0,
                menuOptions = [];

            // setup quality menu for current playlist item
            this.setupQualityMenu();

            $.each(this.dest.find("[" + this.getDA('func') + "]"), function () {
                var currentElement = $(this),
                func = currentElement.attr(ref.getDA('func')).split('_'),
                menuName = func[0],
                optionName = func[1],
                storedValue = ref.pp.storage.restore(menuName);
                
                if (!menuOptions.hasOwnProperty(menuName)) {
                    menuOptions[menuName] = [];
                }

                // check
                if (!ref[menuName + 'Check'](optionName) && optionName !== 'auto') {
                    currentElement.addClass('inactive').removeClass('active');
                    return true;
                } else {
                    currentElement.addClass('active').removeClass('inactive');
                }

                menuOptions[menuName].push(optionName);

                if ((storedValue === optionName) || (storedValue === null && optionName === 'auto')) {
                    currentElement.addClass('on').removeClass('off');
                } else {
                    currentElement.addClass('off').removeClass('on');
                }

                currentElement.click(function (evt) {
                    ref.optionSelect(currentElement, menuName, optionName);
                    evt.stopPropagation();
                    evt.preventDefault();
                    return false;
                });

                return true;
            });

            // restore presets:
            for (var i in menuOptions) {
                if (menuOptions[i].length < 3) {
                    this.dest.find('[data-id="' + i + '"]').addClass('inactive').removeClass('active');
                } else {
                    this.dest.find('[data-id="' + i + '"]').addClass('active').removeClass('inactive');
                    this[i + 'Set']();
                    pCount++;
                }
            }

            // apply "columns" class
            var classes = this.dest.attr("class").split(" ").filter(function (item) {
                return item.lastIndexOf("column", 0) !== 0;
            });

            if (pCount) {
                this.setActive(this.btn, true);
            } else {
                this.setActive(this.btn, false);
            }

            this.dest.attr("class", classes.join(" "));
            this.dest.addClass('column' + pCount);
        },

        setupQualityMenu: function () {
            var qualities = this._qualities.length ? this._qualities : this.pp.getPlaybackQualities(),
                qualityList = this.createQualityList(qualities);
            // remove all the current quality menu items
            this.removeMenuItems('quality');

            // add new items
            this.addMenuItems('quality', qualityList);
        },

        createQualityList: function (qualities) {
            var qualityValues = qualities || this.pp.getPlaybackQualities(),
                qualityList = '',
                val = '';

            for (var i = 0; i < qualityValues.length; i++) {
                val = qualityValues[i];

                if (val != 'auto' && val != 'default') {
                    qualityList += '<li data-' + this.pp.getNS() + '-settings-func="quality_' + val + '"  class="inactive">%{' + val + '}</li>';
                }
            }

            qualityList += '<li data-' + this.pp.getNS() + '-settings-func="quality_auto"  class="auto inactive">%{auto}</li>';

            return $p.utils.i18n(qualityList);
        },

        addMenuItems: function (menuId, content, prepend) {
            var id = menuId || false,
                cont = content || false,
                prep = prepend || false;

            if (!(id && cont)) {
                return false;
            }

            var menu = this.dest.find('[data-id="' + id + '"]');

            if (prep) {
                menu.children('.label').after(content);
            } else {
                menu.append(content);
            }

            return this.dest.find('[data-id="' + id + '"]');
        },

        /**
         * Removes all the menu items from the selected menu
         *
         * @param {String} menuId - id of the menu
         * @returns {jQuery} - jQuery object containing removed elements
         */
        removeMenuItems: function (menuId) {
            var id = menuId || false;

            if (!id) {
                return false;
            }

            return this.dest.find('[data-id="' + id + '"]').children().not('.label').remove();
        }
    };

    $p.plugins.projekktorSettings = projekktorSettings;
}(window, document, jQuery, projekktor));
/*
 * VPAID 2.0 model
 *
 * Copyright 2016-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * all rights reserved
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */

(function (window, document, $, $p) {

    "use strict";

    $p.newModel({
        modelId: 'VPAID',
        iLove: [{
            ext: 'js',
            type: 'application/javascript',
            platform: ['videojs'],
            streamType: ['http']
        }],
        _vpaid: null,
        _vpaidEventMap: {
            "vast.firstPlay": "vpaidFirstPlayListener",
            "vast.adStart": "vpaidAdStartListener",
            "vast.adEnd": "vpaidAdEndListener",
            "vast.adSkip": "vpaidAdEndListener",
            "vast.adError": "vpaidAdErrorListener",
            "vast.adsCancel": "vpaidAdEndListener",
            "vast.contentStart": "vpaidEventListener",
            "vast.contentEnd": "vpaidEventListener",
            "vast.reset": "vpaidEventListener"
        },
        _vpaidAdStarted: false,

        applyMedia: function (destContainer) {
            var ref = this,
                videoJsLoadSuccess = function () {
                    if ($('#' + ref.getMediaElementId()).length === 0) {

                        ref.wasPersistent = false;

                        destContainer.html('').append(
                            $('<video/>')
                            .attr({
                                "id": ref.getMediaElementId(),
                                "poster": $p.utils.imageDummy(),
                                "src": $p.utils.videoDummy('mp4'),
                                "loop": false,
                                "autoplay": false,
                                "preload": "none",
                                "x-webkit-airplay": "allow",
                                "playsinline": ""
                            }).prop({
                                "controls": false,
                                "volume": ref.getVolume()
                            }).css({
                                'width': '100%',
                                'height': '100%',
                                'position': 'absolute',
                                'top': 0,
                                'left': 0
                            })
                        );
                    }

                    ref.mediaElement = $('#' + ref.getMediaElementId());
                    ref.initVideoJs();
                },
                videoJsLoadFailed = function (jqxhr, settings, exception) {
                    ref.sendUpdate('error', 2);
                };

            // check if videojs.js is already loaded
            if (window.videojs && typeof window.videojs === 'function') {
                // just continue
                videoJsLoadSuccess();
            } else {
                // load video.js CSS
                $p.utils.getCss(ref.pp.getConfig('platformsConfig').videojs.css);
                // load video.js JS
                $p.utils.getScript(ref.pp.getConfig('platformsConfig').videojs.src, {
                        cache: true
                    })
                    .done(videoJsLoadSuccess)
                    .fail(videoJsLoadFailed);
            }
        },
        detachMedia: function () {
            try {
                //this._videojs.dispose();
            } catch (e) {}
        },

        initVideoJs: function () {
            var ref = this,
                wasAwakening = ref.getState('AWAKENING'),
                vjsConfig = $.extend({}, ref.pp.getConfig('platformsConfig').videojs.initVars, {
                    "plugins": {
                        "vpaid": {
                            "adCancelTimeout": 20000,
                            "adsEnabled": true
                        }
                    }
                });

            // init vast-vpaid plugin
            window.videojs.plugin('vpaid', function (opts) {
                $p.utils.log('VPAID adsSetup');

                var vjsPlayer = this;

                ref.addVPAIDEventListeners(vjsPlayer);

                ref._vpaid = vjsPlayer.vastClient({
                    adTagXML: function (cb) {
                        ref.getVastXML(cb, ref);
                    },
                    playAdAlways: true,
                    timeout: 1000,
                    adCancelTimeout: 15000,
                    preferredTech: 'html5',
                    adsEnabled: true,
                    verbosity: 0,
                    autoResize: false
                });

                // scale ads when the media is scaled
                var scaledListener = function (event, pp) {
                    vjsPlayer.trigger('vast.resize');
                };

                ref.pp.addListener(('scaled.vpaid'), scaledListener);
            });

            ref._videojs = window.videojs(ref.mediaElement[0], vjsConfig, function () {
                $p.utils.log('VPAID videojs ready');

                ref.mediaElement = $(this.contentEl());

                ref.addVideoJsEventListeners();

                if (wasAwakening) {
                    ref.displayReady();
                    return;
                }

                if (ref.getSeekState('SEEKING')) {
                    if (ref._isPlaying) {
                        ref.setPlay();
                    }

                    ref.seekedListener();
                    return;
                }

                if (ref._isPlaying) {
                    ref.setPlay();
                }
            });
        },
        getVastXML: function (callback, modelRef) {
            var item = modelRef.pp.getItem(),
                adSource = item.config.vast.adSourceXML;
            callback(null, '<VAST version="3.0"><Ad>' + $(adSource).html() + '</Ad></VAST>');
        },
        addVPAIDEventListeners: function (vjsPlayer) {
            var ref = this;

            // add event listeners
            $.each(ref._vpaidEventMap, function (key, value) {
                var listener = ref[value];
                vjsPlayer.on(key, listener);
            });
        },

        removeVPAIDEventListeners: function (vjsPlayer) {
            var ref = this;

            ref.pp.removeListener('*.vpaid');

            // remove event listeners
            $.each(ref._vpaidEventMap, function (key, value) {
                vjsPlayer.off(key);
            });
        },

        vpaidEventListener: function (evt) {
            var ref = this._ppModel;
            $p.utils.log("VPAID", evt);
        },
        vpaidAdErrorListener: function (evt) {
            $p.utils.log("VPAID", evt);
            var ref = this._ppModel;
            ref.removeVPAIDEventListeners(ref._videojs);
            ref.removeVideoJsEventListeners();
            ref.vjsErrorListener(evt, this);
        },
        vpaidFirstPlayListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
        },
        vpaidAdStartListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
            if (!ref._vpaidAdStarted) {
                ref.playingListener();
                ref._vpaidAdStarted = true;
            }
        },
        vpaidAdEndListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
            vjsPlayer.trigger('ended');
            ref.removeVPAIDEventListeners(ref._videojs);
            ref.removeVideoJsEventListeners();
            ref._setState('completed');
        },
        vjsPlayingListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            if (ref._vpaidAdStarted) {
                ref.playingListener();
            }
        },
        vjsPauseListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            if (ref._vpaidAdStarted) {
                ref.pauseListener();
            }
        },
        vjsEndedListener: function (evt) {
            $p.utils.log("VIDEOJS ENDED");
        }

    }, 'VIDEOJS');

}(window, document, jQuery, projekktor));/*
 * Projekktor Ads Plugin
 *
 * Copyright 2011 - 2013 by Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2014-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * all rights reserved
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */

(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorAds = function () {};

    projekktorAds.prototype = {
        version: '2.3.2',
        reqVer: '1.8.1',
        pluginReady: false,
        data: {},
        _enableTracking: false,
        _compContainers: [],
        _adBlocked: false,
        _adId: null,
        _adsSessionOwnerId: "",
        _isSlave: false,
        _hasWrappers: false,
        _wrappers: [],
        _icons: {},
        _defaultAdPlaylistItem: {
            config: {
                id: '',
                cat: '',
                adType: '',
                isAd: true,
                disallowSkip: true,
                skipTestcard: true,
                className: 'ad',
                duration: 0,
                vast: {
                    owner: '',
                    adId: '',
                    impressions: {},
                    impressionsNonLinear: {},
                    tracking: {},
                    isWrapper: false,
                    wrapperURL: '',
                    isVPAID: false,
                    adSourceXML: ""
                },
                plugin_controlbar: {
                    disableFade: false,
                    showOnStart: false
                },
                plugin_display: {
                    staticControls: false,
                    displayClick: {
                        callback: null,
                        value: null
                    },
                    displayPlayingClick: {
                        callback: null,
                        value: null
                    },
                    displayDblClick: {
                        callback: null,
                        value: null
                    }
                }
            }
        },
        _schedulingMethod: 'vastAdIdKey',
        // VMAP
        VMAPNS: "http://www.iab.net/videosuite/vmap",
        config: {
            url: '',
            type: 'application/xml',
            withCredentials: true,
            urlPreprocessor: function (ref, url) {
                return url;
            },
            vastProxy: '', // 'proxy.php?url=',
            vastNoCache: false,
            /**
             * requestTimeout
             * 
             * Set a timeout (in milliseconds) for the single XHR request. If there are multiple requests (e.g. wrappers)
             * this timeout is applied to every individual request.
             */
            requestTimeout: 2000,
            /**
             * wrapperLevelMax
             * 
             * Max number of wrapper levels. This should prevent infinite loops and dead ends. If the player detects
             * more than this number of wrappers, the player will reject any subsequent responses in the chain. 
             * 
             * Default: 5 - this is the value recommended by IAB in VAST 4.0
             * 
             */ 
            wrapperLevelMax: 5,
            /**
             * schedulingMethod
             *
             * Method used to create ads schedule.
             *
             * Possible values:
             *  - 'auto' - autodetect
             *  - 'vmap' - VMAP is used
             *  - 'vastAdIdKey' - VAST <Ad> element id attribute value is used for scheduling
             *  - 'none' - there is no ads scheduling mechanism provided. All available ads will be assigned to the defaultAdCat block
             */
            schedulingMethod: 'auto',
            resourcePriority: ['javascript', 'html', 'iframe', 'image'],
            selectByDimensions: true,
            /*
             * pauseOnClick
             *
             *  Should the ad playback be paused after clicking on the clickThrough overlay.
             */
            pauseOnClick: false,
            // capping
            cappingLimit: 0, // Maximum number of ads delivered to the client within the period defined by 'cappingPeriod'. 0=unlimited
            cappingPeriod: 1, // Number of minutes until the client's capping limit will be reset.
            /*
             * Capping Method
             *
             * Possible values:
             * - 'none' - client side capping is disabled.
             * - 'id' - will force the client to store the ad IDs - as set in the VAST feed - in a local storage.
             *          Once an ID's display counter goes beyond 'cappingLimit' the respective ad will be skipped.
             * - 'hard' - will increase a counter once an ad has been shown. If the counter gets higher
             *            than 'cappingLimit' all further ads will be skipped until 'cappingPeriod' apply.
             */
            cappingMethod: 'none',
            /**
             * disableWhenOwnerVideoUnplayable
             *
             * Disable ad injection when main video can't be play (e.g. because there is no platform to handle the video format provided)
             */
            disableWhenOwnerVideoUnplayable: true,
            /**
             * abDetectedCallback
             *
             * Function called when something goes wrong with ads loading process from the adserver.
             * We assume that these problems are always caused by some kind of adblocking software
             * not a real network problems with adserver. We can break the execution of the plugin/player
             * or whatever we need in this case.
             *
             * NOTE: If you don't want to take any action when ad blocking software is detected just
             * leave this function empty.
             *
             * @param {object} pluginRef
             * @returns {undefined}
             */
            abDetectedCallback: function (pluginRef) {},
            /**
             * abAfterDisabledByUserCallback
             *
             * Function called when user will disable adblocker. It could be used to display 'thank you' message
             * and/or send stats. It is based on the value stored in the browser localStorage (projekktor's persistentStorage)
             * and reliable only if the localStorage is available/writable and not cleared by the user.
             *
             * NOTE: If you don't want to take any action when ad blocking software is detected just
             * leave this function empty.
             *
             * @param {object} pluginRef
             * @returns {undefined}
             */
            abAfterDisabledByUserCallback: function (pluginRef) {},
            /**
             * adsValidationFunc
             *
             * To check integrity/authenticity of an adserver response we could check for some additional values inside
             * the returned document. If this function return true, then we assume that everything is fine with the
             * response. If this function return false, we assume that something went wrong and the 'adsValidationFailCallback'
             * will be executed.
             *
             * NOTE: To skip validation just leave this function unchanged (return true)
             *
             * @param {mixed} responseData - data loaded from ad server (probably VAST template)
             * @param {object} pluginRef - reference to the ads plugin instance
             * @returns {boolean} - result of the validation true/false
             */
            adsValidationFunc: function (responseData, pluginRef) {
                return true;
            },
            /**
             * adsValidationFailCallback
             *
             * If execution of 'adsValidationFunc' will end up with negative result, so the validation of response authenticity fail,
             * then this function will be called. We can break the execution of the plugin/player or whatever we need in this case.
             *
             * NOTE: If you don't want to take any action, just leave this function empty
             *
             * @param {object} pluginRef - reference to the plugin object
             * @returns {undefined}
             */
            adsValidationFailCallback: function (pluginRef) {},
            ownerId: null,
            masterId: null,
            masterData: null,
            slaveMode: false,
            defaultAdCat: 'prerolls',
            vpaidOnMobile: false,
            adTypes: {
                preroll: {
                    enabled: true,
                    showOnMobile: true,
                    key: 'preroll',
                    cat: 'prerolls',
                    // messages displayed during the ad playback (string or array of strings)
                    messages: 'advertisement end in %{secs}s',
                    // skip
                    skip: false,
                    skipHtml: 'Skip this ad in %{secs}',
                    skipUnlockedHtml: 'Click here to skip this ad.',
                    // capping
                    cappingIndependent: false, // if true, then the capping counter will be increased separately for this ads group
                    // icons
                    icons: true, // show icons when present in VAST,
                    // VPAID 2.0
                    vpaid: true, // enable vpaid support
                    // pause after pod is completed
                    pauseAfter: false
                },
                postroll: {
                    enabled: true,
                    showOnMobile: true,
                    key: 'postroll',
                    cat: 'postrolls',
                    // messages displayed during the ad playback (string or array of strings)
                    messages: 'advertisement end in %{secs}s',
                    // skip
                    skip: false,
                    skipHtml: 'Skip this ad in %{secs}',
                    skipUnlockedHtml: 'Click here to skip this ad.',
                    // capping
                    cappingIndependent: false, // if true, then the capping counter will be increased separately for this ads group
                    // icons
                    icons: true, // show icons when present in VAST,
                    // VPAID 2.0
                    vpaid: true, // enable vpaid support
                    // pause after pod is completed
                    pauseAfter: false
                },
                midroll: {
                    enabled: true,
                    showOnMobile: false,
                    key: ['midroll_1', 'midroll_2', 'midroll_3'],
                    cat: ['midrolls_1', 'midrolls_2', 'midrolls_3'],
                    // messages displayed during the ad playback (string or array of strings)
                    messages: 'advertisement end in %{secs}s',
                    // skip
                    skip: false,
                    skipHtml: 'Skip this ad in %{secs}',
                    skipUnlockedHtml: 'Click here to skip this ad.',
                    // capping
                    cappingIndependent: false, // if true, then the capping counter will be increased separately for this ads group
                    // icons
                    icons: true, // show icons when present in VAST
                    // VPAID 2.0
                    vpaid: true // enable vpaid support
                },
                companion: {
                    enabled: true,
                    showOnMobile: true,
                    key: 'companion',
                    cat: 'companions',
                    destinationContainerIds: ['companiona', 'companionb', 'companionc'],
                    // capping
                    cappingIndependent: false // if true, then the capping counter will be increased separately for this ads group
                },
                overlay: {
                    enabled: true,
                    showOnMobile: false,
                    key: 'overlay',
                    cat: 'overlays',
                    overlayDelay: 1,
                    duration: 20,
                    size: {
                        height: 50,
                        width: 300
                    },
                    // capping
                    cappingIndependent: false // if true, then the capping counter will be increased separately for this ads group
                }
            }
        },
        initialize: function () {
            // slave mode for midrolls
            if (this.config.slaveMode) {
                this._setSlaveMode();
            }

            this.pluginReady = true;
        },
        _setSlaveMode: function () {
            if (this.config.masterData !== null) {
                this.data = this.config.masterData;
                this._enableTracking = true;
                this._adsSessionOwnerId = this.config.ownerId;
                this._isSlave = true;
            }
        },
        initVASTLoad: function () {
            var item = this.pp.getItem(),
                itemId = this.getConfig('ownerId') || item.id,
                url = this.getConfig('url') || false,
                disableWhenOwnerVideoUnplayable = this.config.disableWhenOwnerVideoUnplayable,
                ownerVideoPlayable = this._isVideoPlayable(itemId);

            try {
                if (!this.data.hasOwnProperty(itemId) &&
                    !!url &&
                    !(ownerVideoPlayable === false && disableWhenOwnerVideoUnplayable === true)
                ) {

                    this.pluginReady = false;
                    this.loadVAST(itemId);
                } else {
                    $p.utils.log("Plugin Ads: ads loading interrupted", {
                        url: url,
                        ownerVideoPlayable: ownerVideoPlayable,
                        disableWhenOwnerVideoUnplayable: disableWhenOwnerVideoUnplayable
                    });
                    this.pluginReady = true;
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in initVASTLoad()", e);
            }
        },
        loadVAST: function (ownerId) {
            var url = this.getConfig('url'),
                type = this.getConfig('type');

            // reset
            this._enableTracking = true;
            this._wrappedData = [];
            $('.imatrackingpixel').remove();
            this._adsSessionOwnerId = ownerId;

            // grab data
            if (url && !this.data.hasOwnProperty(this._adsSessionOwnerId)) {
                try {
                    this.requestAds(url, type);
                } catch (e) {
                    $p.utils.log("Plugin Ads: requestAds() can't load ads", e);
                }
            }
        },
        requestAds: function (vastUrl, type) {
            var ref = this,
                dataType = (type.indexOf('/') > -1) ? type.split('/')[1] : type,
                url = this.getConfig('urlPreprocessor')(this, vastUrl);

            if (this.getConfig('vastProxy') !== '') {
                url = this.getConfig('vastProxy') + escape(url);
            }

            var ajaxConf = {
                url: url,
                success: function (data, textStatus, jqXHR) {
                    $p.utils.log("Plugin Ads: requestAds() successfully loaded data from URL: " + url, arguments);
                    ref.adsScheduler(data);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    $p.utils.log("Plugin Ads: requestAds() failed loading data from URL: " + url, arguments);
                    // assume that it means that some kind of adblock was detected
                    // save in persistentStorage that the adblock was detected
                    ref.pp.storage.save('abdetected', true);
                    var abDetectedCallback = ref.getConfig('abDetectedCallback');
                    abDetectedCallback(ref);
                    ref.adsScheduler(false);
                },
                cache: true,
                timeout: ref.getConfig('requestTimeout'),
                dataType: 'xml',
                xhrFields: {
                    withCredentials: this.getConfig('withCredentials')
                }
            };
            $.support.cors = true;
            $.ajax(ajaxConf);

            return true;
        },

        requestWrapper: function (wrapperInitAdData, wrapperIndex, onWrapperSuccessCallback, onWrapperErrorCallback) {
            var ref = this,
                wrapperLevelMax = ref.getConfig('wrapperLevelMax'),
                wrapperLevel = 0,
                getWrapper = function(wrapperData) {
                    
                    var vastUrl = wrapperData.linear.config.vast.wrapperURL,
                        url = ref.getConfig('urlPreprocessor')(ref, vastUrl),
                        ajaxConf;

                        if (ref.getConfig('vastProxy') !== '') {
                            url = ref.getConfig('vastProxy') + escape(url);
                        }

                        ajaxConf = {
                            url: url,
                            success: function (data, textStatus, jqXHR) {
                                var isWrapper,
                                    followAdditionalWrappers;

                                $p.utils.log("Plugin Ads: getWrapper() successfully loaded data from wrapper #" + wrapperIndex + " on level: " + wrapperLevel +  ", at URL: " + url, arguments);
                                $.extend(true, wrapperData, ref.VASTAdParser(data, wrapperData.linear));

                                // IMPORTANT! update values after extend
                                isWrapper = wrapperData.linear.config.vast.isWrapper,
                                followAdditionalWrappers = wrapperData.linear.config.vast.followAdditionalWrappers;

                                if ( isWrapper 
                                    && wrapperLevel < wrapperLevelMax
                                    && followAdditionalWrappers ) {
                                        wrapperLevel += 1;
                                        getWrapper(wrapperData);
                                }
                                else if (wrapperLevel >= wrapperLevelMax) {
                                    // 302 Wrapper limit reached, as defined by the video player. Too many Wrapper
                                    // responses have been received with no InLine response.
                                    onWrapperErrorCallback(wrapperData, wrapperIndex, 302);
                                }
                                else {
                                    onWrapperSuccessCallback(wrapperData, wrapperIndex);
                                }
                            },
                            error: function (jqXHR, textStatus, errorThrown) {
                                $p.utils.log("Plugin Ads: getWrapper() failed loading data from wrapper #" + wrapperIndex + " on level: " + wrapperLevel +  ", at URL: " + url, arguments);
                                // 301 Timeout of VAST URI provided in Wrapper element, or of VAST URI provided in a subsequent Wrapper element.
                                // (URI was either unavailable or reached a timeout as defined by the video player)
                                onWrapperErrorCallback(wrapperData, wrapperIndex, 301);
                            },
                            cache: true,
                            timeout: ref.getConfig('requestTimeout'),
                            dataType: 'xml',
                            xhrFields: {
                                withCredentials: ref.getConfig('withCredentials')
                            }
                        };
                        $.support.cors = true;
                        $.ajax(ajaxConf);
                };

                getWrapper(wrapperInitAdData);

            return true;
        },
        // schedule ads
        adsScheduler: function (xmlDocument) {
            var schedule,
                valFunc = this.getConfig('adsValidationFunc'),
                valFailCb = this.getConfig('adsValidationFailCallback'),
                abAfterDisabledCb = this.getConfig('abAfterDisabledByUserCallback'),
                ref = this;

            // something went wrong, play content:
            if (xmlDocument === false) {
                this._itemReady(false);
                return;
            }

            // check if user got adblock detected before and execute callback if it was disabled
            if (this.pp.storage.restore('abdetected')) {
                this.pp.storage.remove('abdetected');
                abAfterDisabledCb(this);
            }

            // detect scheduling method
            this._schedulingMethod = ref._selectSchedulingMethod(xmlDocument);
            $p.utils.log("Plugin Ads: adsScheduler() current scheduling method is: '" + this._schedulingMethod + "'", arguments);

            switch (this._schedulingMethod) {
                case "vmap":
                    this.VMAPScheduler(xmlDocument);
                    break;
                case "vastAdIdKey":
                    schedule = this.VASTAdIdKeyScheduler(xmlDocument);
                    break;
                case "none":
                default:
                    schedule = this.VASTDefaultScheduler(xmlDocument, this.getConfig('defaultAdCat'), true);
                    break;
            }

            if (!valFunc(xmlDocument, this)) {
                $p.utils.log("Plugin Ads: adsScheduler() validation failed.", arguments);
                valFailCb(this);
                this._itemReady();
                return;
            } else {
                $p.utils.log("Plugin Ads: adsScheduler() validation passed.", arguments);
            }

            if (!this._hasWrappers) {
                this._itemReady(schedule);
            } else {
                this.getWrappers(schedule);
            }
        },
        getWrappers: function (schedule) {
            var ref = this,
                wrappers = ref._wrappers,
                wrappersToProcess = wrappers.length,
                wrapper,
                onAllWrappersComplete = function(){
                    if(wrappersToProcess <= 0) {
                        $p.utils.log("Plugin Ads: onAllWrappersComplete(), all wrappers processed.");                        
                        ref._itemReady(schedule);
                        ref._wrappers = [];
                        ref._hasWrappers = false;
                    }
                },
                i;

            $p.utils.log("Plugin Ads: getWrappers(), wrappers to process: ", wrappersToProcess, wrappers);

            for (i = 0; i < wrappersToProcess; i++) {
                wrapper = wrappers[i];

                ref.requestWrapper(wrapper, i, 
                    function onWrapperSuccessCallback(wrapperData, wrapperIndex) {
                        wrappersToProcess -= 1;

                        $p.utils.log("Plugin Ads: onWrapperSuccessCallback(), wrapper #" + wrapperIndex + " processed. Wrappers left: " + wrappersToProcess, wrapperData);
                        onAllWrappersComplete();
                    },
                    function onWrapperErrorCallback(wrapperData, wrapperIndex, error) {
                        wrappersToProcess -= 1;
                        $p.utils.log("Plugin Ads: onWrapperErrorCallback(), wrapper #" + wrapperIndex + " error #" + error + ". Wrappers left: " + wrappersToProcess, wrapperData);
                        onAllWrappersComplete();
                    }
                );
            }
        },
        VMAPScheduler: function (xmlDocument) {
            var adBreaks = xmlDocument.getElementsByTagNameNS(this.VMAPNS, 'AdBreak');
        },
        VASTAdIdKeyScheduler: function (xmlDocument) {
            var schedule = {},
                ref = this,
                adTypes = this.getConfig('adTypes'),
                type,
                typeName,
                typeKeys,
                typeKey,
                typeCategories,
                typeCat,
                i, l;

            for (typeName in adTypes) {

                if (adTypes.hasOwnProperty(typeName) && adTypes[typeName].hasOwnProperty('key') && adTypes[typeName].hasOwnProperty('cat')) {
                    type = adTypes[typeName];

                    // skip parsing for disabled type of ads
                    if (type.enabled === false) {
                        continue;
                    }

                    typeKeys = $.isArray(type.key) ? type.key : [type.key];
                    typeCategories = $.isArray(type.cat) ? type.cat : [type.cat];

                    for (i = 0, l = typeKeys.length; i < l; i++) {
                        typeKey = typeKeys[i];
                        typeCat = typeCategories[i];

                        if (typeof typeKey === 'string' && typeof typeCat === 'string') {

                            if (!schedule.hasOwnProperty(typeCat)) {
                                schedule[typeCat] = {};
                            }
                            if (!schedule[typeCat].hasOwnProperty('vastAds')) {
                                schedule[typeCat].vastAds = [];
                            }
                            if (!schedule[typeCat].hasOwnProperty('data')) {
                                schedule[typeCat].data = {};
                            }

                            $(xmlDocument).find('Ad[id|="' + typeKey + '"]').each(
                                function (index, adElement) {
                                    var currentAdConfig = {
                                            config: {
                                                id: typeCat + index + "_" + $p.utils.randomId(8),
                                                cat: typeCat,
                                                adType: typeName,
                                                vast: {
                                                    owner: ref._adsSessionOwnerId
                                                }
                                            }
                                        },
                                        adItem = ref.VASTAdParser(adElement, currentAdConfig);

                                    if (adItem.linear.config.vast.isWrapper) {
                                        ref._wrappers.push(adItem);
                                    }
                                    schedule[typeCat].vastAds.push(adItem);
                                }
                            );
                        }
                    }
                }
            }

            return schedule;
        },
        VASTDefaultScheduler: function (xmlDocument, adCat, allowAdPods) {
            var schedule = {},
                ref = this,
                cat = adCat || this.getConfig('defaultAdCat'),
                adTypes = this.getConfig('adTypes');

            if (!schedule.hasOwnProperty(cat)) {
                schedule[cat] = {};
            }
            if (!schedule[cat].hasOwnProperty('vastAds')) {
                schedule[cat].vastAds = [];
            }
            if (!schedule[cat].hasOwnProperty('data')) {
                schedule[cat].data = {};
            }

            $(xmlDocument).find('Ad').each(
                function (index, adElement) {
                    var currentAdConfig = {
                            config: {
                                id: cat + index + "_" + $p.utils.randomId(8),
                                cat: cat,
                                adType: ref._getAdTypeForAdCat(cat),
                                vast: {
                                    owner: ref._adsSessionOwnerId
                                }
                            }
                        },
                        adItem = ref.VASTAdParser(adElement, currentAdConfig);

                    if (adItem.linear.config.vast.isWrapper) {
                        ref._wrappers.push(adItem);
                    }
                    schedule[cat].vastAds.push(adItem);
                }
            );

            return schedule;
        },
        VASTAdParser: function (adElement, scheduleConfig) {
            var playlistItem = $.extend(true, {}, this._defaultAdPlaylistItem, scheduleConfig),
                adItem = {
                    id: playlistItem.config.id,
                    linear: playlistItem,
                    nonlinear: {},
                    companion: []
                },
                ad = $(adElement).is('Ad') ? adElement : $(adElement).find('Ad').first(),
                ref = this;

            // is wrapper?
            if ($(ad).has('Wrapper').length) {
                $(ad).find("Wrapper").each(function () {
                    $(this).find("VASTAdTagURI").each(function () {
                        ref._hasWrappers = true;
                        playlistItem.config.vast.isWrapper = true;
                        playlistItem.config.vast.wrapperURL = $.trim($(this).text());
                    });
                    // get followAdditionalWrappers attribute (default: true)
                    playlistItem.config.vast.followAdditionalWrappers = !($(this).attr('followAdditionalWrappers') === 'false');
                    // get allowMultipleAds attribute (default: false)
                    playlistItem.config.vast.allowMultipleAds = $(this).attr('allowMultipleAds') === 'true';
                    // get fallbackOnNoAd attribute (default: false)
                    playlistItem.config.vast.fallbackOnNoAd = !($(this).attr('fallbackOnNoAd') === 'false');
                });
            } else {
                playlistItem.config.vast.isWrapper = false;
                playlistItem.config.vast.wrapperURL = '';
            }

            // get creatives
            $(ad).find("Creative").each(
                function (index, creativeElement) {
                    $.extend(true, adItem, ref.VASTCreativeParser(creativeElement, playlistItem));
                }
            );

            // get impressions
            $(ad).find("Impression").each(function () {
                var imp = $.trim($(this).text()),
                    id = $p.utils.randomId(8),
                    impressions = playlistItem.config.vast.impressions;

                if (imp !== '') {
                    impressions[id] = imp;
                }
            });

            return adItem;
        },
        VASTCreativeParser: function (creativeElement, playlistItem) {
            var adItem = {
                    id: playlistItem.config.id,
                    linear: {},
                    nonlinear: {},
                    companion: []
                },
                typeCat = playlistItem.config.cat,
                adTypes = this.getConfig('adTypes'),
                ref = this;

            try {
                adItem.linear = ref._grabLinearAds($(creativeElement), playlistItem);
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in VASTBodyParser() when grabbing linear ads for " + typeCat, e);
            }
            /*
            try {
                adItem.nonlinear = ref._grabNonLinear($(creativeElement), 'NonLinear', adTypes.overlay.size);
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in VASTBodyParser() when grabbing nonlinear ads for " + typeCat, e);
            }
            try {
                if (!adItem.hasOwnProperty('companion')) {
                    adItem.companion = [];
                }

                for (var i = 0; i < ref._compContainers.length; i++) {
                    adItem.companion.push({
                        dest: ref._compContainers[i],
                        data: ref._grabNonLinear($(creativeElement), 'Companion', ref._compContainers[i])
                    });
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in VASTBodyParser() when grabbing companion ads for " + typeCat, e);
            }
            */

            return adItem;
        },
        _grabLinearAds: function (node, item) {
            var ref = this;

            // video ads
            node.find("Linear").each(function () {
                var index = 0;

                $(this).find('MediaFiles').find('MediaFile').each(function () {
                    $(this).each(function () {
                        var mf = $(this),
                            delivery = mf.attr('delivery').toUpperCase(),
                            type = mf.attr('type').toLowerCase(),
                            canPlay = !!ref.pp.getCanPlay(type),
                            vpaid = mf.attr('apiFramework') ? mf.attr('apiFramework').toUpperCase() === 'VPAID' : false,
                            vpaidOnMobile = ref.getConfig('vpaidOnMobile'),
                            isMobile = $p.userAgent.isMobile,
                            isIE = ($p.userAgent.browser.name === "IE"),
                            src = $.trim(mf.text());

                        if ((delivery !== 'PROGRESSIVE') && (delivery !== 'STREAMING')) {
                            return true;
                        }
                        if (!canPlay) {
                            return true;
                        }
                        if (vpaid && isIE) {
                            return true;
                        }
                        if (vpaid && isMobile && !vpaidOnMobile) {
                            return true;
                        }
                        if (vpaid && type.indexOf('javascript') === -1) {
                            return true;
                        }
                        // add only media files with src URL defined
                        if (src.length > 0) {
                            item[index] = {
                                type: type,
                                src: src
                            };
                            if (delivery === "STREAMING") {
                                item[index].streamType = "httpVideo";
                            }
                            if (vpaid) {
                                item.config.vast.isVPAID = vpaid;
                                item.config.vast.adSourceXML = mf.parents('Ad')[0];
                            }
                            index += 1;
                        }
                        return true;
                    });
                });

                if (!item.config.vast.isWrapper && !item.hasOwnProperty(0)) {
                    return true; // if there is no media files and it's not a wrapper then skip that ad
                }

                item.config.duration = $p.utils.toSeconds($.trim($(this).find("Duration").text()));

                $(this).find("Tracking").each(function () {
                    var evt = $(this).attr('event').toLowerCase(),
                        url = $.trim($(this).text());

                    if (!item.config.vast.tracking.hasOwnProperty(evt)) {
                        item.config.vast.tracking[evt] = {};
                    }

                    if (url !== '') {
                        item.config.vast.tracking[evt][$p.utils.randomId(8)] = url;
                    }

                });
                // VideoClicks
                // ClickThrough - only for inlines / ignore all defined for wrappers
                try {
                    item.config.vast.clickthrough = {};
                    if (!item.config.vast.isWrapper) {
                        $(this).find('ClickThrough').each(function () {
                            item.config.vast.clickthrough[$p.utils.randomId(8)] = $.trim($(this).text());
                        });
                    }
                } catch (e) {
                    $p.utils.log("Plugin Ads: Error in _grabLinearAds() when trying to set clickthrough.", e);
                }
                // ClickTracking
                try {
                    item.config.vast.tracking.clickthrough = {};
                    $(this).find('ClickTracking').each(function () {
                        item.config.vast.tracking.clickthrough[$p.utils.randomId(8)] = $.trim($(this).text());
                    });
                } catch (e) {
                    $p.utils.log("Plugin Ads: Error in _grabLinearAds() when trying to set clickthrough tracking.", e);
                }

                // grab VAST3.0 Industry Icons
                $(this).find('Icons').find('Icon').each(function () {

                    var icon = {
                            attributes: {
                                program: '',
                                width: null,
                                height: null,
                                xPosition: null,
                                yPosition: null,
                                apiFramework: null,
                                offset: null,
                                duration: null
                            },
                            resources: {},
                            iconClicks: {
                                iconClickThrough: null,
                                iconClickTracking: null
                            },
                            iconViewTracking: null
                        },
                        iconElement = this,
                        iconAttr,
                        iconClicks,
                        a;

                    // parse attributes
                    if (('attributes' in iconElement) && iconElement.attributes !== null) {
                        iconAttr = iconElement.attributes;
                        for (a in icon.attributes) {
                            if(icon.attributes.hasOwnProperty(a)){
                                icon.attributes[a] = (iconAttr[a] ? iconAttr[a].nodeValue : null);
                            }
                        }
                    }

                    // grab resources
                    // StaticResource
                    $(this).find('StaticResource').each(function () {
                        var type = null,
                            creativeType = $(this).attr('creativeType'),
                            resource;
                        // images
                        if (creativeType.indexOf('image') > -1) {
                            if (ref._adTypes('image') === false) {
                                return;
                            }
                            type = 'image';
                        }
                        // javascript
                        if (creativeType.indexOf('javascript') > -1) {
                            if (ref._adTypes('javascript') === false) {
                                return;
                            }
                            type = 'javascript';
                        }
                        if (type === null) {
                            return;
                        }
                        resource = {
                            src: $.trim($(this).text()),
                            mimeType: creativeType
                        };

                        if (!icon.resources.hasOwnProperty(type)) {
                            icon.resources[type] = [];
                        }
                        icon.resources[type].push(resource);
                    });

                    // HTMLResource
                    $(this).find('HTMLResource').each(function () {

                        var type = 'html',
                            resource;

                        if (ref._adTypes(type) === false) {
                            return;
                        }

                        resource = {
                            src: $(this).text(),
                            type: type
                        };

                        if (!icon.resources.hasOwnProperty(type)) {
                            icon.resources[type] = [];
                        }
                        icon.resources[type].push(resource);
                    });

                    // IFrameResource
                    $(this).find('IFrameResource').each(function () {

                        var type = 'iframe',
                            resource;

                        if (ref._adTypes(type) === false) {
                            return;
                        }

                        resource = {
                            src: $(this).text(),
                            type: type
                        };

                        if (!icon.resources.hasOwnProperty(type)) {
                            icon.resources[type] = [];
                        }
                        icon.resources[type].push(resource);
                    });

                    // get icon clicks
                    iconClicks = $(this).find('IconClicks');

                    if (iconClicks.length) {

                        iconClicks.find('IconClickThrough').each(function () {

                            if (icon.iconClicks.iconClickThrough === null) {
                                icon.iconClicks.iconClickThrough = [];
                            }
                            icon.iconClicks.iconClickThrough.push($.trim($(this).text()));
                        });

                        iconClicks.find('IconClickTracking').each(function () {
                            if (icon.iconClicks.iconClickTracking === null) {
                                icon.iconClicks.iconClickTracking = {};
                            }
                            icon.iconClicks.iconClickTracking[$p.utils.randomId(8)] = $.trim($(this).text());
                        });
                    }
                    // get icon view tracking
                    $(this).find('IconViewTracking').each(function () {

                        if (icon.iconViewTracking === null) {
                            icon.iconViewTracking = {};
                        }

                        icon.iconViewTracking[$p.utils.randomId(8)] = $.trim($(this).text());
                    });

                    // add icon to the linear ad config only if it has resources
                    if (!$.isEmptyObject(icon.resources)) {
                        if (!item.config.vast.hasOwnProperty('icons')) {
                            item.config.vast.icons = {};
                        }
                        item.config.vast.icons[icon.attributes.program] = icon;
                    } else {
                        $p.utils.log("Plugin Ads: Icon '" + icon.attributes.program +
                            "' has no usable resources to display.", icon);
                    }
                });


            });

            return item;
        },
        _grabNonLinear: function (node, name, destDims) {
            var ref = this,
                parentAd,
                item = {
                    config: {
                        vast: {
                            tracking: {}
                        }
                    }
                },
                resource = {},
                findings = [],
                tracking = {};

            node.find(name + "Ads").each(function () {
                parentAd = $(this).parents('Ad');
                $(parentAd).find("Impression").each(function () {
                    var imp = $.trim($(this).text());
                    if (imp != '') {
                        ref.pp.getConfig().vast.impressionsNonLinear[$p.utils.randomId(8)] = imp;
                    }
                });

                // overlay: get the first
                $(this).find(name).each(function () {
                    var parent = $(this);
                    $(this).each(function () {
                        // Image
                        $(this).find('StaticResource').each(function () {
                            var type = null;
                            // images
                            if ($(this).attr('creativeType').indexOf('image') > -1) {
                                if (ref._adTypes('image') === false) {
                                    return;
                                }
                                type = 'image';
                            }
                            // javascript
                            if ($(this).attr('creativeType').indexOf('javascript') > -1) {
                                if (ref._adTypes('javascript') === false) {
                                    return;
                                }
                                type = 'javascript';
                            }
                            if (type === null) {
                                return;
                            }
                            resource = {
                                src: $(this).text(),
                                type: type,
                                width: parent.attr('width'),
                                height: parent.attr('height'),
                                level: ref._getLevel(type),
                                tracking: {}
                            };
                            try {
                                if (!resource.hasOwnProperty('clickthrough')) {
                                    resource.clickthrough = {};
                                }
                                resource.clickthrough[$p.utils.randomId(8)] = $.trim(parent.find(name + 'ClickThrough')
                                    .text());
                            } catch (e) {
                                $p.utils.log("Plugin Ads: Error in _grabNonLinear() when trying to set clickthrough for javascript", e);
                            }
                            findings.push(resource);
                        }); // close staticresource
                        // HTML
                        $(this).find('HTMLResource').each(function () {
                            if (ref._adTypes('html') === false) {
                                return;
                            }
                            resource = {
                                src: $(this).text(),
                                type: 'html',
                                width: parent.attr('width'),
                                height: parent.attr('height'),
                                level: ref._getLevel('html'),
                                tracking: {}
                            };
                            try {
                                if (!resource.hasOwnProperty('clickthrough')) {
                                    resource.clickthrough = {};
                                }
                                resource.clickthrough[$p.utils.randomId(8)] = $.trim(parent.find(name + 'ClickThrough')
                                    .text());
                            } catch (e) {
                                $p.utils.log("Plugin Ads: Error in _grabNonLinear() when trying to set clickthrough for HTMLResource", e);
                            }
                            findings.push(resource);
                        });
                        // iframe
                        $(this).find('IFrameResource').each(function () {
                            if (ref._adTypes('iframe') === false){
                                return;
                            }
                            resource = {
                                src: $(this).text(),
                                type: 'iframe',
                                width: parent.attr('width'),
                                height: parent.attr('height'),
                                level: ref._getLevel('iframe'),
                                tracking: {}
                            };
                            try {
                                if (!resource.hasOwnProperty('clickthrough')) {
                                    resource.clickthrough = {};
                                }
                                resource.clickthrough[$p.utils.randomId(8)] = $.trim(parent.find(name + 'ClickThrough')
                                    .text());
                            } catch (e) {
                                $p.utils.log("Plugin Ads: Error in _grabNonLinear() when trying to set clickthrough for IFrameResource", e);
                            }
                            findings.push(resource);
                        });
                    });
                    $(this).find("Tracking").each(function () {
                        if (!resource.tracking.hasOwnProperty($(this).attr('event'))) {
                            resource.tracking[$(this).attr('event')] = {};
                        }
                        var url = $.trim($(this).text());
                        if (url !== '') {
                            resource.tracking[$(this).attr('event')][$p.utils.randomId(8)] = url;
                        }
                    });
                });
            });
            // select winner:
            var winner = null,
                result = {
                    config: {
                        vast: {
                            tracking: {}
                        }
                    }
                };

            // find highest prioritized ad form
            findings.sort(function (a, b) {
                return a.level - b.level;
            });
            if (name === 'NonLinear') {
                winner = 0;
            } else if (this.getConfig('selectByDimensions') === true) {
                // find best matching size:
                for (var i = 0; i < findings.length; i++) {
                    if (findings[i].width !== destDims.width){
                        continue;
                    }
                    if (findings[i].height !== destDims.height){
                        continue;
                    }    
                    winner = i;
                }
            }
            result.config.vast = findings[winner] || null;

            return result;
        },
        /********************************************************
         * Player-Event Handler
         ********************************************************/
        timeHandler: function (secs) {
            this._handleOverlay(secs);
        },
        mutedHandler: function (flag) {
            if (flag) {
                this._VASTTrack('mute');
            } else {
                this._VASTTrack('unmute');
            }
        },
        resumeHandler: function () {
            this._VASTTrack('resume');
        },
        startHandler: function () {
            //if (!this._cappingActive()) {
            this._impressionTracker();
            //}
            this._VASTTrack('start');
            this._VASTTrack('creativeview');

            // if video is initially muted it should be tracked to the adserver
            if (this.pp.getMuted()) {
                this._VASTTrack('mute');
            }
        },
        firstquartileHandler: function () {
            this._VASTTrack('firstquartile');
        },
        midpointHandler: function () {
            this._VASTTrack('midpoint');
        },
        thirdquartileHandler: function () {
            this._VASTTrack('thirdquartile');
        },
        durationChangeHandler: function () {
            this._addClick();
        },
        playlistLoadedHandler: function () {
            if (!this._isSlave) {
                this.initVASTLoad();
            }
        },
        itemHandler: function (itemIdx) {
            this.getElement('adskip').remove();
            this.getElement('admessage').remove();
            this.getElement('clickthrough').remove();
            this._removeIconsOverlay();

            $('.imatrackingpixel').remove();
        },
        errorHandler: function () {},
        stateHandler: function (state) {
            var item = this.pp.getItem() || {},
                itemConfig = item.config || {},
                nextItem = this.pp.getItem('next') || {},
                nextItemConfig = nextItem.config || {},
                isAd = itemConfig.isAd || false,
                currentType,
                adTypesConfig,
                currentAdTypeConfig;

            if (isAd) {
                currentType = item.config.adType || '';
                adTypesConfig = this.getConfig('adTypes');
                currentAdTypeConfig = adTypesConfig[currentType];

                switch (state) {
                    case 'AWAKENING':

                        break;
                    case 'PAUSED':
                        this._VASTTrack('pause');
                        break;
                    case 'COMPLETED':
                        this._VASTTrack('complete');
                        if(!nextItemConfig.isAd) {
                            if(currentAdTypeConfig.pauseAfter){
                                nextItemConfig.continuous = false;
                            }
                        }
                        // TODO
                        // this._adPodCleanup(item);
                        break;
                    case 'STARTING':
                        if (currentAdTypeConfig && currentAdTypeConfig.enabled) {
                            if (currentAdTypeConfig.skip) {
                                this._handleSkipOption();
                            }
                            if (currentAdTypeConfig.hasOwnProperty('messages') && currentAdTypeConfig.messages.length) {
                                this._handleMessages();
                            }
                            if (currentAdTypeConfig.icons && itemConfig.vast.hasOwnProperty('icons')) {
                                this._handleIcons();
                            }
                        }
                        break;
                }
            }
        },
        fullscreenHandler: function (on) {
            if (on) {
                this._VASTTrack('fullscreen');
            }
        },
        doneHandler: function () {
            if (!this._isSlave) {
                this._removeAds('*');
            }
        },
        leftclickHandler: function (evt) {},
        /********************************************************
         * COMPANIONS
         ********************************************************/
        _initCompanionsContainers: function () {
            var ref = this,
                config = this.getConfig('adTypes').companion;

            if (config.enabled) {
                $.each(config.destinationContainerIds, function (key, value) {
                    var cont = $('#' + value);
                    ref._compContainers.push({
                        obj: cont,
                        width: cont.width(),
                        height: cont.height(),
                        initHtml: cont.html()
                    });
                });
            }
        },
        _setCompanions: function (itemIdx) {
            var ref = this,
                id = this.pp.getItem(itemIdx).id,
                data = this.data[id],
                result = false,
                cfg,
                dest,
                url;

            if (data == null || data.companion == null) {
                return;
            }

            // remove companions if none is defined for current media
            $.each(this._compContainers, function () {
                this.obj.html(this.initHtml);
                this.obj.click(function () {
                    return false;
                });
            });

            for (var i = 0; i < data.companion.length; i++) {
                try {
                    cfg = data.companion[i].data.config.vast;
                    if (cfg == null) {
                        continue;
                    }

                    dest = data.companion[i].dest;
                    url = null;

                    $.each(cfg.clickthrough, function (key, value) {
                        if (value == '' || value == null){
                            return true;
                        }
                        url = value;
                        return false;
                    });

                    switch (cfg.type) {
                        case 'image':
                            dest.obj.html('');
                            $('<img/>')
                                .attr('src', cfg.src)
                                .attr('width', cfg.width)
                                .attr('height', cfg.height)
                                .appendTo(dest.obj);
                            break;
                        case 'iframe':
                            dest.obj.html('');
                            $('<iframe/>')
                                .attr('src', cfg.src)
                                .attr('width', cfg.width)
                                .attr('height', cfg.height)
                                .attr('frameborder', 0)
                                .attr('allowtransparency', 'true')
                                .attr('scrolling', 'no')
                                .attr('marginwidth', 0)
                                .attr('marginheight', 0)
                                .attr('vspace', 0)
                                .attr('hspace', 0)
                                .appendTo(dest.obj);
                            break;
                        case 'html':
                            if (cfg.code){
                                dest.obj.html(cfg.code);
                            }
                            break;
                        default:
                            dest.obj.html(cfg.src);
                    }
                    if (url != null) {
                        dest.obj
                            .data('url', url)
                            .click(function () {
                                window.open($(this).data('url'));
                            });
                    }
                    if (cfg.tracking) {
                        $.each(cfg.tracking['creativeView'] || [], function (key, value) {
                            ref._addPixel(value, "creativeView");
                        });
                    }
                    result = true;
                } catch (e) {
                    $p.utils.log("Plugin Ads: Error in _setCompanions()", e);
                }
            }
            return result;
        },
        /********************************************************
         * OVERLAY ADS
         ********************************************************/
        _setOverlay: function (itemIdx) {
            var id = this.pp.getItem(itemIdx).id,
                nonlinearAdCfg = this.data[id].nonlinear.config.vast,
                ref = this;

            // remove overlay if none is defined for current media
            try {
                this.overlay.remove();
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _setOverlay() when trying to remove overlay", e);
            }

            this.overlay = null;
            if (!nonlinearAdCfg){
                return;
            }
            this.overlay = this.applyToPlayer($('<div/>').addClass('adoverlay'), 'overlay');

            var adWrapper = $('<div/>').appendTo(this.overlay)
                .addClass(this.getCN('adoverlaywrapper'));

            adWrapper.css({
                width: nonlinearAdCfg.width + "px",
                height: nonlinearAdCfg.height + "px"
            });

            $(('<div/>'))
                .addClass(this.getCN('adclose'))
                .appendTo(adWrapper)
                .click(function () {
                    ref._handleOverlayClose();
                });

            var adContainer = $('<div/>')
                .addClass(this.getCN('adcontent'))
                .css({
                    width: nonlinearAdCfg.width + "px",
                    height: nonlinearAdCfg.height + "px"
                })
                .appendTo(adWrapper)
                .click(function () {
                    ref.pp.setPause();
                    ref._handleOverlayClick();
                });

            switch (nonlinearAdCfg.type) {
                case 'image':
                    adContainer
                        .css({
                            background: "url('" + nonlinearAdCfg.src + "') transparent center center no-repeat"
                        });
                    break;
                case 'javascript':
                    adContainer.append(
                        $('<iframe/>')
                        .attr({
                            frameborder: 0,
                            marginwidth: 0,
                            marginheight: 0,
                            allowtransparency: true,
                            hspace: 0,
                            vspace: 0,
                            scrolling: 'no',
                            width: nonlinearAdCfg.width + 'px',
                            height: nonlinearAdCfg.height + 'px',
                            src: ''
                        }).on('load', function () {

                            if (!this.contentWindow) {
                                return;
                            }

                            var iScript = document.createElement('script');
                            iScript.type = 'text/javascript';
                            iScript.innerHTML = 'document.writeln("<span/>");var script = document.createElement("script");script.src = "' + nonlinearAdCfg.src + '";document.getElementsByTagName("body")[0].appendChild(script);';
                            this.contentWindow.document.getElementsByTagName('body')[0].appendChild(iScript);


                        })
                    );
                    break;
                default:
                    adContainer.html(nonlinearAdCfg.src);
            }
        },
        _handleOverlay: function (secs) {
            if (this.overlay == null) {
                return;
            }
            var overlay = this.overlay,
                delay = this.getConfig('overlayDelay'),
                duration = this.getConfig('overlayDuration');

            if (secs >= delay && overlay.hasClass('inactive') && !this._isAd()) {
                overlay.addClass('active').removeClass('inactive');
                this._impressionTracker('NonLinear');
            }

            if (overlay.hasClass('active') && secs >= (delay + duration)) {
                this._handleOverlayClose();
            }
        },
        _handleOverlayClick: function () {
            var item = this.pp.getItem(),
                cfg = this.data[item.id].nonlinear.config.vast,
                dest = null;
            $.each(cfg.clickthrough, function (key, value) {
                if (value === '' || value === null) {
                    return true;
                }
                dest = value;
                return false;
            });

            if (dest !== null) {
                try {
                    window.open(dest);
                } catch (e) {
                    $p.utils.log("Plugin Ads: Error in _handleOverlayClick() when trying to call window.open()", e);
                }
            }
        },
        _handleOverlayClose: function () {
            this.overlay.remove();
            this.overlay = null;
        },
        /********************************************************
         * ADS INJECTION
         ********************************************************/
        _itemReady: function (data) {
            if (typeof data !== 'object') {
                this.pluginReady = true;
                return;
            }

            var config = this.getConfig('adTypes'),
                isMobile = $p.userAgent.isMobile;

            this.data[this._adsSessionOwnerId] = data;

            // OVERLAYS
            try {
                if (config.hasOwnProperty('overlay') && config.overlay.enabled && (isMobile ? config.overlay.showOnMobile === isMobile : true)) {
                    this._setOverlay(this.pp.getItemIdx());
                } else {
                    $p.utils.log("Plugin Ads: overlays disabled.");
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _itemReady() when trying to set overlays with _setOverlay()", e);
            }

            // COMPANIONS
            try {
                if (config.hasOwnProperty('companion') && config.companion.enabled && (isMobile ? config.companion.showOnMobile === isMobile : true)) {
                    if (this._setCompanions(this.pp.getItemIdx())) {
                        this._impressionTracker();
                    }
                } else {
                    $p.utils.log("Plugin Ads: companions disabled.");
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _itemReady() when trying to set companions with _setCompanions()", e);
            }

            // PREROLLS
            try {
                if (config.hasOwnProperty('preroll') && config.preroll.enabled && (isMobile ? config.preroll.showOnMobile === isMobile : true)) {
                    this._setLinears('preroll', this._adsSessionOwnerId);
                } else {
                    $p.utils.log("Plugin Ads: prerolls disabled.");
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _itemReady() when trying to set prerolls with _setLinears()", e);
            }

            // POSTROLLS
            try {
                if (config.hasOwnProperty('postroll') && config.postroll.enabled && (isMobile ? config.postroll.showOnMobile === isMobile : true)) {
                    this._setLinears('postroll', this._adsSessionOwnerId);
                } else {
                    $p.utils.log("Plugin Ads: postrolls disabled.");
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _itemReady() when trying to set postrolls with _setLinears()", e);
            }

            // MIDROLLS
            try {
                if (config.hasOwnProperty('midroll') && config.midroll.enabled && (isMobile ? config.midroll.showOnMobile === isMobile : true)) {
                    this._setMidrolls(this._adsSessionOwnerId);
                } else {
                    $p.utils.log("Plugin Ads: midrolls disabled.");
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _itemReady() when trying to set midrolls with _setMidrolls()", e);
            }

            this.pluginReady = true;
        },
        _setLinears: function (adType, ownerItemId) {

            var ownerId = ownerItemId || this._adsSessionOwnerId,
                idx = this.pp.getItemIdx({
                    id: ownerId
                }),
                addOnIndex = 0,
                config = this.getConfig('adTypes')[adType],
                catName = config.cat || '',
                category,
                item,
                i, l;

            if (this.data.hasOwnProperty(ownerId) && this.data[ownerId].hasOwnProperty(catName)) {
                category = this.data[ownerId][catName];
            }

            if (!category || !category.hasOwnProperty('vastAds') || category.vastAds.length === 0) {
                $p.utils.log("Plugin Ads: No " + adType + " to set.");
                return;
            } else {
                category.data.podDuration = 0;
                category.data.podPlaylist = [];

                for (i = 0, l = category.vastAds.length; i < l; i++) {
                    item = category.vastAds[i].linear;
                    if (item.hasOwnProperty(0)) {
                        // set industry icons when present and enabled
                        if (config.icons && item.config.vast.hasOwnProperty('icons')) {
                            item.cuepoints = this._getIconsCuepoints(item.config.vast.icons);
                        }
                        category.data.podDuration += item.config.duration;
                        category.data.podPlaylist.push(item);
                    }
                }
                switch (adType) {
                    case 'preroll':
                        addOnIndex = idx;
                        break;

                    case 'postroll':
                        addOnIndex = idx + 1;
                        break;
                }
                category.data.podPlaylist = this.pp.addItems(category.data.podPlaylist, addOnIndex).added;
                if (adType === 'preroll') {
                    this.pp.setActiveItem(idx);
                }
                $p.utils.log("Plugin Ads: " + category.data.podPlaylist.length + " " + adType + " successfuly added.");
            }
        },
        _setMidrolls: function (ownerItemId) {
            this._addMidrollCuepoints(ownerItemId);
        },
        _addMidrollCuepoints: function (ownerItemId) {
            var ref = this,
                ownerId = ownerItemId || this._adsSessionOwnerId,
                item = this.pp.getItemById(ownerId),
                ownerItemDuration = item.config.duration || 0,
                config = this.getConfig('adTypes')['midroll'],
                cat = config.cat || [],
                catName,
                categoryItems,
                cuepoints = [],
                item,
                positionCuepoints,
                i, l,
                j, k;

            if (!$.isArray(cat)) {
                return;
            }

            for (i = 0, l = cat.length; i < l; i++) {
                catName = cat[i];

                if (this.data.hasOwnProperty(ownerId) && this.data[ownerId].hasOwnProperty(catName)) {
                    categoryItems = this.data[ownerId][catName];
                }

                if (!categoryItems || !categoryItems.hasOwnProperty('vastAds') || categoryItems.vastAds.length === 0) {
                    $p.utils.log("Plugin Ads: No " + catName + " to set.");
                    continue;
                } else {
                    categoryItems.data.podDuration = 0;
                    categoryItems.data.podPlaylist = [];

                    for (j = 0, k = categoryItems.vastAds.length; j < k; j++) {
                        item = categoryItems.vastAds[j].linear;
                        if (item.hasOwnProperty(0)) {
                            // set industry icons when present and enabled
                            if (config.icons && item.config.vast.hasOwnProperty('icons')) {
                                item.cuepoints = this._getIconsCuepoints(item.config.vast.icons);
                            }
                            categoryItems.data.podDuration += item.config.duration;
                            categoryItems.data.podPlaylist.push(item);
                        }
                    }
                }

                cuepoints.push({
                    id: catName,
                    on: 0,
                    off: 0,
                    once: true,
                    group: 'midroll',
                    value: this
                });

                $p.utils.log("Plugin Ads: " + categoryItems.data.podPlaylist.length + " " + catName + " successfully added.");
            }

            // update cuepoints time
            if (cuepoints.length > 0) {
                // create positioning function
                positionCuepoints = function (ownerItemDuration, player, itemId) {
                    var currentItemId = itemId || ref.pp.getItemId(),
                        i,
                        l = cuepoints.length,
                        partTime = ownerItemDuration / (l + 1);

                    // execute only when owner item duration was changed
                    if (currentItemId === ownerId) {
                        // try to cleanup listeners
                        ref.pp.removeListener('durationChange.midrolls');

                        for (i = 0; i < l; i++) {
                            cuepoints[i].on = (i + 1) * partTime;
                            cuepoints[i].off = cuepoints[i].on + partTime;
                        }

                        ref.pp.addListener('cuepoint', ref._midrollCuePointHandler);
                        ref.pp.setCuePoints(cuepoints, ownerId);
                    }
                };

                // if owner video has duration execute it immediately
                if (ownerItemDuration > 0) {
                    positionCuepoints(ownerItemDuration, null, ownerId);
                }
                // otherwise defer addition until we've got proper duration
                else {
                    this.pp.addListener('durationChange.midrolls', positionCuepoints);
                }
            }

        },
        _midrollCuePointHandler: function (cuepoint) {
            var ref;
            if (cuepoint.group === 'midroll') {
                try {
                    ref = cuepoint.value;
                    ref._playMidroll(cuepoint.value, cuepoint.id);
                } catch (e) {
                    $p.utils.log("Plugin Ads: Error in _midrollCuePointHandler() when trying to run _playMidroll()", e);
                }
            }
        },
        _playMidroll: function (adsPluginRef, catName) {
            var ref = adsPluginRef,
                ownerId = ref._adsSessionOwnerId,
                categoryItems,
                ownerPlayer = ref.pp,
                midrollPlayer,
                midrollPlayerConfig = {
                    thereCanBeOnlyOne: false,
                    autoplay: true,
                    fullscreen: ownerPlayer.getFullscreenEnabled() ? ['viewport'] : [],
                    iframe: false
                },
                midrollPlayerAdsPluginConfig = {
                    slaveMode: true,
                    ownerId: ownerId,
                    masterId: ownerPlayer._id,
                    masterData: ref.data,
                    adTypes: ref.getConfig('adTypes')
                },
                midrollPlayerListener = function (event, player) {
                    var playerElement = player.getDC();
                    player.selfDestruct();
                    player = null;
                    playerElement.remove();
                    ownerPlayer.removeListener('fullscreen', ownerPlayerFullscreenListener);
                    ownerPlayer.setPlay();
                },
                midrollPlayerVolumeListener = function (volume, player) {
                    ownerPlayer.setVolume(volume);
                },
                ownerPlayerFullscreenListener = function (value, player) {
                    midrollPlayer.setFullscreen(value);
                },
                midrollPlayerFullscreenListener = function (value, player) {
                    ownerPlayer.setFullscreen(value);
                    if (value) {
                        ownerPlayer.addListener('fullscreen', ownerPlayerFullscreenListener);
                    } else {
                        ownerPlayer.removeListener('fullscreen', ownerPlayerFullscreenListener);
                    }
                };

            if (ref.data.hasOwnProperty(ownerId) && ref.data[ownerId].hasOwnProperty(catName)) {
                categoryItems = ref.data[ownerId][catName];
            }

            if (!categoryItems.hasOwnProperty('data') || !categoryItems.data.hasOwnProperty('podPlaylist') || categoryItems.data.podPlaylist.length === 0) {
                $p.utils.log("Plugin Ads: _playMidroll(). No midrolls to set for " + catName + ".");
                return;
            }

            // prepare old player
            ownerPlayer.setPause();
            ownerPlayer.getDC().append('<div id="midrollplayer"/>');
            // prepare midroll player
            midrollPlayer = $p('#midrollplayer', $.extend({}, ownerPlayer.config, midrollPlayerConfig, {
                playlist: categoryItems.data.podPlaylist
            }, {
                plugin_ads: midrollPlayerAdsPluginConfig
            }), function (player) {
                midrollPlayer.getDC().css({
                    'position': 'absolute',
                    'top': 0,
                    'left': 0,
                    'z-index': 999999999,
                    'width': '100%',
                    'height': '100%'
                });
                midrollPlayer.setVolume(ownerPlayer.getVolume());
                if (ownerPlayer.getIsFullscreen()) {
                    midrollPlayer.setFullscreen(true);
                }
            });

            midrollPlayer.addListener('volume', midrollPlayerVolumeListener);
            midrollPlayer.addListener('fullscreen', midrollPlayerFullscreenListener);
            midrollPlayer.addListener('error', midrollPlayerListener);
            midrollPlayer.addListener('done', midrollPlayerListener);
        },
        _addClick: function () {
            var ref = this,
                dest = '',
                item = this.pp.getItem(),
                config = item.config || [],
                adsConfig = this.getConfig('adTypes'),
                clickthroughs;

            this.pp.getDC().find('.' + this.getCN('clickthrough')).remove();

            if (!config.isAd || !config.hasOwnProperty('vast') || !config.vast.hasOwnProperty('clickthrough') || config.vast.isVPAID) {
                return;
            }

            clickthroughs = config.vast.clickthrough;

            if ($.isEmptyObject(clickthroughs)) {
                return;
            }

            try {
                $.each(clickthroughs, function (key, value) {
                    if (value == '' || value == null) {
                        return true;
                    }
                    dest = value;
                    return false;
                });
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _addClick() when trying to set clickthrough", e);
                return;
            }
            try {
                this.applyToPlayer(
                    $(document.createElement('a'))
                    .addClass('clickthrough')
                    .attr({
                        'href': dest,
                        target: '_blank'
                    })
                    .css({
                        border: '1px solid red',
                        position: 'absolute',
                        backgroundColor: '#fff',
                        opacity: 0,
                        filter: 'alpha(opacity=1)',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        zIndex: '1000'
                    })
                    .click(function (evt) {

                        if (ref.pp.getState('PLAYING')) {

                            if (ref.getConfig('pauseOnClick')) {
                                ref.pp.setPause();
                            }
                            ref._VASTTrack('clickthrough');
                            return true;
                        } else {
                            evt.preventDefault();
                            ref.pp.setPlay();
                            return false;
                        }
                    })
                    .mousemove(function (event) {
                        ref.pp._playerFocusListener(event);
                    })
                    .mouseenter(function (event) {
                        ref.pp._playerFocusListener(event);
                    })
                    .mouseleave(function (event) {
                        ref.pp._playerFocusListener(event);
                    }), 'clickthrough');
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _addClick() when trying to add clickthrough to the DOM", e);
            }
        },
        /********************************************************
         * LINEAR ADS HANDLING
         ********************************************************/
        _cappingActive: function () {
            switch (this.getConfig('cappingMethod')) {
                case 'id':
                    if (this.pp.storage.restore(this._adId) >= this.getConfig('cappingLimit')){
                        return true;
                    }
                    break;
                case 'hard':
                    if (this.getConfig('cappingLimit') <= 0){
                        return false;
                    }
                    if (this.pp.storage.restore('capping') >= this.getConfig('cappingLimit')){
                        return true;
                    }    
                    break;
            }
            return false;
        },
        _cappingCount: function () {
            switch (this.getConfig('cappingMethod')) {
                case 'id':
                    if (typeof this.pp.storage.restore(this._adId) != 'number' || this.pp.storage.restore(this._adId) < this.getConfig('cappingLimit')){
                        this.pp.storage.save(this._adId, (this.pp.storage.restore(this._adId) || 0) + 1, this.getConfig('cappingPeriod'));
                    }
                    break;
                case 'hard':
                    if (this.getConfig('cappingLimit') > 0 && this.pp.storage.restore('capping') < this.getConfig('cappingLimit')){
                        this.pp.storage.save('capping', (this.pp.storage.restore('capping') || 0) + 1, this.getConfig('cappingPeriod'));
                    }
                    break;
            }
        },
        _handleSkipOption: function () {
            var skipOn = this.getConfig('prerollSkip') || 0,
                ref = this;
            // disabled
            if (skipOn == 0){
                return;
            }
            var skipContainer = this.applyToPlayer(
                $('<div/>')
                .addClass('adskip')
                .addClass('locked')
                .css('zIndex', 1000)
                .click(function () {
                    ref.pp.setActiveItem('next');
                }),
                'skip');
            var listener = function () {
                var maxSecs = ref.pp.getMaxPosition(),
                    left = skipOn - Math.ceil(maxSecs) + 1;
                skipContainer.html($p.utils.parseTemplate(ref.getConfig('prerollSkipHtml'), {
                    secs: left
                }));
                if (skipOn / 2 >= left){
                    skipContainer.addClass('active').removeClass('inactive');
                }
                // enable skip
                if (maxSecs < skipOn && skipOn > 0){
                    return;
                }
                ref.pp.setConfig({
                        'disallowSkip': false
                    },
                    0);
                ref.pp.removeListener('time', listener);
                skipContainer.removeClass('locked').addClass('unlocked')
                    .html(ref.getConfig('prerollUnlockedHtml'));
            };
            this.pp.addListener('time', listener);
        },
        _handleMessages: function () {

            var ref = this,
                adsConfig = this.getConfig('adTypes'),
                adType,
                adCat,
                podItem = this.pp.getItem(),
                podItemIdx = 0,
                currentPod,
                podPlaylist,
                podData,
                podOwner,
                ownerPlayer,
                podLength = 0,
                messageContainers = [],
                messageTemplates = [],
                messageTemplateVars = {
                    title: '',
                    h: 0,
                    m: 0,
                    s: 0,
                    secs: 0
                },
                countdownListener,
                lastPos = -1,
                i, l;

            if (!podItem.config.isAd) {
                return;
            }

            // If it's an ad than we could assume that there are needed configuration values. If not we should
            // catch errors
            try {
                podOwner = podItem.config.vast.owner;
                adCat = podItem.config.cat;
                adType = podItem.config.adType;

                if (this.data.hasOwnProperty(podOwner)) {
                    currentPod = this.data[podOwner];
                    if (currentPod.hasOwnProperty(adCat)) {
                        currentPod = currentPod[adCat]; // pod for current category
                        podData = currentPod.data;
                        podPlaylist = podData.podPlaylist;
                    }
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _handleMessages() when trying to get config values from adItem.", e);
            }

            // get message templates
            if (adsConfig[adType].hasOwnProperty('messages') && !$.isArray(adsConfig[adType].messages)) {
                messageTemplates = [adsConfig[adType].messages];
            } else {
                messageTemplates = adsConfig[adType].messages;
            }

            // create ad message containers for each configured message template
            for (i = 0, l = messageTemplates.length; i < l; i++) {
                messageContainers.push(this.applyToPlayer($('<div/>').addClass('admessage admessage' + i), 'admessage' + i, true));
            }

            podData.podTimeRemaining = podData.podTimeRemaining || podData.podDuration;
            podLength = podPlaylist.length;
            podItemIdx = $.inArray($.grep(podPlaylist, function (el, idx) {
                return el.config.id === podItem.id;
            })[0], podPlaylist, podItemIdx);

            // update message template variables
            if (this.config.slaveMode) {
                ownerPlayer = $p(this.config.masterId);
                messageTemplateVars.title = ownerPlayer.getItemById(podOwner).config.title || '';
            } else {
                messageTemplateVars.title = this.pp.getItemById(podOwner).config.title || '';
            }

            countdownListener = function () {
                var timeElapsed = ref.pp.getPosition() || 0,
                    currentPodItemTimeRemaining,
                    podTimeRemainingObj,
                    messageTemplate;

                if (Math.abs(lastPos - timeElapsed) >= 1) { // limit updates to one per second
                    currentPodItemTimeRemaining = Math.floor(ref.pp.getTimeLeft());
                    podData.podTimeRemaining = 0;
                    for (var i = podItemIdx + 1; i < podLength; i++) {
                        podData.podTimeRemaining += podPlaylist[i].config.duration;
                    }
                    podData.podTimeRemaining += currentPodItemTimeRemaining;
                    podData.podTimeRemaining = Math.floor(podData.podTimeRemaining);

                    podTimeRemainingObj = $p.utils.toTimeObject(podData.podTimeRemaining);

                    // update message template variables
                    messageTemplateVars.secs = podData.podTimeRemaining;
                    messageTemplateVars.h = podTimeRemainingObj.h < 10 ? '0' + podTimeRemainingObj.h : podTimeRemainingObj.h;
                    messageTemplateVars.m = podTimeRemainingObj.m < 10 ? '0' + podTimeRemainingObj.m : podTimeRemainingObj.m;
                    messageTemplateVars.s = podTimeRemainingObj.s < 10 ? '0' + podTimeRemainingObj.s : podTimeRemainingObj.s;

                    // update DOM elements
                    for (i = 0; i < l; i++) {
                        messageTemplate = $p.utils.parseTemplate(messageTemplates[i], messageTemplateVars);
                        messageContainers[i].html('<span>' + messageTemplate + '</span>');
                    }

                    lastPos = timeElapsed;
                }
                if (currentPodItemTimeRemaining <= 0) {
                    ref.pp.removeListener('time', countdownListener);
                }
            };
            this.pp.removeListener('*.adcountdown');
            this.pp.addListener('time.adcountdown', countdownListener);
        },
        /********************************************************
         * INDUSTRY ICONS
         ********************************************************/
        _handleIcons: function () {
            var ref = this,
                adsConfig = this.getConfig('adTypes'),
                adType,
                adCat,
                podItem = this.pp.getItem(),
                podOwner = podItem.config.vast.owner,
                adCat = podItem.config.cat,
                adType = podItem.config.adType,
                icons = podItem.config.vast.icons,
                iconsCuepointListener = function (cuepoint) {
                    var icon;
                    if (cuepoint.group === 'vasticons') {

                        icon = cuepoint.value;

                        if (cuepoint.enabled) {
                            ref._addIcon(icon);
                        } else {
                            ref._removeIcon(icon);
                        }
                    }
                };

            this._createIconsOverlay();

            // add cuepoints listener
            this.pp.removeListener('*.vasticons');
            this.pp.addListener('cuepoint.vasticons', iconsCuepointListener);
        },
        _getIconsCuepoints: function (icons) {
            var cuepoints = [];

            $.each(icons, function () {
                var icon = this;
                cuepoints.push({
                    id: icon.attributes.program,
                    on: icon.attributes.offset || 0,
                    off: $p.utils.toSeconds(icon.attributes.duration || 0) + $p.utils.toSeconds(icon.attributes.offset || 0),
                    group: 'vasticons',
                    value: icon
                });
            });
            return cuepoints;
        },
        _createIconsOverlay: function () {
            var scaledListener,
                iconsOverlay;

            iconsOverlay = this.applyToPlayer(
                $('<div>')
                .addClass('vasticonsoverlay')
                .css({
                    position: 'absolute',
                    display: 'block',
                    zIndex: '1001',
                    pointerEvents: 'none'
                }),
                'vasticonsoverlay');

            scaledListener = function (event, pp) {
                var mediaElement = pp.playerModel.getMediaElement();
                iconsOverlay.css(mediaElement.css(['width', 'height', 'left', 'top']));
            };

            scaledListener(null, this.pp);
            this.pp.removeListener('*.vasticons');
            this.pp.addListener('scaled.vasticons', scaledListener);

            return iconsOverlay;
        },
        _removeIconsOverlay: function () {
            this.pp.removeListener('*.vasticons');
            this.getElement('vasticonsoverlay').remove();
            this._cleanupIcons();
        },
        _addIcon: function (icon) {
            var ref = this,
                iconOverlay = this.getElement('vasticonsoverlay'),
                iconElement,
                iconResources = icon.resources,
                iconResourceType,
                iconResource,
                resourcePriority = this.getConfig('resourcePriority');

            iconElement = $('<div>')
                .attr({
                    id: "vasticon_" + icon.attributes.program,
                    name: icon.attributes.program
                })
                .css({
                    width: icon.attributes.width,
                    height: icon.attributes.height,
                    position: 'absolute',
                    overflow: 'hidden',
                    pointerEvents: 'auto'
                });

            // icon positioning
            iconElement.css(ref._iconPositioning().getIconPosition(icon));

            // select resource by priority
            $.each(resourcePriority, function (idx, resourceType) {
                if (iconResources.hasOwnProperty(resourceType)) {
                    iconResourceType = resourceType;
                    iconResource = iconResources[resourceType][0]; // get first resource of that type
                    return false;
                }
            });

            switch (iconResourceType) {
                case 'image':
                    $('<div/>')
                        .css({
                            backgroundImage: "url(" + iconResource.src + ")",
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "contain",
                            width: '100%',
                            height: '100%'
                        })
                        .appendTo(iconElement);
                    break;
                case 'iframe':
                    $('<iframe/>')
                        .attr('src', iconResource.src)
                        .attr('width', '100%')
                        .attr('height', '100%')
                        .attr('frameborder', 0)
                        .attr('allowtransparency', 'true')
                        .attr('scrolling', 'no')
                        .attr('marginwidth', 0)
                        .attr('marginheight', 0)
                        .attr('vspace', 0)
                        .attr('hspace', 0)
                        .appendTo(iconElement);
                    break;
                case 'html':
                    /*$(this._createFriendlyIframe(iconResource.src,'html'))
                        .attr('width', '100%')
                        .attr('height', '100%')
                        .attr('frameborder', 0)
                        .attr('allowtransparency', 'true')
                        .attr('scrolling', 'no')
                        .attr('marginwidth', 0)
                        .attr('marginheight', 0)
                        .attr('vspace', 0)
                        .attr('hspace', 0)
                        .appendTo(iconElement);*/
                    iconElement.html(iconResource.src);
                    break;
            }

            // add icon clicks if defined
            if (icon.iconClicks.iconClickThrough !== null) {

                iconElement.css({
                        cursor: 'pointer'
                    })
                    .on('mousedown', function (evt) {

                        if (ref.pp.getState('PLAYING')) {

                            if (ref.getConfig('pauseOnClick')) {
                                ref.pp.setPause();
                            }

                            // track click events
                            if (icon.iconClicks.iconClickTracking !== null) {
                                $.each(icon.iconClicks.iconClickTracking, function (key, url) {
                                    ref._addPixel(url, 'IconClick');
                                });
                            }
                        } else {
                            ref.pp.setPlay();
                        }
                    });

                iconElement.click(function (evt) {
                    window.open(icon.iconClicks.iconClickThrough, '_blank');
                });   
            }

            iconOverlay.append(iconElement);

            // track icon view immediately after display
            if (icon.iconViewTracking !== null) {
                $.each(icon.iconViewTracking, function (key, url) {
                    ref._addPixel(url, 'IconView');
                });
            }

            // push icon to the current icons list
            this._iconPositioning().addIcon(icon);

            // log icon add
            $p.utils.log("Plugin Ads: Icon '" + icon.attributes.program +
                "' added. Current video position: " + this.pp.getPosition() + "s. Icon offset: " +
                (icon.attributes.offset || "0") + "s", icon);
        },

        _removeIcon: function (icon) {
            this.getElement('vasticonsoverlay')
                .find('#vasticon_' + icon.attributes.program)
                .remove();

            // remove icon from list
            this._iconPositioning().removeIcon(icon);
        },

        _cleanupIcons: function () {
            this._iconPositioning().clearIcons();
        },
        _iconPositioning: function () {
            var ref = this;

            return {
                addIcon: function (icon) {
                    var positionType = this.getIconPositionType(icon);

                    if (!ref._icons.hasOwnProperty(positionType)) {
                        ref._icons[positionType] = [];
                    }
                    ref._icons[positionType].push(icon);
                },
                removeIcon: function (icon) {
                    var positionType = this.getIconPositionType(icon),
                        icons = ref._icons,
                        idx;

                    if (icons.hasOwnProperty(positionType)) {
                        idx = icons[positionType].indexOf(icon);
                        if (idx > -1) {
                            icons[positionType].splice(idx, 1);
                            return true;
                        }
                    }

                    return false;
                },
                clearIcons: function () {
                    ref._icons = {};
                },
                getIconPosition: function (icon) {
                    var result = {},
                        positionType = this.getIconPositionType(icon),
                        xPos = icon.attributes.xPosition,
                        yPos = icon.attributes.yPosition,
                        yPosStacked = 0,
                        icons = ref._icons,
                        i, l;

                    if (positionType === 'numeric') {
                        // invert alignment for negative values
                        if (parseInt(xPos) < 0) {
                            result.right = Math.abs(parseInt(xPos)) + 'px';
                        } else {
                            result.left = parseInt(xPos) + 'px';
                        }
                        if (parseInt(yPos) < 0) {
                            result.bottom = Math.abs(parseInt(yPos)) + 'px';
                        } else {
                            result.top = parseInt(yPos) + 'px';
                        }
                    } else if (positionType === 'percentage') {
                        // invert alignment for negative values
                        if (parseInt(xPos) < 0) {
                            result.right = Math.abs(parseFloat(xPos)) + '%';
                        } else {
                            result.left = parseFloat(xPos) + '%';
                        }
                        if (parseInt(yPos) < 0) {
                            result.bottom = Math.abs(parseFloat(yPos)) + '%';
                        } else {
                            result.top = parseFloat(yPos) + '%';
                        }
                    } else {
                        if (icons.hasOwnProperty(positionType)) {
                            for (i = 0, l = icons[positionType].length; i < l; i++) {
                                yPosStacked += parseInt(icons[positionType][i].attributes.height);
                            }
                        }

                        result[xPos] = 0 + 'px';
                        result[yPos] = yPosStacked + 'px';
                    }

                    return result;
                },
                getIconPositionType: function (icon) {
                    var positionType = 'numeric',
                        xPos = icon.attributes.xPosition,
                        yPos = icon.attributes.yPosition;

                    if (xPos.indexOf('%') > -1 && yPos.indexOf('%')) {
                        positionType = 'percentage';
                    }

                    if (['left', 'right'].indexOf(xPos) > -1 && ['top', 'bottom'].indexOf(yPos) > -1) {
                        positionType = xPos + yPos;
                    }

                    return positionType;
                }
            };

        },
        /********************************************************
         * VAST TRACKING STUFF
         ********************************************************/
        _impressionTracker: function (mode) {
            var ref = this,
                item = this.pp.getItem(),
                itemConfig = item.config,
                vastConfig = item.config.vast || {},
                impressions = {},
                impression = {};

            if (this._enableTracking === false) {
                return;
            }

            switch (mode) {
                case 'NonLinear':
                    impressions = vastConfig.impressionsNonLinear;
                    break;

                default:
                    impressions = vastConfig.impressions || {};
                    break;
            }

            for (impression in impressions) {
                if (impressions.hasOwnProperty(impression)) {
                    if (itemConfig.isAd || (mode === 'NonLinear' && item.id === this._adsSessionOwnerId)) {
                        this._addPixel(impressions[impression], 'impression');
                    }
                }
            }

            // cleanup
            switch (mode) {
                case 'NonLinear':
                    vastConfig.impressionsNonLinear = {};
                    break;

                default:
                    vastConfig.impressions = {};
                    break;
            }
        },
        _VASTTrack: function (event) {
            if (this._enableTracking === false) {
                return;
            }

            var item = this.pp.getItem(),
                config = {},
                tEvents = {},
                key;

            try {
                // TODO nonlinear tracking
                //if (this.data.hasOwnProperty(itemId)) {
                //    config = this.data[itemId].nonlinear.config;
                //} else {
                config = item.config;

                if (config.isAd) {

                    if (config.vast.tracking.hasOwnProperty(event)) {
                        tEvents = config.vast.tracking[event];

                        for (key in tEvents) {
                            if (tEvents.hasOwnProperty(key)) {
                                this._addPixel(tEvents[key], event);
                            }
                        }
                    }
                }
            } catch (e) {
                $p.utils.log("Plugin Ads: Error in _VASTTrack() when trying to get config.", e);
            }
        },
        _addPixel: function (pixelUrl, event) {
            if (!pixelUrl) {
                return;
            }

            var url = this.getConfig('urlPreprocessor')(this, pixelUrl),
                noCache = '';

            $p.utils.log('VAST Tracking', event, url);

            if (this.getConfig('vastNoCache') === true) {
                noCache = "ver=" + new Date().getTime();

                if (url.indexOf('?') > -1) {
                    url = url + '&' + noCache;
                } else {
                    url = url + '?' + noCache;
                }
            }
            $('body').append(
                $('<img/>')
                .attr('src', url)
                .attr('alt', event)
                .addClass('imatrackingpixel')
                .hide());
        },
        _adPodCleanup: function (podItem) {
            var podOwner = podItem.config.vast.owner,
                adCat = podItem.config.cat,
                adType = podItem.config.adType,
                currentPod,
                podData,
                podPlaylist;

            if (this.data.hasOwnProperty(podOwner)) {
                currentPod = this.data[podOwner];
                if (currentPod.hasOwnProperty(adCat)) {
                    currentPod = currentPod[adCat]; // pod for current category
                    podData = currentPod.data;
                    podPlaylist = podData.podPlaylist;
                }
            }

            if (podItem === podPlaylist[podPlaylist.length - 1]) {
                this._removeAds(adCat);
            }
        },
        _removeAds: function (category) {
            var cat = category || '*';

            if (cat === '*') {
                this.pp.removeItems(function (itm, idx) {
                    return itm.config.isAd === true;
                });
                this.data = {};
            } else {
                this.pp.removeItemsCategory(category);
                delete this.data[this._adsSessionOwnerId][category];
            }
        },
        _isVideoPlayable: function (itemId) {
            var item = this.pp.getItemById(itemId) || {};
            if (item.hasOwnProperty('model') && item.model !== 'NA') {
                return true;
            } else {
                return false;
            }
        },
        _getLevel: function (type) {
            return this._adTypes(type);
        },
        /* ugly "hotfix" */
        _adTypes: function (type) {
            var types = this.getConfig('resourcePriority');
            for (var i in types) {
                if (types[i] === type){
                    return i;
                }
            }
            return false;
        },
        _isAd: function () {
            return this.pp.getDC().hasClass('ad') || false;
        },
        _selectSchedulingMethod: function (data) {
            var confSm = this.getConfig('schedulingMethod'),
                sm;

            switch (confSm) {
                case "auto":
                    sm = this._detectSchedulingMethod(data);
                    break;
                case "vmap":
                    sm = "vmap";
                    break;
                case "vastAdIdKey":
                    sm = "vastAdIdKey";
                default:
                    sm = "none";
                    break;
            }
            return sm;
        },
        _detectSchedulingMethod: function (data) {
            var result = 'none';

            if (this._isVMAPDocument(data)) {
                result = 'vmap';
            } else if (this._hasVASTAdIdKey(data)) {
                result = 'vastAdIdKey';
            }

            return result;
        },
        _hasVASTAdIdKey: function (data) {
            var adTypes = this.getConfig('adTypes'),
                type,
                typeName,
                typeKeys,
                typeKey,
                typeCategories,
                typeCat,
                i, l;

            for (typeName in adTypes) {
                if (adTypes.hasOwnProperty(typeName) && adTypes[typeName].hasOwnProperty('key') && adTypes[typeName].hasOwnProperty('cat')) {
                    type = adTypes[typeName];
                    typeKeys = $.isArray(type.key) ? type.key : [type.key];
                    typeCategories = $.isArray(type.cat) ? type.cat : [type.cat];

                    for (i = 0, l = typeKeys.length; i < l; i++) {
                        typeKey = typeKeys[i];
                        typeCat = typeCategories[i];

                        if (typeof typeKey === 'string' && typeof typeCat === 'string') {
                            if ($(data).find('Ad[id*="' + typeKey + '"]').length) {
                                return true;
                            }
                        }
                    }
                }
            }

            return false;
        },
        _isVMAPDocument: function (data) {
            return data.documentElement === data.getElementsByTagNameNS(this.VMAPNS, 'VMAP')[0];
        },
        _isVASTDocument: function (data) {
            return data.documentElement === data.getElementsByTagName('VAST')[0];
        },
        _getVMAPVersion: function (data) {
            if (this._isVMAPDocument(data)) {
                return data.documentElement.getAttribute('version');
            }
            return false;
        },
        _getVASTVersion: function (data) {
            if (this._isVASTDocument(data)) {
                return data.documentElement.getAttribute('version');
            }
            return false;
        },
        _getAdTypeForAdCat: function (adCat) {
            var adTypes = this.getConfig('adTypes'),
                type,
                typeName,
                typeCategories,
                i;

            for (typeName in adTypes) {
                if (adTypes.hasOwnProperty(typeName) && adTypes[typeName].hasOwnProperty('cat')) {
                    type = adTypes[typeName];
                    typeCategories = $.isArray(type.cat) ? type.cat : [type.cat];
                    for (var i = 0; i < typeCategories.length; i++) {
                        if (typeCategories[i] === adCat) {
                            return typeName;
                        }
                    }
                }
            }
            return false;
        },
        /**
         *
         * @param {string} content - URL to JavaScript file to load or HTML content to put into IFrame
         * @param {string} type - javascript, html
         * @returns {HTMLElement} - iframe
         */
        _createFriendlyIframe: function (content, type) {
            var iframe = $("<iframe>")
                .attr('src', 'javascript:false'),
                iframeContent;

            switch (type) {
                case 'javascript':
                    iframeContent = '<div>' +
                        '<script>window.inDapIF = true;</script>' +
                        '<script src="' + content + '" type="application/javascript"></script>' +
                        '</div>';
                    break;
                case 'html':
                    iframeContent = '<div>' +
                        '<script>window.inDapIF = true;</script>' +
                        content +
                        '</div>';
                    break;
            }

            iframe.on('load', function () {

                if (!this.contentWindow) {
                    return;
                }
                var doc = $(this.contentWindow.document).find("body");
                doc.html(iframeContent);
            });

            return iframe;
        }
    };

    $p.plugins.projekktorAds = projekktorAds;
}(window, document, jQuery, projekktor));/*
 * Projekktor II Plugin: Related
 * VERSION: 1.1.2
 * DESC: Provides a "related videos" and "share me" postroll display
 *
 * Copyright Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2014-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */

(function (window, document, $, $p) {
    'use strict';

    if ($p === undefined || !$p.hasOwnProperty('plugins')) {
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorRelated = function () {
    };

    projekktorRelated.prototype = {
        version: '1.1.2',
        reqVer: '1.8.1',
        _showOnReady: false,
        _myContent: null,
        pluginReady: false,
        relatedTimeout: null,
        relatedSVG: null,
        _items: [],
        config: {
            enabled: true,
            showOnStart: false,
            replay: {
                enabled: true,
                title: 'Replay'
            },
            embed: {
                enabled: true,
                code: '<' + 'if' + 'rame id="%{embedid}" src="%{playerurl}?vidid=%{ID}" width="640" height="385" frameborder="0"><' + '/if' + 'rame>',
                title: "Embed this"
            },
            share: {
                enabled: true,
                code: 'http://%{playerurl}?vidid=%{ID}',
                title: "Share me"
            },
            related: {
                enabled: true,
                title: 'Related Videos',
                itemTemplate: '<a href="%{url}" target="%{target}"><span class="title">%{title}</span><span class="image"><img src="%{poster}"/></span></a>',
                items: [
                    /*  {poster: this._imgDummy, url: 'http://www.projekktor.com', title:'Title 1'} */
                ],
                autoContinue: {
                    enabled: true,
                    timeout: 5
                }
            }
        },
        initialize: function () {
            this._myContent = $('<div/>').addClass('wrapper');

            this._myPanel = this.applyToPlayer(
                $(document.createElement('div'))
                    .addClass('related')
                    .append(this._myContent)
            );

            this.setInactive();
            this.pluginReady = true;
        },
        _buildShare: function () {
            // related video list:
            var cssprefix = this.getConfig('ns'),
                div = $('<div>').addClass(cssprefix + 'relatedone'),
                ref = this,
                title = '',
                acEnabled = this.getConfig('related').autoContinue.enabled,
                acTimout = this.getConfig('related').autoContinue.timeout,
                svg = $('<svg class="csvg inactive" viewBox="0 0 36 36"><path class="cpath" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg>'),
                svgStyle = $('<style>.projekktor .pprelated .cpath{animation-duration:' + acTimout + 's !important;-webkit-animation-duration:' + acTimout + 's !important;}</style>');

            if (!this.getConfig('replay').enabled && !this.getConfig('embed').enabled && !this.getConfig('share').enabled) {
                return;
            }

            // add replay tile:
            if (this.getConfig('replay').enabled) {
                title = this.getConfig('replay').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedreplay')
                        .append(title ? $('<h2>').html(title) : false)
                        .append($('<div>')
                            .addClass('container')
                            .append(
                                $('<a>')
                                    .addClass('replay')
                                    .attr({
                                        href: '#',
                                        title: this.getConfig('replay').title
                                    })
                                    .click(function (evt) {
                                        evt.stopPropagation();
                                        ref.pp.setActiveItem(0).setPlay();
                                        if (ref.relatedTimeout) {
                                            clearTimeout(ref.relatedTimeout);
                                        }
                                        return false;
                                    })
                            )
                            .append(acEnabled ? svg : false)
                        )
                );
                // related.autoContinue: append css to head, set timeout for auto-start function
                if (this.getConfig('related').enabled && acEnabled && acTimout > 0) {
                    $('head').append(svgStyle);
                    svg.removeClass('inactive').addClass('active');
                    this.relatedSVG = svg;
                    if (this.relatedTimeout) {
                        clearTimeout(this.relatedTimeout);
                    }
                    this.relatedTimeout = setTimeout(this._startFirstRelated.bind(this), acTimout * 1000);
                }
            }

            // add embed tile:
            if (this.getConfig('embed').enabled) {
                title = this.getConfig('embed').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedembed')
                        .append((title) ? $('<h2/>').html(title) : false)
                        .append(
                            $('<textarea>')
                                .val(this._getEmbedCode())
                                .click(function (evt) {
                                    evt.stopPropagation();
                                    this.select();
                                })
                                .focus(function () {
                                    this.select();
                                })
                                .attr('rows', 4)
                                .addClass('context')
                        )
                );
            }

            // add share tile:
            if (this.getConfig('share').enabled) {
                title = this.getConfig('share').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedshare')
                        .append((title) ? $('<h2/>').html(title) : false)
                        .append(
                            $('<textarea>')
                                .val(this._getShareUrl())
                                .click(function (evt) {
                                    evt.stopPropagation();
                                    this.select();
                                })
                                .focus(function () {
                                    this.select();
                                })
                                .attr('rows', 4)
                                .addClass('context')
                        )
                );
            }

            this._myContent.append(div);
        },
        _buildRelated: function () {
            // related video list:
            var cssprefix = this.getConfig('ns'),
                mainDiv = $('<div>').addClass(cssprefix + 'relatedtwo'),
                itemsDiv = $('<div>').addClass(cssprefix + 'relateditems'),
                itemsTitle = this.getConfig('related').title,
                itemTemplate = this.getConfig('related').itemTemplate,
                items = [],
                t = this;

            this._items = items = this._getItems();

            $.each(items, function (idx, item) {
                // ie mess:
                if (!item.url && !item.clickHandler) {
                    return;
                }
                var itemElement = itemTemplate;

                // replace template variables
                Object.keys(item).forEach(function (key) {
                    itemElement = itemElement.replace('%{' + key + '}', item[key]);
                });

                // Convert template to HTML Node, add class & some event handlers
                itemElement = $(itemElement)
                    .addClass(cssprefix + 'relateditem')
                    .off()
                    .on('mouseenter', function () {
                        $(this).addClass('active');
                    })
                    .on('mouseleave', function () {
                        $(this).removeClass('active');
                    })
                    .addClass(('ontouchstart' in document.documentElement) ? 'active' : '');

                // add click handler
                if (item.clickHandler && typeof item.clickHandler === 'function') {
                    itemElement.on('click', function() {
                        if (t.relatedTimeout) {
                            t.relatedSVG.removeClass('active').addClass('inactive');
                            clearTimeout(t.relatedTimeout);
                        }
                        t.setInactive();
                        item.clickHandler();
                    });
                }

                itemsDiv.append(itemElement);
            });

            mainDiv.append((itemsTitle) ? $('<h2>').html(itemsTitle) : false)
                .append(itemsDiv);

            this._myContent.append(mainDiv);
        },
        _startFirstRelated: function() {
            // auto-start first found related item
            var itemCH = null,
                itemUrl = null;

            $.each(this._items, function (idx, item) {
                if (itemUrl === null && itemCH === null) {
                    if (typeof item.clickHandler === 'function') {
                        itemCH = item.clickHandler;
                    }
                    if (typeof item.url === 'string') {
                        itemUrl = item.url;
                    }
                }
            });

            this.setInactive();

            if (typeof itemCH === 'function') {
                itemCH.call();
            } else if (typeof itemUrl === 'string') {
                document.location.href = itemUrl;
            }
        },
        _getEmbedCode: function () {
            // replace standard items
            var result = this.getConfig('embed').code;
            var data = {};

            data.embedid = $p.utils.randomId(8);
            data.playerurl = window.location.href + window.location.hash;
            data.ID = this.pp.getItem()['ID'];

            for (var i in data) {
                if (data.hasOwnProperty(i)) {
                    result = $p.utils.parseTemplate(result, data);
                }
            }
            return result; // jQuery('<div />').text(result).html();
        },
        _getShareUrl: function () {
            // replace standard items
            var result = this.getConfig('share').code;
            var data = {};

            data.embedid = $p.utils.randomId(8);
            data.playerurl = window.location.href + window.location.hash;
            data.ID = this.pp.getItem()['ID'];

            for (var i in data) {
                if (data.hasOwnProperty(i)) {
                    result = $p.utils.parseTemplate(result, data);
                }
            }
            return jQuery('<div />').text(result).html();
        },
        _buildPanel: function () {
            this._myContent.html('');

            if (this.getConfig('enabled') !== true) {
                return;
            }

            if (!this.getConfig('replay').enabled && !this.getConfig('embed').enabled && !this.getConfig('share').enabled && !this.getConfig('related').enabled) {
                return;
            }

            if (this.getConfig('share')) {
                this._buildShare();
            }

            if (this.getConfig('related')) {
                this._buildRelated();
            }

            if (this._items.length) {
                this.setActive();
            }
        },
        _getItems: function () {
            var items = [];

            if (typeof this.getConfig('related').items === 'function') {
                items = this.getConfig('related').items(this.pp);
            } else {
                items = this.getConfig('related').items;
            }

            return items;
        },
        /* Event Handlers */
        displayReadyHandler: function () {
            if (this.getConfig('showOnStart') && this.pp.getState('IDLE')) {
                this._buildPanel();
            }
        },
        doneHandler: function () {
            this._buildPanel();
        },
        stateHandler: function (stateValue) {
            switch (stateValue) {
                case 'ERROR':
                case 'STARTING':
                    this.setInactive();
                    break;
                case 'AWAKENING':
                case 'COMPLETED':
                case 'IDLE':
            }
        }
    };

    $p.plugins.projekktorRelated = projekktorRelated;
}(window, document, jQuery, projekktor));
/*
 * Projekktor II Plugin: Tracking
 * VERSION: 1.1.9
 *
 * DESC: Allows tracking of all player events and states plus some additional client information
 * to any pixelImg based tracker.
 *
 * Copyright 2013, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * all rights reserved
 * Copyright 2014-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * all rights reserved
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorTracking = function () {};

    projekktorTracking.prototype = {
        version: '1.1.9',
        reqVer: '1.8.1',
        sessionId: null,
        pixelSeqCount: 0,
        sessionStartTime: 0,
        userStartTime: new Date(),
        continuousDurations: [],
        totalPlaybackDuration: 0,
        error: {
            code: 0,
            message: 'unknown error'
        },
        _trackThis: {},
        _data: {},
        _usageDuration: 0,
        _usageDurationOffset: 0,
        _lastPos: -1,
        config: {
            permanentUuid: false,
            respectDNT: false,
            track: []
        },
        _getConstants: function () {

            var pltfrms = this.pp.getSupportedPlatformsGlobal(),
                pltfrm = this.pp.getPlatform();

            return {
                uid: this.getTrackingId(), // player's tracking id (via config)
                sid: this.sessionId, // a unique session id
                sst: this.sessionStartTime.getTime(), // session start time (timestamp)
                plyid: this.pp.getId(), // player's DOM id
                r: String(Math.random()).slice(2, 8), // some random string
                url: this.cleanUrl(window.location.href), // page location
                ref: this.cleanUrl(window.location.href), // alias page location
                pltfrms: pltfrms, // available platforms/mimeTypes on client
                pltfrm: pltfrm, // available platforms on client
                res: screen.width + 'x' + screen.height, // client's screen dims
                ua: $p.userAgent.string
            };
        },
        _getVariables: function (error) {
            var now = new Date(),
                isLive = (this.pp.getConfig('streamType').indexOf('dvr') > -1 || this.pp.getConfig('streamType').indexOf('live') > -1);

            return {
                cat: this.pp.getItem().cat, // clip category (via config, default "clip")
                dur: this.pp.getDuration(), // clip duration in seconds
                durms: this.pp.getDuration() * 1000, // clip duration in milliseconds
                err: (error) ? 1 : 0, // is error
                errcode: this.error.code, // error code
                errmsg: this.error.message, // error message
                fs: this.pp.getIsFullscreen(), // is in fullscreen
                h: now.getHours(), // IQ TEST
                m: now.getMinutes(), // IQ TEST
                mpos: this.pp.getMaxPosition(), // current playhead position in seconds
                mposms: this.pp.getMaxPosition() * 1000, // current playhead position in milli-seconds
                mf: this.pp.getMediaType().split('/')[1], // media type (audio/video)
                mt: this.pp.getMediaType().split('/')[0], // media format (mp4/webm/ogg ...)
                mid: this.pp.getItemId(), // media id (via config)
                midx: this.pp.getItemIdx(), // media idx (0=first)
                mod: this.pp.getModel(), // media's playback model
                murl: this.pp.getSource() || '', // media URL
                mcontdur: Math.max.apply(Math, this.continuousDurations.concat(this._usageDuration) || []), // max. continuous media consume
                mlive: isLive, // is media live or VOD
                pstate: this.pp.getState(), // current player state
                pver: this.pp.getVersion(), // player version
                pos: this.pp.getPosition(), // current playhead position in seconds
                posms: this.pp.getPosition() * 1000, // current playhead position in milli-seconds
                rnd: $p.utils.randomId(8), // random string
                seq: this.pixelSeqCount, // pixel sequence # per session
                s: now.getSeconds(), // IQ TEST
                sdur: now.getTime() - this.sessionStartTime.getTime(), // session duration (milliseconds)
                udur: now.getTime() - this.userStartTime.getTime(), // session duration (milliseconds)
                udurnet: now.getTime() - this.userStartTime.getTime(), // session duration (milliseconds)
                title: this.pp.getConfig('title'), // item title (via config)
                tpdur: this.totalPlaybackDuration,
                ts: now.getTime() // timestamp of NOW
            };
        },
        initialize: function () {
            this.pluginReady = true;
            this.sessionId = this._uuid();
            this.pixelSeqCount = 0;
            this.sessionStartTime = new Date();
        },
        itemHandler: function () {

            var ref = this,
                dnt = navigator.doNotTrack || navigator.msDoNotTrack;

            // clean prior mess
            this.removeTrackingPixels();
            this._trackThis = {};

            // init usage stats counting
            this.continuousDurations = [];
            this._usageDuration = 0;
            this._usageDurationOffset = 0;
            this.totalPlaybackDuration = 0;

            // respect donottrack
            if (this.getConfig('respectDNT') === true && (dnt === 'yes' || dnt === '1')) {
                return;
            }

            this.pluginReady = false;

            // gather tracking requests from config
            $.each(this.getConfig('track'), function () {
                // parse URL
                var url = this.url || null,
                    post = this.post || null,
                    cat = this.cat || '*',
                    callback = this.callback || null;

                if (ref._trackThis[cat] == null) {
                    ref._trackThis[cat] = {};
                }

                $.each(this.events, function (key, value) {

                    // buffer / state event?
                    if (ref._trackThis[cat][value] == null) {
                        ref._trackThis[cat][value] = [];
                    }

                    ref._trackThis[cat][value].push({
                        url: url,
                        post: post,
                        callback: callback
                    });
                });

                return true;
            });

            this.pluginReady = true;
        },
        eventHandler: function (event, value, player) {

            if ($.isEmptyObject(this._trackThis)) {
                return;
            }

            var evt = event,
                evtPartsArray = [],
                evtTempArray = [],
                ref = this,
                itemCat = this.pp.getItem().cat;

            switch (event) {
                case 'state':
                    evt = event + "." + value.toLowerCase();
                    switch (value) {
                        case 'AWAKENING':
                            this.userStartTime = new Date();
                            break;
                        case 'COMPLETED':
                            // update usage stats on complete
                            this.continuousDurations.push(this._usageDuration);
                            this.totalPlaybackDuration += this._usageDuration;
                            break;
                    }
                    break;
                case 'buffering':
                    evt = event + "." + value.toLowerCase();
                    break;
                case 'seek':
                    if (isNaN(value)) { // temp V1.2.31 bug workaround
                        evt = event + "." + value.toLowerCase();

                        if (value == 'SEEKED') {
                            this.continuousDurations.push(this._usageDuration);
                            this._usageDurationOffset = null;
                        }
                    }
                    break;
                case 'time':
                    // limit time event to be tracked only one per second
                    if (Math.abs(this._lastPos - value) < 1) {
                        return;
                    }

                    this._lastPos = Math.floor(value); // cut off milliseconds part

                    // "seek" doesn't provide seek-dest values and "getPosition" is still to inaccurate
                    if (this._usageDurationOffset === null) {
                        this._usageDuration = 0;
                        this._usageDurationOffset = value;
                    }

                    evt = event + "." + this._lastPos;

                    this._usageDuration = value - this._usageDurationOffset;
                    this.totalPlaybackDuration = this.continuousDurations.reduce(function (a, b) {
                        return a + b;
                    }, 0) + this._usageDuration; // first sum up the previous durations then add current one

                    break;
                case 'error':
                    this.error.code = value;
                    this.error.message = $p.utils.errorMessage(value, this.pp);
                    break;
                default:
                    value = '';
            }

            // TRACK regular events
            try {
                evtPartsArray = evt.split('.');
                for (var i = 0; i < evtPartsArray.length; i++) {
                    evtTempArray.push(evtPartsArray[i]);
                    evt = evtTempArray.join('.');
                    if (!!this._trackThis[itemCat]) {
                        $.each(this._trackThis[itemCat][evt] || [], function () {
                            ref._trackCall(event, this.url, this.post, this.callback);
                        });
                    }
                    // track events for every category
                    if(this._trackThis.hasOwnProperty('*')) {
                        $.each(this._trackThis['*'][evt] || [], function () {
                            ref._trackCall(event, this.url, this.post, this.callback);
                        });
                    }
                }
            } catch (e) {}

        },
        _trackCall: function (event, url, post, callback) {

            var postData = {},
                tVars = this._getVariables((event === 'error')),
                tConst = this._getConstants();

            this.pixelSeqCount++;

            // trigger callback function
            if (callback != null) {
                callback(tConst, tVars, this.pp);
            }

            if (url == null) {
                return;
            }

            // parse URL tags
            url = $p.utils.parseTemplate(url, $.extend({}, tConst, tVars), true);

            // -----------------------------------------
            // no POST: load tracking pixel
            if (post == null) {
                this.addTrackingPixel(url);
                return;
            }

            // parse POST params
            $.each(post, function (key, value) {
                try {
                    postData[key] = $p.utils.parseTemplate(value, $.extend({}, tConst, tVars), true);
                } catch (e) {
                    postData[key] = value;
                }
            });

            // -----------------------------------------
            // CORS Ajax request:
            // The IE family it the most fascinating sort of browser in the whole wide world. lovin' it.
            if (window.XDomainRequest) {
                // Use Microsoft XDR
                var xdr = new XDomainRequest();
                xdr.open("POST", url, true);
                xdr.onprogress = function () {}; // IE9 caveat
                xdr.onerror = function () {};
                xdr.send($.param(postData));
                return;
            }

            var ajaxConf = {
                url: url,
                type: 'POST',
                data: postData,
                error: function () {},
                success: function () {},
                cache: false,
                async: true,
                // dataType: 'text/html',
                crossDomain: true
            };

            ajaxConf.xhrFields = {
                withCredentials: true
            };

            ajaxConf.beforeSend = function (xhr) {
                xhr.withCredentials = true;
            };

            $.support.cors = true;
            $.ajax(ajaxConf);
        },
        cleanUrl: function (url) {
            // remove hash tags, encode URI
            return window.encodeURIComponent(url.replace(new RegExp('#.*'), ''));
        },
        addTrackingPixel: function (url) {
            $('body').append(
                $('<img/>')
                .attr('src', $('<p/>').html(url).text())
                .addClass(this.pp.getId() + '_tracking')
                .hide()
            );
        },
        removeTrackingPixels: function () {
            $('.' + this.pp.getId() + '_tracking').remove();
        },
        getTrackingId: function () {
            var name = 'prkusruuid',
                uuid = null;

            if (this.getConfig('permanentUuid') === false) {
                this.pp.storage.save(name, 'anonymous');
                return this._uuid();
            }

            uuid = this.pp.storage.restore(name);
            if (uuid == null || uuid == 'anonymous') {
                uuid = this._uuid();
                this.pp.storage.save(name, uuid);
            }
            return uuid;
        },
        /* uuid generator Copyright (c) 2010 Robert Kieffer */
        _uuid: function () {
            var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
            var uuid = new Array(36),
                rnd = 0,
                r;
            for (var i = 0; i < 36; i++) {
                if (i == 8 || i == 13 || i == 18 || i == 23) {
                    uuid[i] = '-';
                } else if (i == 14) {
                    uuid[i] = '4';
                } else {
                    if (rnd <= 0x02) {
                        rnd = 0x2000000 + (Math.random() * 0x1000000) | 0;
                    }
                    r = rnd & 0xf;
                    rnd = rnd >> 4;
                    uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
                }
            }
            return uuid.join('');
        }
    };

    $p.plugins.projekktorTracking = projekktorTracking;
}(window, document, jQuery, projekktor));/*
 * Projekktor Plugin: Overlay
 * VERSION: 1.1.3
 * DESC: Plugin for placing timed overlays.
 * Copyright 2015-2018 Radosław Włodkowski, radoslaw@wlodkowski.net, http://www.wlodkowski.net
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */

(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorOverlay = function () {};

    projekktorOverlay.prototype = {
        version: '1.1.3',
        reqVer: '1.8.1',
        containers: {
            main: null,
            viewport: null,
            media: null
        },
        config: {
            schedule: [
                /* example overlay element config */
                {
                    /**
                     * id - should be unique
                     */
                    id: 'overlay',
                    /**
                     *  Time in seconds from the beginning of the current playlist item after the current
                     *  overlay element will be shown. If the value is negative, the overlay element will be
                     *  shown on this many seconds before the end of the current playlist item.
                     *
                     *  NOTE: Negative values works only with items which duration is known and finite.
                     *
                     *  Default: 0 - overlay will be shown immediately after start of current playlist item.
                     */
                    on: 0,
                    /**
                     * Time in seconds from the beginning of the current playlist item after the current
                     * overlay element will be hidden. If the value is negative, the overlay element will be
                     * hidden on this many seconds before the end of the current playlist item.
                     *
                     * NOTE: Negative values works only with items which duration is known and finite.
                     *
                     * Default: 0 - overlay will be hidden with the end of current item playback.
                     */
                    off: 0,
                    /**
                     * If true the overlay will appear only once during playback.
                     */
                    once: false,
                    /**
                     * Should the overlay be positioned and scaled relatively to Projekktor viewport region
                     * or current media display region.
                     *
                     * Possible values:
                     * - 'viewport' - whole projekktor viewport area
                     * - 'media' - only media display region
                     */
                    alignTo: 'media',
                    /**
                     * width/height in px or %; default means natural size of the picture loaded
                     */

                    width: 'default',
                    height: 'default',

                    /**
                     * position: top, right, bottom, left;
                     *
                     * Any property can be defined in px or %.
                     * Special value 'center' remains the element centered.
                     *
                     * Values in px are uninfluenced by scaling the container they're included.
                     * Values in % gives possibility to remain relative position when the container is scaled.
                     */
                    position: {
                        top: '0px',
                        left: '0px'
                    },
                    /**
                     * Inline styles to be added to the overlay
                     */
                    styles: {},
                    /**
                     * One or more space-separated classes to be added to the class attribute of the overlay
                     */
                    cssClasses: '',
                    /**
                     * Type of the overlay content. Overlay could be image, iframe or HTML element.
                     * Interpretation of the 'src' value depends on this setting.
                     *
                     *  Possible values:
                     *  - 'image/<type>' - proper mimeType of the image to display e.g. 'image/png', 'image/svg+xml' etc.
                     *  - 'iframe' - overlay will be handled as <iframe> element
                     *  - 'html' - overlay will be handled as <div> element
                     */
                    type: '',
                    /**
                     * URL to the overlay image (works fine with SVG too)
                     * or src of the <iframe> element
                     * or string containing HTML code which should be placed inside the overlay <div>
                     */
                    src: '',
                    /**
                     * Title added to the <img> element title and alt attributes.
                     */
                    title: '',
                    /**
                     * Should the overlay be responsive to user interactions like clicks/touches etc.
                     * If there is a 'link' or 'callback' defined this value should be set to true,
                     * otherwise they won't work.
                     */
                    interactive: false,
                    /**
                     * URL to go to after click on the overlay element [optional].
                     */
                    link: {
                        url: 'http://www.projekktor.com',
                        target: '_blank'
                    },
                    /**
                     * Function called after click on the overlay [optional].
                     * It works only if the link config isn't present.
                     *
                     * There are two parameters passed to the callback function:
                     *      - player - reference to the current projekktor instance
                     *      - plugin - reference to the overlay plugin instance
                     *      - e - event object
                     */
                    callback: function (player, plugin, e) {}
                }
            ]
        },
        defaults: {
            overlay: {
                id: null,
                on: 0,
                off: 0,
                once: false,
                alignTo: 'media',
                width: 'default',
                height: 'default',
                position: {
                    top: '0px',
                    left: '0px',
                    bottom: null,
                    right: null
                },
                styles: {},
                cssClasses: '',
                src: null,
                type: null,
                title: '',
                interactive: false,
                link: {
                    url: null,
                    target: '_blank'
                },
                callback: null
            }
        },
        _endRelativeOverlays: [],
        /*****************************************
         * PUBLIC PLUGIN API
         *****************************************/

        initialize: function () {
            this.createMainContainer();
            this.pluginReady = true;
        },
        /*****************************************
         * EVENT HANDLERS
         *****************************************/

        itemHandler: function () {

        },
        stateHandler: function (state) {

            switch (state) {
                case 'STARTING':
                    this.handleOverlays();
                    break;

                case 'COMPLETED':
                    this.removeOverlayContainers();
                    break;
            }
        },
        durationChangeHandler: function (duration) {
            this.updateEndRelativeOverlaysCuepoints(duration);
        },
        errorHandler: function (error) {
            this.removeOverlayContainers();
        },
        /*****************************************
         * PRIVATE METHODS
         *****************************************/
        handleOverlays: function () {
            var ref = this,
                schedule = this.getConfig('schedule') || [],
                overlaysCuepointListener;

            // cleanup
            this.removeOverlayContainers();

            if (schedule.length) {
                this.addOverlayContainers();

                // add cuepoints for overlays
                this.pp.removeCuePoints(this.pp.getItemId(), true, ['overlayplugin']);
                this.pp.setCuePoints(this.getOverlaysCuepoints(schedule));

                overlaysCuepointListener = function (cuepoint) {
                    var overlay;
                    if (cuepoint.group === ('plugin' + ref.name)) {

                        overlay = cuepoint.value;

                        if (cuepoint.enabled) {
                            ref.addOverlay(overlay);
                        } else {
                            ref.removeOverlay(overlay);
                        }
                    }
                };

                // add cuepoints listener
                this.pp.removeListener('cuepoint.plugin' + this.name);
                this.pp.addListener(('cuepoint.plugin' + this.name), overlaysCuepointListener);
            } else {
                $p.utils.log('Plugin Overlay: no overlays defined for the current item.');
            }
        },

        createMainContainer: function () {
            this.containers.main = this.applyToPlayer(
                $('<div>')
                .css({
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    pointerEvents: 'none'
                })
            );
        },
        addOverlayContainers: function () {
            var scaledListener,
                mainOverlay = this.containers.main,
                mediaOverlay,
                viewportOverlay;

            mediaOverlay = $('<div>')
                .addClass(this.getCN('overlay_media'))
                .css({
                    position: 'absolute',
                    display: 'block',
                    pointerEvents: 'none'
                })
                .appendTo(mainOverlay);

            viewportOverlay = $('<div>')
                .addClass(this.getCN('overlay_viewport'))
                .css({
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    pointerEvents: 'none'
                })
                .appendTo(mainOverlay);

            // scale media overlay when the media is scaled
            scaledListener = function (event, pp) {
                var mediaElement = pp.playerModel.getMediaElement();
                mediaOverlay.css(mediaElement.css(['width', 'height', 'left', 'top']));
            };

            // immediately execute scaledListener to prevent overlays being invisible
            // if 'scaled' event isn't dispatched after 'state.starting'
            scaledListener(null, this.pp);

            // add listener for scaling
            this.pp.addListener(('scaled.plugin' + this.name), scaledListener);

            this.containers.media = mediaOverlay;
            this.containers.viewport = viewportOverlay;
        },
        removeOverlayContainers: function () {
            if (this.containers.main) {
                this._endRelativeOverlays = [];
                this.containers.main.html('');
                this.pp.removeListener('*.plugin' + this.name);
                this.containers.viewport = null;
                this.containers.media = null;
            }
        },
        addOverlay: function (overlay) {
            var overlayElement = $('<div>'),
                alignTo = overlay.alignTo,
                destination = this._getDestinationContainer(alignTo),
                nId = this.getCN('overlay_' + overlay.id),
                ref = this;

            overlayElement
                .addClass(this.getCN('overlay_element'))
                .attr('id', nId)
                .append(
                    this._getElementType(overlay.src, overlay.type, overlay.id, overlay.title)
                    .addClass(overlay.cssClasses)
                    .css(overlay.styles)
                    .css(this._getElementPositionCss({
                        top: overlay.position.top,
                        right: overlay.position.right,
                        bottom: overlay.position.bottom,
                        left: overlay.position.left,
                        width: overlay.width,
                        height: overlay.height
                    }))
                    .css({
                        width: overlay.width === 'default' ? undefined : overlay.width,
                        height: overlay.height === 'default' ? undefined : overlay.height,
                        position: 'absolute',
                        display: 'block',
                        pointerEvents: overlay.interactive ? 'auto' : 'none'
                    })
                );

            if (overlay.interactive) {
                if (overlay.link && overlay.link.url) {
                    overlayElement.css({
                            cursor: 'pointer'
                        })
                        .click(function (evt) {
                            window.open(overlay.link.url, overlay.link.target);
                        });
                }
                if (!overlay.link && typeof (overlay.callback) === 'function') {
                    overlayElement.css({
                            cursor: 'pointer'
                        })
                        .click(function (evt) {
                            overlay.callback(ref.pp, ref, evt);
                        });
                }
            }

            destination.append(overlayElement);
        },
        removeOverlay: function (overlay) {
            var alignTo = overlay.alignTo,
                destination = this._getDestinationContainer(alignTo),
                nId = this.getCN('overlay_' + overlay.id);

            destination.find('#' + nId).remove();
        },
        getOverlaysCuepoints: function (schedule) {
            var ref = this,
                cuepoints = [],
                mediaDuration = this.pp.getDuration() || 0,
                isLive = this.pp.getIsLiveOrDvr();

            $.each(schedule, function () {
                var overlay = $.extend(true, {}, ref.defaults.overlay, this),
                    on = ref._getRelativeTime(overlay.on, mediaDuration),
                    off = isLive ? Number.POSITIVE_INFINITY : ref._getRelativeTime(overlay.off || mediaDuration, mediaDuration);

                // store overlays which timing is related to the media duration
                if (!isLive && ((overlay.on + '' + overlay.off).indexOf('-') > -1 || overlay.off === 0)) {
                    ref._endRelativeOverlays.push(overlay);
                }

                if (typeof overlay.src === 'string' && overlay.src.length) {

                    cuepoints.push({
                        id: overlay.id || $p.utils.randomId(8),
                        on: on,
                        off: off,
                        once: overlay.once || false,
                        group: 'plugin' + ref.name,
                        value: overlay
                    });
                }
            });

            return cuepoints;
        },
        updateEndRelativeOverlaysCuepoints: function (duration) {
            var overlay,
                cuepoint,
                i, l;

            for (i = 0, l = this._endRelativeOverlays.length; i < l; i++) {
                overlay = this._endRelativeOverlays[i];
                cuepoint = this.pp.getCuePointById(overlay.id);
                if (cuepoint && cuepoint.group === ('plugin' + this.name)) {
                    cuepoint.on = this._getRelativeTime(overlay.on, duration);
                    cuepoint.off = this._getRelativeTime(overlay.off, duration) || duration;
                }
            }
        },
        /*****************************************
         * HELPERS
         *****************************************/
        _getRelativeTime: function (time, duration) {
            if ((String(time).indexOf('-') > -1) && duration) {
                time = duration - Math.abs($p.utils.toSeconds(time));
            }

            return $p.utils.toSeconds(time);
        },
        _getElementType: function (src, type, id, title, props) {
            var el;

            // image
            if (type.indexOf('image') > -1) {
                el = $('<img>')
                    .attr('src', src)
                    .attr('type', type)
                    .attr('id', this.getCN('overlay_' + id + '_image'))
                    .attr('alt', escape(title));
            }

            // iframe
            if (type === 'iframe') {
                el = $('<iframe>')
                    .attr('src', src)
                    .attr('frameborder', 0)
                    .attr('allowtransparency', 'true')
                    .attr('scrolling', 'auto')
                    .attr('marginwidth', 0)
                    .attr('marginheight', 0)
                    .attr('vspace', 0)
                    .attr('hspace', 0);
            }

            // html
            if (type === 'html') {
                el = $('<div>')
                    .html(src);
            }

            return el;
        },
        _getElementPositionCss: function (conf) {
            var css = {};

            // set vertically centering styles
            if (String(conf.top + conf.bottom).indexOf('center') > -1) {
                css.top = 'calc(50% - (' + conf.height + '/2))';
            } else {
                if (conf.bottom) {
                    css.bottom = conf.bottom;
                } else {
                    css.top = conf.top || '0px';
                }
            }

            // set horizontally centering styles
            if (String(conf.left + conf.right).indexOf('center') > -1) {
                css.left = 'calc(50% - (' + conf.width + '/2))';
            } else {
                if (conf.right) {
                    css.right = conf.right;
                } else {
                    css.left = conf.left || '0px';
                }
            }

            return css;
        },
        _getDestinationContainer: function (alignTo) {
            var destination;

            if (alignTo === 'viewport') {
                destination = this.containers.viewport;
            } else {
                destination = this.containers.media;
            }

            return destination;
        }
    };

    $p.plugins.projekktorOverlay = projekktorOverlay;
}(window, document, jQuery, projekktor));}

// CommonJS Export
if (typeof module !== 'undefined' && module.exports && typeof window !== 'undefined') {
    module.exports = window.projekktor;
}
