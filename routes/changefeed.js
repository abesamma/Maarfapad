var express = require('express');
var router = express.Router();
var EventSource = require('eventsource');
var config = require('../config/secret.json');

router.get('/', function (req, res) {
    if (req.user) {
        var doc_id = req.user.id;
        var url = config.database + '/maarfapad/_changes?id=' +
                  doc_id + '&feed=eventsource&filter=user/filterId&heartbeat=3000&include_docs=true';
        res.writeHead(200,{
            'Content-Type': 'text/event-stream',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache'
        });
        var source = new EventSource(url);
        source.onmessage = function (e) {
            var data = JSON.parse(e.data);
            var attachments = {};
            for (var wiki in data.doc._attachments) {
                attachments[wiki] = data.doc._attachments[wiki].revpos.toString();
            }
            var json = JSON.stringify(attachments);
            res.write("data: " + json + '\n\n');
        };
    } else {
        res.sendStatus(403);
    }
});

module.exports = router;
