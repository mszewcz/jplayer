/*
 * Copyright 2015-2018 Radosław Włodkowski, radoslaw@wlodkowski.net
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

    var projekktorSourceredirect = function () {};

    projekktorSourceredirect.prototype = {

        version: '1.1.3',
        reqVer: '1.8.1',

        _readyTimeoutIds: [],
        _currentServiceName: '',
        _currentServiceConfig: {},
        _retryCount: 0,
        _retryTimeout: 500,
        _retryTimeoutId: 0,

        defaultConfig: {
            services: {
                DEFAULT: {
                    /**
                     * @param {string} method
                     *        Metoda obsługi przekierowania adresu URL na inny.
                     *        Możliwe wartości: "regexp", "path".
                     *
                     * @param {string|Array} onlyForPlatforms
                     *        {string} Nazwa szukanej platformy.
                     *        {Array} Lista szukanych platform np: `["ios", "android", "native"]`.
                     *
                     *
                     * # Poniższe parametry są wykorzystywane jeżeli ustawiono metodę "regexp":
                     *
                     * @param {string|RegExp|null} condition
                     *        Warunek który musi spełnić adres URL materiału wideo.
                     *        string: Musi zawierać podany ciąg znaków.
                     *        RegExp: Musi spełniać wyrażenie regularne.
                     *        null: Powoduje wyłączenie serwisu (OFF).
                     *
                     * @param {RegExp} replace
                     *        Co należy wyciąć (zamienić na nową wartość) - Wyrażenie regularne.
                     *
                     * @param {string|Array} newValue
                     *        Nowy ciąg znaków, jako nowa wartość lub
                     *        tablica jedno-elementowa [{string}]
                     *        [0]: Nazwa funkcji która generuje nową wartość.
                     */
                    url: "",
                    mimeType: "application/json",
                    method: "regexp",
                    parser: "_parseDefaultJSONRedir",
                    onlyForPlatforms: ["android", "ios", "mse", "native", "videojs"],
                    condition: /s\.foo\.net/i,
                    replace: /s\.foo\.net/i,
                    newValue: ["NodeHost"]
                }
            }
        },

        config: {
            services: {
                // FOO:{
                //     url:"http://json.redir.net/",
                //     mimeType:"application/json",
                //     method:"path"
                // }
            },
            maxRetryCount: -1,
            maxRetryTimeout: 64000
        },

        initialize: function () {
            this._ready(true);
        },

        itemHandler: function () {
            clearTimeout(this._retryTimeoutId);
            this._retryCount = 0;
            this._retryTimeout = 500;
        },

        stateHandler: function (state) {
            var item;

            if (state === "AWAKENING") {
                this._ready(false);
                item = this.pp.getItem();

                this._currentServiceName = this._getSourceRedirectServiceName(item);
                this._currentServiceConfig = this._getServiceConfig(this._currentServiceName);

                if (this._testPlatform(item.platform)) {

                    if (this._currentServiceConfig.method === "regexp") {

                        var url = this._hasCondition(item, this._currentServiceConfig.condition);

                        if (!!url) {
                            url = this._modifyStr(url, this._currentServiceConfig.replace, this._currentServiceConfig.newValue);

                            // Remove protocol part from the URL and convert it to protocol relative `//:` 
                            url = (url + "").replace(/^https?\:/i, "");

                            this._setRedirectedSource(url);
                        }

                        this._ready(true);

                    } else if (this._hasSourceRedirectService(item)) {

                        this._getSourceRedirect(item);

                    } else {
                        this._ready(true);
                    }

                } else {

                    $p.utils.log("Plugin Sourceredirect: Redirect service " + this._currentServiceName + " won't be used for platform: " + item.platform + " cause it's configured to be used only for platforms: " + this._currentServiceConfig.onlyForPlatforms);
                    this._ready(true);

                }

            }
        },

        _hasSourceRedirectService: function (item) {

            if (item && item.hasOwnProperty('file')) {
                return item.file.some(function (f) {
                    if (f.hasOwnProperty('sourceRedirectServiceName') && !!f.sourceRedirectServiceName.length) {
                        return f.sourceRedirectServiceName;
                    } else {
                        return false;
                    }
                });
            } else {
                return false;
            }
        },

        _getSourceRedirectServiceName: function (item) {
            return item.file[0].sourceRedirectServiceName;
        },

        _getServiceConfig: function (serviceName) {
            var services = this.getConfig('services');
            services = $.extend({}, this.defaultConfig.services['DEFAULT'], services[serviceName]);
            return services;
        },

        _getSourceRedirect: function (item) {
            var serviceConfig = this._currentServiceConfig,
                serviceBaseUrl = serviceConfig.url,
                serviceMethod = serviceConfig.method,
                serviceMimeType = serviceConfig.mimeType,
                serviceRequestUrl;

            serviceRequestUrl = this._getServiceRequestUrl(item.file[0].src, serviceBaseUrl, serviceMethod);
            this.pp.getFromUrl(serviceRequestUrl, this, "_parseServiceAnswer", serviceMimeType);

        },

        _getServiceRequestUrl: function (sourceUrl, serviceUrl, method) {
            var resultUrl,
                serviceUrlParts = $p.utils.parseUri(serviceUrl),
                sourceUrlParts = $p.utils.parseUri(sourceUrl);

            switch (method) {
                case 'path':
                    resultUrl = serviceUrlParts.protocol + "://" + serviceUrlParts.host + sourceUrlParts.path;
                    break;

                case 'POST':
                    break;

                case 'GET':
                    break;
            }

            return resultUrl;
        },

        _parseServiceAnswer: function (answer) {
            var ref = this,
                item = this.pp.getItem(),
                redirUrl,
                answerParser = this._currentServiceConfig.parser,
                maxRetryCount = this.getConfig('maxRetryCount'),
                maxRetryTimeout = this.getConfig('maxRetryTimeout');

            if (answer) {
                if ($.isFunction(answerParser)) {
                    redirUrl = answerParser(answer);
                } else if (typeof answerParser === 'string' && this.hasOwnProperty(answerParser)) {
                    redirUrl = this[answerParser](answer);
                }

                if (typeof redirUrl !== 'string') {
                    $p.utils.log("Plugin Sourceredirect: Error, no redirect answer parser set or invalid answer format. Leaving original src.");
                    this._ready(true);
                    return false;
                }

                this._setRedirectedSource(redirUrl);
                this._ready(true);
            } else {
                if ((maxRetryCount >= 0 && this._retryCount >= maxRetryCount) || maxRetryTimeout <= this._retryTimeout) {
                    $p.utils.log("Plugin Sourceredirect: Error, no answer from redirect service " + this._currentServiceName + ". Leaving original src.");
                    this._ready(true);
                } else {
                    this._retryCount++;
                    this._retryTimeout = Math.min(this._retryTimeout * 2, maxRetryTimeout);
                    $p.utils.log("Plugin Sourceredirect: Error, no answer from redirect service " + this._currentServiceName + ". Retrying for the " + this._retryCount + " time in " + this._retryTimeout + "ms");
                    this._retryTimeoutId = setTimeout(function (itm) {
                        ref._getSourceRedirect(itm);
                    }, this._retryTimeout, item);
                }
            }
        },

        _parseDefaultJSONRedir: function (answer) {
            if (answer.hasOwnProperty('redirectURL')) {
                return answer.redirectURL;
            } else {
                return false;
            }
        },
        /**
         * Funkcja `_setRedirectedSource` ustawia adres URL dla bieżącego materiału wideo.
         *
         * @param {string} src
         *        Adres URL do pliku wideo.
         *
         */
        _setRedirectedSource: function (src) {
            var model = this.pp.playerModel;
            model.setSrc(src);
            $p.utils.log("Plugin Sourceredirect: Source redirected to ", src);
        },
        /**
         * Funkcja `_ready` ustawia tryb gotowości wtyczki.
         *
         * @param {boolean|number} status
         *        Przyjmuje jeden parametr, który może mieć wartości:
         *        - true
         *        - false
         *        - <liczba milisekund>
         *
         * Jeżeli ustawimy liczbę to po <x> milisekundach wtyczka zmieni stan gotowości na `true`.
         * Wywołanie `_ready(true)` usuwa wszystkie opóźniania czasowe!
         */
        _ready: function (status) {
            var ref = this; // Miała być nazwa `self`, ale przeglądarki używają jej jako zamiennik `this`, więc lepiej nie ryzykować :)
            var type = typeof status;

            if (type === "boolean") {

                // Czyszczę wszystki opóźnienia czasowe:
                for (var i = 0; i < ref._readyTimeoutIds.length; i++) {
                    clearTimeout(ref._readyTimeoutIds[i]);
                }

                ref.pluginReady = status;

            } else if (type === "number") {

                var id = setTimeout(function () {
                    ref._ready(true);
                }, status);

                ref._readyTimeoutIds.push(id);

            }
        },
        /**
         * Funkcja `_modifyStr` modyfikuje podany ciąg znaków.
         *
         * @param {string} input
         *        Ciąg znaków który należy zmodyfikować.
         *
         * @param {RegExp} replace
         *
         * @param {string|Array} newValue
         *        Nowy ciąg znaków, jako nowa wartość lub
         *        tablica jedno-elementowa [{string}]
         *        [0]: Nazwa funkcji która generuje nową wartość.
         */
        _modifyStr: function (input, replace, newValue) {

            // Jeżeli `newValue` jest tablicą,
            // to nowa wartość jest generowana na podstawie zdefiniowanej funkcji,
            // której nazwę przechowuje pierwszy element tablicy `newValue[0]`.
            if (newValue instanceof Array) {

                switch (newValue[0]) {
                    // Nazwa hosta (noda) z którego jest odtwarzany materiał wideo.
                    case 'NodeHost':
                        newValue = this._getNodeHost();
                        break;

                    default:
                        break;
                }

            }

            // Podmieniam ciąg znaków wedle wyrażenia regularnego:
            input = ("" + input).replace(replace, newValue);

            return input;
        },
        /**
         * Funkcja `_getNodeHost` nazwę hosta z adresy URL głównego materialu wideo.
         *
         * @returns {string|null}
         *          Jeżeli znaleziono adres HOST'a to zwraca typ `string`
         *          w przeciwnym wypadku `null`.
         *
         */
        _getNodeHost: function () {
            var src;

            try {
                src = this.pp.config._playlist[0].file[0].src;
            } catch (_err) {
                src = null;
            }

            if (typeof src === "string") {
                var UrlParts = $p.utils.parseUri(src);
                return UrlParts.host;
            }

            return null;
        },
        /**
         * Funckja `_hasCondition` sprawdza czy którykolwiek plik wideo pochodzący z przekazanego elementu `item`
         * spełnia warunek. Szukanie kończy się na pierwszym znalezionym elemencie spełniającym warunek.
         *
         * Szukany ciąg znaków znajduje się w konfiguracji!
         *
         * @param {object} item
         *        Obiekt `item` posiada informacje o odtwarzanym materiale video.
         *        Na potrzeby tej funkcji powinien posiadać parametr `item.file[].src`.
         *
         * @param {string|RegExp|null} condition
         *        Warunek który musi spełnić adres URL materiału wideo w obiekcie `item`.
         *        string: Musi zawierać podany ciąg znaków.
         *        RegExp: Musi spełniać wyrażenie regularne.
         *        null: Powoduje zwrócenie wartości `false`.
         *
         * @returns {boolean|string}
         *          {string} Adres URL który spełnia warunek.
         *          `false` Żaden plik wideo nie spełnia warunku!
         */
        _hasCondition: function (item, condition) {

            if (condition === null) {
                return false;
            } else {

                if (!!item && item.hasOwnProperty('file')) {

                    for (var i = 0; i < item.file.length; i++) {
                        if (typeof item.file[i].src === "string") {

                            if (typeof condition === "string") {

                                // Sprawdzam czy w adresie URL znajduje się szukany ciąg znaków podany w parametrze `condition`:
                                if (item.file[i].src.indexOf(condition) > -1) {
                                    return item.file[i].src;
                                }
                            } else if (condition instanceof RegExp) {

                                // Sprawdzam czy adres URL spełnia warunek wyrażania regularnego podanego jako parametr `condition`:
                                if (item.file[i].src.search(condition) > -1) {
                                    return item.file[i].src;
                                }

                            }

                        }
                    }
                }
            }

            return false;

        },
        /**
         * Funkcja `_testPlatform` sprawdza czy lista platform zawarta w konfiguracji zawiera szukaną platformę podaną w parametrze `platform`,
         * lub jeżeli podano jako parametr `platform` listę platform. To czy jakikolwiek element z listy `platform` znajduje się w konfiguracji.
         *
         * @param {string|Array} platform
         *        {string} Nazwa szukanej platformy.
         *        {Array} Lista szukanych platform np: `["ios", "android", "native"]`.
         *
         * @returns {boolean}
         *          `true` Znaleziono platformę.
         *          `false` Platformy nie ma na liście!
         */
        _testPlatform: function (platform) {

            if (typeof platform === 'string') {
                if (this._currentServiceConfig.onlyForPlatforms.indexOf(platform) > -1) {
                    return true;
                }
            } else if (platform instanceof Array) {

                for (var i = 0; i < platform.length; i++) {

                    if (this._currentServiceConfig.onlyForPlatforms.indexOf(platform[i]) > -1) {
                        return true;
                    }

                }

            }

            return false;
        }
    };

    $p.plugins.projekktorSourceredirect = projekktorSourceredirect;
}(window, document, jQuery, projekktor));