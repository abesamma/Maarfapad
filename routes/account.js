var express = require('express');
var router = express.Router();

router.get('/', function(req,res,next){
    if(req.isAuthenticated()){
        res.render('account',{ emailaddress: req.user.key });
    }else{
        res.redirect('/');
    }
});

module.exports = router;