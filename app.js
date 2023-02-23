// Core dependencies
const path = require('path');

// External dependencies
const browserSync = require('browser-sync');
const compression = require('compression');
const express = require('express');
const helmet = require('helmet');
const highlightjs = require('highlight.js');
const nunjucks = require('nunjucks');
const markdown = require('nunjucks-markdown');
const marked = require('marked');

// Local dependencies
const authentication = require('./middleware/authentication');
const config = require('./app/config');
const fileHelper = require('./middleware/file-helper');
const locals = require('./app/locals');
const routing = require('./middleware/routing');
const PageIndex = require('./middleware/page-index');
const { getRandomValues } = require('crypto');
const session = require('express-session')
const bodyParser = require('body-parser')
const pageIndex = new PageIndex(config);

var cookieParser = require('cookie-parser');

// Initialise applications
const app = express();

// Authentication middleware
app.use(authentication);

// Use local variables
app.use(locals(config));

// Use gzip compression to decrease the size of
// the response body and increase the speed of web app
app.use(compression());

// Use helmet to help secure the application
// by setting http headers
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// Middleware to serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dfeuk-frontend', express.static(path.join(__dirname, '/node_modules/dfeuk-frontend/dist')));
app.use('/dfeuk-frontend', express.static(path.join(__dirname, '/node_modules/dfeuk-frontend/packages')));
app.use('/iframe-resizer', express.static(path.join(__dirname, 'node_modules/iframe-resizer/')));

// View engine (nunjucks)
app.set('view engine', 'njk');

// Nunjucks configuration
const appViews = [
  path.join(__dirname, '/app/views/'),
  path.join(__dirname, '/node_modules/dfeuk-frontend/packages/components'),
];

const env = nunjucks.configure(appViews, {
  autoescape: true,
  express: app,
  noCache: true,
  watch: true,
});



markdown.register(env, marked.parse);

/*
 * Add some global nunjucks helpers
 */
env.addGlobal('getHTMLCode', fileHelper.getHTMLCode);
env.addGlobal('getNunjucksCode', fileHelper.getNunjucksCode);
env.addGlobal('getJSONCode', fileHelper.getJSONCode);
env.addFilter('highlight', (code, language) => {
  const languages = language ? [language] : false;
  return highlightjs.highlightAuto(code.trim(), languages).value;
});

var addNunjucksFilters = function (env) {
  var customFilters = require('./app/filters.js')(env)
  var filters = Object.assign(customFilters)
  Object.keys(filters).forEach(function (filterName) {
    env.addFilter(filterName, filters[filterName])
  })
}

addNunjucksFilters(env)

app.set('trust proxy', 1) // trust first proxy

app.use(cookieParser());
    var MemoryStore =session.MemoryStore;
    app.use(session({
        name : 'standardsmanual',
        secret: "dops-sess-fh82hv3893ef3rfgh4j545g3r",
        resave: true,
        store: new MemoryStore(),
        saveUninitialized: true
}));

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))


app.post('/service/assurance/check', (req, res) => {

  if(req.body.phase === "Discovery")
  {
    req.session.outcome = "1"
    return res.redirect('/service-assurance/check-what-assurance-you-need/check-service/outcome')
  }

  return res.redirect('/service-assurance/check-what-assurance-you-need/check')

});

app.get('/service-assurance/check-what-assurance-you-need/check-service/outcome', (req, res) => {

  var outcome = req.session.outcome;

    return res.render('service-assurance/check-what-assurance-you-need/check-service/outcome',{outcome})
});

// Render standalone design examples
app.get('/design-example/:group/:item/:type', (req, res) => {
  const displayFullPage = req.query.fullpage === 'true';
  const blankPage = req.query.blankpage === 'true';
  const { group } = req.params;
  const { item } = req.params;
  const { type } = req.params;
  const examplePath = path.join(__dirname, `app/views/design-system/${group}/${item}/${type}/index.njk`);

  // Get the given example as HTML.
  const exampleHtml = fileHelper.getHTMLCode(examplePath);

  // Wrap the example HTML in a basic html base template.
  let baseTemplate = 'includes/design-example-wrapper.njk';
  if (displayFullPage) {
    baseTemplate = 'includes/design-example-wrapper-full.njk';
  }
  if (blankPage) {
    baseTemplate = 'includes/design-example-wrapper-blank.njk';
  }

  res.render(baseTemplate, { body: exampleHtml, item });
});

app.get('/search', (req, res) => {
  const query = req.query['search-field'] || '';
  const resultsPerPage = 10;
  let currentPage = parseInt(req.query.page, 10);
  const results = pageIndex.search(query);
  const maxPage = Math.ceil(results.length / resultsPerPage);
  if (!Number.isInteger(currentPage)) {
    currentPage = 1;
  } else if (currentPage > maxPage || currentPage < 1) {
    currentPage = 1;
  }

  const startingIndex = resultsPerPage * (currentPage - 1);
  const endingIndex = startingIndex + resultsPerPage;

  res.render('includes/search.njk', {
    currentPage,
    maxPage,
    query,
    results: results.slice(startingIndex, endingIndex),
    resultsLen: results.length,
  });
});

app.get('/suggestions', (req, res) => {
  const results = pageIndex.search(req.query.search);
  const slicedResults = results.slice(0, 10);
  res.set({ 'Content-Type': 'application/json' });
  res.send(JSON.stringify(slicedResults));
});


// Automatically route pages
app.get(/^([^.]+)$/, (req, res, next) => {
  routing.matchRoutes(req, res, next);
});

// Render sitemap.xml in XML format
app.get('/sitemap.xml', (_, res) => {
  res.set({ 'Content-Type': 'application/xml' });
  res.render('sitemap.xml');
});

// Render robots.txt in text format
app.get('/robots.txt', (_, res) => {
  res.set('text/plain');
  res.render('robots.txt');
});

// Render 404 page
app.get('*', (_, res) => {
  res.statusCode = 404;
  res.render('page-not-found');
});

// Run application on configured port
if (config.env === 'development') {
  app.listen(config.port - 50, () => {
    browserSync({
      files: ['app/views/**/*.*', 'public/**/*.*'],
      notify: true,
      open: false,
      port: config.port,
      proxy: `localhost:${config.port - 50}`,
      ui: false,
    });
  });
} else {
  app.listen(config.port);
}

setTimeout(() => {
  pageIndex.init();
}, 2000);

module.exports = app;
