/*
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
}(window, document, jQuery, projekktor));