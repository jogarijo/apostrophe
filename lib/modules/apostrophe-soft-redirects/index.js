var _ = require('@sailshq/lodash');
var async = require('async');

// Implements "soft redirects." When a 404 is about to occur, Apostrophe will look
// for a page or piece that has been associated with that URL in the past, and
// redirect if there is one. This only comes into play if a 404 is about to occur.
//
// ## Options
//
// ### `enable`
//
// Set this option explicitly to `false` to shut off this feature.
//
// ### `statusCode`
//
// Set this option to return another HTTP status code when redirecting. You may use
// e.g. HTTP 301 for permanent redirects. Defaults to HTTP 302.
//
// For example in your `app.js` module configuration:
//
// ```javascript
// 'apostrophe-soft-redirects': {
//   statusCode: 301
// }
// ```

module.exports = {

  afterConstruct: function(self, callback) {
    if (self.options.enable === false) {
      return;
    }
    self.on('apostrophe:migrate', 'ensureIndexesPromisified', function() {
      return require('bluebird').promisify(self.ensureIndexes)();
    });
    return callback(null);
  },

  construct: function(self, options) {
    var statusCode = self.options.statusCode || 302;

    if (self.options.enable === false) {
      return;
    }

    self.ensureIndexes = function(callback) {
      return self.apos.docs.db.ensureIndex({ historicUrls: 1 }, callback);
    };

    self.pageNotFound = function(req, callback) {
      var cleanUrl = req.url.replace(/\?.*$/, '').replace(/\/+/, '/');
      var partialUrls = cleanUrl
        .split(/(?!^)\//)
        .reduce(function (acc, segment, index) {
          return acc.concat(index === 0 ? segment : `${acc[acc.length - 1]}/${segment}`);
        }, [])
        .reverse();

      return self.apos.docs.find(req, { historicUrls: { $in: partialUrls } }).sort({ updatedAt: -1 }).toArray(function(err, candidates) {
        if (err) {
          return callback(err);
        }

        // If several docs match the historic URL, keep the deepest one (e.g. "/a/b/c" > "/a/b")
        var longestMatch = 0;
        var redirectUrl;
        for (var candidate of candidates) {
          // Get longest historic match for this doc
          var longestHistoricUrl = (candidate.historicUrls || [])
            .sort(function (a, b) { return b.split('/').length - a.split('/').length; })
            .find(function (url) { return partialUrls.includes(url); });
          var matchLength = longestHistoricUrl.split('/').length;

          if (matchLength > longestMatch) {
            // Check that a rule would recognize the new URL
            var manager = self.apos.docs.getManager(candidate.type);
            var rules = manager && manager.rules;
            var hasMatchingRoute = true;
            var candidateUrl = cleanUrl.replace(longestHistoricUrl, candidate._url);
            if (!_.isEmpty(rules)) {
              var childRouteUrl = cleanUrl.replace(longestHistoricUrl, '');
              hasMatchingRoute = _.some(rules, function (rule) { return rule.regexp.test(childRouteUrl); });
            }
            if (hasMatchingRoute) {
              redirectUrl = candidateUrl;
              longestMatch = matchLength;
            }
          }
        }

        if (redirectUrl && self.apos.modules['apostrophe-soft-redirects'].local(redirectUrl) !== cleanUrl) {
          return req.res.redirect(statusCode, redirectUrl);
        }
        return callback(null);
      });
    };

    self.pageBeforeSend = function(req, callback) {
      var docs = [];
      if (req.data.page) {
        docs.push(req.data.page);
      }
      if (req.data.piece) {
        docs.push(req.data.piece);
      }
      docs = _.filter(docs, function(doc) {
        if (doc._url) {
          return !_.contains(doc.historicUrls || [], self.local(doc._url));
        } else {
          return false;
        }
      });
      return async.eachSeries(docs, function(doc, callback) {
        return self.apos.docs.db.update({ _id: doc._id }, {
          $addToSet: {
            historicUrls: self.local(doc._url)
          }
        }, callback);
      }, callback);
    };

    // Remove any protocol, // and host/port/auth from URL
    self.local = function(url) {
      return url.replace(/^(https?:)?\/\/[^/]+/, '');
    };

  }

};
