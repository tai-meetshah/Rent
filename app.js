const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const cors = require('cors');
const flash = require('connect-flash');
const i18n = require('i18next');
const i18nFsBackend = require('i18next-fs-backend');
const i18nMiddleware = require('i18next-http-middleware');
const globalErrorHandler = require('./controllers/errorController');

// Start express app
const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Multilingal
i18n.use(i18nFsBackend)
    .use(i18nMiddleware.LanguageDetector)
    .init({
        backend: { loadPath: __dirname + '/locales/{{lng}}.json' },
        fallbackLng: 'en',
        lowerCaseLng: true,
        preload: ['en', 'ar'],
        saveMissing: true,
    });

app.use(i18nMiddleware.handle(i18n, { removeLngFromUrl: false }));

// 1) GLOBAL MIDDLEWARES

// Serving static files
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// session
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(
    require('cookie-session')({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);

// Express Messages middleware
app.use(flash());
// Make flash messages accessible in all views
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    res.locals.dateOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    };
    res.locals.dateLocale = 'en-US';
    next();
});

// CORS middleware
app.use(cors());
const corsOptions = {
    origin: '*',
    optionsSuccessStatus: 200,
};
app.options('*', cors(corsOptions));

// caching disabled for every route
app.use(function (req, res, next) {
    res.set(
        'Cache-Control',
        'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'
    );
    next();
});

// end app-assets
app.use('/app-assets/*', (req, res) => res.status(404).end());

// 404 uploads
app.use('/uploads/*', (req, res) => res.status(404).end());

// 2) API ROUTES
app.use('/api/auth', require('./routes/api/authRoutes'));
app.use('/api/cms', require('./routes/api/cmsRoutes'));
app.use('/api/product', require('./routes/api/productRoutes'));
// app.use('/api/staff-self', require('./routes/api/selfStaff'));
// app.use('/api/branch', require('./routes/api/branchRoutes'));

// 404 api
app.use('/api', (req, res, next) => {
    next(createError.NotFound(`Can't find ${req.originalUrl} on this server!`));
});

app.use(function (req, res, next) {
    res.locals.url = req.originalUrl;
    res.locals.title = 'Rent Anything';
    res.locals.dateLocale = 'en-US';
    res.locals.dateOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    };
    next();
});

//ADMIN ROUTES
app.use('/admin', require('./routes/admin/authRoutes'));
app.use('/admin/user', require('./routes/admin/userRoutes'));
app.use('/admin/banner', require('./routes/admin/bannerRoutes'));
app.use('/admin/category', require('./routes/admin/categoryRoutes'));
app.use('/admin/cms', require('./routes/admin/cmsRoutes'));

// 404 admin
app.all('/*', (req, res) => res.status(404).render('404'));

// 4) ERROR HANDLING
app.use(globalErrorHandler);

module.exports = app;
