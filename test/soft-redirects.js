var t = require('../test-lib/test.js');
var assert = require('assert');
var request = require('request');

var apos;

describe.only('Soft Redirects', function() {
  this.timeout(t.timeout);

  after(function(done) {
    return t.destroy(apos, done);
  });

  it('should exist', function(done) {
    apos = require('../index.js')({
      root: module,
      shortName: 'test',

      modules: {
        'apostrophe-express': {
          port: 7900,
          secret: 'test'
        },
        'apostrophe-pages': {
          park: [
            {
              parkedId: 'child',
              title: 'Child',
              slug: '/child',
              type: 'default',
              published: true
            }
          ]
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-soft-redirects']);
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('should be able to serve the /child page (which also populates historicUrls)', function(done) {
    return request('http://localhost:7900/child', function(err, response, body) {
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 200);
      // Did we get our page back?
      assert(body.match(/Default Page Template/));
      return done();
    });
  });

  it('should be able to change the URL via db', function() {
    return apos.docs.db.update({ slug: '/child' }, { $set: { slug: '/child-moved' } });
  });

  it('should be able to serve the page at its new URL', function(done) {
    return request('http://localhost:7900/child-moved', function(err, response, body) {
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 200);
      // Did we get our page back?
      assert(body.match(/Default Page Template/));
      return done();
    });
  });

  it('should be able to serve the page at its old URL too, via redirect', function(done) {
    return request({
      url: 'http://localhost:7900/child',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 302);
      // Are we going to be redirected to our page?
      assert.equal(response.headers['location'], '/child-moved');
      return done();
    });
  });

});

describe.only('Soft Redirects - with `statusCode` option', function() {

  this.timeout(t.timeout);

  after(function(done) {
    return t.destroy(apos, done);
  });

  it('should exist', function(done) {
    apos = require('../index.js')({
      root: module,
      shortName: 'test',

      modules: {
        'apostrophe-express': {
          port: 7900,
          secret: 'test'
        },
        'apostrophe-pages': {
          park: [
            {
              parkedId: 'child',
              title: 'Child',
              slug: '/child',
              type: 'default',
              published: true
            }
          ]
        },
        'apostrophe-soft-redirects': {
          statusCode: 301
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-soft-redirects']);
        assert.equal(apos.modules['apostrophe-soft-redirects'].options.statusCode, 301);
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('should be able to serve the /child page (which also populates historicUrls)', function(done) {
    return request('http://localhost:7900/child', function(err, response, body) {
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 200);
      // Did we get our page back?
      assert(body.match(/Default Page Template/));
      return done();
    });
  });

  it('should be able to change the URL via db', function() {
    return apos.docs.db.update({ slug: '/child' }, { $set: { slug: '/child-moved' } });
  });

  it('should be able to serve the page at its old URL too, via redirect', function(done) {
    return request({
      url: 'http://localhost:7900/child',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      // Is our status code good?
      assert.equal(response.statusCode, 301);
      // Are we going to be redirected to our page?
      assert.equal(response.headers['location'], '/child-moved');
      return done();
    });
  });

});

describe.only('Soft Redirects - with custom routes via self.dispatch()', function() {

  this.timeout(t.timeout);

  after(function(done) {
    return t.destroy(apos, done);
  });

  it('should exist', function(done) {
    apos = require('../index.js')({
      root: module,
      shortName: 'test',

      modules: {
        'apostrophe-express': {
          port: 7900,
          secret: 'test'
        },
        'apostrophe-pages': {
          park: [
            {
              parkedId: 'child',
              title: 'Child',
              slug: '/child-moved/deeply',
              type: 'custom-page',
              published: true,
              historicUrls: [
                '/child',
                '/child-moved',
                '/child/moved'
              ]
            },
            {
              parkedId: 'child2',
              title: 'Child 2',
              slug: '/child-2',
              type: 'custom-page',
              published: true,
              historicUrls: [
                '/child'
              ]
            }
          ]
        },
        'custom-pages': {
          extend: 'apostrophe-custom-pages',
          afterConstruct: function (self) {
            self.dispatch('/', indexPage);
            self.dispatch('/:param1/:param2?', indexPage);

            function indexPage (req, done) {
              req.template = function (_req, _data) {
                return 'Custom Page Template\n' + JSON.stringify({
                  query: req.query,
                  params: req.params,
                  header: req.header('X-Deep-Soft-Redirect')
                }, null, 2);
              };
              done();
            }
          }
        }
      },
      afterInit: function(callback) {
        assert(apos.modules['apostrophe-soft-redirects']);
        apos.argv._ = [];
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('should be able to serve custom routes of the page at its old URL, via redirect', function(done) {
    return request({
      url: 'http://localhost:7900/child-moved/param1',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      assert.equal(response.statusCode, 302);
      assert.equal(response.headers['location'], '/child-moved/deeply/param1');
      return done();
    });
  });

  it('should always match the page with the longest historic URL, when more than one page could match', function(done) {
    return request({
      url: 'http://localhost:7900/child/moved',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      assert.equal(response.statusCode, 302);
      assert.equal(response.headers['location'], '/child-moved/deeply');
      return done();
    });
  });

  it('should always keep the longest possible segment of the historic URL', function(done) {
    // "moved" could be the first parameter of the custom route, or part of the
    // historicUrl "/child/moved". If there is a redirection, we assume it is an
    // old URL, so we keep the longest historic URL that matches.
    return request({
      url: 'http://localhost:7900/child/moved/param1',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      assert.equal(response.statusCode, 302);
      assert.equal(response.headers['location'], '/child-moved/deeply/param1');
      return done();
    });
  });

  it('should not redirect to a page with custom routes when the parameters do not match', function(done) {
    return request({
      url: 'http://localhost:7900/child/moved/param1/param2/toomanyparams',
      followRedirect: false
    }, function(err, response, body) {
      assert(!err);
      assert.equal(response.statusCode, 404);
      return done();
    });
  });

});
