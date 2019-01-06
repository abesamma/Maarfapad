
const offlineSaveMsg = `You are currently offline. 
                Your notebook has been temporarily saved to your browser's cache. 
                You can download it on to your device, or save via other means 
                by deselecting Maarfapad as your default saver and selecting 'Others' instead.`;
const offlineMsg = 'You are currently working offline.';

self.addEventListener('install', function (event) {
    console.log('Mpad service worker version 0.7.4 installed');
    event.waitUntil(
        caches.open('mpad-cache-v0.5').then(function (cache) {
            cache.addAll([
                'https://fonts.googleapis.com/icon?family=Material+Icons',
                'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-rc.2/css/materialize.min.css',
                'https://code.jquery.com/jquery-2.1.1.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-rc.2/js/materialize.min.js',
                'https://fonts.googleapis.com/css?family=Comfortaa',
                'https://fonts.googleapis.com/css?family=Comfortaa:300&subset=latin-ext',
                '/stylesheets/style.css',
                '/javascripts/index.js',
                '/offline',
                '/login',
                '/about',
                '/signup',
                '/recovery',
                '/favicon.ico',
                '/images/demo.png',
                '/manifest.json'
            ]);
        })
    );
});

self.addEventListener('activate', function (event) {
    const cacheWhitelist = ['mpad-cache-v0.5'];
    event.waitUntil(
        caches.keys().then(function (keyList) {
            clients.claim(); // sieze control of all pages in scope without a reload
            return Promise.all(keyList.map(function (key) {
                if (cacheWhitelist.indexOf(key) === -1) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('fetch', function (event) {
    
    let url = new URL(event.request.url);
    let regex = new RegExp(/^\/wiki\/[ab-z,AB-Z,0-9]+$/); //to test if wiki pathname
    let assetWhitelistRegEx = new RegExp(/(offline|images|login|about|index.js|css|fonts|icon|favicon.ico|manifest.json|sw.js|jquery-2.1.1|ajax)/g);

    function offlineMsgSetter (url, type) {
        switch (type) {
            case 'offline-message': clients.matchAll().then(function (all) {
                let filter = all.filter(function (client) {
                    return url == client.url;
                });
                filter.map(function (client) {
                    client.postMessage({
                        message: offlineMsg,
                        name: 'mpad-sw',
                        type: type
                    });
                });
            });
            case 'offline-save': clients.matchAll().then(function (all) {
                let filter = all.filter(function (client) {
                    return url == client.url;
                });
                filter.map(function (client) {
                    client.postMessage({
                        message: offlineSaveMsg,
                        name: 'mpad-sw',
                        type: type
                    });
                });
            });
            default: return;
        }
    };

    function offlineCookieSetter () {
        clients.matchAll().then(function (all) {
            all.map(function (client) {
                client.postMessage({
                    message: 'mpad-offline=true; path=/',
                    name: 'mpad-sw',
                    type: 'offline-status-cookie'
                });
            });
        });
    };

    function clearCache () {
        return caches.open('mpad-cache-v0.5').then(function (cache) {
            cache.keys().then(function (keyList) {
                keyList.forEach(function (request, index, array) {
                    if (request.url.match(assetWhitelistRegEx)) return;
                    cache.delete(request);
                });
            });
        });
    };

    function cacheUser () {
        return fetch('/user').then(function (res) {
            caches.open('mpad-cache-v0.5').then(function (cache) {
                cache.put('/user', res);
            }).then(function () {
                console.log('Cached user');
            }).catch(function (err) {
                console.log('Failed to cache user. Error:', err);
            });
        });
    };

    function fetchAndCacheWiki () {
        return fetch(event.request).then(function (res) {
            caches.open('mpad-cache-v0.5').then(function (cache) {
                cache.put(event.request.url, res);
            })
            return res.clone();
        }).catch(function () {
            return caches.match('/offline').then(function (offline) {
                return offline;
            });
        });
    }

    if (event.request.method === 'POST') return;
    if (event.request.method == 'OPTIONS') return;
    if (event.request.method == 'HEAD') return;
    if (url.pathname.match(/^\/changefeed$/)) return;
    // Chrome DevTools opening will trigger these o-i-c requests, which this SW can't handle.
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
    if (event.request.method === 'PUT') {
        let req = event.request.clone();
        let str = event.request.url;
        let url = str.replace(/\/[^\/]+$/, '');
        function cacheWiki () {
            return caches.open('mpad-cache-v0.5').then(function (cache) {
                req.text().then(function (text) {
                    let response = new Response(text, {
                        'status': 200,
                        'headers': {
                            'Content-Type': 'text/html'
                        }
                    });
                    cache.put(url, response).then(function () {
                        console.log('Cached copy of saved wiki');
                    }).catch(function () {
                        console.log('Failed to cache copy of saved wiki');
                    });
                });
            });
        };
        event.respondWith(
            fetch(event.request, {
                credentials: 'include'
            }).then(function (res) {
                cacheWiki();
                return res;
            }).then(function (res) {
                cacheUser();
                return res;
            }).catch(function () {
                cacheWiki();
                let response = new Response('', {
                    status: 200
                });
                setTimeout(function () { return offlineMsgSetter(url, 'offline-save'); }, 1000);
                return response;
            })
        )
    }
    // delete request handler
    if (event.request.method === 'DELETE') {
        caches.open('mpad-cache-v0.5').then(function (cache) {
            cache.delete(event.request.url)
                .then(function (res) {
                    if (res) {
                        console.log('Deleted:', event.request.url);
                    }
                });
        });
        return;
    }

    if (event.request.method === 'GET' && regex.test(url.pathname)) {
        event.respondWith(
            caches.match('/user').then(function (cachedUser) {
                if (!cachedUser) {
                    cacheUser();
                    return fetchAndCacheWiki();
                }
                return cachedUser.json().then(function (cachedJson) {
                    return fetch('/user').then(function (res) {
                        return res.json();
                    }).then(function (fetchedJson) {
                        let wikiName = url.pathname.replace(/\/[wiki]+\//, '');
                        let cachedRevpos = cachedJson._attachments[wikiName]['revpos'];
                        let fetchedRevpos = fetchedJson._attachments[wikiName]['revpos'];
                        if (!fetchedRevpos || !cachedRevpos) {
                            cacheUser();
                            return fetchAndCacheWiki()
                        } else if (fetchedRevpos == cachedRevpos) {
                            return caches.match(event.request).then(function (result) {
                                if (!result) {
                                    return fetchAndCacheWiki();
                                }
                                return result;
                            });
                        } else if (fetchedRevpos != cachedRevpos) {
                            cacheUser();
                            return fetchAndCacheWiki();
                        }
                    }).catch(function () {
                        return caches.open('mpad-cache-v0.5').then(function (cache) {
                            return cache.match(event.request).then(function (result) {
                                if (!result) return cache.match('/offline').then(function (offline) {
                                    return offline;
                                });
                                return result;
                            });
                        });
                    });
                });
            })
        );
    } else if (url.pathname.match(/^\/(login)$/)) {
        // wipe out data after logging out
        event.respondWith(
            fetch(event.request).then(function (res) {
                clearCache();
                return res;
            }).catch(function () {
                clearCache();
                return caches.match(event.request).then(function (result) {
                    setTimeout(offlineCookieSetter, 2000);
                    return result;
                });
            })
        );
    } else if (url.pathname.match(/^\/$/)) {
        /**
         * Home page requests should work as
         * usual when online. When offline,
         * default to wiki
         */
        event.respondWith(
            fetch(event.request).then(function (res) {
                return res;
            }).catch(function () {
                return new Response('', {
                    'status': 302,
                    'statusText': 'OK',
                    'headers': new Headers({
                        'Location': url.origin + '/wiki/home'
                    })
                });
            })
        );
    } else if (url.pathname.match(assetWhitelistRegEx)) {
        /**
         * Assets should come from cache.
         * If not in cache, default to network
         * and add to cache
         */
        event.respondWith(
            caches.match(event.request).then(function (result) {
                if (!result) {
                    return fetch(event.request).then(function (res) {
                        caches.open('mpad-cache-v0.5').then(function (cache) {
                            cache.put(event.request, res);
                        });
                        return res.clone();
                    });
                }
                return result;
            })
        );
    } else {
        /**
         * Non-asset and non-wiki requests should
         * default to network first. Default to cache
         * when offline.
         */
        event.respondWith(
            fetch(event.request).then(function (res) {
                caches.open('mpad-cache-v0.5').then(function (cache) {
                    cache.put(event.request, res);
                });
                return res.clone();
            }).catch(function () {
                return caches.match(event.request).then(function (result) {
                    if (!result) {
                        return fetch(event.request).then(function (res) {
                            caches.open('mpad-cache-v0.5').then(function (cache) {
                                cache.put(event.request, res);
                            });
                            return res.clone();
                        }).catch(function () {
                            return caches.match('/offline').then(function (offline) {
                                return offline;
                            });
                        });
                    }
                    if (url.pathname.match(/\/user/)) return result;
                    offlineMsgSetter(url, 'offline-message');
                    return result;
                });
            })
        );
    }

});
