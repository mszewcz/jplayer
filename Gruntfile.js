module.exports = function (grunt) {

    "use strict";
    grunt.util.linefeed = '\n';
    grunt.file.defaultEncoding = 'utf-8';

    var libs = {
            projekktor: "node_modules/projekktor/",
            hlsjs: 'node_modules/hls.js/dist/',
            dashjs: 'node_modules/dashjs/dist/',
            videojs: 'node_modules/projekktor/platforms/videojs/'
        },
        dest = 'build/',
        destThemesDir = dest + 'themes/jplayer/',
        platformsDest = {
            dashjs: dest + 'platforms/mse/dashjs/',
            hlsjs: dest + 'platforms/mse/hlsjs/',
            videojs: dest + 'platforms/videojs/'
        },
        demo = 'demo/',
        pluginspath = 'plugins/',
        distpaths = [
            "temp/jplayer.js",
            "temp/jplayer.min.js"
        ],
        defaults = [
            "+playlist",
            "+html",
            "+msehls",
            "+msedash",
            "+videojs",
            "+vpaid2model",
            "+plugins/overlay",
            "+plugins/ads",
            "-plugins/postertitle",
            "-plugins/share",
            "+plugins/tracking",
            "+plugins/related",
            "-plugins/download",
            "-plugins/subtitles"
        ].join(":"),
        filesUglify = {},
        filesCSS = [
            "themes/jplayer/style.css"
        ],
        readJSON = function (filepath) {
            var data = {};
            try {
                data = grunt.file.readJSON(filepath);
            } catch (e) {
            }
            return data;
        },
        srcHintOptions = readJSON("src/.jshintrc"),
        banner =
            `/*
    * JPlayer <%= pkg.version %> 
    * <%= grunt.template.today('yyyy-mm-dd') %> 
    * Copyright Radosław Włodkowski <radoslaw@wlodkowski.net> 
    * All rights reserved 
    *
    * based on: 
    * projekktor 
    * http://www.projekktor.com 
    * Copyright 2010-2014, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
    * under GNU General Public License
    *
    */`;

    filesUglify["temp/jplayer.min.js"] = ["temp/jplayer.js"];

    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        dst: readJSON("temp/.destination.json"),
        compare_size: {
            files: ["temp/jplayer.js", "temp/jplayer.min.js"],
            options: {
                cache: "temp/.sizecache.json"
            }
        },
        build: {
            all: {
                dest: "temp/jplayer.js",
                src: [
                    "node_modules/core-js/client/shim.js",
                    "src/ssr-fix-start.js",
                    libs.projekktor + "src/controller/projekktor.js",
                    libs.projekktor + "src/controller/projekktor.config.version.js",
                    "config/jplayer.config.js",
                    libs.projekktor + "src/controller/projekktor.utils.js",
                    libs.projekktor + "src/controller/projekktor.useragent.js",
                    libs.projekktor + "src/controller/projekktor.features.js",
                    libs.projekktor + "src/controller/projekktor.fullscreenapi.js",
                    libs.projekktor + "src/controller/projekktor.persistentstorage.js",
                    libs.projekktor + "src/controller/projekktor.platforms.js",
                    libs.projekktor + "src/controller/projekktor.drm.js",
                    libs.projekktor + "src/controller/projekktor.plugininterface.js",
                    "config/jplayer.messages.js",
                    libs.projekktor + "src/models/player.js",
                    libs.projekktor + "src/models/player.na.js",
                    libs.projekktor + "src/models/player.audio.video.js",
                    libs.projekktor + "src/models/player.audio.video.hls.js",
                    libs.projekktor + "src/models/player.playlist.js",
                    libs.projekktor + "src/models/player.image.html.js",
                    {
                        flag: "msehls",
                        src: libs.projekktor + "src/models/player.audio.video.mse.hls.js"
                    },
                    {
                        flag: "msedash",
                        src: libs.projekktor + "src/models/player.audio.video.mse.dash.js"
                    },
                    {
                        flag: "videojs",
                        src: libs.projekktor + "src/models/player.videojs.js"
                    },
                    libs.projekktor + "src/plugins/projekktor.display.js",
                    libs.projekktor + "src/plugins/projekktor.controlbar.js",
                    libs.projekktor + "src/plugins/projekktor.settings.js",
                    //libs.projekktor + "src/plugins/projekktor.contextmenu.js",
                    {
                        user: true,
                        flag: "vpaid2model",
                        src: pluginspath + "ads/vpaid/player.vpaid.js"
                    },
                    {
                        user: true,
                        flag: "plugins/ads",
                        src: pluginspath + "ads/projekktor.ads.js",
                        css: pluginspath + "ads/projekktor.ads.css"
                    },
                    {
                        user: true,
                        flag: "plugins/postertitle",
                        src: pluginspath + "postertitle/projekktor.postertitle.js",
                        css: pluginspath + "postertitle/projekktor.postertitle.css"
                    },
                    {
                        user: true,
                        flag: "plugins/related",
                        src: pluginspath + "related/projekktor.related.js",
                        css: pluginspath + "related/projekktor.related.css"
                    },
                    {
                        user: true,
                        flag: "plugins/tracking",
                        src: pluginspath + "tracking/projekktor.tracking.js",
                        css: pluginspath + "tracking/projekktor.tracking.css"
                    },
                    {
                        user: true,
                        flag: "plugins/subtitles",
                        src: pluginspath + "subtitles/projekktor.subtitles.js",
                        css: pluginspath + "subtitles/projekktor.subtitles.css"
                    },
                    // custom
                    {
                        user: true,
                        flag: "plugins/download",
                        src: pluginspath + "download/projekktor.download.js",
                        css: pluginspath + "download/projekktor.download.css"
                    },
                    {
                        user: true,
                        flag: "plugins/overlay",
                        src: pluginspath + "overlay/projekktor.overlay.js",
                        css: pluginspath + "overlay/projekktor.overlay.css"
                    },
                    "src/ssr-fix-end.js",
                    "src/jplayer.js"
                ]
            }
        },
        jshint: {
            dist: {
                src: ["temp/jplayer.js"],
                options: srcHintOptions
            },
            grunt: {
                src: ["Gruntfile.js"],
                options: {
                    jshintrc: ".jshintrc"
                }
            }
        },
        bump: {
            options: {
                files: ['package.json'],
                updateConfigs: [],
                commit: true,
                commitMessage: 'Bump version to %VERSION%',
                commitFiles: ['package.json'],
                createTag: false,
                tagName: '%VERSION%',
                tagMessage: 'JPlayer v%VERSION%',
                push: false,
                pushTo: 'upstream',
                gitDescribeOptions: '--tags --always --abbrev=1 --dirty=-d',
                globalReplace: false,
                prereleaseName: false,
                metadata: '',
                regExp: false
            }
        },
        cssmin: {
            target: {
                files: [{
                    expand: false,
                    src: filesCSS,
                    dest: dest + "themes/jplayer/styles.min.css",
                    ext: "min.css"
                }]
            }
        },
        uglify: {
            all: {
                files: filesUglify,
                options: {
                    // Keep our hard-coded banner
                    banner: banner,
                    preserveComments: false,
                    //sourceMap: false,
                    //sourceMapName: "temp/jplayer.min.map",
                    report: "min",
                    beautify: false,
                    compress: {
                        hoist_funs: false,
                        join_vars: false,
                        loops: false,
                        unused: false
                    }
                }
            }
        },
        clean: {
            all: [dest, 'temp/*.js', 'temp/*.map', 'temp/.*.json'],
            demo: ['demo/platforms', 'demo/themes', 'demo/*.js'],
            temp: ['temp/']
        },
        copy: {
            main: {
                files: [
                    // includes files within path
                    // {expand: true, src: ['path/*'], dest: 'dest/', filter: 'isFile'},
                    // includes files within path and its sub-directories
                    {
                        expand: true,
                        flatten: true,
                        src: ['temp/*'],
                        dest: dest
                    },
                    // hlsjs
                    {
                        expand: true,
                        cwd: libs.hlsjs,
                        src: ['hls.js', 'hls.js.map', 'hls.min.js'],
                        dest: platformsDest.hlsjs
                    },
                    // dashjs
                    {
                        expand: true,
                        cwd: libs.dashjs,
                        src: ['dash.all.*.js', 'dash.all.*.map'],
                        dest: platformsDest.dashjs
                    },
                    // videojs
                    {
                        expand: true,
                        cwd: libs.videojs,
                        src: ['video.js', 'video.min.js', 'videojs.vpaid.js', 'videojs.vpaid.min.js', 'video-js.css', 'video-js.min.css', 'videojs.vpaid.css', 'videojs.vpaid.min.css'],
                        dest: platformsDest.videojs
                    },
                    // themes
                    {
                        expand: true,
                        src: ['themes/**', '!themes/jplayer/*.psd'],
                        dest: dest
                    },
                    {
                        expand: true,
                        flatten: true,
                        src: ['plugins/**/*.png', 'plugins/**/*.jpg'],
                        dest: destThemesDir
                    }
                ]
            },
            preview: {
                files: [{
                    expand: true,
                    cwd: dest,
                    src: '**',
                    dest: demo
                }]
            }
        },
        lineending: {
            dist: {
                options: {
                    eol: 'lf',
                    overwrite: true
                },
                files: {
                    '': ['temp/*.js']
                }
            }
        },
        watch: {
            files: [
                'lib/projekktor/src/**/*.js',
                'lib/projekktor/themes/**/*.css',
                'lib/projekktor/themes/**/*.scss',
                'plugins/**/*.js',
                'plugins/**/*.css'
            ],
            tasks: ['build-preview']
        },
        browserSync: {
            dev: {
                bsFiles: {
                    src: [
                        'demo/**/*.js',
                        'demo/**/*.css',
                        'demo/*.html'
                    ]
                },
                options: {
                    watchTask: true,
                    server: {
                        baseDir: [demo],
                        index: "index.html"
                    }
                }
            }
        }
    });

    // Special concat/build task to handle various build requirements
    grunt.registerMultiTask(
        "build",
        "Concatenate source (include/exclude modules with +/- flags), embed date/version",

        function () {
            // Concat specified files.
            var compiled = "",
                modules = this.flags,
                optIn = !modules["*"],
                explicit = optIn || Object.keys(modules).length > 1,
                name = this.data.dest,
                src = this.data.src,
                deps = {},
                excluded = {},
                version = grunt.config("pkg.version"),
                excluder = function (flag, needsFlag) {
                    // optIn defaults implicit behavior to weak exclusion
                    if (optIn && !modules[flag] && !modules["+" + flag]) {
                        excluded[flag] = false;
                    }

                    // explicit or inherited strong exclusion
                    if (excluded[needsFlag] || modules["-" + flag]) {
                        excluded[flag] = true;

                        // explicit inclusion overrides weak exclusion
                    } else if (excluded[needsFlag] === false && (modules[flag] || modules["+" + flag])) {

                        delete excluded[needsFlag];

                        // ...all the way down
                        if (deps[needsFlag]) {
                            deps[needsFlag].forEach(function (subDep) {
                                modules[needsFlag] = true;
                                excluder(needsFlag, subDep);
                            });
                        }
                    }
                };

            // figure out which files to exclude based on these rules in this order:
            //  dependency explicit exclude
            //  > explicit exclude
            //  > explicit include
            //  > dependency implicit exclude
            //  > implicit exclude
            // examples:
            //  *                  none (implicit exclude)
            //  *:*                all (implicit include)
            //  *:*:-html           all except css and dependents (explicit > implicit)
            //  *:*:-html:+youtube  same (excludes effects because explicit include is trumped by explicit exclude of dependency)
            //  *:+youtube         none except effects and its dependencies (explicit include trumps implicit exclude of dependency)
            src.forEach(function (filepath, index) {

                // check for user plugins
                var user = filepath.user;
                if (user && filepath.src) {
                    if (!grunt.file.exists(filepath.src)) {
                        delete src[index];
                        return;
                    }
                }

                var flag = filepath.flag;

                if (flag) {
                    excluder(flag);

                    // check for dependencies
                    if (filepath.needs) {
                        deps[flag] = filepath.needs;
                        filepath.needs.forEach(function (needsFlag) {
                            excluder(flag, needsFlag);
                        });
                    }
                }
            });

            // conditionally concatenate source
            src.forEach(function (filepath) {

                var flag = filepath.flag,
                    specified = false,
                    omit = false,
                    messages = [],
                    css = false;

                if (flag) {
                    if (excluded[flag] !== undefined) {
                        messages.push([
                            ("Excluding " + flag).red,
                            ("(" + filepath.src + ")").grey
                        ]);
                        specified = true;
                        omit = !filepath.alt;
                        if (!omit) {
                            flag += " alternate";
                            filepath.src = filepath.alt;
                        }
                    }
                    if (excluded[flag] === undefined) {
                        messages.push([
                            ("Including " + flag).green,
                            ("(" + filepath.src + ")").grey
                        ]);

                        // If this module was actually specified by the
                        // builder, then set the flag to include it in the
                        // output list
                        if (modules["+" + flag]) {
                            specified = true;
                        }
                    }

                    css = filepath.css ? filepath.css : false;

                    filepath = filepath.src;

                    // Only display the inclusion/exclusion list when handling
                    // an explicit list.
                    //
                    // Additionally, only display modules that have been specified
                    // by the user
                    if (explicit && specified) {
                        messages.forEach(function (message) {
                            grunt.log.writetableln([27, 30], message);
                        });
                    }
                }

                if (!omit) {
                    if (css) filesCSS.push(css);
                    compiled += grunt.file.read(filepath);
                }
            });

            // Embed Version
            // Embed Date
            compiled = compiled.replace(/@VERSION/g, version)
            // yyyy-mm-ddThh:mmZ
                .replace(/@DATE/g, (new Date()).toISOString().replace(/:\d+\.\d+Z$/, "Z"));

            // Write concatenated source to file
            grunt.file.write(name, compiled);

            // Fail task if errors were logged.
            if (this.errorCount) {
                return false;
            }

            // Otherwise, print a success message.
            grunt.log.writeln("File '" + name + "' created.");
        });

    // Process files for distribution
    grunt.registerTask("dist", function () {
        var stored, flags, paths, fs, nonascii;

        // Check for stored destination paths
        // ( set in dist/.destination.json )
        stored = Object.keys(grunt.config("dst"));

        // Allow command line input as well
        flags = Object.keys(this.flags);

        // Combine all output target paths
        paths = [].concat(stored, flags).filter(function (path) {
            return path !== "*";
        });

        // Ensure the dist files are pure ASCII
        fs = require("fs");

        distpaths.forEach(function (filename) {
            var i, c,
                text = fs.readFileSync(filename, "utf8");

            // Optionally copy dist files to other locations
            paths.forEach(function (path) {
                var created;

                if (!/\/$/.test(path)) {
                    path += "/";
                }

                created = path + filename.replace("temp/", "");
                grunt.file.write(created, text);
                grunt.log.writeln("File '" + created + "' created.");
            });
        });

        return !nonascii;
    });

    // Load grunt tasks from NPM packages
    grunt.loadNpmTasks("grunt-bump");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-compare-size");
    grunt.loadNpmTasks("grunt-contrib-uglify");
    grunt.loadNpmTasks('grunt-lineending');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-browser-sync');
    grunt.loadNpmTasks('grunt-contrib-watch');

    // Default build
    grunt.registerTask("default", [
        "clean",
        "build:*:*:" + defaults,
        "uglify",
        "lineending",
        "dist:*",
        "cssmin",
        "compare_size",
        "copy",
        "clean:temp"
    ]);

    // Build preview
    grunt.registerTask("build-preview", [
        "clean",
        "build:*:*:" + defaults,
        "uglify",
        "lineending",
        "dist:*",
        "cssmin",
        "copy"
    ]);

    // preview in browserSync
    grunt.registerTask('preview', ['browserSync', 'build-preview', 'watch']);

};
