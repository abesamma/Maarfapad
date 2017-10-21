var express = require('express');
var router = express.Router();

router.get('/', function(req,res,next){
    if(req.user){
        res.render('account',{ emailaddress: req.user.key });
    }else{
        res.redirect('/');
    }
});

module.exports = router;