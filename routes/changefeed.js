var express = require('express');
var router = express.Router();
var EventSource = require('eventsource');
var config = require('../config/secret.json');

var url;
var source;
var data;
var attachments;
var json;

router.get('/', function (req, res) {
    if (req.user) {
        url = config.database + '/maarfapad/_changes?id=' +
                  req.user.id + '&feed=eventsource&filter=user/filterId&include_docs=true';
        res.writeHead(200,{
            'Content-Type': 'text/event-stream',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache'
        });
        source = new EventSource(url);
        source.onmessage = function (e) {
            data = JSON.parse(e.data);
            attachments = {};
            for (var wiki in data.doc._attachments) {
                attachments[wiki] = data.doc._attachments[wiki].revpos.toString();
            }
            json = JSON.stringify(attachments);
            res.write("data: " + json + '\n\n');
        };
    } else {
        res.sendStatus(403);
    }
});

module.exports = router;
