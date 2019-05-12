var express = require('express');
var router = express.Router();
var config;

if (process.env.NODE_ENV === 'development') {
  config = require('../config/dev.secret.json');
} else config = require('../config/secret.json');

var nano = require('nano')(config.database);
var db = nano.db.use('maarfapad');

router.get('/:name', function (req, res) {
  if (!req.params.name) res.status(400).send('Please specify a pub name parameter.');
  
  var pubname = req.params.name;
  var raw = (req.query.raw == 'true');
  var skinny = (req.query.skinny == 'true');
  var queryEntries = Object.entries(req.query);
  var filterArray = queryEntries.filter(function (entry) {
    if (entry[0].includes('filter_by')) return true;
  });

  db.view('pub', 'index', { 'key': pubname }, function (err, body) {
    if (err) return res.status(500).send(err);
    if (body.rows.length == 0) return res.status(404).send('No such pub record is available.');
    
    body.rows.forEach(function (row) {
      // send raw data if type is unspecified, regardless of raw query value
      if (!row.value['type']) return res.send(row.value);
      // process type and send data
      switch (row.value['type']) {
        case 'text/html': if (raw) return res.send(row.value);
        // get the attachment named in the text field
        db.attachment.get(row.id, row.value['text'], function (err, body) {
          if (!err) {
            res.header('Content-Type', 'text/html');
            res.send(body);
          } else {
            logError(err);
            res.status(500).send(err);
          }
        });
        break;
        case 'application/json': res.header('Content-Type', 'application/json');
        if (filterArray.length == 0) raw ? res.send(row.value) : res.send(row.value['text']);
        // send filtered data only if the data is an Array of js objects
        
        default: raw ? res.send(row.value) : res.header(row.value['type']).send(row.value['text']);
      }
    });

  });
});

router.put('/', function (req, res) {
  // seek editing permission first, then write
});

router.delete('/', function (req, res) {
  // only the owner can delete a data tiddler
});

module.exports = router;
