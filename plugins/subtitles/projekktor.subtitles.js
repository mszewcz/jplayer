/*
 * Projekktor II Plugin: Subtitles
 * VERSION: 1.2.2
 * DESC: Implements <track> support for displaying subtitles and captions.
 * Supports .SRT .TTML
 * Copyright 2012, 2013, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2014-2018 Radosław Włodkowski, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */

(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorSubtitles = function () {};

    projekktorSubtitles.prototype = {
        version: '1.2.2',
        reqVer: '1.8.1',
        cache: {},
        _selectedLanguage: '',
        _defaultFontSize: 16,
        _isOutside: false,

        languages: {
            none: 'Disabled',
            af: 'Afrikaans',
            sq: 'Albanian',
            ar: 'Arabic',
            be: 'Belarusian',
            bg: 'Bulgarian',
            ca: 'Catalan',
            zh: 'Chinese',
            hr: 'Croatian',
            cs: 'Czech',
            da: 'Danish',
            nl: 'Dutch',
            en: 'English',
            et: 'Estonian',
            fi: 'Finnish',
            fr: 'French',
            gl: 'Galician',
            de: 'German',
            el: 'Greek',
            ht: 'Haitian Creole',
            iw: 'Hebrew',
            hi: 'Hindi',
            hu: 'Hungarian',
            is: 'Icelandic',
            id: 'Indonesian',
            ga: 'Irish',
            it: 'Italian',
            ja: 'Japanese',
            ko: 'Korean',
            lv: 'Latvian',
            lt: 'Lithuanian',
            mk: 'Macedonian',
            ms: 'Malay',
            mt: 'Maltese',
            no: 'Norwegian',
            fa: 'Persian',
            pl: 'Polish',
            pt: 'Portuguese',
            ro: 'Romanian',
            ru: 'Russian',
            sr: 'Serbian',
            sk: 'Slovak',
            sl: 'Slovenian',
            es: 'Spanish',
            sw: 'Swahili',
            sv: 'Swedish',
            tl: 'Tagalog',
            th: 'Thai',
            tr: 'Turkish',
            uk: 'Ukrainian',
            vi: 'Vietnamese',
            cy: 'Welsh',
            yi: 'Yiddish'
        },

        types: {
            TTML: 'application/xml',
            DFXP: 'application/xml',
            XML: 'application/xml',
            VTT: 'text/plain',
            SRT: 'text/plain'
        },

        ns: {
            xml: 'http://www.w3.org/XML/1998/namespace',

            // Timed Text Markup Language (TTML) 1.0 namespace URIs
            // http://www.w3.org/ns/ttml/
            ttml: {
                tt: 'http://www.w3.org/ns/ttml',
                ttp: 'http://www.w3.org/ns/ttml#parameter',
                tts: 'http://www.w3.org/ns/ttml#styling',
                ttm: 'http://www.w3.org/ns/ttml#metadata'
            },

            // EBU-TT specific vocabulary namespaces
            // https://tech.ebu.ch/ebu-tt
            ebutt: {
                ebuttm: 'urn:ebu:tt:metadata',
                ebutts: 'urn:ebu:tt:style',
                ebuttdt: 'urn:ebu:tt:datatypes'
            }
        },

        /**
         * TTML styles to CSS styles transformer functions map
         *
         * All of the transformers gets string value as a parameter and returns array of object with name and
         * value pairs of CSS styles styles to be applied
         */
        ttmlStylesToCssTransformers: {

            fontFamily: function (value) {
                var self = projekktorSubtitles.prototype;

                if (self.config.ttml.styling.genericFamilyName.hasOwnProperty(value)) {
                    value = self.config.ttml.styling.genericFamilyName[value];
                }

                return [{
                    name: 'fontFamily',
                    value: value
                }];
            },
            /**
             * textOutline
             *
             * Converts TTML textOutline to functional equivalent in CSS. It produce reasonably good results
             * for small outline thickness (1-4px).
             *
             * @param {string} value of textOutline in form of: "<color> <thickness> <blur>" e.g.:
             * "black 1px 1px"
             *
             * @returns {Array} array of objects with CSS styles to be applied
             */
            textOutline: function (value) {
                // parse values
                var values = value.split(' '),
                    color = values[0],
                    thickness = parseInt(values[1]),
                    blur = parseInt(values[2]);
                return [{
                    name: 'textShadow',
                    value: thickness + 'px ' + thickness + 'px ' + blur + 'px ' + color + ',' +
                        (-thickness) + 'px ' + (-thickness) + 'px ' + blur + 'px ' + color + ',' +
                        (thickness) + 'px ' + (-thickness) + 'px ' + blur + 'px ' + color + ',' +
                        (-thickness) + 'px ' + (thickness) + 'px ' + blur + 'px ' + color
                }];
            }
        },

        dest: {},

        config: {
            offset: 0,
            stack: false,
            style: true,
            ttstyle: true,
            ttsoverwrite: false,
            autoSize: true, // scale font size proportionally to the screen size. The initial font size is get
            // from css .<prefix>subtitles class (default: 16px). That size is used as 100% for screen size 720x405px
            defaultLanguage: 'auto', // if 'auto' then the default language will be get from User Agent
            autoLoad: false, // load subtitles automatically
            saveUserPreferences: true,

            // TTML options
            ttml: {
                /**
                 * Parameter attributes default configuration
                 * http://www.w3.org/TR/ttaf1-dfxp/#parameters
                 */
                parameter: {
                    /**
                     * The ttp:cellResolution attribute may be used by an author to express the number of
                     * horizontal and vertical cells into which the Root Container Region area is divided for
                     * the purpose of expressing presentation semantics in terms of a uniform grid.
                     *
                     * If not specified, the number of columns and rows must be considered to be 32 and 15,
                     * respectively. If specified, then columns or rows must not be zero (0).
                     *
                     * The choice of values 32 and 15 are based on this being the maximum number of columns
                     * and rows defined by [CEA-608-E].
                     *
                     * http://www.w3.org/TR/ttaf1-dfxp/#parameter-attribute-cellResolution
                     */
                    cellResolution: {
                        columns: 32,
                        rows: 15
                    }
                },
                /**
                 * Styling attributes default configuration for TTML.
                 * http://www.w3.org/TR/ttaf1-dfxp/#styling-attribute-vocabulary
                 */
                styling: {
                    /**
                     * The tts:backgroundColor attribute is used to specify a style property that defines the
                     * background color of a region or an area generated by content flowed into a region.
                     * http://www.w3.org/TR/ttaf1-dfxp/#style-attribute-backgroundColor
                     */
                    backgroundColor: 'transparent',
                    /**
                     * The tts:color attribute is used to specify a style property that defines the foreground
                     * color of marks associated with an area generated by content flowed into a region.
                     * http://www.w3.org/TR/ttaf1-dfxp/#style-attribute-color
                     */
                    color: 'white',
                    direction: 'ltr',
                    display: 'auto',
                    displayAlign: '',
                    extent: '',
                    fontFamily: 'default',
                    fontSize: '1c',
                    fontStyle: '',
                    fontWeight: '',
                    lineHeight: '',
                    opacity: '',
                    origin: '',
                    overflow: '',
                    padding: '',
                    showBackground: '',
                    textAlign: '',
                    textDecoration: '',
                    textOutline: '',
                    unicodeBidi: '',
                    visibility: '',
                    wrapOption: '',
                    writingMode: '',
                    zIndex: '',
                    /**
                     * NOTE:
                     * The mapping between a generic (font) family name and an actual font is not determined
                     * by this specification; however, the distinction of monospace versus proportional and
                     * serif versus sans-serif should be maintained if possible when performing presentation.
                     *
                     * If a generic (font) family name of monospace is specified, then it may be interpreted
                     * as equivalent to either monospaceSansSerif or monospaceSerif. The generic family names
                     * sansSerif and serif are to be interpreted as equivalent to proportionalSansSerif and
                     * proportionalSerif, respectively.
                     *
                     * If the generic family name default is specified (or implied by an initial value), then
                     * its typographic characteristics are considered to be implementation dependent; however,
                     * it is recommended that this default font family be mapped to an monospaced, sans-serif
                     * font.
                     * http://www.w3.org/TR/ttaf1-dfxp/#style-value-genericFamilyName
                     */
                    genericFamilyName: {
                        'default': 'sans-serif', // UA CSS generic font families
                        monospace: 'monospace',
                        sansSerif: 'sans-serif',
                        serif: 'serif',
                        monospaceSansSerif: '"Lucida Console", Monaco, monospace',
                        monospaceSerif: '"Courier New", monospace',
                        proportionalSansSerif: "Verdana, Geneva, sans-serif",
                        proportionalSerif: '"Times New Roman", Times, serif'
                    }
                }
            }
        },

        /*
         * triggered on plugin-instantiation
         * set language to navigator language and unlock player
         */
        initialize: function () {
            var ref = this;

            this.dest = this.applyToPlayer($('<div/>'));
            this.btn = this.setActive(this.getElement('subtitlesbtn'), false);

            this._defaultFontSize = parseInt(this.dest.css('font-size'));

            this._isOutside = (this.pp.getDC().find(this.dest).length === 0);

            this.btn.click(function () {
                if ($(this).hasClass('on')) {
                    ref.setLanguage('none');
                } else {
                    ref.setLanguage(ref.getConfig('defaultLanguage'));
                }
            });
            this.pluginReady = true;
        },

        /*
         * triggers on item initialization
         * get subtitles for default language
         */
        itemHandler: function (itmObj) {
            var defaultLanguage = this.getConfig('defaultLanguage');

            try {
                this.dest.css('bottom', this.dest.data('pos') + "px");
            } catch (e) {}

            if (this.getConfig('subtitles') && this.getConfig('subtitles').length > 0) {
                this.setActive(this.btn, true);
                this.btn.addClass('off').removeClass('on');

                if ((this.getConfig('saveUserPreferences') && this.pp.storage.restore('on') === true) || (this.getConfig('autoLoad') && !this.getConfig('saveUserPreferences'))) {

                    if (defaultLanguage === 'auto') {
                        this.setLanguage(this._detectUALanguage());
                    } else {
                        this.setLanguage(defaultLanguage);
                    }
                }
            } else {
                this._setState('off');
                this.setActive(this.btn, false);
            }

            this.cache = {};
        },
        plugin_controlbarShowHandler: function (controlBar) {
            if (this._isOutside === true) {
                return;
            }
            this.dest.addClass('shifted');
        },
        plugin_controlbarHideHandler: function (controlBar) {
            if (this._isOutside === true) {
                return;
            }
            this.dest.removeClass('shifted');
        },
        fullscreenHandler: function () {
            // this.dest.css('bottom', this.dest.data('pos') + "px")
        },
        scaledHandler: function (data) {
            if (this.config.autoSize) {
                this.dest.css('font-size', ((data.displayWidth / 720) * this._defaultFontSize) + "px");
            }
        },
        plugin_subtitlesLoadedHandler: function (success) {
            if (success) {
                this._setState('on');
            }
        },
        plugin_subtitlesChangedHandler: function () {
            var subtitles = this.getConfig('subtitles') || [],
                lang = this._selectedLanguage,
                trackOwnerId = this.getConfig('id'),
                trackUrl = null,
                possibleUrl = [];

            if (lang === 'none') {
                this._setState('off');
                this.pluginReady = true;
                return;
            } else {
                this.pluginReady = false;
            }

            if (!this.cache.hasOwnProperty(lang)) {
                $.each(subtitles, function () {
                    if ((this.srclang === lang) || (this.srclang.split('-')[0] === lang)) {
                        trackUrl = this.src;
                        return false;
                    }

                    if (this.srclang === null) {
                        possibleUrl.push(this.src);
                    }

                    return true;
                });

                if (trackUrl === null && possibleUrl.length === 0) {
                    this.pluginReady = true;
                    return;
                }

                this._loadTrack(trackUrl || possibleUrl[0], lang, trackOwnerId);

            } else {
                this._trackLoaded();
            }
        },
        plugin_subtitlesInactiveHandler: function () {},
        plugin_subtitlesActiveHandler: function () {

        },
        cuepointHandler: function (cuePoint) {
            if (cuePoint.group === 'subtitles') {
                if (cuePoint.enabled) {
                    if (cuePoint.value.stack !== true) {
                        this.dest.html('');
                    }

                    this.dest.append(
                        $('<div>')
                        .attr('id', cuePoint.value.id || cuePoint.id)
                        .html(cuePoint.value.html)
                        .css(cuePoint.value.style)
                        .addClass(cuePoint.value.className)
                    );
                } else {
                    $('#' + (cuePoint.value.id || cuePoint.id)).remove();
                }
            }
        },
        setLanguage: function (language) {

            if (this.languages.hasOwnProperty(language) || this.languages.hasOwnProperty(language.split('-')[0])) {
                if (language !== this._selectedLanguage) {
                    this._selectedLanguage = language;
                    this.sendEvent('changed', language);
                }
            }
        },
        _setState: function (state) {
            if (state === 'on') {
                this.btn.addClass('on').removeClass('off');
                this.pp.storage.save('on', true);
                this.setActive();
            } else {
                this.btn.addClass('off').removeClass('on');
                this.pp.storage.save('on', false);
                this.setInactive();
            }
        },
        /*
         * Detects User Agent language
         *
         * @returns string User Agent language
         */
        _detectUALanguage: function () {
            return window.navigator.userLanguage || window.navigator.language;
        },
        _loadTrack: function (url, language, trackOwnerId) {
            var ref = this,
                scope = {
                    _loadingComplete: function (data, responseText) {
                        ref._trackLoaded(data, responseText, language, trackOwnerId);
                    }
                };

            this.pp.getFromUrl(url, scope, '_loadingComplete', this._getContentTypeByExtension(url));
        },
        /*
         Data ready - inject cuepoints
         */
        _trackLoaded: function (data, responseText, language, trackOwnerId) {
            var parsedData = {};

            if (data != null) {
                parsedData[language] = this['_parse' + this._getExtension(this._currentTrackUrl)](data, responseText, this);
                this.cache = $.extend(true, {}, this.cache, parsedData);
                this._setCuepoints(trackOwnerId);
            }

            this.sendEvent('loaded', true);
            this.pluginReady = true;
        },
        _setCuepoints: function (trackOwnerId) {
            var itemId = trackOwnerId,
                group = 'subtitles',
                offset = this.getConfig('offset'),
                data = this.cache[this._selectedLanguage] || this.cache[this._defaultLanguage] || [],
                cuepoints = [];

            this.pp.removeCuePoints(itemId, false, [group]);
            this.dest.html("");

            for (var i = 0; i < data.length; i++) {
                cuepoints.push({
                    item: itemId,
                    group: group,
                    on: data[i].on,
                    off: data[i].off,
                    value: data[i].value,
                    precision: 0
                });
            }
            this.pp.setCuePoints(cuepoints, itemId, false, {
                offset: offset
            });
        },

        /**
         * SRT parser
         *
         * @param {type} responseObj
         * @param {type} responseText
         * @param {type} dest
         * @returns {Array} cuepoints array
         */
        _parseSRT: function (responseObj, responseText, dest) {
            var result = [],
                strip = function (txt) {
                    return txt.replace(/^\s+|\s+$/g, "");
                },
                srt = strip(responseText.replace(/\r\n|\r|\n/g, '\n')).split('\n\n');

            result = [];

            for (var s in srt) {
                if (srt.hasOwnProperty(s)) {
                    var st = srt[s].split('\n'),
                        txt = st[2],
                        j;
                    if (st.length > 2) {
                        for (j = 3; j < st.length; j++) {
                            txt += '\n' + st[j];
                        }
                    }
                    result.push({
                        on: strip(st[1].split(' --> ')[0]),
                        off: strip(st[1].split(' --> ')[1]),
                        value: {
                            style: {},
                            html: txt,
                            stack: dest.getConfig('stack')
                        }
                    });
                }
            }
            return result;
        },

        /**
         * TTML-DXFP parser
         *
         * @param {type} responseObj
         * @param {type} responseText
         * @param {type} dest
         * @returns {Array} cuepoints array
         */
        _parseXML: function (responseObj, responseText, dest) {
            var result = [],
                divs = null,
                ref = dest,
                styles = {},
                config = {
                    ttstyle: ref.getConfig('ttstyle'),
                    ttsoverwrite: ref.getConfig('ttsoverwrite'),
                    stack: ref.getConfig('stack'),
                    style: ref.getConfig('style')
                };

            // parse styling here: http://www.w3.org/TR/ttaf1-dfxp/
            if (config.style !== false) {
                $(responseObj).find("style").each(function () {
                    var id = this.getAttributeNS(ref.ns.xml, 'id') || 'default';

                    if (!styles.hasOwnProperty(id)) {
                        styles[id] = {};
                    }

                    $.each(this.attributes, function () {
                        var txt = this.textContent || this.text,
                            name = this.localName || this.name.substr(this.name.indexOf(':') + 1);

                        if (name !== 'id') {
                            styles[id][name] = txt;
                        }
                    });
                });
            }

            // grab subtitles
            divs = $(responseObj).find("div");

            for (var i = 0; i < divs.length; i++) {

                var targetDiv = $(divs[i]),
                    paragraphs = targetDiv.find("p"),
                    targetPara = null,
                    subtitle = null,
                    j;

                for (j = 0; j < paragraphs.length; j++) {

                    var classNames = [],
                        css = {};

                    targetPara = $(paragraphs[j]);

                    classNames.push(targetPara.attr('style') || '');

                    if (config.ttstyle !== false) {
                        $.each(targetPara.get(0).attributes, function () {
                            if (this.name.indexOf('tts:') > -1) {
                                var directive = this.name.substr(this.name.indexOf('tts:') + 4),
                                    val = this.value.replace(/#/, '');
                                if (config.ttsoverwrite) {
                                    classNames.push(ref.getCN("tt" + (val || '')));
                                } else {
                                    css[directive] = this.value;
                                }
                            }
                        });
                    }
                    subtitle = this._ttmlToHtml(targetPara.get(0), null, config.ttstyle);

                    result.push({
                        on: targetPara.attr('begin'),
                        off: targetPara.attr('end'),
                        value: {
                            style: styles[targetPara.attr('style')] || css, // header style
                            className: classNames.join(' ') || '', // style ID
                            html: subtitle,
                            stack: config.stack,
                            id: targetPara.attr('id')
                        }
                    });
                }

            }

            return result;
        },
        _parseTTML: function (responseObj, responseText, dest) {
            return dest._parseXML(responseObj, responseText, dest);
        },
        _parseDFXP: function (responseObj, responseText, dest) {
            return dest._parseXML(responseObj, responseText, dest);
        },
        /*
         Helpers
         */
        _getContentTypeByExtension: function (url) {
            return this.types[this._getExtension(url)] || 'application/xml';
        },
        _getExtension: function (url) {

            var fileExt = '',
                extRegEx = [],
                cfg = this.types;

            // build regex string and filter duplicate extensions:
            for (var ext in cfg) {
                if (cfg.hasOwnProperty(ext)) {
                    extRegEx.push('\\\.' + ext);
                }
            }
            extRegEx = '^.*\.(' + extRegEx.join('|') + ')';

            try {
                fileExt = url.toUpperCase().match(new RegExp(extRegEx))[1];
                fileExt = (!fileExt) ? '' : fileExt.replace('.', '');
            } catch (e) {
                fileExt = 'XML';
            }

            return fileExt.toUpperCase();
        },
        _ttmlToHtml: function (ttmlElement, htmlElement, addStyles) {
            var ttmlElementChildren = ttmlElement.childNodes,
                ttmlElementChildrenLength = ttmlElementChildren.length,
                i;

            htmlElement = this._ttmlToHtmlElement(ttmlElement, addStyles);

            for (i = 0; i < ttmlElementChildrenLength; i++) {
                htmlElement.appendChild(this._ttmlToHtml(ttmlElementChildren[i], htmlElement, addStyles));
            }

            return htmlElement;
        },

        _ttmlToHtmlElement: function (ttmlElement, addStyles) {
            var ref = this,
                nodeType = ttmlElement.nodeType || null,
                htmlElement = null;

            // create adequate HTML element
            switch (nodeType) {
                case ttmlElement.TEXT_NODE:
                    htmlElement = document.createTextNode(ttmlElement.nodeValue);
                    break;

                case ttmlElement.ELEMENT_NODE:
                    htmlElement = document.createElement(ttmlElement.nodeName);
                    break;
            }

            // convert TTML styles to CSS styles for element
            if (addStyles && ttmlElement && ('attributes' in ttmlElement) && ttmlElement.attributes !== null) {

                $.each(ttmlElement.attributes, function () {
                    // add element inline styles
                    if (this.name.indexOf('tts:') > -1) {

                        var name = this.name.substr(this.name.indexOf('tts:') + 4),
                            value = this.value,
                            cssStyles = ref._ttmlStyleToCSS(name, value);

                        ref._applyCSSToHTMLElement(htmlElement, cssStyles);
                    }
                    // add element class style
                    if (this.name === 'style') {
                        htmlElement.className = this.value;
                    }
                });
            }

            return htmlElement;
        },
        _ttmlStyleToCSS: function (name, value) {
            if (this.ttmlStylesToCssTransformers.hasOwnProperty(name)) {
                return this.ttmlStylesToCssTransformers[name](value);
            } else {
                return [{
                    name: name,
                    value: value
                }];
            }
        },
        _applyCSSToHTMLElement: function (htmlElement, cssStyles) {
            var i, l;
            for (i = 0, l = cssStyles.length; i < l; i++) {
                htmlElement.style[cssStyles[i].name] = cssStyles[i].value;
            }
        },
        /**
         *
         * NOTE:
         * Computed Cell Size: The size (extent) of a cell computed by dividing the width of the Root
         * Container Region by the column count, i.e., the number of cells in the horizontal axis,
         * and by dividing the height of the Root Container Region by the row count, i.e.,
         * the number of cells in the vertical axis, where the column and row counts are determined
         * by the ttp:cellResolution parameter attribute.
         *
         * Root Container Region: A logical region that establishes a coordinate system into which
         * Document Instance content regions are placed and optionally clipped.
         * http://www.w3.org/TR/ttaf1-dfxp/#terms
         *
         * The expression 1c means one cell, where 'c' expresses the cell length unit
         * as defined by 8.3.9 <length>. When a single <length> is expressed using cell units,
         * then it refers to the height of the Computed Cell Size. When two <length> values are expressed
         * using cell units, then the first refers to the width of the Computed Cell Size, and the second
         * refers to the height of the Computed Cell Size.
         * http://www.w3.org/TR/ttaf1-dfxp/#style-attribute-fontSize
         *
         *
         * @param {object} cellResolution {columns: <int>, rows: <int>}
         * @param {object} rootContainerRegionSize in px {width: <int>, height: <int>}
         * @returns {object} cell size (1c unit) in px {width: <int>, height: <int>}
         */
        _computeCellPixelSize: function (cellResolution, rootContainerRegionSize) {
            return {
                width: Math.round(rootContainerRegionSize.width / cellResolution.columns),
                height: Math.round(rootContainerRegionSize.height / cellResolution.rows)
            };
        }
    };

    $p.plugins.projekktorSubtitles = projekktorSubtitles;
}(window, document, jQuery, projekktor));