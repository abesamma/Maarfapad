
self.addEventListener('install', function (event) {
    console.log('Mpad service worker version 0.5.0 installed');
    event.waitUntil(
        caches.open('mpad-cache-v0.5').then(function (cache){
            cache.addAll([
                'https://fonts.googleapis.com/icon?family=Material+Icons',
                'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0-rc.2/css/materialize.min.css',
                'https://code.jquery.com/jquery-2.1.1.min.js',
                'https://fonts.googleapis.com/css?family=Comfortaa',
                'https://fonts.googleapis.com/css?family=Comfortaa:300&subset=latin-ext',
                '/stylesheets/style.css',
                '/javascripts/index.js',
                '/offline',
                '/favicon.ico',
                '/manifest.json'
            ]);
        })
    );
});

self.addEventListener('activate', function (event) {
    var cacheWhitelist = ['mpad-cache-v0.5'];
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
    /**
     * Generic request body with redirect set to follow
     */
    var cachedRequest = new Request(event.request.url, {
        bodyUsed: false,
        credentials: "include",
        integrity: "",
        method: "GET",
        redirect: "follow", // needed to prevent respondWith() from throwing network error
        referrer: "",
        referrerPolicy: "no-referrer-when-downgrade"
    });
    const FETCH_TIMEOUT = 5000;
    let didTimeout = false;
    let timer;
    let eventURL = event.request.url;
    let url = new URL(eventURL);
    let regex = new RegExp(/^\/wiki\/[ab-z,AB-Z,0-9]+$/); //to test if wiki url

    if (event.request.method === 'POST') return;
    if (event.request.method == 'OPTIONS') return;
    if (event.request.method == 'HEAD') return;
    if (eventURL.includes('changefeed')) return;
    // Chrome DevTools opening will trigger these o-i-c requests, which this SW can't handle.
    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') return;
    if (event.request.method === 'PUT') {
        // update cache after successful PUT
        caches.open('mpad-cache-v0.5').then(function (cache) {
            cache.keys().then(function (keys) {
                keys.forEach(function (request) {
                    var array = eventURL.match(request.url);
                    if (array) {
                        var cachedRequestForPut = new Request(array[0], {
                            bodyUsed: false,
                            credentials: "include",
                            integrity: "",
                            method: "GET",
                            redirect: "follow",
                            referrer: "",
                            referrerPolicy: "no-referrer-when-downgrade"
                        });
                        cache.add(cachedRequestForPut).then(function (){
                            console.log('Cached copy of saved wiki');
                        }).catch(function (){
                            console.log('Failed to cache copy of saved wiki');
                        });
                    }
                });
            });
        });
        return;
    }
    // delete request handler
    if (event.request.method === 'DELETE') {
        caches.open('mpad-cache-v0.5').then(function(cache){
            cache.delete(event.request.url)
            .then(function(res){
                if (res) {
                    console.log('Deleted:',event.request.url);
                }
            });
        });
        return;
    }

    if (event.request.method === 'GET' && regex.test(url.pathname)) {
        event.respondWith(
            new Promise(function (resolve, reject) {

                timer = setTimeout(function () {
                    didTimeout = true;
                    reject();
                }, FETCH_TIMEOUT);
                fetch(event.request).then(function (res) {
                    clearTimeout(timer);
                    if (didTimeout) return reject();
                    return resolve(res);
                }).catch(function (){
                    clearTimeout(timer);
                    return reject();
                });
            }).then(function (res) {
                // for all GET requests
                console.log('Serving from network:', event.request.url);
                caches.open('mpad-cache-v0.5').then(function (cache) {
                    cache.put(cachedRequest, res).then(function () {
                        console.log('Cached url:', event.request.url);
                    });
                });
                return res.clone();
            }).catch(function () {
                return caches.match(cachedRequest).then(function (result) {
                    console.log('Serving from cache:', event.request.url);
                    setTimeout(function () {
                        clients.matchAll().then(function (all) {
                            all.map(function (client) {
                                client.postMessage({
                                    message: 'You are currently working offline.',
                                    name: 'mpad-sw',
                                    type: 'offline'
                                });
                            });
                        });
                    }, 1500);
                    if (!result) return caches.match('/offline');
                    return result;
                });
            })
        );
    } else if (url.pathname.match(/^\/(|signup|login|about|recovery|notice|recovery|account|)$/)) {
        event.respondWith(
            fetch(event.request).then(function (res) {
                return res;
            }).catch(function () {
                return caches.open('mpad-cache-v0.5').then(function (cache) {
                    cache.keys().then(function (keyList) {
                        keyList.forEach(function (request, index, array) {
                            if (request.url.match(/(offline|js|css|icon|favicon|manifest)$/g)) return;
                            return cache.delete(request);
                        });
                    });
                }).then(function () {
                    return new Response('', {
                        'status': 302,
                        'statusText': 'OK',
                        'headers': new Headers({
                            'Location': url.origin + '/wiki/home'
                        })
                    });
                });
            })
        );
    } else {
        event.respondWith(
            fetch(event.request).then(function (res){
                caches.open('mpad-cache-v0.5').then(function (cache){
                    cache.put(cachedRequest,res);
                });
                return res.clone();
            }).catch(function (){
                return caches.match(cachedRequest).then(function (result){
                    clients.matchAll().then(function (all) {
                        all.map(function (client) {
                            client.postMessage({
                                message: 'You are currently working offline.',
                                name: 'mpad-sw',
                                type: 'offline'
                            });
                        });
                    });
                    return result;
                });
            })
        );
    }

});
