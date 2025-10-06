const mongoose = require('mongoose');
const dotenv = require('dotenv');

process.on('uncaughtException', err => {
    console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.log(err);
    process.exit(1);
});

dotenv.config();
const app = require('./app');

const DB = process.env.DATABASE.replace(
    '<password>',
    process.env.DATABASE_PASSWORD
);

mongoose.set('strictQuery', false);
mongoose
    .connect(DB, { useNewUrlParser: true })
    .then(() => console.log('DB connection successful!'));

const port = process.env.PORT || 4001;
// const server = app.listen(port, () => {
//     console.log(`App running on port ${port}...`);
// });

// httpServer.listen(port, () => {
//     console.log('Server started at this port:' + port);
// });


process.on('unhandledRejection', err => {
    console.log('UNHANDLED REJECTION! 💥 Shutting down...');
    console.log(err);
    // No server instance here; exit directly
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
    // No server instance here; exit directly
    console.log('💥 Process terminated!');
    process.exit(0);
});
