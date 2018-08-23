
self.addEventListener('install', function (event) {
    console.log('Mpad service worker version 26 installed');
    event.waitUntil(
        caches.open('mpad-cache').then(function(cache){
            return cache.addAll([
                '/wiki/home'
            ]);
        }).then(function(){
            return self.skipWaiting(); // kicks out the old version of sw.js
        })
    )
});

self.addEventListener('activate', function (event) {
    var cacheWhitelist = ['mpad-cache'];

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
    return self.clients.claim();
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
    })

    if (event.request.method == 'OPTIONS') return
    if (event.request.method == 'HEAD') return
    
    /**
     * Respond normally when network available and cache,
     * else serve cached items.
     */
    event.respondWith(
        fetch(event.request).then(function(res){
            if (event.request.method == 'PUT') {
                // update cache after successful PUT
                var eventURL = event.request.url;
                caches.open('mpad-cache').then(function (cache) {
                    cache.keys().then(function (keys) {
                        keys.forEach(function (request) {
                            var array = eventURL.match(request.url)
                            if (array) {
                                console.log('Cached ' + array[0]);
                                var cachedRequestForPut = new Request(array[0], {
                                    bodyUsed: false,
                                    credentials: "include",
                                    integrity: "",
                                    method: "GET",
                                    redirect: "follow",
                                    referrer: "",
                                    referrerPolicy: "no-referrer-when-downgrade"
                                })
                                cache.add(cachedRequestForPut);
                            }
                        });
                    });
                });
            }
            // cache all GET requests
            if (event.request.method == 'GET') {
                caches.open('mpad-cache').then(function(cache){
                    console.log('Cached ' + cachedRequest.url)
                    cache.put(cachedRequest,res);
                });
            }
            return res.clone();
        }).catch(function(){
            // return cache if failed connection
            console.log('Serving cache of: ' + cachedRequest.url);
            return caches.match(cachedRequest);
        })
    )
});
