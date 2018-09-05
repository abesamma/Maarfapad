if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
    .then(function (reg) {
        // registration worked
        console.log('Registration succeeded. Scope is ' + reg.scope);
        navigator.serviceWorker.addEventListener('message', function (e) {
            if (e.data.type==='offline-status-cookie' && e.data.name==='mpad-sw') {
                document.cookie = e.data.message;
            }
        });
    }).catch(function (error) {
        // registration failed
        console.log('Registration failed with ' + error);
    });
} else {
  console.log("Service workers not supported.");
}

$(document).ready(function () {
    $('.sidenav').sidenav();
});