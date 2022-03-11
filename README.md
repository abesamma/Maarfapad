# Maarfapad

## What is this?

Maarfapad was my attempt at learning Expressjs back in 2016 while building a CRUD app to handle [TiddlyWiki](https://tiddlywiki.com) html files. It was hosted at [cloudnode](https://cloudno.de), but has since been retired in favor of another project of mine [Oneplaybook](https://oneplaybook.app). This repository contains Maarfapad's source code, licensed under MIT.

## How do I get it to work?

When you clone this repo, you'll need to first install all dependencies with `npm install`.

Please note that, depending on what you want to do, you might want to fiddle around with the `config` folder under the root directory. In there you will find 2 JSON files containing credentials needed to:

1. Configure a host and port to run the app
2. The CouchDB server address for long-term storage of the wiki files and otther app data
3. Configure the email client to send service emails for things like password resets

The `dev.secret.json` file contains generic localhost addresses and whatnot for development purposes. Use the `secret.json` file to add production credentials. I chose this setup because Cloudnode allowed for private git repositories that safely handle these secret JSON files. Needless to say, **don't persist secrets to your public Github repo**!

The `editions.js` file exports a URL pointing to an HTML TiddlyWiki template that is used by the app to create new wikis for the user. You can add more if you wish! These are used in `app.js`.

Finally, to run the whole thing in development mode, run the npm script:

```bash
npm run deploy:dev
```

For production (which is the default mode when your host boots the app with `npm start` using the `server.js` file, run:

```bash
npm run deploy:prod
```

Oh, and make sure you have CouchDB installed for all this to work when you're developing. You'll have to find a cloud provider that offers CouchDB instances for you to use. I used Cloudnode.

## Is this project still being maintained?

As stated at the begining, this repo is just me archiving a project that was fun to build back when Nodejs was at v6.1 or less. A lot has happened since then. Things might break, but it worked well for me up to the moment of this commit. Feel free to play around with it.

## Miscellaneous technical details

This app uses PUG as its view template engine. The server code uses Expressjs framework with a number of essential middlewares for things like parsing cookies, etc. The service worker code under the `public` folder is somewhat unorthodox because it was supposed to do a LOT.

1. It allowed the app to be pretty much offline first, or atleast as much as possible.
2. If wiki saves (the app saves the whole wiki as a single HTML blob) fail, then the app persists the blob into the browser cache. Of course, this is only temporary and the app tells you as much
3. The only problem that used to happen was rare but annoying episodes of the app presenting a stale cache as a current view. I had the service worker always check the revision cached against the one in CouchDB to decide if it should default to fetch from the database or the browser cache. I never got a chance to address these staleness hiccups completely (partly because it was infrequent) so if it happens, just logout of the app and log back in. This causes the servier to reset credentials and delete the cached content (this tends to happen when you revisit the app on a device long after the credentials had expired, and it would warn you anyway that that is the case).
4. Sign ups and login handling is done using Passportjs middleware
5. Note that I artificially limited the number of wikis you could create per account to 2 for the sake of evaluating its performance. I have never increased it beyond that but you're welcomed to.
6. Finally, this whole thing is a nice progressive web app!

Have fun 😄
