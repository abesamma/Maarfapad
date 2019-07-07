/* Note that when hosted on cloudnode,
 * this application favours local-first
 * approach. Therefore this service worker
 * should not allow fetch requests to show
 * the default cloudnode banner if the
 * server is down but network is available. 
 * The user should default to cache
 * or to the offline page as much as possible.
 */

const offlineSaveMsg = `Something went wrong during the save operation. 
                Your notebook has been temporarily saved to your browser's cache. 
                You can download it on to your device, or save via other means 
                by deselecting Maarfapad as your default saver and selecting 'Others' instead.`;

self.addEventListener('install', function (event) {
    console.log('Mpad service worker version 0.8.7 installed');
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
    let fetchOptions = {
        credentials: 'include'
    };

    function offlineMsg(msg='You are currently working offline.') {
        clients.matchAll().then(function (all) {
            all.map(function (client) {
                client.postMessage({
                    message: msg,
                    name: 'mpad-sw',
                    type: 'offline-message'
                });
            });
        });
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
        return fetch('/user', fetchOptions).then(function (res) {
            if (res.status >= 400) return reject();
            caches.open('mpad-cache-v0.5').then(function (cache) {
                cache.put('/user', res);
            }).then(function () {
                console.log('Cached user');
            }).catch(function (err) {
                console.error('Failed to cache user. Error:', err);
            });
            return res.clone().json();
        }).catch(function () {
            return;
        });
    };

    function cacheAllWikis (json) {
        let wikis = Object.keys(json._attachments);
        wikis.forEach(function (wiki) {
            caches.open('mpad-cache-v0.5').then(function (cache) {
                cache.add('/wiki/' + wiki);
            });
        });
    }

    function fetchAndCacheWiki () {
        return fetch(event.request, fetchOptions).then(function (res) {
            if (res.status >= 400) reject();
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
        function cacheWiki () {
            return caches.open('mpad-cache-v0.5').then(function (cache) {
                req.text().then(function (text) {
                    let str = event.request.url;
                    let url = str.replace(/\/[^\/]+$/, '');
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
            fetch(event.request, fetchOptions).then(function (res) {
                if (res.status >= 400) return reject(res);
                cacheWiki();
                return res;
            }).then(function (res) {
                cacheUser();
                return res;
            }).catch(function (res) {
                cacheWiki();
                let response = new Response('', {
                    status: 200
                });
                res ? offlineMsg(offlineSaveMsg + ` Error: ${res.statusText}`) : offlineMsg(offlineSaveMsg);
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
                    cacheUser().then(function (json) {
                        cacheAllWikis(json);
                    });
                    return fetch(event.request, fetchOptions).then(function (res) {
                        return res;
                    }).catch(function () {
                        return caches.match('/offline').then(function (offline) {
                            return offline;
                        });
                    });
                }
                return cachedUser.json().then(function (cachedJson) {
                    return fetch('/user', fetchOptions).then(function (res) {
                        if (res.status >= 400) return reject();
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
            }).catch(function () {
                /*Incase the /user url does not exist in cache
                * then default to network, or offline page if
                * if offline
                */
                return fetch(event.request, fetchOptions) || caches.match('/offline').then(function (offline) {
                    return offline;
                });
            })
        );
    } else if (url.pathname.match(/^\/(login)$/)) {
        // wipe out data after logging out
        event.respondWith(
            fetch(event.request, fetchOptions).then(function (res) {
                if (res.status >= 400) return reject();
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
            fetch(event.request, fetchOptions).then(function (res) {
                if (res.status >= 400) return reject();
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
    } else if (url.href.match(assetWhitelistRegEx)) {
        /**
         * Assets should come from cache.
         * If not in cache, default to network
         * and add to cache
         */
        event.respondWith(
            caches.match(event.request).then(function (result) {
                if (!result) {
                    return fetch(event.request, fetchOptions).then(function (res) {
                        caches.open('mpad-cache-v0.5').then(function (cache) {
                            cache.put(event.request, res);
                        });
                        return res.clone();
                    }).catch(function () { return; });
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
            fetch(event.request, fetchOptions).then(function (res) {
                if (url.pathname.match(/\/user/)) return res;
                caches.open('mpad-cache-v0.5').then(function (cache) {
                    cache.put(event.request, res);
                });
                return res.clone();
            }).catch(function () {
                return caches.match(event.request).then(function (result) {
                    if (!result) {
                        return fetch(event.request, fetchOptions).then(function (res) {
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
                    if (url.pathname.match(/\/user/)) return result; // user requests should not trigger offline message
                    // other requests should trigger offline message
                    offlineMsg();
                    return result;
                });
            })
        );
    }

});
