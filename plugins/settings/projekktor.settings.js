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
