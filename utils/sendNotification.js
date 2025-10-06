const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
const serviceAccount = require('./rent-anything-a6f78-firebase-adminsdk-fbsvc-d6b976eac0.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const sendNotificationsToTokens = async (
     title,
     body,
     registrationTokens,
) => {
     // Handle single token or array of tokens
     const tokens = Array.isArray(registrationTokens) ? registrationTokens : [registrationTokens];

     // Filter out null/undefined tokens
     const validTokens = tokens.filter(token => token && token.trim() !== '');

     if (validTokens.length === 0) {
          console.log('No valid FCM tokens provided');
          return;
     }
     // Split registration tokens into batches
     const batchSize = 500;
     const tokenBatches = [];
     for (let i = 0; i < registrationTokens.length; i += batchSize) {
          tokenBatches.push(registrationTokens.slice(i, i + batchSize));
     }

     const message = { notification: { title, body } };

     try {
          const sendPromises = tokenBatches.map(batch => {
               const batchMessages = batch.map(token => ({ ...message, token }));
               return admin.messaging().sendEach(batchMessages);
          });

          const response = await Promise.all(sendPromises);

          console.log('Successfully sent all messages', JSON.stringify(response, null, 2));

          console.log('Successfully sent all messages', response);
          return response;
     } catch (error) {
          console.log('Error sending notification:', error);
          throw error;
     }
};

module.exports = {
     sendNotificationsToTokens,
};
